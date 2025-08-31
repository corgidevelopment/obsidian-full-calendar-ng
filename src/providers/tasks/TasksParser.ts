/**
 * @file TasksParser.ts
 * @brief Core parsing logic for Obsidian Tasks format.
 *
 * @description
 * This module provides parsing functionality for tasks in Obsidian's markdown
 * format, specifically those managed by the Obsidian Tasks plugin. It can
 * identify and extract task information including title, due dates, and
 * completion status.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { parseChecklistItems } from './utils/markdown';
import { splitBySymbol, extractDate, cleanTaskTitle } from './utils/splitter';
import { getDueDateEmoji } from './TasksSettings';

export interface ParsedTask {
  title: string;
  date: DateTime;
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export class TasksParser {
  /**
   * Parses a single line of text for task information.
   * @param line The line of text to parse
   * @param filePath The path to the file containing this line
   * @param lineNumber The line number (1-based)
   * @returns A ParsedTask object if the line contains a valid task with due date, null otherwise
   */
  parseLine(line: string, filePath: string, lineNumber: number): ParsedTask | null {
    // Check if the line is a checklist item
    if (!/^\s*-\s*\[[\sx]\]\s*/.test(line)) {
      return null;
    }

    const dueDateEmoji = getDueDateEmoji();

    // Extract checklist content without checkbox syntax
    const contentMatch = line.match(/^\s*-\s*\[[\sx]\]\s*(.*)$/);
    if (!contentMatch) {
      return null;
    }

    const content = contentMatch[1];
    const isCompleted = /^\s*-\s*\[x\]\s*/i.test(line);

    // Check if the content contains the due date emoji
    const { before: titlePart, after: afterEmoji, found } = splitBySymbol(content, dueDateEmoji);

    if (!found) {
      return null; // No due date found
    }

    // Extract the date from the text after the emoji
    const dateString = extractDate(afterEmoji);
    if (!dateString) {
      return null; // No valid date found
    }

    // Parse the date using Luxon
    const date = this.parseDate(dateString);
    if (!date || !date.isValid) {
      return null; // Invalid date
    }

    // Clean the title by removing any remaining emoji and metadata
    const cleanedTitle = cleanTaskTitle(titlePart).trim();
    if (!cleanedTitle) {
      return null; // Empty title
    }

    return {
      title: cleanedTitle,
      date,
      isDone: isCompleted,
      location: {
        path: filePath,
        lineNumber
      }
    };
  }

  /**
   * Parses all tasks from a file's content.
   * @param content The complete file content
   * @param filePath The path to the file
   * @returns Array of ParsedTask objects
   */
  parseFileContent(content: string, filePath: string): ParsedTask[] {
    const checklistItems = parseChecklistItems(content);
    const tasks: ParsedTask[] = [];

    for (const item of checklistItems) {
      const task = this.parseLine(item.line, filePath, item.lineNumber);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Parses a date string into a DateTime object.
   * Supports various common date formats.
   * @param dateString The date string to parse
   * @returns A DateTime object or null if parsing fails
   */
  private parseDate(dateString: string): DateTime | null {
    // Try different date formats
    const formats = [
      'yyyy-MM-dd', // 2024-01-15
      'yyyy/MM/dd', // 2024/01/15
      'dd-MM-yyyy', // 15-01-2024
      'dd/MM/yyyy', // 15/01/2024
      'dd.MM.yyyy', // 15.01.2024
      'MM-dd-yyyy', // 01-15-2024
      'MM/dd/yyyy' // 01/15/2024
    ];

    for (const format of formats) {
      const date = DateTime.fromFormat(dateString, format);
      if (date.isValid) {
        return date;
      }
    }

    // Also try ISO parsing as fallback
    const isoDate = DateTime.fromISO(dateString);
    if (isoDate.isValid) {
      return isoDate;
    }

    return null;
  }
}
