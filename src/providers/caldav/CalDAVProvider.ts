import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import { ObsidianInterface } from '../../ObsidianAdapter';
import * as React from 'react';

// Use require for robust module loading.
const { createAccount, getCalendarObjects, AuthMethod } = require('tsdav');

// Settings row component for CalDAV Provider - handles URL, name, and username
const CalDAVSettingRow: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  // Handle both flat and nested config structures
  const getProperty = (key: string): string => {
    const flat = (source as Record<string, unknown>)[key];
    const nested = (source as { config?: Record<string, unknown> }).config?.[key];
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  const url = getProperty('url');
  const name = getProperty('name');
  const username = getProperty('username');

  return React.createElement(
    React.Fragment,
    {},
    // URL input
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
    // Name input
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: name,
        className: 'fc-setting-input'
      })
    ),
    // Username input
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
  // Static metadata for registry
  static readonly type = 'caldav';
  static readonly displayName = 'CalDAV';
  static getConfigurationComponent(): FCReactComponent<any> {
    return CalDAVConfigComponent;
  }

  private plugin: FullCalendarPlugin;
  private source: CalDAVProviderConfig;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';
  readonly isRemote = true;
  readonly loadPriority = 110;

  // Standardized constructor signature
  constructor(source: CalDAVProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    try {
      const account = await createAccount({
        server: this.source.url,
        credentials: {
          username: this.source.username,
          password: this.source.password
        },
        authMethod: AuthMethod.Basic
      });

      const caldavEvents = await getCalendarObjects({
        calendarUrl: this.source.homeUrl,
        account
      });

      // The rest of the pipeline remains the same:
      // Pass raw ICS data to the existing parser.
      interface RawCalDAVObject {
        data?: string;
      }
      return caldavEvents
        .filter((vevent: RawCalDAVObject) => typeof vevent.data === 'string')
        .flatMap((vevent: RawCalDAVObject) => getEventsFromICS(vevent.data as string))
        .map((event: OFCEvent) => [event, null]);
    } catch (e) {
      console.error(`Error fetching CalDAV events from ${this.source.url}`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Creating events on a CalDAV calendar is not yet supported.');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('Updating events on a CalDAV calendar is not yet supported.');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('Deleting events on a CalDAV calendar is not yet supported.');
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error(`Cannot create a recurring event override on a read-only calendar.`);
  }

  async revalidate(): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return () => null;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return CalDAVSettingRow;
  }
}
