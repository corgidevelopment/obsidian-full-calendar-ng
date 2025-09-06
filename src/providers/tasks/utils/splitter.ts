/**
 * @file splitter.ts
 * @brief String splitting utilities for task content parsing.
 *
 * @description
 * Provides utilities for splitting and tokenizing task content, particularly
 * for separating task titles from metadata like due dates and other emojis.
 *
 * @license See LICENSE.md
 */

import { TASK_EMOJIS } from '../TasksSettings';
import { DateTime } from 'luxon';

/**
 * Splits a string by an emoji/symbol, returning the parts before and after.
 */
export function splitBySymbol(
  text: string,
  symbol: string
): {
  before: string;
  after: string;
  found: boolean;
} {
  const index = text.indexOf(symbol);
  if (index === -1) {
    return {
      before: text.trim(),
      after: '',
      found: false
    };
  }

  return {
    before: text.substring(0, index).trim(),
    after: text.substring(index + symbol.length).trim(),
    found: true
  };
}

/**
 * Extracts the first date-like string from text.
 * Supports formats like: 2024-01-15, 2024/01/15, 15-01-2024, etc.
 */
export function extractDate(text: string): string | null {
  // Match various date formats
  const datePatterns = [
    /\b\d{4}-\d{1,2}-\d{1,2}\b/, // 2024-01-15
    /\b\d{4}\/\d{1,2}\/\d{1,2}\b/, // 2024/01/15
    /\b\d{1,2}-\d{1,2}-\d{4}\b/, // 15-01-2024
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, // 15/01/2024
    /\b\d{1,2}\.\d{1,2}\.\d{4}\b/ // 15.01.2024
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

/**
 * Validates if a date string represents a valid date.
 * @param dateString The date string to validate
 * @returns true if the date string represents a valid date, false otherwise
 */
export function isValidDateString(dateString: string): boolean {
  const formats = [
    'yyyy-MM-dd', // 2024-01-15
    'yyyy/MM/dd', // 2024/01/15
    'dd-MM-yyyy', // 15-01-2024
    'dd/MM/yyyy', // 15/01/2024
    'dd.MM.yyyy' // 15.01.2024
  ];

  for (const format of formats) {
    const date = DateTime.fromFormat(dateString, format);
    if (date.isValid) {
      return true;
    }
  }

  // Also try ISO parsing as fallback
  const isoDate = DateTime.fromISO(dateString);
  return isoDate.isValid;
}

/**
 * Robustly removes task metadata emojis and their associated values from a task title.
 *
 * This function surgically removes all Tasks plugin metadata while preserving user content:
 * - For date-related emojis (📅, 🛫, ⏳, ➕): removes both emoji and subsequent date string
 * - For completion emojis (✅, ❌): removes just the emoji
 * - Optionally removes tags (#tag) for cleaner calendar display
 * - Preserves all other content including user emojis, tags, links
 * - Handles emojis in any order and multiple occurrences
 *
 * @param title The raw task title containing potential metadata
 * @param taskEmojis Object containing all task emoji definitions (defaults to TASK_EMOJIS)
 * @param removeInvalidDateText Whether to remove text after date emojis if it's not a valid date (for backward compatibility)
 * @param removeTags Whether to remove #tags from the title for cleaner display
 * @returns The cleaned title with only the descriptive text and user content
 *
 * @example
 * cleanTaskTitleRobust("Review PR #42 🚀 📅 2025-09-01 ✅")
 * // Returns: "Review PR #42 🚀"
 *
 * cleanTaskTitleRobust("Meeting with team ⏳ 2025-08-15 🛫 2025-08-10 #work", TASK_EMOJIS, true, true)
 * // Returns: "Meeting with team"
 */
export function cleanTaskTitleRobust(
  title: string,
  taskEmojis: Record<string, string> = TASK_EMOJIS,
  removeInvalidDateText = true,
  removeTags = false
): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  let cleaned = title.trim();

  // Handle pure whitespace strings
  if (!cleaned) {
    return '';
  }

  // Define which emojis should have their associated dates removed
  const dateEmojis = new Set([
    taskEmojis.DUE, // 📅
    taskEmojis.START, // 🛫
    taskEmojis.SCHEDULED, // ⏳
    taskEmojis.DATE_CREATED // ➕
  ]);

  // Define which emojis should just be removed (no date parsing)
  const completionEmojis = new Set([
    taskEmojis.DONE, // ✅
    taskEmojis.CANCELLED // ❌
  ]);

  // Combine all emojis for processing
  const allTaskEmojis = [...dateEmojis, ...completionEmojis];

  // Process each type of emoji
  for (const emoji of allTaskEmojis) {
    // Keep processing until no more instances of this emoji are found
    while (true) {
      const { before, after, found } = splitBySymbol(cleaned, emoji);

      if (!found) {
        break; // No more instances of this emoji
      }

      if (dateEmojis.has(emoji)) {
        // For date-related emojis, remove emoji + associated date
        const dateString = extractDate(after);
        if (dateString && isValidDateString(dateString)) {
          // Valid date found, remove both emoji and date
          const afterDateRemoved = after.replace(dateString, '').trim();
          cleaned = (before + ' ' + afterDateRemoved).replace(/\s+/g, ' ').trim();
        } else if (removeInvalidDateText && after.trim()) {
          // No valid date found, check if we should remove first word for backward compatibility
          const afterParts = after.trim().split(/\s+/);
          if (afterParts.length > 0 && afterParts[0]) {
            const firstWord = afterParts[0];
            // Only remove first word if it doesn't look like a date pattern at all
            const looksLikeDatePattern =
              /\d{4}[-/\.]\d{1,2}[-/\.]\d{4}|\d{1,2}[-/\.]\d{1,2}[-/\.]\d{4}|\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2}/.test(
                firstWord
              );

            if (!looksLikeDatePattern) {
              // First word doesn't look like a date - remove it for backward compatibility
              const remainingAfter = afterParts.slice(1).join(' ');
              cleaned = (before + ' ' + remainingAfter).replace(/\s+/g, ' ').trim();
            } else {
              // First word looks like a date pattern (even if invalid) - preserve it
              cleaned = (before + ' ' + after).replace(/\s+/g, ' ').trim();
            }
          } else {
            // Just remove the emoji
            cleaned = (before + ' ' + after).replace(/\s+/g, ' ').trim();
          }
        } else {
          // Just remove the emoji (preserve all text after)
          cleaned = (before + ' ' + after).replace(/\s+/g, ' ').trim();
        }
      } else if (completionEmojis.has(emoji)) {
        // For completion emojis, just remove the emoji
        cleaned = (before + ' ' + after).replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Remove tags if requested (after all other processing)
  if (removeTags) {
    // Remove tags (#word) but preserve other content
    cleaned = cleaned
      .replace(/(^|\s)#[^\s]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return cleaned;
}
