// src/chrono_analyser/modules/DataService.ts

/**
 * @file Manages the flow of data from the main plugin's EventCache to the
 * ChronoAnalyser's DataManager. It listens for updates and translates events
 * into a format suitable for analysis.
 */

import EventCache, { UpdateViewCallback } from 'src/core/EventCache';
import { DataManager } from './DataManager';
import * as Translator from './translator';
import { TimeRecord } from './types';
import FullNoteCalendar from 'src/calendars/FullNoteCalendar';

export class DataService {
  public processingErrors: any[] = [];
  private eventCacheUpdateCallback: UpdateViewCallback;

  constructor(
    private eventCache: EventCache,
    private dataManager: DataManager,
    private onDataReady: () => void
  ) {
    this.eventCacheUpdateCallback = () => {
      this.repopulateDataManager();
      this.onDataReady();
    };
  }

  public initialize(): void {
    this.eventCache.on('update', this.eventCacheUpdateCallback);
    // Initial population
    this.repopulateDataManager();
    this.onDataReady();
  }

  /**
   * Clears the DataManager and refills it by translating events from all
   * "Full Note" calendars in the main EventCache.
   */
  private repopulateDataManager(): void {
    this.dataManager.clear();
    const records: TimeRecord[] = [];

    // Iterate through the main plugin's configured calendars
    for (const calendar of this.eventCache.calendars.values()) {
      // We only analyze "Full Note" (local) calendars, as they have a folder structure.
      if (calendar instanceof FullNoteCalendar) {
        const calendarSourcePath = calendar.directory;
        const eventsInCalendar = this.eventCache._storeForTest.getEventsInCalendar(calendar);

        for (const storedEvent of eventsInCalendar) {
          const timeRecord = Translator.storedEventToTimeRecord(storedEvent, calendarSourcePath);
          if (timeRecord) {
            records.push(timeRecord);
          }
        }
      }
    }

    for (const record of records) {
      this.dataManager.addRecord(record);
    }

    this.dataManager.finalize();
  }

  public destroy(): void {
    this.eventCache.off('update', this.eventCacheUpdateCallback);
  }
}
