/**
 * @file categoryParser.ts
 * @brief Provides utility functions for parsing and constructing event titles with categories.
 *
 * @description
 * This file centralizes the logic for handling the `Category - Title` format.
 * It ensures that the parsing and reconstruction of event titles are consistent
 * across the entire plugin, from data ingress (reading files) to egress (writing files).
 *
 * @license See LICENSE.md
 */

/**
 * Parses a full title string into its category and clean title components.
 * The category is everything before the first " - " delimiter.
 *
 * @param fullTitle The complete title string from the event source.
 * @returns An object containing the parsed `category` (or undefined) and `title`.
 */
export function parseTitle(fullTitle: string): { category: string | undefined; title: string } {
  // Use `indexOf` and `slice` for performance and to only split on the first occurrence.
  const delimiterIndex = fullTitle.indexOf(' - ');

  if (delimiterIndex === -1) {
    // No delimiter found, the entire string is the title.
    return { category: undefined, title: fullTitle };
  }

  const category = fullTitle.slice(0, delimiterIndex);
  const title = fullTitle.slice(delimiterIndex + 3); // +3 to skip ' - '

  // Ensure category is not an empty string if the title was e.g. " - My Event"
  if (category.trim() === '') {
    return { category: undefined, title: fullTitle };
  }

  return { category, title };
}

/**
 * Constructs the full title string from a category and a clean title.
 *
 * @param category The category string, or undefined if no category.
 * @param title The clean event title.
 * @returns The reconstructed full title string.
 */
export function constructTitle(category: string | undefined, title: string): string {
  if (!category || category.trim() === '') {
    return title;
  }
  return `${category} - ${title}`;
}
