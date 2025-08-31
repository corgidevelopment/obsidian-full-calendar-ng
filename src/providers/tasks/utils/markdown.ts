/**
 * @file markdown.ts
 * @brief Markdown parsing utilities for task identification.
 *
 * @description
 * Provides utilities for parsing markdown content, specifically for identifying
 * checklist items (tasks) and extracting their components.
 *
 * @license See LICENSE.md
 */

/**
 * Checks if a line is a checklist item (task).
 */
export function isChecklistItem(line: string): boolean {
  return /^\s*-\s*\[[\sx]\]\s*/.test(line);
}

/**
 * Checks if a checklist item is completed.
 */
export function isChecklistItemCompleted(line: string): boolean {
  return /^\s*-\s*\[x\]\s*/i.test(line);
}

/**
 * Extracts the content of a checklist item without the checkbox syntax.
 */
export function getChecklistItemContent(line: string): string {
  const match = line.match(/^\s*-\s*\[[\sx]\]\s*(.*)$/);
  return match ? match[1] : line;
}

/**
 * Parses all checklist items from a markdown content string.
 */
export function parseChecklistItems(content: string): Array<{
  line: string;
  lineNumber: number;
  isCompleted: boolean;
  content: string;
}> {
  const lines = content.split('\n');
  const checklistItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChecklistItem(line)) {
      checklistItems.push({
        line,
        lineNumber: i + 1, // 1-based line numbers
        isCompleted: isChecklistItemCompleted(line),
        content: getChecklistItemContent(line)
      });
    }
  }

  return checklistItems;
}
