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
 * Parses a title that contains only subcategory and title in "SubCategory - Title" format.
 * This is used when the category is managed separately (e.g., in the edit modal).
 *
 * @param titleWithSubcategory The title string containing subcategory and title.
 * @returns An object containing the parsed `subCategory` and `title`.
 */
export function parseSubcategoryTitle(titleWithSubcategory: string): {
  subCategory: string | undefined;
  title: string;
} {
  const parts = titleWithSubcategory.split(' - ');

  if (parts.length >= 2) {
    // Case: "SubCategory - Title" (robust to extra dashes)
    const subCategory = parts[0].trim();
    const title = parts.slice(1).join(' - ').trim();

    // Ensure parts are not empty strings
    if (subCategory && title) {
      return { subCategory, title };
    }
  }

  // Case: "Title only" or invalid format
  return { subCategory: undefined, title: titleWithSubcategory };
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
  if (subCategory) {
    return `${subCategory} - ${title}`;
  }
  return title;
}
