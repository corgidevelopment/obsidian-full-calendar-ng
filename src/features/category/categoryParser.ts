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
 * Only splits the title if the parsed category exists in the defined categories.
 * This prevents false positives like "Foo - Bar" from being split when "Marko"
 * is not a defined category.
 *
 * @param fullTitle The complete title string from the event source.
 * @param definedCategories Optional set of defined category names. If provided,
 *   the title will only be split if the parsed category exists in this set.
 * @returns An object containing the parsed `category`, `subCategory`, and `title`.
 */
export function parseTitle(
  fullTitle: string,
  definedCategories?: Set<string>
): {
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
      // Only split if category is defined (or no definedCategories provided for backward compatibility)
      if (!definedCategories || definedCategories.has(category)) {
        return { category, subCategory, title };
      } else {
        // Category detected but not defined - log and return full title
        console.debug(
          `[Full Calendar] Category "${category}" detected in title but not defined. Showing full title: "${fullTitle}"`
        );
        return { category: undefined, subCategory: undefined, title: fullTitle };
      }
    }
  }

  if (parts.length === 2) {
    // Case: "Category - Title"
    const category = parts[0].trim();
    const title = parts[1].trim();

    // Ensure parts are not empty strings
    if (category && title) {
      // Only split if category is defined (or no definedCategories provided for backward compatibility)
      if (!definedCategories || definedCategories.has(category)) {
        return { category, subCategory: undefined, title };
      } else {
        // Category detected but not defined - log and return full title
        console.debug(
          `[Full Calendar] Category "${category}" detected in title but not defined. Showing full title: "${fullTitle}"`
        );
        return { category: undefined, subCategory: undefined, title: fullTitle };
      }
    }
  }

  // Case: "Title only" or invalid format or category not defined
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
