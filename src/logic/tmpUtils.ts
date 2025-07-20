import { type CachedMetadata, type ListItemCache, type Loc, parseYaml, type Pos, type TFile } from "obsidian";
import type { Line } from "./Line";
import type { AddToHeadingProps } from "./AddToHeadingProps";
import type { PrintableAtom } from "./PrintableAtom";
import { type AnyEvent, isEvent, isNotAllDay, isRecurring } from "./Event";
import { DateTime } from "luxon";
import { createDailyNote, getDailyNote, getDateFromFile } from "obsidian-daily-notes-interface";
import type { Moment } from "moment";
import moment from "moment/moment";

export const listRegex = /^(\s*)-\s+(\[(.)]\s+)?/;
export const fieldRegex = /\[([^\]]+):: ?([^\]]+)]/g;

export const DATE_FORMAT = "YYYY-MM-DD";

export function parseBool(s: string): boolean {
  if (s.toLowerCase() === "true") {
    return true;
  } else if (s.toLowerCase() === "false") {
    return false;
  }
  throw new Error(`error parsing ${s} as boolean `);
}

export function getAllInlineEventsFromFile(
  fileText: string,
  listItems: ListItemCache[],
  fileGlobalAttrs: Partial<AnyEvent>
): { lineNumber: number; event: AnyEvent }[] {
  const lines = fileText.split("\n");
  const listItemText: Line[] = listItems
    .map((i) => i.position.start.line)
    .map((idx) => ({
      lineNumber: idx,
      text: lines[idx]
    }));

  return listItemText
    .map((l) => ({
      lineNumber: l.lineNumber,
      event: getInlineEventFromLine(l.text, {
        ...fileGlobalAttrs
      })
    }))
    .flatMap(({ event, lineNumber }) => (event ? [{ event, lineNumber }] : []));
}

export function getInlineEventFromLine(_: string, __: Partial<AnyEvent>): AnyEvent | null {
  return null;
}

export function getInlineAttributes(s: string): Record<string, string | boolean> {
  return Object.fromEntries(Array.from(s.matchAll(fieldRegex)).map((m) => [m[1], parseBool(m[2])]));
}

export function getHeadingPosition({ headingText, metadata, endOfDoc }: { headingText: string; metadata: CachedMetadata; endOfDoc: Loc }) {
  if (!metadata.headings) {
    return null;
  }

  let level: number | null = null;
  let startingPos: Pos | null = null;
  let endingPos: Pos | null = null;

  for (const heading of metadata.headings) {
    if (!level && heading.heading === headingText) {
      level = heading.level;
      startingPos = heading.position;
    } else if (level && heading.level <= level) {
      endingPos = heading.position;
      break;
    }
  }

  if (!level || !startingPos) {
    return null;
  }

  return { start: startingPos.end, end: endingPos?.start || endOfDoc };
}

export function generateInlineAttributes(attrs: Record<string, any>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `[${k}:: ${v}]`)
    .join("  ");
}

export function getListsUnderHeading({ headingText, metadata }: { headingText: string; metadata: CachedMetadata }): ListItemCache[] {
  if (!metadata.listItems) {
    return [];
  }
  const endOfDoc = metadata.sections?.last()?.position.end;
  if (!endOfDoc) {
    return [];
  }
  const headingPos = getHeadingPosition({ headingText, metadata, endOfDoc });
  if (!headingPos) {
    return [];
  }
  return metadata.listItems?.filter((l) => headingPos.start.offset < l.position.start.offset && l.position.end.offset <= headingPos.end.offset);
}

export function makeListItem(data: AnyEvent, whitespacePrefix: string = ""): string {
  if (isNotAllDay(data)) {
    const { id, allDay } = data;
    let attrs = {};
    if (!allDay) {
      attrs = { id };
    } else {
      attrs = { id, allDay };
    }
    return `${whitespacePrefix}- ${data.title} ${generateInlineAttributes(attrs)}`;
  } else {
    throw new Error("Can only pass in single event.");
  }
}

export function addToHeading({ page, heading, headingText, item }: AddToHeadingProps): {
  page: string;
  lineNumber: number;
} {
  let lines = page.split("\n");

  const listItem = makeListItem(item);
  if (heading) {
    const headingLine = heading.position.start.line;
    const lineNumber = headingLine + 1;
    lines.splice(lineNumber, 0, listItem);
    return { page: lines.join("\n"), lineNumber };
  } else {
    lines.push(`## ${headingText}`);
    lines.push(listItem);
    return { page: lines.join("\n"), lineNumber: lines.length - 1 };
  }
}

export function basenameFromEvent(event: AnyEvent): string {
  if (isEvent(event)) {
    return `${event.start} ${event.title}`;
  } else if (isRecurring(event)) {
    return `(Every ${event.daysOfWeek.join(",")}) ${event.title}`;
  }
  throw new Error("unhandled event type passed to basenameFromEvent!");
}

export function filenameForEvent(event: AnyEvent): string {
  return `${basenameFromEvent(event)}.md`;
}

