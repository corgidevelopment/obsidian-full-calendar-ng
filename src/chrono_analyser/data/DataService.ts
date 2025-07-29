// src/chrono_analyser/modules/DataService.ts

/**
 * @file Manages the flow of data from the main plugin's EventCache to the
 * ChronoAnalyser's DataManager. It listens for updates and translates events
 * into a format suitable for analysis.
 */

import EventCache, { UpdateViewCallback } from '../../core/EventCache';
import { DataManager } from '../data/DataManager';
import * as Translator from './translator';
import { TimeRecord } from './types';
import FullNoteCalendar from '../../calendars/FullNoteCalendar';
import { FullCalendarSettings } from '../../types/settings';

export class DataService {
  public processingErrors: any[] = [];
  private eventCacheUpdateCallback: UpdateViewCallback;

  constructor(
    private eventCache: EventCache,
    private dataManager: DataManager,
    private settings: FullCalendarSettings,
    private onDataReady: () => void
  ) {
    this.eventCacheUpdateCallback = () => {
      this.repopulateDataManager();
      this.onDataReady();
    };
  }

  public initialize(): void {
    this.eventCache.on('update', this.eventCacheUpdateCallback);
    this.repopulateDataManager();
    this.onDataReady();
  }

  /**
   * Clears the DataManager and refills it. The source of events depends on
   * the `enableCategoryColoring` setting.
   */
  private repopulateDataManager(): void {
    this.dataManager.clear();
    const records: TimeRecord[] = [];
    const useCategoryFeature = this.settings.enableCategoryColoring;

    for (const calendar of this.eventCache.calendars.values()) {
      if (!useCategoryFeature && !(calendar instanceof FullNoteCalendar)) {
        continue;
      }

      const calendarSource =
        calendar instanceof FullNoteCalendar ? calendar.directory : calendar.name;

      const eventsInCalendar = this.eventCache._storeForTest.getEventsInCalendar(calendar);

      for (const storedEvent of eventsInCalendar) {
        const timeRecord = Translator.storedEventToTimeRecord(
          storedEvent,
          useCategoryFeature,
          calendarSource
        );

        if (timeRecord) {
          records.push(timeRecord);
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
