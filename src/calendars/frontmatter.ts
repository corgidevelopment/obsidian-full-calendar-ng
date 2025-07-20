/**
 * @file frontmatter.ts
 * @brief A utility for parsing and manipulating YAML frontmatter in notes.
 *
 * @description
 * This file provides a set of pure functions for working with Obsidian's
 * YAML frontmatter. It centralizes the logic for creating, reading, and
 * modifying frontmatter, ensuring consistent behavior across the plugin.
 * This utility is primarily used by the `FullNoteCalendar` to manage event
 * data stored in note files.
 *
 * @see FullNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../types';
import { parseYaml } from 'obsidian';

const FRONTMATTER_SEPARATOR = '---';

/**
 * @param page Contents of a markdown file.
 * @returns Whether or not this page has a frontmatter section.
 */
function hasFrontmatter(page: string): boolean {
  return (
    page.startsWith(FRONTMATTER_SEPARATOR) && page.slice(3).indexOf(FRONTMATTER_SEPARATOR) !== -1
  );
}

/**
 * Return only frontmatter from a page.
 * @param page Contents of a markdown file.
 * @returns Frontmatter section of a page.
 */
function extractFrontmatter(page: string): string | null {
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
function extractPageContents(page: string): string {
  if (hasFrontmatter(page)) {
    return page.split(FRONTMATTER_SEPARATOR).slice(2).join(FRONTMATTER_SEPARATOR);
  }
  return page;
}

export function replaceFrontmatter(page: string, newFrontmatter: string): string {
  const contents = extractPageContents(page);
  // If the new frontmatter is empty, don't write any separators.
  if (!newFrontmatter || newFrontmatter.trim() === '') {
    return contents;
  }
  return `---\n${newFrontmatter.trim()}\n---${contents}`;
}

type PrintableAtom = Array<number | string> | number | string | boolean | null;

function stringifyYamlLine(k: string, v: PrintableAtom): string {
  if (v === null) return `${k}:`;
  if (Array.isArray(v)) return `${k}: [${v.join(',')}]`;
  return `${k}: ${v}`;
}

export function newFrontmatter(fields: Partial<OFCEvent>): string {
  const newFields = { ...fields };
  if (newFields.type === 'single') delete newFields.type;
  if (newFields.allDay) delete newFields.allDay;

  return Object.entries(newFields)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => stringifyYamlLine(k, v as PrintableAtom))
    .join('\n');
}

export function modifyFrontmatterString(page: string, modifications: Partial<OFCEvent>): string {
  const frontmatter = extractFrontmatter(page);
  const existingData = frontmatter ? parseYaml(frontmatter) : {};
  const newData = { ...existingData, ...modifications };

  // Remove properties that are null or undefined to keep frontmatter clean
  Object.keys(newData).forEach(key => {
    if (newData[key] === null || newData[key] === undefined) {
      delete newData[key];
    }
  });

  return replaceFrontmatter(page, newFrontmatter(newData));
}
