import { request } from 'obsidian';
import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from './ics';
import * as React from 'react';

import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { ICSProviderConfig } from './typesICS';
import { ICSConfigComponent } from './ui/ICSConfigComponent';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';

const WEBCAL = 'webcal';

// Settings row component for ICS Provider
const ICSUrlSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  // Handle both flat and nested config structures for URL
  const getUrl = (): string => {
    const flat = (source as { url?: unknown }).url;
    const nested = (source as { config?: { url?: unknown } }).config?.url;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getUrl(),
      className: 'fc-setting-input'
    })
  );
};

export class ICSProvider implements CalendarProvider<ICSProviderConfig> {
  // Static metadata for registry
  static readonly type = 'ical';
  static readonly displayName = 'Remote Calendar (ICS)';
  static getConfigurationComponent(): FCReactComponent<any> {
    return ICSConfigComponent;
  }

  private plugin: FullCalendarPlugin;
  private source: ICSProviderConfig;

  readonly type = 'ical';
  readonly displayName = 'Remote Calendar (ICS)';
  readonly isRemote = true;
  readonly loadPriority = 100;

  constructor(source: ICSProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
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
    let url = this.source.url;
    if (url.startsWith(WEBCAL)) {
      url = 'https' + url.slice(WEBCAL.length);
    }

    try {
      const response = await request({ url, method: 'GET' });
      const displayTimezone = this.plugin.settings.displayTimezone;
      if (!displayTimezone) return [];

      // Remove timezone conversion logic; just return raw events
      return getEventsFromICS(response).map(event => [event, null]);
    } catch (e) {
      console.error(`Error fetching ICS calendar from ${url}`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error('Cannot create an event on a read-only ICS calendar.');
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    throw new Error('Cannot update an event on a read-only ICS calendar.');
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    throw new Error('Cannot delete an event on a read-only ICS calendar.');
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
    return ICSConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return ICSUrlSetting;
  }
}
