// src/chrono_analyser/modules/DataService.ts

/**
 * @file Manages the flow of data from the main plugin's EventCache to the
 * ChronoAnalyser's DataManager. It listens for updates and translates events
 * into a format suitable for analysis.
 */

import EventCache, { UpdateViewCallback } from '../../core/EventCache';
import { DataManager } from '../data/DataManager';
import * as Translator from './translator';
import { TimeRecord, ProcessingError } from './types';
// FullNoteCalendar class is no longer used directly; providers are stored instead.
import { FullCalendarSettings } from '../../types/settings';

export class DataService {
  public processingErrors: ProcessingError[] = [];
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
   * the `enableAdvancedCategorization` setting.
   */
  private repopulateDataManager(): void {
    this.dataManager.clear();
    const records: TimeRecord[] = [];
    const useCategoryFeature = this.settings.enableAdvancedCategorization;

    for (const [calId, provider] of this.eventCache.calendars.entries()) {
      // In legacy mode, only include local (full note) calendars
      if (!useCategoryFeature && provider.type !== 'local') {
        continue;
      }

      // Derive a human-friendly source label:
      // - For local, use the directory from the runtime id: "local::<directory>"
      // - Otherwise, use the provider displayName
      const calendarSource =
        provider.type === 'local' ? calId.split('::')[1] || 'local' : provider.displayName;

      const eventsInCalendar = this.eventCache._storeForTest.getEventsInCalendar(calId);

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
