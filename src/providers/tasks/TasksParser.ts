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
import { splitBySymbol, extractDate, cleanTaskTitleRobust } from './utils/splitter';
import { getTaskDateEmojis, TASK_EMOJIS, getTasksPluginSettings, isDone } from './TasksSettings';
import { FullCalendarSettings } from '../../types/settings';

export interface ParsedDatedTask {
  title: string;
  startDate?: DateTime; // Start date (🛫) or scheduled date (⏳)
  endDate?: DateTime; // Due date (📅)
  date: DateTime; // Legacy compatibility - the primary date for display
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export interface ParsedUndatedTask {
  title: string;
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}

export type ParsedTaskResult =
  | { type: 'dated'; task: ParsedDatedTask }
  | { type: 'undated'; task: ParsedUndatedTask }
  | { type: 'none' };

export class TasksParser {
  // New: Patterns that, if found in a line, will cause the line to be entirely ignored.
  // This prevents parsing other plugin's metadata as duplicate events.
  private EXCLUSION_PATTERNS: RegExp[] = [
    // Example: Dataview inline fields or similar structures
    // For now, specifically targeting `[StartTime::` for exclusion
    /\s\[startTime::/ // Exclude any line containing this pattern
  ];

  // Store settings to access tag removal preference
  private settings: FullCalendarSettings | null = null;

  constructor(settings?: FullCalendarSettings) {
    this.settings = settings || null;
  }

  /**
   * Checks if a given line contains any patterns that indicate it should be excluded
   * from further task parsing. This helps prevent double-counting events from
   * other plugins or specific metadata.
   * @param line The input line from the markdown file.
   * @returns True if the line should be excluded, false otherwise.
   */
  private _isLineExcluded(line: string): boolean {
    for (const pattern of this.EXCLUSION_PATTERNS) {
      if (pattern.test(line)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a line should be considered a task based on the Tasks plugin's global filter.
   * If no global filter is set, all checklist items are considered tasks.
   * @param line The input line from the markdown file.
   * @returns True if the line should be treated as a task, false otherwise.
   */
  private _isTaskLine(line: string): boolean {
    const settings = getTasksPluginSettings();
    const globalFilter = settings.globalFilter;

    // If no global filter is set, all checklist items are considered tasks
    if (!globalFilter || globalFilter.trim() === '') {
      return true;
    }

    // Check if the line contains the global filter text
    return line.includes(globalFilter);
  }

  /**
   * Parses a single line of text for task information.
   * @param line The line of text to parse
   * @param filePath The path to the file containing this line
   * @param lineNumber The line number (1-based)
   * @returns A ParsedTaskResult discriminated union indicating the type of task found
   */
  parseLine(line: string, filePath: string, lineNumber: number): ParsedTaskResult {
    // First check: Global filter from Tasks plugin to respect user's task definition
    if (!this._isTaskLine(line)) {
      return { type: 'none' };
    }

    // Second check: Exclude lines based on specific patterns (e.g., other plugin's metadata)
    if (this._isLineExcluded(line)) {
      return { type: 'none' };
    }

    // Check if the line is a checklist item (any character in brackets)
    if (!/^\s*-\s*\[.\]\s*/.test(line)) {
      return { type: 'none' };
    }

    // Extract checklist content without checkbox syntax
    const contentMatch = line.match(/^\s*-\s*\[.\]\s*(.*)$/);
    if (!contentMatch) {
      return { type: 'none' };
    }

    const content = contentMatch[1];

    // Extract the status symbol from the brackets and use the isDone utility
    const statusMatch = line.match(/^\s*-\s*\[(.)\]\s*/);
    const statusSymbol = statusMatch ? statusMatch[1] : ' ';
    const isCompletedFromStatus = isDone(statusSymbol);

    // Look for completion status emojis as additional completion indicators
    const isDoneFromEmoji =
      content.includes(TASK_EMOJIS.DONE) || content.includes(TASK_EMOJIS.CANCELLED);
    const finalIsDone = isCompletedFromStatus || isDoneFromEmoji;

    // Parse all date emojis found in the content
    const dateEmojis = getTaskDateEmojis();
    const foundDates: { type: 'start' | 'scheduled' | 'due'; date: DateTime }[] = [];
    let workingContent = content;

    for (const [emoji, dateType] of dateEmojis) {
      const { before, after, found } = splitBySymbol(workingContent, emoji);
      if (found) {
        const dateString = extractDate(after);
        if (dateString) {
          const parsedDate = this.parseDate(dateString);
          if (parsedDate && parsedDate.isValid) {
            foundDates.push({ type: dateType, date: parsedDate });
            // Update working content to remove this emoji and date for next iteration
            workingContent = before + ' ' + after.replace(dateString, '').trim();
          }
        }
      }
    }

    // Clean the title using the robust cleaning utility
    // This removes all task metadata emojis and their associated data
    // Optionally remove tags based on user setting
    const removeTagsSetting = this.settings?.removeTagsFromTaskTitle ?? false;
    const cleanedTitle = cleanTaskTitleRobust(content, TASK_EMOJIS, true, removeTagsSetting);

    if (!cleanedTitle) {
      return { type: 'none' }; // Empty title
    }

    // If no dates found, this is an undated task
    if (foundDates.length === 0) {
      return {
        type: 'undated',
        task: {
          title: cleanedTitle,
          isDone: finalIsDone,
          location: {
            path: filePath,
            lineNumber
          }
        }
      };
    }

    // Determine start and end dates based on found dates
    let startDate: DateTime | undefined;
    let endDate: DateTime | undefined;
    let primaryDate: DateTime;

    // Find start date (🛫 or ⏳ in that order of preference)
    const startDateEntry =
      foundDates.find(d => d.type === 'start') || foundDates.find(d => d.type === 'scheduled');
    if (startDateEntry) {
      startDate = startDateEntry.date;
    }

    // Find due date (📅)
    const dueDateEntry = foundDates.find(d => d.type === 'due');
    if (dueDateEntry) {
      endDate = dueDateEntry.date;
    }

    // Determine primary date for legacy compatibility
    if (startDate && endDate) {
      // Multi-day event: primary date is start date
      primaryDate = startDate;
    } else if (startDate) {
      // Only start date: single-day event
      primaryDate = startDate;
    } else if (endDate) {
      // Only due date: single-day event
      primaryDate = endDate;
    } else {
      // Should not happen given foundDates.length > 0, but fallback to first found
      primaryDate = foundDates[0].date;
    }

    return {
      type: 'dated',
      task: {
        title: cleanedTitle,
        startDate,
        endDate,
        date: primaryDate, // Legacy compatibility
        isDone: finalIsDone,
        location: {
          path: filePath,
          lineNumber
        }
      }
    };
  }

  /**
   * Parses all tasks from a file's content.
   * @param content The complete file content
   * @param filePath The path to the file
   * @returns An object containing arrays of both dated and undated tasks.
   */
  parseFileContent(
    content: string,
    filePath: string
  ): { dated: ParsedDatedTask[]; undated: ParsedUndatedTask[] } {
    const checklistItems = parseChecklistItems(content);
    const dated: ParsedDatedTask[] = [];
    const undated: ParsedUndatedTask[] = [];

    for (const item of checklistItems) {
      const result = this.parseLine(item.line, filePath, item.lineNumber);
      if (result.type === 'dated') {
        dated.push(result.task);
      } else if (result.type === 'undated') {
        undated.push(result.task);
      }
    }

    return { dated, undated };
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
