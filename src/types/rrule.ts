/**
 * @file rrule.ts
 * @brief Standalone utility functions for handling RRule logic.
 *
 * @description
 * This file centralizes the creation and manipulation of RRule objects and strings
 * from OFCEvents. It ensures that the logic for generating iCalendar-compliant
 * recurrence rules is consistent across the plugin.
 *
 * @license See LICENSE.md
 */

import { RRule } from 'rrule';
import { DateTime } from 'luxon';

// Define a specific type for the data these functions operate on.
// This avoids issues with the broader OFCEvent union type.
export type RecurringEventData = {
  daysOfWeek: string[];
  startRecur: string;
  endRecur?: string;
};

/**
 * Creates an RRule object from recurring event properties.
 * @param event The recurring event data.
 * @returns An RRule object or null if the event data is invalid.
 */
export function getRruleFromEvent(event: RecurringEventData): RRule | null {
  if (!event.startRecur || !event.daysOfWeek || event.daysOfWeek.length === 0) {
    return null;
  }

  const weekdays = {
    U: RRule.SU,
    M: RRule.MO,
    T: RRule.TU,
    W: RRule.WE,
    R: RRule.TH,
    F: RRule.FR,
    S: RRule.SA
  };
  const byday = event.daysOfWeek.map(c => weekdays[c as keyof typeof weekdays]);

  // RRule constructor expects a native Date object.
  // We parse the ISO string and create a Date at UTC midnight to avoid timezone shifts.
  const dtstart = new Date(event.startRecur);

  let until: Date | null = null;
  if (event.endRecur) {
    // Set 'until' to be the end of the specified day.
    until = DateTime.fromISO(event.endRecur).endOf('day').toJSDate();
  }

  return new RRule({
    freq: RRule.WEEKLY,
    byweekday: byday,
    dtstart,
    until
  });
}

/**
 * Calculates the first occurrence of a recurring event.
 * @param event The recurring event data.
 * @returns A Luxon DateTime object of the first occurrence, or null.
 */
export function getFirstOccurrence(event: RecurringEventData): DateTime | null {
  const rule = getRruleFromEvent(event);
  if (!rule) return null;

  // The `after` method with `inc=true` finds the first date that matches the rule,
  // including the start date itself.
  const first = rule.after(rule.options.dtstart, true);
  return first ? DateTime.fromJSDate(first) : null;
}
