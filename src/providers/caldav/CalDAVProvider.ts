import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import { ObsidianInterface } from '../../ObsidianAdapter';

// Use require for robust module loading.
const { createAccount, getCalendarObjects, AuthMethod } = require('tsdav');

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
      return caldavEvents
        .filter((vevent: any) => vevent.data)
        .flatMap((vevent: any) => getEventsFromICS(vevent.data))
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
}
