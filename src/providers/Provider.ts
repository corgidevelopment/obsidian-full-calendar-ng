import { OFCEvent, EventLocation } from '../types';
import { EventHandle, ProviderConfigContext, FCReactComponent } from './typesProvider';

export interface CalendarProviderCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface CalendarProvider<TConfig> {
  readonly type: string;
  readonly displayName: string;
  readonly isRemote: boolean;

  getCapabilities(): CalendarProviderCapabilities;

  getEventHandle(event: OFCEvent): EventHandle | null;

  getEvents(): Promise<[OFCEvent, EventLocation | null][]>;
  getEventsInFile?(file: import('obsidian').TFile): Promise<[OFCEvent, EventLocation | null][]>;

  createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]>;
  updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null>;
  deleteEvent(handle: EventHandle): Promise<void>;

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]>;

  getConfigurationComponent(): FCReactComponent<{
    config: Partial<TConfig>;
    onConfigChange: (newConfig: Partial<TConfig>) => void;
    context: ProviderConfigContext;
    onSave: (finalConfig: TConfig | TConfig[]) => void;
    onClose: () => void;
  }>;

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../types').CalendarInfo>;
  }>;
}
