/**
 * @file index.ts
 * @brief Provides utility functions for handling task-related events.
 *
 * @description
 * This file contains helper functions to manage the "task" aspect of an event.
 * It includes logic for identifying if an event is a task (`isTask`), toggling
 * its completion status (`toggleTask`), and converting a regular event into a
 * task or vice-versa (`unmakeTask`).
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { OFCEvent } from 'src/types';

export const isTask = (e: OFCEvent) =>
  e.type === 'single' && e.completed !== undefined && e.completed !== null;

export const unmakeTask = (event: OFCEvent): OFCEvent => {
  if (event.type !== 'single') {
    return event;
  }
  return { ...event, completed: null };
};

export const toggleTask = (event: OFCEvent, isDone: boolean): OFCEvent => {
  if (event.type !== 'single') {
    return event;
  }
  if (isDone) {
    return { ...event, completed: DateTime.now().toISO() };
  } else {
    return { ...event, completed: false };
  }
};
