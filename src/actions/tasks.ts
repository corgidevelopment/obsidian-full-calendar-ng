/**
 * @file tasks.ts
 * @brief Provides utility functions for handling task-related events.
 *
 * @description
 * This file contains core business logic for managing the "task" aspect of an event.
 * It includes logic for identifying if an event is a task (`isTask`), toggling
 * its completion status (`toggleTask`), and converting a regular event into a
 * task or vice-versa (`unmakeTask`).
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from '../types';

export const isTask = (e: OFCEvent) => {
  if (e.type === 'single') {
    return e.completed !== undefined && e.completed !== null;
  }
  if (e.type === 'recurring' || e.type === 'rrule') {
    return !!e.isTask;
  }
  return false;
};

export const unmakeTask = (event: OFCEvent): OFCEvent => {
  if (event.type === 'single') {
    return { ...event, completed: null };
  }
  if (event.type === 'recurring' || event.type === 'rrule') {
    return { ...event, isTask: false };
  }
  return event;
};

export const toggleTask = (event: OFCEvent, isDone: boolean): OFCEvent => {
  if (event.type === 'single') {
    if (isDone) {
      return { ...event, completed: DateTime.now().toISO() };
    } else {
      return { ...event, completed: false };
    }
  }

  if (event.type === 'recurring' || event.type === 'rrule') {
    // For a recurring series, "toggling" means defining it as a task series.
    // The `isDone` parameter is irrelevant here.
    return { ...event, isTask: true };
  }

  return event;
};
