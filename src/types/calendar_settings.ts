/**
 * @file calendar_settings.ts
 * @brief Defines the schemas and types for calendar source configurations.
 *
 * @description
 * This file uses the `zod` library to define strongly-typed schemas for the
 * various calendar source types (local, dailynote, ical, caldav). These
 * schemas are used to parse and validate the calendar configurations stored
 * in `data.json`, ensuring data integrity and providing type safety
 * throughout the plugin.
 *
 * @license See LICENSE.md
 */

import { ZodError, z } from 'zod';
import { OFCEvent } from './schema';
import { getNextColor } from '../ui/colors';

const calendarOptionsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('local'), directory: z.string() }),
  z.object({ type: z.literal('dailynote'), heading: z.string() }),
  z.object({ type: z.literal('ical'), url: z.string().url() }),
  z.object({
    type: z.literal('caldav'),
    name: z.string(),
    url: z.string().url(),
    homeUrl: z.string().url(),
    username: z.string(),
    password: z.string()
  })
]);

const colorValidator = z.object({ color: z.string() });

export type TestSource = {
  type: 'FOR_TEST_ONLY';
  id: string;
  events?: OFCEvent[];
};

export type CalendarInfo = (z.infer<typeof calendarOptionsSchema> | TestSource) &
  z.infer<typeof colorValidator>;

export function parseCalendarInfo(obj: unknown): CalendarInfo {
  const options = calendarOptionsSchema.parse(obj);
  const color = colorValidator.parse(obj);

  return { ...options, ...color };
}

export function safeParseCalendarInfo(obj: unknown): CalendarInfo | null {
  try {
    return parseCalendarInfo(obj);
  } catch (e) {
    if (e instanceof ZodError) {
      console.debug('Parsing calendar info failed with errors', {
        obj,
        error: e.message
      });
    }
    return null;
  }
}

/**
 * Construct a partial calendar source of the specified type.
 * ACCEPTS TWO ARGUMENTS.
 */
export function makeDefaultPartialCalendarSource(
  type: CalendarInfo['type'] | 'icloud',
  existingColors: string[]
): Partial<CalendarInfo> {
  const newColor = getNextColor(existingColors);

  if (type === 'icloud') {
    return {
      type: 'caldav',
      color: newColor,
      url: 'https://caldav.icloud.com'
    };
  }

  return {
    type: type,
    color: newColor
  };
}
