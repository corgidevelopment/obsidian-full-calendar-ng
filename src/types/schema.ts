/**
 * @file schema.ts
 * @brief Defines the Zod schema and TypeScript type for an OFCEvent.
 *
 * @description
 * This is a critical file that defines the canonical shape of an event object
 * (`OFCEvent`) within the plugin. It uses a `zod` schema to enforce structure,
 *  handle default values, and validate event data parsed from various sources.
 * This ensures that all events, regardless of origin, conform to a consistent
 * and predictable data model.
 *
 * @license See LICENSE.md
 */

import { z, ZodError } from 'zod';
import { DateTime, Duration } from 'luxon';

const stripTime = (date: DateTime) => {
  // Strip time from luxon dateTime.
  return DateTime.fromObject(
    {
      year: date.year,
      month: date.month,
      day: date.day
    },
    { zone: 'utc' }
  );
};

export const ParsedDate = z.string();
// z.string().transform((val, ctx) => {
//     const parsed = DateTime.fromISO(val, { zone: "utc" });
//     if (parsed.invalidReason) {
//         ctx.addIssue({
//             code: z.ZodIssueCode.custom,
//             message: parsed.invalidReason,
//         });
//         return z.NEVER;
//     }
//     return stripTime(parsed);
// });

export const ParsedTime = z.string();
// z.string().transform((val, ctx) => {
//     let parsed = DateTime.fromFormat(val, "h:mm a");
//     if (parsed.invalidReason) {
//         parsed = DateTime.fromFormat(val, "HH:mm");
//     }

//     if (parsed.invalidReason) {
//         ctx.addIssue({
//             code: z.ZodIssueCode.custom,
//             message: parsed.invalidReason,
//         });
//         return z.NEVER;
//     }

//     return Duration.fromISOTime(
//         parsed.toISOTime({
//             includeOffset: false,
//             includePrefix: false,
//         })
//     );
// });

export const TimeSchema = z.discriminatedUnion('allDay', [
  z.object({ allDay: z.literal(true) }),
  z.object({
    allDay: z.literal(false),
    startTime: ParsedTime,
    endTime: ParsedTime.nullable().default(null)
  })
]);

// MODIFICATION HAPPENS HERE
export const CommonSchema = z.object({
  title: z.string(), // This will now store the CLEAN title.
  id: z.string().optional(),
  uid: z.string().optional(), // Added line
  timezone: z.string().optional(),
  category: z.string().optional(), // This will store the parsed category.
  recurringEventId: z.string().optional() // The ID of the parent recurring event.
});

export const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('single'),
    date: ParsedDate,
    endDate: ParsedDate.nullable().default(null),
    completed: ParsedDate.or(z.literal(false)).or(z.literal(null)).optional()
  }),
  z.object({
    type: z.literal('recurring'),
    daysOfWeek: z.array(z.enum(['U', 'M', 'T', 'W', 'R', 'F', 'S'])),
    startRecur: ParsedDate.optional(),
    endRecur: ParsedDate.optional(),
    isTask: z.boolean().optional(),
    skipDates: z.array(ParsedDate).default([]) // <-- ADD THIS LINE
  }),
  z.object({
    type: z.literal('rrule'),
    startDate: ParsedDate,
    rrule: z.string(),
    skipDates: z.array(ParsedDate).default([]),
    isTask: z.boolean().optional() // Add this line
  })
]);

type EventType = z.infer<typeof EventSchema>;
type TimeType = z.infer<typeof TimeSchema>;
type CommonType = z.infer<typeof CommonSchema>;

export type OFCEvent = CommonType & TimeType & EventType;

export function parseEvent(obj: unknown): OFCEvent {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('value for parsing was not an object.');
  }
  const hasTime = 'startTime' in obj && !!(obj as any).startTime;
  const objectWithDefaults = { type: 'single', allDay: !hasTime, ...obj };
  const result = {
    ...CommonSchema.parse(objectWithDefaults),
    ...TimeSchema.parse(objectWithDefaults),
    ...EventSchema.parse(objectWithDefaults)
  };
  return result;
}

export function validateEvent(obj: unknown): OFCEvent | null {
  try {
    return parseEvent(obj);
  } catch (e) {
    if (e instanceof ZodError) {
      // console.debug('Parsing failed with errors', {
      //   obj,
      //   message: e.message
      // });
    }
    return null;
  }
}
type Json = { [key: string]: Json } | Json[] | string | number | true | false | null;

export function serializeEvent(obj: OFCEvent): Json {
  return { ...obj };
}
