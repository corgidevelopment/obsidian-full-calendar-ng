import { OFCEvent, validateEvent } from "../types";
import { CachedMetadata, ListItemCache, Loc, Pos } from "obsidian";
import { AddToHeadingProps, Line } from "./tmpTypes";

export const listRegex = /^(\s*)-\s+(\[(.)]\s+)?/;
export const checkboxRegex = /^\s*-\s+\[(.)]\s+/;
export const fieldRegex = /\[([^\]]+):: ?([^\]]+)]/g;

export const DATE_FORMAT = "YYYY-MM-DD";

//lol, parseBool returning a string 😂
export function parseBool(s: string): boolean | string {
  return s === "true" ? true : s === "false" ? false : s;
}

// string | false | null 🤣
export function checkboxTodo(s: string): string | false | null {
  const match = s.match(checkboxRegex);
  if (!match || !match[1]) {
    return null;
  }
  return match[1] === " " ? false : match[1];
}

export function getAllInlineEventsFromFile(
  fileText: string,
  listItems: ListItemCache[],
  fileGlobalAttrs: Partial<OFCEvent>
): { lineNumber: number; event: OFCEvent }[] {
  const lines = fileText.split("\n");
  const listItemText: Line[] = listItems
    .map((i) => i.position.start.line)
    .map((idx) => ({ lineNumber: idx, text: lines[idx] }));

  return listItemText
    .map((l) => ({
      lineNumber: l.lineNumber,
      event: getInlineEventFromLine(l.text, {
        ...fileGlobalAttrs,
        type: "single",
      }),
    }))
    .flatMap(({ event, lineNumber }) => (event ? [{ event, lineNumber }] : []));
}

export function getInlineEventFromLine(
  text: string,
  globalAttrs: Partial<OFCEvent>
): OFCEvent | null {
  const attrs = getInlineAttributes(text);
  // Shortcut validation if there are no inline attributes.
  if (Object.keys(attrs).length === 0) {
    return null;
  }

  return validateEvent({
    title: text.replace(listRegex, "").replace(fieldRegex, "").trim(),
    completed: checkboxTodo(text),
    ...globalAttrs,
    ...attrs,
  });
}

export function getInlineAttributes(
  s: string
): Record<string, string | boolean> {
  return Object.fromEntries(
    Array.from(s.matchAll(fieldRegex)).map((m) => [m[1], parseBool(m[2])])
  );
}

export function getHeadingPosition({
  headingText,
  metadata,
  endOfDoc,
}: {
  headingText: string;
  metadata: CachedMetadata;
  endOfDoc: Loc;
}) {
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

export function getListsUnderHeading({
  headingText,
  metadata,
}: {
  headingText: string;
  metadata: CachedMetadata;
}): ListItemCache[] {
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
  return metadata.listItems?.filter(
    (l) =>
      headingPos.start.offset < l.position.start.offset &&
      l.position.end.offset <= headingPos.end.offset
  );
}

const makeListItem = (
  data: OFCEvent,
  whitespacePrefix: string = ""
): string => {
  if (data.type !== "single") {
    throw new Error("Can only pass in single event.");
  }
  const { completed, title } = data;
  const checkbox = (() => {
    if (completed !== null && completed !== undefined) {
      return `[${completed ? "x" : " "}]`;
    }
    return null;
  })();

  const attrs: Partial<OFCEvent> = { ...data };
  delete attrs["completed"];
  delete attrs["title"];
  delete attrs["type"];
  delete attrs["date"];

  for (const key of <(keyof OFCEvent)[]>Object.keys(attrs)) {
    if (attrs[key] === undefined || attrs[key] === null) {
      delete attrs[key];
    }
  }

  if (!attrs["allDay"]) {
    delete attrs["allDay"];
  }

  return `${whitespacePrefix}- ${
    checkbox || ""
  } ${title} ${generateInlineAttributes(attrs)}`;
};

export function addToHeading({
  page,
  heading,
  headingText,
  item,
}: AddToHeadingProps): { page: string; lineNumber: number } {
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