/**
 * @param page Contents of a markdown file.
 * @returns Whether or not this page has a frontmatter section.
 */
function hasFrontmatter(page: string): boolean {
  return page.indexOf(FRONTMATTER_SEPARATOR) === 0 && page.slice(3).indexOf(FRONTMATTER_SEPARATOR) !== -1;
}

/**
 * Return only frontmatter from a page.
 * @param page Contents of a markdown file.
 * @returns Frontmatter section of a page.
 */
export function extractFrontmatter(page: string): string | null {
  if (hasFrontmatter(page)) {
    return page.split(FRONTMATTER_SEPARATOR)[1];
  }
  return null;
}

/**
 * Remove frontmatter from a page.
 * @param page Contents of markdown file.
 * @returns Contents of a page without frontmatter.
 */
export function extractPageContents(page: string): string {
  if (hasFrontmatter(page)) {
    // Frontmatter lives between the first two --- linebreaks.
    return page.split("---").slice(2).join("---");
  } else {
    return page;
  }
}

export function replaceFrontmatter(page: string, newFrontmatter: string): string {
  return `---\n${newFrontmatter}---${extractPageContents(page)}`;
}

export function stringifyYamlAtom(v: PrintableAtom): string {
  let result = "";
  if (Array.isArray(v)) {
    result += "[";
    result += v.map(stringifyYamlAtom).join(",");
    result += "]";
  } else {
    result += `${v}`;
  }
  return result;
}

export function stringifyYamlLine(k: string | number | symbol, v: PrintableAtom): string {
  return `${String(k)}: ${stringifyYamlAtom(v)}`;
}

export function newFrontmatter(fields: Partial<AnyEvent>): string {
  return (
    "---\n" +
    Object.entries(fields)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => stringifyYamlLine(k, v))
      .join("\n") +
    "\n---\n"
  );
}

export function eventFromFrontmatter(fm: { [key: string]: any }): AnyEvent {
  if (fm["daysOfWeek"]?.length >= 0) {
    return {
      id: fm["id"],
      start: fm["start"],
      end: fm["end"],
      title: fm["title"],
      daysOfWeek: fm["daysOfWeek"]
    };
  } else {
    return {
      id: fm["id"],
      start: fm["start"],
      end: fm["end"],
      title: fm["title"],
      allDay: fm["allDay"]
    };
  }
}

export function modifyListItem(line: string, data: AnyEvent): string | null {
  const listMatch = line.match(listRegex);
  if (!listMatch) {
    console.warn("Tried modifying a list item with a position that wasn't a list item", { line });
    return null;
  }

  return makeListItem(data, listMatch[1]);
}

const FRONTMATTER_SEPARATOR = "---";

export function modifyFrontmatterString(page: string, modifications: Partial<AnyEvent>): string {
  const frontmatter = extractFrontmatter(page)?.split("\n");
  let newFrontmatter: string[] = [];
  if (!frontmatter) {
    newFrontmatter = Object.entries(modifications)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => stringifyYamlLine(k, v));
    page = "\n" + page;
  } else {
    const linesAdded: Set<string | number | symbol> = new Set();
    // Modify rows in-place.
    for (let i = 0; i < frontmatter.length; i++) {
      const line: string = frontmatter[i];
      const obj: Record<any, any> | null = parseYaml(line);
      if (!obj) {
        continue;
      }

      const keys = Object.keys(obj) as [keyof AnyEvent];
      if (keys.length !== 1) {
        throw new Error("One YAML line parsed to multiple keys.");
      }
      const key = keys[0];
      linesAdded.add(key);
      const newVal = modifications[key] instanceof DateTime ? modifications[key].toISODate() : modifications[key];
      if (newVal !== undefined) {
        newFrontmatter.push(stringifyYamlLine(key, newVal));
      } else {
        newFrontmatter.push(line);
      }
    }

    // Add all rows that were not originally in the frontmatter.
    newFrontmatter.push(
      ...(Object.keys(modifications) as [keyof AnyEvent])
        .filter((k) => !linesAdded.has(k))
        .filter((k) => modifications[k] !== undefined)
        .map((k) => stringifyYamlLine(k, modifications[k] as PrintableAtom))
    );
  }
  return replaceFrontmatter(page, newFrontmatter.join("\n") + "\n");
}

export function getDateFromDailyNote(file: TFile): DateTime | null {
  const m = getDateFromFile(file as any, "day");
  if (!m) return null;
  return momentToDateTime(m);
}

export function getDateOfDateTime(t: DateTime) {
  return t.startOf("day");
}

function momentToDateTime(m: Moment): DateTime {
  return DateTime.fromMillis(m.milliseconds());
}

function dateTimeToMoment(d: DateTime): Moment {
  return moment(d.toMillis());
}

export async function createDailyNoteByDateTime(d: DateTime): Promise<TFile> {
  return (await createDailyNote(dateTimeToMoment(d))) as unknown as TFile;
}

export function getDailyNoteByDateTime(d: DateTime, dailyNotes: any): TFile {
  return getDailyNote(dateTimeToMoment(d), dailyNotes as any) as unknown as TFile;
}
