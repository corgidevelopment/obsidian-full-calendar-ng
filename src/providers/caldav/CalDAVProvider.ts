import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { eventToIcs, createOverrideVEvent } from '../ics/formatter';
import ical from 'ical.js';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import * as React from 'react';
import { obsidianFetch } from './obsidian-fetch_caldav';

import { checkCalendarResourceType } from './helper_caldav';

// Helper function to ensure URL formatting is consistent.
function canonCollection(u?: string): string {
  return u ? (u.endsWith('/') ? u : u + '/') : (u as unknown as string);
}

// Helper to format a Date object into the format CalDAV expects (YYYYMMDDTHHMMSSZ).
function ymdhmsZ(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

// --- Direct REPORT + GET implementation (standards-compliant) ---
async function fetchCalendarObjects(
  collectionUrl: string,
  start: Date,
  end: Date,
  username?: string,
  password?: string
) {
  const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${ymdhmsZ(start)}" end="${ymdhmsZ(end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const authHeader =
    username && password
      ? 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
      : undefined;

  const reportHeaders: Record<string, string> = {
    Depth: '1',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };
  if (authHeader) {
    reportHeaders['Authorization'] = authHeader;
  }

  // STEP 1: Send the REPORT to get the list of event URLs and data

  const reportRes = await obsidianFetch(canonCollection(collectionUrl), {
    method: 'REPORT',
    headers: reportHeaders,
    body: reportBody
  });

  const xml = await reportRes.text();

  if (reportRes.status >= 400) {
    console.error('[CalDAVProvider] REPORT request failed', reportRes.status, xml.slice(0, 800));
    throw new Error(`REPORT ${reportRes.status}`);
  }

  // STEP 2: Parse the XML response using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const icsList: { ics: string; etag?: string }[] = [];

  // Robustly find calendar-data elements regardless of namespace prefix
  // We use getElementsByTagNameNS('*', 'response') to find all response elements regardless of namespace
  const responses = doc.getElementsByTagNameNS('*', 'response');
  const allResponses = Array.from(responses);

  for (const response of allResponses) {
    // Find calendar-data within this response
    // We use wildcard namespace to find propstat and prop elements
    const propstats = response.getElementsByTagNameNS('*', 'propstat');

    for (let i = 0; i < propstats.length; i++) {
      const propstat = propstats[i];
      const status = propstat.getElementsByTagNameNS('*', 'status')[0]?.textContent || '';
      if (!status.includes('200')) continue;

      const prop = propstat.getElementsByTagNameNS('*', 'prop')[0];
      if (!prop) continue;

      // Try to find calendar-data
      // 1. Try standard namespace
      let calendarData = prop.getElementsByTagNameNS(
        'urn:ietf:params:xml:ns:caldav',
        'calendar-data'
      )[0];

      // 2. Try wildcard namespace if specific one fails
      if (!calendarData) {
        const candidates = prop.getElementsByTagNameNS('*', 'calendar-data');
        if (candidates.length > 0) {
          calendarData = candidates[0];
        }
      }

      if (calendarData && calendarData.textContent) {
        // Try to find etag
        let etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent;
        if (!etag) {
          const candidates = prop.getElementsByTagNameNS('*', 'getetag');
          if (candidates.length > 0) etag = candidates[0].textContent;
        }

        icsList.push({
          ics: calendarData.textContent,
          etag: etag || undefined
        });
      }
    }
  }

  // STEP 3: Fallback - if no calendar-data was returned, fetch individual .ics files
  if (icsList.length === 0) {
    const eventHrefs: string[] = [];

    // Parse hrefs using DOMParser
    for (const response of allResponses) {
      let hrefEl = response.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl) {
        // Fallback to wildcard
        const candidates = response.getElementsByTagNameNS('*', 'href');
        if (candidates.length > 0) {
          hrefEl = candidates[0];
        }
      }

      if (hrefEl && hrefEl.textContent && hrefEl.textContent.endsWith('.ics')) {
        eventHrefs.push(hrefEl.textContent);
      }
    }

    if (eventHrefs.length === 0) {
      return [];
    }

    // Fetch each .ics file individually
    const collectionOrigin = new URL(collectionUrl).origin;
    const getPromises = eventHrefs.map(href => {
      const getUrl = collectionOrigin + href;
      const getHeaders: Record<string, string> = { Accept: 'text/calendar' };
      if (authHeader) {
        getHeaders['Authorization'] = authHeader;
      }
      console.log(`[CalDAV] Fetching individual event from ${getUrl}`);
      return obsidianFetch(getUrl, { method: 'GET', headers: getHeaders }).then(res => res.text());
    });

    const fetchedIcs = await Promise.all(getPromises);
    // Individual fetches don't easily give us ETags unless we capture headers from each response
    // For now, mapping to object structure. PROPFIND is better for ETags.
    return fetchedIcs.map(ics => ({ ics, etag: undefined }));
  }

  return icsList;
}

// --- Read-only settings row ---
const CalDAVSettingRow: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const url = (source as any)?.url || '';
  const username = (source as any)?.username || '';

  return React.createElement(
    React.Fragment,
    {},
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: url,
        className: 'fc-setting-input'
      })
    ),
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: username,
        className: 'fc-setting-input'
      })
    )
  );
};

