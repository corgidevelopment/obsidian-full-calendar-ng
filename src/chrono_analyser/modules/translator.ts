// src/chrono_analyser/modules/translator.ts

/**
 * @file Responsible for converting event data from the main plugin's EventCache
 * into the TimeRecord format used by the ChronoAnalyser.
 */

import { StoredEvent } from 'src/core/EventStore';
import { TimeRecord } from './types';
import * as Utils from './utils';
import { OFCEvent } from 'src/types';

/**
 * Converts a StoredEvent from the main EventCache into a TimeRecord for analysis.
 *
 * @param storedEvent - The event object from the main plugin's cache.
 * @param calendarSourcePath - The path of the calendar this event belongs to. This defines the hierarchy.
 * @returns A structured TimeRecord object, or null if the event is not valid for analysis.
 */
export function storedEventToTimeRecord(
  storedEvent: StoredEvent,
  calendarSourcePath: string
): TimeRecord | null {
  const { event, location } = storedEvent;
  const { path } = location || {};

  if (!path) return null;

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

  // --- NEW HIERARCHY LOGIC ---
  // The hierarchy is now simply the path of the calendar source folder.
  const hierarchy = calendarSourcePath;
  const filename = path.split('/').pop() || '';

  // --- PROJECT/SUBPROJECT EXTRACTION from the event title ---
  // We will now use the FULL filename (which is often the event title in FullNoteCalendar)
  const basename = filename.endsWith('.md') ? filename.slice(0, -3) : filename;

  // Regex to handle date prefix, e.g., "2023-11-01 " or "(Every M) "
  const prefixRegex = /^(?:\d{4}-\d{2}-\d{2}\s+)?(?:\([^)]+\)\s*)?/;
  const titleWithoutPrefix = basename.replace(prefixRegex, '');

  const titleParts = titleWithoutPrefix.split(' - ');
  const project = titleParts[0]?.trim() || 'Unknown Project';
  let subproject = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : 'none';
  if (subproject === '') subproject = 'none';

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
