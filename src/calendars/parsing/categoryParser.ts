/**
 * @file categoryParser.ts
 * @brief Provides utility functions for parsing and constructing event titles with categories and sub-categories.
 *
 * @description
 * This file centralizes the logic for handling the `Category - SubCategory - Title` format.
 * It ensures that the parsing and reconstruction of event titles are consistent
 * across the entire plugin.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../types';
import { FullCalendarSettings } from '../../types/settings';

/**
 * Parses a full title string into its category, sub-category, and clean title components.
 * The format is `Category - SubCategory - Title`. A sub-category is only parsed
 * if at least two ` - ` delimiters are present.
 *
 * @param fullTitle The complete title string from the event source.
 * @returns An object containing the parsed `category`, `subCategory`, and `title`.
 */
export function parseTitle(fullTitle: string): {
  category: string | undefined;
  subCategory: string | undefined;
  title: string;
} {
  const parts = fullTitle.split(' - ');

  if (parts.length >= 3) {
    // Case: "Category - SubCategory - Title"
    const category = parts[0].trim();
    const subCategory = parts[1].trim();
    const title = parts.slice(2).join(' - ').trim();

    // Ensure parts are not empty strings
    if (category && subCategory && title) {
      return { category, subCategory, title };
    }
  }

  if (parts.length === 2) {
    // Case: "Category - Title"
    const category = parts[0].trim();
    const title = parts[1].trim();

    // Ensure parts are not empty strings
    if (category && title) {
      return { category, subCategory: undefined, title };
    }
  }

  // Case: "Title only" or invalid format
  return { category: undefined, subCategory: undefined, title: fullTitle };
}

/**
 * Constructs the full title string from a category, sub-category, and a clean title.
 *
 * @param category The category string.
 * @param subCategory The sub-category string.
 * @param title The clean event title.
 * @returns The reconstructed full title string.
 */
export function constructTitle(
  category: string | undefined,
  subCategory: string | undefined,
  title: string
): string {
  if (category && subCategory) {
    return `${category} - ${subCategory} - ${title}`;
  }
  if (category) {
    return `${category} - ${title}`;
  }
  return title;
}

/**
 * Takes a raw OFCEvent and enhances it with parsed category/sub-category
 * information if the advanced categorization setting is enabled.
 *
 * @param rawEvent The event object with an un-parsed title.
 * @param settings The plugin's settings.
 * @returns An enhanced OFCEvent with title, category, and subCategory correctly populated.
 */
export function enhanceEvent(rawEvent: OFCEvent, settings: FullCalendarSettings): OFCEvent {
  if (!settings.enableAdvancedCategorization) {
    // If the feature is off, just return the event as-is.
    return rawEvent;
  }

  // If the feature is on, parse the title.
  const { category, subCategory, title } = parseTitle(rawEvent.title);

  // Return a new event object with the parsed fields.
  return {
    ...rawEvent,
    title,
    category,
    subCategory
  };
}
