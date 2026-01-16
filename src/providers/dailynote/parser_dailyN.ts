/**
 * @file parser.ts
 * @brief Handles serialization/deserialization of events from daily notes.
 *
 * @description
 * This module contains all the logic for parsing OFCEvents from plain text lines
 * and for serializing them back into list items with inline attributes. It is
 * decoupled from the Obsidian API and file system.
 *
 * @license See LICENSE.md
 */

import { CachedMetadata, HeadingCache, ListItemCache, Loc, Pos } from 'obsidian';
import { DateTime } from 'luxon';

import { OFCEvent, validateEvent } from '../../types';
import { FullCalendarSettings } from '../../types/settings';

// TYPES AND CONSTANTS
// =================================================================================================

type AddToHeadingProps = {
  heading: HeadingCache | undefined;
  item: OFCEvent;
  headingText: string;
};

export const fieldRegex = /\s*\[.*?\]\s*/g;
export const listRegex = /^(\s*)-\s+(\[(.)\]\s+)?/;
const checkboxRegex = /^\s*-\s+\[(.)\]\s+/;
const inlineFieldRegex = /\[([^\]]+):: ?([^\]]+)\]/g;

// INTERNAL HELPERS
// =================================================================================================

const parseBool = (s: string): boolean | string =>
  s === 'true' ? true : s === 'false' ? false : s;

const checkboxTodo = (s: string) => {
  const match = s.match(checkboxRegex);
  if (!match || !match[1]) return null;
  return match[1] === ' ' ? false : match[1];
};

const getHeadingPosition = (
  headingText: string,
  metadata: CachedMetadata,
  endOfDoc: Loc
): Pos | null => {
  if (!metadata.headings) return null;
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
  if (!level || !startingPos) return null;
  return { start: startingPos.end, end: endingPos?.start || endOfDoc };
};

export const getListsUnderHeading = (
  headingText: string,
  metadata: CachedMetadata
): ListItemCache[] => {
  if (!metadata.listItems) return [];
  const endOfDoc = metadata.sections?.last()?.position.end;
  if (!endOfDoc) return [];
  const headingPos = getHeadingPosition(headingText, metadata, endOfDoc);
  if (!headingPos) return [];
  return metadata.listItems?.filter(
    l =>
      headingPos.start.offset < l.position.start.offset &&
      l.position.end.offset <= headingPos.end.offset
  );
};

const generateInlineAttributes = (attrs: Record<string, unknown>): string => {
  return Object.entries(attrs)
    .map(([k, v]) => `[${k}:: ${String(v)}]`)
    .join('  ');
};

const makeListItem = (
  data: OFCEvent,
  whitespacePrefix: string = '',
  settings: FullCalendarSettings
): string => {
  if (data.type !== 'single') throw new Error('Can only pass in single event.');
  const { completed, title } = data;
  const checkbox = (() => {
    if (completed !== null && completed !== undefined) {
      return `[${completed ? 'x' : ' '}]`;
    }
    return null;
  })();

  const titleToWrite = title;

  const attrs: Partial<OFCEvent> = { ...data };
  // If endDate is present but is the same as the start date, nullify it so it isn't written to the file.
  if (attrs.endDate && attrs.date === attrs.endDate) {
    attrs.endDate = null;
  }

  delete attrs['completed'];
  delete attrs['title'];
  delete attrs['type'];
  delete attrs['date'];
  delete attrs['category'];
  delete attrs['subCategory'];

  for (const key of <(keyof OFCEvent)[]>Object.keys(attrs)) {
    if (attrs[key] === undefined || attrs[key] === null) {
      delete attrs[key];
    }
  }

  if (!attrs['allDay']) delete attrs['allDay'];

  return `${whitespacePrefix}- ${checkbox || ''} ${titleToWrite} ${generateInlineAttributes(attrs)}`;
};

// PUBLIC API
// =================================================================================================

export function getInlineAttributes(s: string): Record<string, string | boolean> {
  return Object.fromEntries(
    Array.from(s.matchAll(inlineFieldRegex)).map(m => [m[1], parseBool(m[2])])
  );
}

export const getInlineEventFromLine = (
  text: string,
  globals: Partial<OFCEvent>
): OFCEvent | null => {
  const attrs = getInlineAttributes(text);

  const hasInlineFields = Object.keys(attrs).length > 0;
  if (!hasInlineFields) {
    return null;
  }

  const titleWithExtraSpaces = text.replace(listRegex, '').replace(fieldRegex, '');
  const rawTitle = titleWithExtraSpaces.replace(/\s+/g, ' ').trim();

  if (!rawTitle && !hasInlineFields) {
    return null;
  }

  const eventData: Partial<OFCEvent> = { title: rawTitle };

  const allDay = !('startTime' in attrs && !!attrs.startTime);

  const attrsForValidation: Record<string, unknown> = {
    ...eventData,
    completed: checkboxTodo(text),
    ...globals,
    ...attrs,
    allDay
  };

  // Handle legacy overnight events if no explicit endDate is provided.
  const startTimeValue = attrsForValidation.startTime;
  const endTimeValue = attrsForValidation.endTime;

  if (
    !attrsForValidation.endDate &&
    !allDay &&
    typeof startTimeValue === 'string' &&
    typeof endTimeValue === 'string'
  ) {
    if (endTimeValue < startTimeValue) {
      const startDate = attrsForValidation.date as string;
      if (startDate) {
        attrsForValidation.endDate = DateTime.fromISO(startDate).plus({ days: 1 }).toISODate();
      }
    }
  }

  if (!('date' in attrsForValidation)) {
    attrsForValidation['date'] = '1970-01-01';
  }

  return validateEvent(attrsForValidation as OFCEvent);
};

export function getAllInlineEventsFromFile(
  text: string,
  listItems: ListItemCache[],
  globals: Partial<OFCEvent>
): { event: OFCEvent; lineNumber: number }[] {
  return listItems
    .map(item => {
      const lineNumber = item.position.start.line;
      const line = text.split('\n')[lineNumber];
      const event = getInlineEventFromLine(line, globals);
      if (!event) {
        return null;
      }
      return { event, lineNumber };
    })
    .flatMap(e => (e ? [e] : []));
}

export const modifyListItem = (
  line: string,
  data: OFCEvent,
  settings: FullCalendarSettings
): string | null => {
  const listMatch = line.match(listRegex);
  if (!listMatch) {
    console.warn("Tried modifying a list item with a position that wasn't a list item", { line });
    return null;
  }
  return makeListItem(data, listMatch[1], settings);
};

export const addToHeading = (
  page: string,
  { heading, item, headingText }: AddToHeadingProps,
  settings: FullCalendarSettings
): { page: string; lineNumber: number } => {
  const lines = page.split('\n');
  const listItem = makeListItem(item, '', settings);
  if (heading) {
    const headingLine = heading.position.start.line;
    const lineNumber = headingLine + 1;
    lines.splice(lineNumber, 0, listItem);
    return { page: lines.join('\n'), lineNumber };
  } else {
    lines.push(`## ${headingText}`);
    lines.push(listItem);
    return { page: lines.join('\n'), lineNumber: lines.length - 1 };
  }
};