export class CalDAVProvider implements CalendarProvider<CalDAVProviderConfig> {
  static readonly type = 'caldav';
  static readonly displayName = 'CalDAV';
  static getConfigurationComponent(): FCReactComponent<any> {
    return CalDAVConfigComponent;
  }

  private source: CalDAVProviderConfig;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';
  readonly isRemote = true;
  readonly loadPriority = 110;

  constructor(source: CalDAVProviderConfig, plugin: FullCalendarPlugin) {
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    return event.uid ? { persistentId: event.uid } : null;
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    // Validate collection URL using PROPFIND instead of regex
    const isValid = await checkCalendarResourceType(this.source.homeUrl, {
      username: this.source.username,
      password: this.source.password
    });

    if (!isValid) {
      const message = `[CalDAVProvider] Invalid collection URL or not a calendar: ${this.source.homeUrl}`;
      console.error(message);
      throw new Error(message);
    }

    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    const end = new Date(now);
    end.setMonth(end.getMonth() + 6);

    try {
      const icsList = await fetchCalendarObjects(
        this.source.homeUrl,
        start,
        end,
        this.source.username,
        this.source.password
      );
      return icsList
        .flatMap(({ ics, etag }) =>
          getEventsFromICS(ics).map(ev => {
            if (etag) ev.etag = etag.replace(/"/g, ''); // standard ETag usually has quotes
            return ev;
          })
        )
        .map(ev => [ev, null]);
    } catch (err) {
      console.error('[CalDAVProvider] Failed to fetch events.', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch events from CalDAV server: ${errorMessage}`);
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    // 1. Ensure event has a UID
    if (!event.uid) {
      event.uid = window.crypto.randomUUID();
    }
    const uid = event.uid;

    // 2. Convert to ICS
    const icsContent = eventToIcs(event);

    // 3. PUT to server
    // URL typically: collectionUrl + uid + ".ics"
    // Helper ensure trailing slash on homeUrl
    const url = canonCollection(this.source.homeUrl) + `${uid}.ics`;

    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*' // Prevent overwriting if it somehow exists
      },
      body: icsContent
    });

    return [event, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    const uid = handle.persistentId;
    if (!newEvent.uid) {
      newEvent.uid = uid;
    }

    // Convert to ICS
    const icsContent = eventToIcs(newEvent);

    const url = canonCollection(this.source.homeUrl) + `${uid}.ics`;

    // PUT to update
    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(oldEvent.etag ? { 'If-Match': `"${oldEvent.etag}"` } : {})
        // We could use If-Match with ETag if we had it, to prevent lost updates.
        // For now, simpler last-write-wins or just overwrite.
      },
      body: icsContent
    });

    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const uid = handle.persistentId;
    const url = canonCollection(this.source.homeUrl) + `${uid}.ics`;

    await this.doRequest(url, {
      method: 'DELETE'
    });
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    // 1. Fetch the existing ICS for the master event
    if (!masterEvent.uid) {
      throw new Error('Cannot create override: Master event has no UID.');
    }
    const uid = masterEvent.uid;
    const url = canonCollection(this.source.homeUrl) + `${uid}.ics`;

    // Fetch existing
    // We need to fetch the raw text of the ICS file.
    const headers: Record<string, string> = {};
    if (this.source.username && this.source.password) {
      headers['Authorization'] =
        'Basic ' +
        Buffer.from(`${this.source.username}:${this.source.password}`).toString('base64');
    }

    // Use obsidianFetch directly for GET
    const res = await obsidianFetch(url, { method: 'GET', headers });
    if (res.status >= 300) {
      throw new Error(`Failed to fetch original event for override: ${res.status}`);
    }
    const originalIcs = await res.text();

    // 2. Parse existing ICS
    const jcal = ical.parse(originalIcs);
    const vcalendar = new ical.Component(jcal);

    // 3. Create the Override VEVENT
    const overrideVEvent = createOverrideVEvent(newEventData, instanceDate);

    // 4. Merge: Add the new VEVENT to the VCALENDAR
    vcalendar.addSubcomponent(overrideVEvent);

    // 5. Update: PUT the new ICS back
    const newIcsContent = vcalendar.toString();

    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8'
        // Ideally use ETag (If-Match) to avoid race conditions, but for now strict overwrite is safer
        // given we just fetched it.
      },
      body: newIcsContent
    });

    return [newEventData, null];
  }

  // Helper to attach auth and fetch
  private async doRequest(url: string, options: RequestInit) {
    const headers = (options.headers as Record<string, string>) || {};
    if (this.source.username && this.source.password) {
      headers['Authorization'] =
        'Basic ' +
        Buffer.from(`${this.source.username}:${this.source.password}`).toString('base64');
    }
    options.headers = headers;

    const res = await obsidianFetch(url, options);
    if (res.status >= 300) {
      throw new Error(`CalDAV request failed: ${res.status} ${res.statusText}`);
    }
    return res;
  }

  // Boilerplate methods for the provider interface.
  async revalidate(): Promise<void> {}
  getConfigurationComponent(): FCReactComponent<any> {
    return () => null;
  }
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return CalDAVSettingRow;
  }
}
