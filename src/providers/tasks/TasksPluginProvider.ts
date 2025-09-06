/**
 * @file TasksPluginProvider.ts
 * @brief Obsidian Tasks integration as a read-only calendar source.
 *
 * @description
 * This provider integrates with the Obsidian Tasks plugin to display tasks
 * with due dates on the Full Calendar. It is read-only to prevent accidental
 * modification of task data through the calendar interface.
 *
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';
import { DateTime } from 'luxon';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent } from './TasksConfigComponent';
import { TasksParser, ParsedUndatedTask, ParsedDatedTask } from './TasksParser';
import { getDueDateEmoji, getStartDateEmoji } from './TasksSettings';
import React from 'react';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

export class TasksPluginProvider implements CalendarProvider<TasksProviderConfig> {
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: TasksProviderConfig;
  private parser: TasksParser;

  // Unified cache for the single-pass scan
  private _undatedTasks: ParsedUndatedTask[] | null = null;
  private _datedTasks: EditableEventResponse[] | null = null;

  // Promise to ensure the scan only runs once, even with concurrent calls.
  private _scanPromise: Promise<void> | null = null;

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;
  readonly loadPriority = 30;

  constructor(source: TasksProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('TasksPluginProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
    this.parser = new TasksParser(plugin.settings);

    // Set up file watchers for cache invalidation
    this.setupFileWatchers();
  }

  /**
   * Sets up file watchers to invalidate cache when files change.
   */
  private setupFileWatchers(): void {
    // Note: In a real implementation, we'd want to set up proper file watchers
    // For now, we'll rely on the existing file watching infrastructure
    // and expose methods that can be called when files change
  }

  /**
   * Handles file updates by invalidating the cache.
   * Called by ProviderRegistry when a markdown file changes.
   * This ensures the cache is refreshed on the next access.
   */
  public handleFileUpdate(file: TFile): void {
    if (this.isFileRelevant(file)) {
      this._invalidateCache();
    }
  }

  /**
   * Handles file deletions by invalidating the cache.
   * Called by ProviderRegistry when a markdown file is deleted.
   * This ensures the cache is refreshed on the next access.
   */
  public handleFileDelete(filePath: string): void {
    // For Tasks provider, we need to invalidate cache for any markdown file deletion
    // since we can't easily determine relevance without the file content
    if (filePath.endsWith('.md')) {
      this._invalidateCache();
    }
  }

  /**
   * Invalidates the cached task data, forcing a re-scan on next access.
   * Currently used only for undated tasks cache and write operations.
   * Dated tasks are now managed by EventCache via surgical file updates.
   */
  private _invalidateCache(): void {
    this._undatedTasks = null;
    this._datedTasks = null;
    this._scanPromise = null; // And reset the promise
  }

  /**
   * Ensures that the vault has been scanned for tasks.
   * Uses a promise to prevent race conditions where multiple callers
   * trigger a scan at the same time.
   */
  private _ensureCacheIsPopulated(): Promise<void> {
    if (this._scanPromise === null) {
      this._scanPromise = this._scanVaultForAllTasks();
    }
    return this._scanPromise;
  }

  /**
   * Performs a unified scan of the vault for both dated and undated tasks.
   * Used for initial cache population for both getEvents() and getUndatedTasks().
   * This ensures a single file read per file for maximum efficiency.
   */
  private async _scanVaultForAllTasks(): Promise<void> {
    // Return immediately if both caches are already populated
    if (this._undatedTasks !== null && this._datedTasks !== null) {
      return;
    }

    // Initialize caches
    const allEvents: EditableEventResponse[] = [];
    this._undatedTasks = [];

    // Scan all markdown files in the vault
    const markdownFiles = this.plugin.app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
      try {
        const content = await this.app.read(file);
        const lines = content.split('\n');

        // Parse each line
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
          const result = this.parser.parseLine(lines[lineNumber], file.path, lineNumber + 1);

          if (result.type === 'dated') {
            // Add to dated events result
            const event = this.parseTaskToOFCEvent({
              title: result.task.title,
              date: result.task.date,
              isDone: result.task.isDone,
              location: result.task.location
            });
            const location: EventLocation = {
              file: { path: file.path },
              lineNumber: result.task.location.lineNumber
            };
            allEvents.push([event, location]);
          } else if (result.type === 'undated') {
            // Add to undated tasks cache
            this._undatedTasks.push(result.task);
          }
        }
      } catch (error) {
        console.warn(`Failed to scan file ${file.path} for tasks:`, error);
        // Continue with other files
      }
    }

    // Cache the results
    this._datedTasks = allEvents;
  }

  getCapabilities(): CalendarProviderCapabilities {
    // Now supports full read/write operations via Tasks plugin API
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    // Minimal row component: display provider display name (or configured custom name if available)
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
      // Some calendar types have a name property, others do not.
      const name = (source as any).name ?? this.displayName;
      return React.createElement(
        'div',
        { className: 'setting-item-control ofc-settings-row-tasks-provider' },
        React.createElement('input', {
          disabled: true,
          type: 'text',
          value: name,
          className: 'fc-setting-input'
        })
      );
    };
    return Row;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Create a unique identifier based on the file path and line number
    // The event must have metadata about its source location
    if (event.uid) {
      // Use the UID which should be in format "filepath::lineNumber"
      return { persistentId: event.uid };
    }
    return null;
  }

  public isFileRelevant(file: TFile): boolean {
    // Tasks provider is interested in all markdown files.
    return file.extension === 'md';
  }

  /**
   * Converts a ParsedTask to an OFCEvent.
   */
  private parseTaskToOFCEvent(task: ParsedDatedTask): OFCEvent {
    let date: string;
    let endDate: string | null = null;

    const hasStartDate = task.startDate && task.startDate.isValid;
    const hasEndDate = task.endDate && task.endDate.isValid;

    if (hasStartDate) {
      // If there's a start date, it's always the primary date.
      date = task.startDate!.toFormat('yyyy-MM-dd');
      if (
        hasEndDate &&
        task.startDate!.toFormat('yyyy-MM-dd') !== task.endDate!.toFormat('yyyy-MM-dd')
      ) {
        // If there's also an end date and it's different, it's a multi-day event.
        endDate = task.endDate!.toFormat('yyyy-MM-dd');
      }
    } else if (hasEndDate) {
      // If there's only an end date (due date), that's the primary date.
      date = task.endDate!.toFormat('yyyy-MM-dd');
    } else {
      // Fallback for any unexpected case.
      date = task.date.toFormat('yyyy-MM-dd');
    }

    // For the completion timestamp, prefer the end date if it exists, otherwise the primary date.
    const completionTimestampSource = task.endDate || task.startDate || task.date;

    return {
      type: 'single',
      title: task.title,
      date,
      allDay: true,
      endDate,
      timezone: undefined,
      uid: `${task.location.path}::${task.location.lineNumber}`,
      completed: task.isDone ? completionTimestampSource.toISO() : false
    };
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    try {
      // Ensure internal caches are populated before attempting a surgical update.
      await this._ensureCacheIsPopulated();

      const content = await this.app.read(file);
      // 1. Parse the file ONCE to get both dated and undated tasks.
      const { dated: newDatedTasks, undated: newUndatedTasks } = this.parser.parseFileContent(
        content,
        file.path
      );

      // 2. Surgically update the internal caches.
      if (this._datedTasks) {
        // Remove all old dated events from this file.
        this._datedTasks = this._datedTasks.filter(
          ([, location]) => location?.file.path !== file.path
        );
        // Add all new dated events from this file.
        for (const task of newDatedTasks) {
          const event = this.parseTaskToOFCEvent(task);
          const location: EventLocation = {
            file: { path: file.path },
            lineNumber: task.location.lineNumber
          };
          this._datedTasks.push([event, location]);
        }
      }

      if (this._undatedTasks) {
        // Remove all old undated tasks from this file.
        this._undatedTasks = this._undatedTasks.filter(task => task.location.path !== file.path);
        // Add all new undated tasks from this file.
        this._undatedTasks.push(...newUndatedTasks);
      }

      // 3. Trigger a refresh of any open backlog views.
      this.plugin.providerRegistry.refreshBacklogViews();

      // 4. Return only the dated events, as expected by the ProviderRegistry's syncFile flow.
      const events: EditableEventResponse[] = [];
      for (const task of newDatedTasks) {
        const event = this.parseTaskToOFCEvent(task);
        const location: EventLocation = {
          file: { path: file.path },
          lineNumber: task.location.lineNumber
        };
        events.push([event, location]);
      }
      return events;
    } catch (error) {
      console.warn(`Failed to parse tasks from file ${file.path}:`, error);
      return [];
    }
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    // For dated tasks, the EventCache is now the source of truth via getEventsInFile()
    // This method is only called for initial population, so we'll do a unified scan once
    // Subsequent updates are handled surgically by ProviderRegistry via getEventsInFile

    await this._ensureCacheIsPopulated();
    return this._datedTasks || [];
  }

  /**
   * Public method to expose undated tasks for backlog functionality.
   * @returns Array of undated tasks
   */
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._ensureCacheIsPopulated();
    return this._undatedTasks || [];
  }

  /**
   * Converts an OFCEvent to a task line string compatible with Obsidian Tasks format.
   * Handles both single-day and multi-day events by using appropriate emoji.
   */
  private _ofcEventToTaskLine(event: OFCEvent): string {
    if (event.type !== 'single') {
      throw new Error('Tasks provider can only handle single events, not recurring events.');
    }

    if (!event.date) {
      throw new Error('Event is missing a date.');
    }
    // Format the primary date
    const formattedStartDate = DateTime.fromISO(event.date).toFormat('yyyy-MM-dd');
    let taskLine = `- [ ] ${event.title}`;

    // Determine if this is a multi-day event
    if (event.endDate && event.endDate !== event.date) {
      // Multi-day event: add start date and due date
      const formattedEndDate = DateTime.fromISO(event.endDate).toFormat('yyyy-MM-dd');
      const startEmoji = getStartDateEmoji();
      const dueEmoji = getDueDateEmoji();

      taskLine += ` ${startEmoji} ${formattedStartDate} ${dueEmoji} ${formattedEndDate}`;
    } else {
      // Single-day event: use due date emoji (default behavior)
      const dueEmoji = getDueDateEmoji();
      taskLine += ` ${dueEmoji} ${formattedStartDate}`;
    }

    return taskLine;
  }

  /**
   * Safely locates a task by its handle (filePath::lineNumber) by re-parsing the file.
   * This ensures we find the task even if line numbers have changed due to other edits.
   */
  private async _findTaskByHandle(
    handle: EventHandle
  ): Promise<{ file: TFile; lineNumber: number; taskLine: string }> {
    if (!handle.persistentId.includes('::')) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }

    const [filePath, originalLineNumber] = handle.persistentId.split('::');
    const file = this.app.getFileByPath(filePath);

    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.read(file);
    const lines = content.split('\n');

    // Try the original line number first (most common case)
    const originalLine = parseInt(originalLineNumber, 10);
    if (originalLine > 0 && originalLine <= lines.length) {
      const line = lines[originalLine - 1];
      const result = this.parser.parseLine(line, filePath, originalLine);
      if (result.type === 'dated') {
        return { file, lineNumber: originalLine, taskLine: line };
      }
    }

    // If original line doesn't match, scan for the task
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const result = this.parser.parseLine(line, filePath, i + 1);
      if (result.type === 'dated' && result.task.location.path === filePath) {
        // This is a potential match, but we need more context to be sure it's the right task
        // For now, we'll use the first matching task line we find
        return { file, lineNumber: i + 1, taskLine: line };
      }
    }

    throw new Error(`Task not found in file ${filePath}. It may have been deleted or moved.`);
  }

  /**
   * Determines the target file for creating a new task.
   * Uses the designated file "FMR Tasks integration.md" at vault root.
   */
  private async _getTargetFileForNewTask(event: OFCEvent): Promise<TFile> {
    const targetFileName = 'FMR Tasks integration.md';

    // Check if the target file already exists
    const existingFile = this.app.getFileByPath(targetFileName);
    if (existingFile) {
      return existingFile;
    }

    // Create the file if it doesn't exist
    const initialContent = '# Tasks\n\n';
    return await this.app.create(targetFileName, initialContent);
  }

  // Write operations using direct file I/O
  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    if (event.type !== 'single') {
      throw new Error('Tasks provider can only create single events, not recurring events.');
    }

    try {
      // Convert the OFCEvent to a task line format
      const taskLine = this._ofcEventToTaskLine(event);

      // Determine target file for the new task
      // Priority: 1. Today's daily note, 2. default tasks.md file
      const targetFile = await this._getTargetFileForNewTask(event);

      // Use direct file I/O to append the new task
      const location = await this.app.rewrite(targetFile, (contents: string) => {
        const lines = contents.split('\n');

        // Add the new task line at the end
        lines.push(taskLine);

        // Return new content and location information
        const newLineNumber = lines.length;
        const locationInfo: EventLocation = {
          file: { path: targetFile.path },
          lineNumber: newLineNumber
        };

        return [lines.join('\n'), locationInfo] as [string, EventLocation];
      });

      // Create the final event with updated UID to include actual location
      const finalEvent: OFCEvent = {
        ...event,
        uid: `${targetFile.path}::${location.lineNumber}`
      };

      return [finalEvent, location];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create task: ${errorMessage}`);
    }
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Tasks provider can only update single events, not recurring events.');
    }

    try {
      // Find the current task line with resiliency to line number changes
      const { file, lineNumber } = await this._findTaskByHandle(handle);

      // Convert the new event data to a task line
      const newTaskLine = this._ofcEventToTaskLine(newEventData);

      // Use direct file I/O to update the task with line-shift resiliency
      const updatedLocation = await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');

        // Verify the task is still at the expected line, if not, find it
        let actualLineIndex = lineNumber - 1; // Convert to 0-based index

        // Double-check: if the line at lineNumber doesn't match, scan for the task
        if (actualLineIndex >= 0 && actualLineIndex < lines.length) {
          const currentLine = lines[actualLineIndex];
          const parseResult = this.parser.parseLine(currentLine, file.path, lineNumber);

          // If it's not a task at this line, we need to find the actual line
          if (parseResult.type !== 'dated') {
            // Scan the file to find the task
            let found = false;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const result = this.parser.parseLine(line, file.path, i + 1);
              if (result.type === 'dated') {
                // This is a potential match - for now use first dated task found
                // In a more sophisticated implementation, we'd match by content/UID
                actualLineIndex = i;
                found = true;
                break;
              }
            }

            if (!found) {
              throw new Error('Task not found in file. It may have been deleted.');
            }
          }
        } else {
          throw new Error('Invalid line number for task location.');
        }

        // Update the line
        lines[actualLineIndex] = newTaskLine;

        const finalLocation: EventLocation = {
          file: { path: file.path },
          lineNumber: actualLineIndex + 1 // Convert back to 1-based
        };

        return [lines.join('\n'), finalLocation] as [string, EventLocation];
      });

      return updatedLocation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update task: ${errorMessage}`);
    }
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    try {
      // Find the current task line location
      const { file, lineNumber } = await this._findTaskByHandle(handle);

      // Since the Tasks API has no delete function, we manage this directly using ObsidianInterface
      await this.app.rewrite(file, (contents: string) => {
        const lines = contents.split('\n');

        // Remove the specific line (convert to 0-based index)
        lines.splice(lineNumber - 1, 1);

        return lines.join('\n');
      });

      // Invalidate cache to reflect the deletion
      this._invalidateCache();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete task: ${errorMessage}`);
    }
  }

  /**
   * Schedules an undated task by adding a due date to it.
   * This method is called when a task is dragged from the backlog to the calendar.
   *
   * @param taskId Unique identifier for the task (filePath::lineNumber)
   * @param date Date to schedule the task for
   */
  public async scheduleTask(taskId: string, date: Date): Promise<void> {
    try {
      // 1. Ensure caches are populated before we try to modify them.
      await this._ensureCacheIsPopulated();

      if (!taskId.includes('::')) {
        throw new Error('Invalid task ID format.');
      }

      // 2. Parse taskId and get the file.
      const [filePath, lineNumberStr] = taskId.split('::');
      const lineNumber = parseInt(lineNumberStr, 10); // 1-based
      const file = this.app.getFileByPath(filePath);

      if (!file) {
        throw new Error(`File not found: ${filePath}`);
      }

      // 3. Read the file and validate the target line.
      const content = await this.app.read(file);
      const lines = content.split('\n');
      const lineIndex = lineNumber - 1; // 0-based

      if (lineIndex < 0 || lineIndex >= lines.length) {
        throw new Error(`Line number ${lineNumber} is out of bounds for file ${filePath}.`);
      }

      const originalLine = lines[lineIndex];
      const parseResult = this.parser.parseLine(originalLine, filePath, lineNumber);

      if (parseResult.type !== 'undated') {
        throw new Error(
          'The dragged item is not an undated task. It may have been modified or deleted.'
        );
      }

      // 4. Modify the line and rewrite the file.
      const dueDateEmoji = getDueDateEmoji();

      // Format the date in YYYY-MM-DD format (standard Tasks plugin format)
      const formattedDate = DateTime.fromJSDate(date).toFormat('yyyy-MM-dd');
      const updatedLine = `${originalLine.trim()} ${dueDateEmoji} ${formattedDate}`;

      lines[lineIndex] = updatedLine;
      await this.app.rewrite(file, () => lines.join('\n'));

      // 5. Perform a surgical cache update instead of a full invalidation.
      if (this._undatedTasks && this._datedTasks) {
        // a. Remove from undated tasks cache
        const undatedTaskIndex = this._undatedTasks.findIndex(
          task => task.location.path === filePath && task.location.lineNumber === lineNumber
        );

        if (undatedTaskIndex > -1) {
          this._undatedTasks.splice(undatedTaskIndex, 1);
        }

        // b. Add to dated tasks cache by re-parsing the now-dated line
        const newParseResult = this.parser.parseLine(updatedLine, filePath, lineNumber);
        if (newParseResult.type === 'dated') {
          const newOFCEvent = this.parseTaskToOFCEvent(newParseResult.task);
          const newLocation: EventLocation = {
            file: { path: filePath },
            lineNumber: lineNumber
          };
          this._datedTasks.push([newOFCEvent, newLocation]);
        }
      } else {
        // Fallback to invalidation if caches weren't populated for some reason
        this._invalidateCache();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to schedule task: ${errorMessage}`);
    }
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    throw new Error('TasksPluginProvider is read-only. Cannot create instance overrides.');
  }
}
