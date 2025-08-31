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
 * Removes emoji and metadata from the end of a task title.
 */
export function cleanTaskTitle(title: string, symbols: string[] = ['📅', '⏰', '🔁']): string {
  let cleaned = title;

  for (const symbol of symbols) {
    const index = cleaned.indexOf(symbol);
    if (index !== -1) {
      cleaned = cleaned.substring(0, index).trim();
    }
  }

  return cleaned;
}
