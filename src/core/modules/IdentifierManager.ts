/**
 * @file IdentifierManager.ts
 * @brief Manages the mapping between persistent and session-specific event IDs.
 *
 * @description
 * This class is an internal module of the EventCache. It abstracts away the
 * complexity of handling transient session IDs versus persistent, globally-unique
 * identifiers for events. It's responsible for generating new IDs and maintaining
 * the lookup map.
 *
 * @see EventCache.ts
 * @license See LICENSE.md
 */

import { Calendar } from '../../calendars/Calendar';
import EventStore from '../EventStore';
import { OFCEvent } from '../../types';

export class IdentifierManager {
  private calendars: Map<string, Calendar>;
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  constructor(calendars: Map<string, Calendar>) {
    this.calendars = calendars;
  }

  public generateId(): string {
    return `${this.pkCounter++}`;
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const calendar = this.calendars.get(calendarId);
    if (!calendar) {
      console.warn(`Could not find calendar with ID ${calendarId} to generate global identifier.`);
      return null;
    }
    const localIdentifier = calendar.getLocalIdentifier(event);
    if (!localIdentifier) {
      return null;
    }
    return `${calendar.id}::${localIdentifier}`;
  }

  public buildMap(store: EventStore): void {
    this.identifierMapPromise = (async () => {
      this.identifierToSessionIdMap.clear();
      for (const storedEvent of store.getAllEvents()) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
        }
      }
    })();
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.set(globalIdentifier, sessionId);
    }
  }

  public removeMapping(event: OFCEvent, calendarId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
    }
  }
}
