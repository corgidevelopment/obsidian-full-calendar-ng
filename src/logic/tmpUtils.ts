import { type OFCEvent, validateEvent } from "../types";
import { type CachedMetadata, type ListItemCache, type Loc, parseYaml, type Pos } from "obsidian";
import { type AddToHeadingProps, type Line, type PrintableAtom } from "./tmpTypes";
import { rrulestr } from "rrule";

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
  const listItemText: Line[] = listItems.map((i) => i.position.start.line).map((idx) => ({ lineNumber: idx, text: lines[idx] }));

  return listItemText
    .map((l) => ({
      lineNumber: l.lineNumber,
      event: getInlineEventFromLine(l.text, {
        ...fileGlobalAttrs,
        type: "single"
      })
    }))
    .flatMap(({ event, lineNumber }) => (event ? [{ event, lineNumber }] : []));
}

export function getInlineEventFromLine(text: string, globalAttrs: Partial<OFCEvent>): OFCEvent | null {
  const attrs = getInlineAttributes(text);
  // Shortcut validation if there are no inline attributes.
  if (Object.keys(attrs).length === 0) {
    return null;
  }

  return validateEvent({
    title: text.replace(listRegex, "").replace(fieldRegex, "").trim(),
    completed: checkboxTodo(text),
    ...globalAttrs,
    ...attrs
  });
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

const makeListItem = (data: OFCEvent, whitespacePrefix: string = ""): string => {
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

  return `${whitespacePrefix}- ${checkbox || ""} ${title} ${generateInlineAttributes(attrs)}`;
};

export function addToHeading({ page, heading, headingText, item }: AddToHeadingProps): { page: string; lineNumber: number } {
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

export function basenameFromEvent(event: OFCEvent): string {
  switch (event.type) {
    case undefined:
    case "single":
      return `${event.date} ${event.title}`;
    case "recurring":
      return `(Every ${event.daysOfWeek.join(",")}) ${event.title}`;
    case "rrule":
      return `(${rrulestr(event.rrule).toText()}) ${event.title}`;
  }
}

export function filenameForEvent(event: OFCEvent): string {
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

export function newFrontmatter(fields: Partial<OFCEvent>): string {
  return (
    "---\n" +
    Object.entries(fields)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => stringifyYamlLine(k, v))
      .join("\n") +
    "\n---\n"
  );
}

export function modifyListItem(line: string, data: OFCEvent): string | null {
  const listMatch = line.match(listRegex);
  if (!listMatch) {
    console.warn("Tried modifying a list item with a position that wasn't a list item", { line });
    return null;
  }

  return makeListItem(data, listMatch[1]);
}

const FRONTMATTER_SEPARATOR = "---";

export function modifyFrontmatterString(page: string, modifications: Partial<OFCEvent>): string {
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

      const keys = Object.keys(obj) as [keyof OFCEvent];
      if (keys.length !== 1) {
        throw new Error("One YAML line parsed to multiple keys.");
      }
      const key = keys[0];
      linesAdded.add(key);
      const newVal: PrintableAtom | undefined = modifications[key];
      if (newVal !== undefined) {
        newFrontmatter.push(stringifyYamlLine(key, newVal));
      } else {
        // Just push the old line if we don't have a modification.
        newFrontmatter.push(line);
      }
    }

    // Add all rows that were not originally in the frontmatter.
    newFrontmatter.push(
      ...(Object.keys(modifications) as [keyof OFCEvent])
        .filter((k) => !linesAdded.has(k))
        .filter((k) => modifications[k] !== undefined)
        .map((k) => stringifyYamlLine(k, modifications[k] as PrintableAtom))
    );
  }
  return replaceFrontmatter(page, newFrontmatter.join("\n") + "\n");
}
