// src/chrono_analyser/modules/translator.ts

/**
 * @file Responsible for converting event data from the main plugin's EventCache
 * into the TimeRecord format used by the ChronoAnalyser.
 */

import { StoredEvent } from '../../core/EventStore';
import { TimeRecord } from './types';
import * as Utils from './utils';
import { OFCEvent } from '../../types';

/**
 * Converts a StoredEvent from the main EventCache into a TimeRecord for analysis.
 *
 * @param storedEvent - The event object from the main plugin's cache.
 * @param useCategoryFeature - A boolean flag indicating if the category feature is enabled.
 * @param calendarSource - The hierarchy source (name or path), used only in legacy mode.
 * @returns A structured TimeRecord object, or null if the event is not valid for analysis.
 */
export function storedEventToTimeRecord(
  storedEvent: StoredEvent,
  useCategoryFeature: boolean,
  calendarSource: string
): TimeRecord | null {
  const { event, location } = storedEvent;
  // This path is just a unique identifier for the DataManager, it's okay to have a fallback.
  const path = location?.path || `remote-event-${storedEvent.id}`;

  // --- ADD THIS LINE ---
  const uniqueId = `${path}::${storedEvent.id}`;
  // --- END OF ADDITION ---

  const startTime = 'startTime' in event ? event.startTime : null;
  const endTime = 'endTime' in event ? event.endTime : null;
  const days = 'days' in event && typeof event.days === 'number' ? event.days : undefined;

  const duration =
    event.type === 'recurring'
      ? Utils.calculateDuration(startTime, endTime, 1)
      : Utils.calculateDuration(startTime, endTime, days);

  if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) {
    return null;
  }

  // The filename is for display/reference in popups, it's not used for aggregation.
  const filename = path.split('/').pop() || event.title;

  // --- CORRECTED HIERARCHY LOGIC ---
  const { hierarchy, project, subproject } = (() => {
    // A small helper to avoid repeating the parsing logic.
    const parseTitleForProject = (title: string) => {
      const titleParts = title.split(' - ');
      const parsedProject = titleParts[0]?.trim() || 'Unknown Project';
      let parsedSubproject =
        titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : 'none';
      if (parsedSubproject === '') {
        parsedSubproject = 'none';
      }
      return { project: parsedProject, subproject: parsedSubproject };
    };

    if (useCategoryFeature) {
      // CATEGORY MODE: DERIVE EVERYTHING FROM THE EVENT OBJECT.
      // Ignore filename, ignore file path.
      if (!event.category) {
        // If the feature is on but an event has no category, skip it.
        // This enforces data quality for this mode.
        return { hierarchy: null, project: null, subproject: null };
      }

      const { project, subproject } = parseTitleForProject(event.title);

      return {
        hierarchy: event.category,
        project: project,
        subproject: subproject
      };
    } else {
      // LEGACY MODE: DERIVE FROM FILE/FOLDER STRUCTURE.
      const basename = filename.endsWith('.md') ? filename.slice(0, -3) : filename;
      const prefixRegex = /^(?:\d{4}-\d{2}-\d{2}\s+)?(?:\([^)]+\)\s*)?/;
      const titleToParse = basename.replace(prefixRegex, '');

      const { project, subproject } = parseTitleForProject(titleToParse);

      return {
        hierarchy: calendarSource,
        project: project,
        subproject: subproject
      };
    }
  })();

  // If the IIFE returned null, it means the record should be skipped.
  if (!hierarchy || !project || !subproject) {
    return null;
  }
  // --- END OF CORRECTED LOGIC ---

  let recordDate: Date | null = null;
  if ('date' in event && event.date) {
    const d = new Date(event.date);
    if (!isNaN(d.getTime())) {
      recordDate = d;
    }
  }

  const metadata: OFCEvent = { ...event };
  if (metadata.type === 'recurring') {
    if (metadata.startRecur && typeof metadata.startRecur === 'string') {
      (metadata as any).startRecur = new Date(metadata.startRecur);
    }
    if (metadata.endRecur && typeof metadata.endRecur === 'string') {
      (metadata as any).endRecur = new Date(metadata.endRecur);
    }
  }

  return {
    _id: uniqueId, // <-- ADD THIS LINE
    path,
    hierarchy,
    project,
    subproject,
    subprojectFull: subproject,
    duration,
    file: filename,
    date: recordDate,
    metadata: metadata,
    _effectiveDurationInPeriod: duration
  };
}
