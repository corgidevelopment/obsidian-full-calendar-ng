import { z } from "zod";

const calendarOptionsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("local"), directory: z.string() }),
  z.object({ type: z.literal("dailynote"), heading: z.string() }),
  z.object({ type: z.literal("ical"), url: z.string().url() }),
  z.object({
    type: z.literal("caldav"),
    name: z.string(),
    url: z.string().url(),
    homeUrl: z.string().url(),
    username: z.string(),
    password: z.string()
  })
]);

const colorValidator = z.object({ color: z.string() });

export type CalendarInfo = z.infer<typeof calendarOptionsSchema> & z.infer<typeof colorValidator>;

/**
 * Construct a partial calendar source of the specified type
 */
export function makeDefaultPartialCalendarSource(type: CalendarInfo["type"] | "icloud"): Partial<CalendarInfo> {
  if (type === "icloud") {
    return {
      type: "caldav",
      color: getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim(),
      url: "https://caldav.icloud.com"
    };
  }

  return {
    type: type,
    color: getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim()
  };
}
