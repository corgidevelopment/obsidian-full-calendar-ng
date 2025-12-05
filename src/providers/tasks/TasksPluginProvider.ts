// src/providers/tasks/TasksPluginProvider.ts

/**
 * @file TasksPluginProvider.ts
 * @brief Obsidian Tasks integration as a calendar source.
 *
 * @description
 * This provider integrates with the Obsidian Tasks plugin by subscribing to its
 * cache. It displays tasks with due dates on the Full Calendar and supports
 * full CUD (Create, Update, Delete) operations by surgically modifying the
 * underlying markdown files.
 *
 * @license See LICENSE.md
 */

import { TFile, Notice } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent } from './TasksConfigComponent';
import React from 'react';
import { ParsedUndatedTask } from './typesTask';
import { DateTime } from 'luxon';

// CHANGE: Define Scheduled emoji instead of Due
const getScheduledDateEmoji = (): string => '⏳';
const getStartDateEmoji = (): string => '🛫';

// This is our own internal, simplified interface for a task from the Tasks plugin's cache.
// It prevents the need to import anything from the Tasks plugin itself.
interface CalendarTask {
  id: string; // A unique ID created by us, e.g., "filePath::lineNumber"
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  scheduledDate: Date | null;
  originalMarkdown: string; // The full original line from the file.
  filePath: string;
  lineNumber: number; // 1-based line number.
  isDone: boolean;
}

export type EditableEventResponse = [OFCEvent, EventLocation | null];

export class TasksPluginProvider implements CalendarProvider<TasksProviderConfig> {
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }
  /**
   * Adds or removes the done date (✅) from a task's markdown line.
   * @param originalMarkdown The original line of the task.
   * @param isDone The desired completion state.
   * @returns The modified task line.
   */
  private setDoneState(originalMarkdown: string, isDone: boolean): string {
    const doneDateRegex = /\s*✅\s*\d{4}-\d{2}-\d{2}/;
    const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
    let updated = originalMarkdown;

    if (isDone) {
      // Change '- [ ]' to '- [x]'
      updated = updated.replace(/^- \[ \]/, '- [x]');
      // Add done date if not present
      if (!doneDateRegex.test(updated)) {
        const doneDate = DateTime.now().toFormat('yyyy-MM-dd');
        const doneComponent = ` ✅ ${doneDate}`;
        const blockLinkMatch = updated.match(blockLinkRegex);
        if (blockLinkMatch) {
          const contentWithoutBlockLink = updated.replace(blockLinkRegex, '');
          updated = `${contentWithoutBlockLink.trim()}${doneComponent}${blockLinkMatch[1]}`;
        } else {
          updated = `${updated.trim()}${doneComponent}`;
        }
      }
    } else {
      // Change '- [x]' to '- [ ]'
      updated = updated.replace(/^- \[x\]/, '- [ ]');
      // Remove done date if present
      updated = updated.replace(doneDateRegex, '').trim();
      // Preserve block link if present
      const blockLinkMatch = originalMarkdown.match(blockLinkRegex);
      if (blockLinkMatch && !updated.endsWith(blockLinkMatch[1])) {
        updated += blockLinkMatch[1];
      }
    }
    return updated;
  }

  public async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const event = this.plugin.cache?.getEventById(eventId);
      if (!event || !event.uid || event.type !== 'single') {
        throw new Error(
          `Event with session ID ${eventId} not found, has no UID, or is not a single event.`
        );
      }

      const task = this.allTasks.find(t => t.id === event.uid);
      if (!task) {
        throw new Error(`Task with persistent ID ${event.uid} not found in provider cache.`);
      }

      const newLine = this.setDoneState(task.originalMarkdown, isDone);

      // If the line didn't change, we don't need to do anything.
      if (newLine === task.originalMarkdown) {
        return true;
      }

      // 1. Perform the I/O to update the file.
      // The line number on the task object is 1-based, which is what replaceTaskInFile expects.
      await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);

      // 2. Optimistically update the cache.
      // The file watcher will eventually confirm this, but we want immediate UI feedback.
      const completedStatus = isDone ? DateTime.now().toISO() : false; // MODIFIED

      // Construct a new event object that is explicitly a 'single' type event.
      const optimisticEvent: OFCEvent = {
        ...event, // Spread the original single event
        completed: completedStatus // Now this property is valid.
      };

      // Update our internal task model to match the optimistic state.
      task.originalMarkdown = newLine;
      task.isDone = isDone;

      // Push the update to the EventCache.
      // We use the persistentId (event.uid) for the update payload.
      await this.plugin.providerRegistry.processProviderUpdates(this.source.id, {
        additions: [],
        updates: [
          {
            persistentId: event.uid,
            event: optimisticEvent,
            location: { file: { path: task.filePath }, lineNumber: task.lineNumber }
          }
        ],
        deletions: []
      });

      return true;
    } catch (e) {
      if (e instanceof Error) {
        console.error('Error toggling task completion:', e);
        new Notice(e.message);
      }
      // If an error occurs, we return false. The CalendarView will revert the checkbox.
      return false;
    }
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: TasksProviderConfig;

  // Live array of all tasks from the Tasks plugin.
  private allTasks: CalendarTask[] = [];
  private isSubscribed = false;
  private isTasksCacheWarm = false;
  private tasksPromise: Promise<void> | null = null;
  private isProcessingUpdate = false; // Singleton guard for live update

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;
  readonly loadPriority = 130;

  constructor(source: TasksProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('TasksPluginProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
    // No parser instantiation needed anymore.
  }

  /**
   * On-demand cache warming: requests initial data from the Tasks plugin and waits for response.
   */
  private _ensureTasksCacheIsWarm(): Promise<void> {
    if (this.isTasksCacheWarm) {
      return Promise.resolve();
    }
    if (this.tasksPromise) {
      return this.tasksPromise;
    }
    this.tasksPromise = new Promise((resolve, reject) => {
      console.log('Full Calendar: Tasks cache is cold. Requesting data from Tasks plugin...');
      const callback = (cacheData: any) => {
        if (
          cacheData &&
          (cacheData.state === 'Warm' || cacheData.state?.name === 'Warm') &&
          cacheData.tasks
        ) {
          this.allTasks = this.parseTasksForCalendar(cacheData.tasks);
          this.isTasksCacheWarm = true;
          this.tasksPromise = null;
          resolve();
        }
      };
      (this.plugin.app.workspace as any).trigger(
        'obsidian-tasks-plugin:request-cache-update',
        callback
      );
      setTimeout(() => {
        if (!this.isTasksCacheWarm) {
          console.error(
            "Full Calendar: Timed out waiting for Tasks plugin's cache. The Tasks plugin may not be enabled or may have failed to load."
          );
          this.tasksPromise = null;
          reject(new Error("Timed out waiting for Tasks plugin's cache."));
        }
      }, 5000);
    });
    return this.tasksPromise;
  }

  /**
   * Helper to convert a CalendarTask to an OFCEvent and EventLocation.
   * This now prioritizes Scheduled Date and ensures tasks are single-day events.
   */
  private _taskToOFCEvent(task: CalendarTask): [OFCEvent, EventLocation | null] | null {
    // NEW PRIORITY LOGIC: Scheduled > Due > Start
    const primaryDate = task.scheduledDate || task.dueDate || task.startDate;

    // A task must have at least one of these dates to appear on the calendar.
    if (!primaryDate) {
      return null;
    }

    const ofcEvent: OFCEvent = {
      type: 'single',
      title: task.title,
      allDay: true,
      date: DateTime.fromJSDate(primaryDate).toFormat('yyyy-MM-dd'), // MODIFIED
      // FIX: Ensure tasks are never multi-day by setting endDate to null.
      endDate: null,
      completed: task.isDone ? DateTime.now().toISO() : false, // MODIFIED
      uid: task.id // The UID is our persistent handle.
    };

    const location: EventLocation = {
      file: { path: task.filePath },
      lineNumber: task.lineNumber
    };

    return [ofcEvent, location];
  }

  /**
   * Initializes the provider by subscribing to live updates from the Tasks plugin.
   * Now performs granular diff and sync with EventCache.
   */
  public initialize(): void {
    if (this.isSubscribed) {
      return;
    }
    // The handler is now async to await cache operations.
    const handleLiveCacheUpdate = async (cacheData: any) => {
      if (
        this.isProcessingUpdate ||
        !this.isTasksCacheWarm ||
        !this.plugin.cache ||
        !cacheData ||
        !(cacheData.state === 'Warm' || cacheData.state?.name === 'Warm') ||
        !cacheData.tasks
      ) {
        return;
      }

      this.isProcessingUpdate = true;
      try {
        const oldTasksMap = new Map(this.allTasks.map(task => [task.id, task]));
        const newTasks = this.parseTasksForCalendar(cacheData.tasks);
        const newTasksMap = new Map(newTasks.map(task => [task.id, task]));

        const providerPayload = {
          additions: [] as { event: OFCEvent; location: EventLocation | null }[],
          updates: [] as {
            persistentId: string;
            event: OFCEvent;
            location: EventLocation | null;
          }[],
          deletions: [] as string[]
        };

        // Find deletions
        for (const [id, oldTask] of oldTasksMap.entries()) {
          if (!newTasksMap.has(id)) {
            if (oldTask.startDate || oldTask.scheduledDate || oldTask.dueDate) {
              providerPayload.deletions.push(id);
            }
          }
        }

        // Find additions and modifications
        for (const [id, newTask] of newTasksMap.entries()) {
          const oldTask = oldTasksMap.get(id);
          const transformed = this._taskToOFCEvent(newTask);
          const wasDated = !!(oldTask?.startDate || oldTask?.scheduledDate || oldTask?.dueDate);
          const isDated = transformed !== null;

          if (!oldTask && isDated) {
            // Addition
            const [ofcEvent, location] = transformed;
            providerPayload.additions.push({ event: ofcEvent, location });
          } else if (oldTask && oldTask.originalMarkdown !== newTask.originalMarkdown) {
            // Modification
            if (wasDated && isDated) {
              // Update
              const [ofcEvent, location] = transformed;
              providerPayload.updates.push({ persistentId: id, event: ofcEvent, location });
            } else if (!wasDated && isDated) {
              // Addition to calendar
              const [ofcEvent, location] = transformed;
              providerPayload.additions.push({ event: ofcEvent, location });
            } else if (wasDated && !isDated) {
              // Deletion from calendar
              providerPayload.deletions.push(id);
            }
          }
        }

        // Update the provider's internal state for the next diff.
        this.allTasks = newTasks;

        // Send the entire batch of changes to the ProviderRegistry for translation and execution.
        if (
          providerPayload.additions.length > 0 ||
          providerPayload.updates.length > 0 ||
          providerPayload.deletions.length > 0
        ) {
          await this.plugin.providerRegistry.processProviderUpdates(
            this.source.id,
            providerPayload
          );
        }

        // Refresh the backlog view.
        this.plugin.providerRegistry.refreshBacklogViews();
      } finally {
        this.isProcessingUpdate = false;
      }
    };

    (this.plugin.app.workspace as any).on(
      'obsidian-tasks-plugin:cache-update',
      handleLiveCacheUpdate
    );
    this.isSubscribed = true;
  }

  /**
   * Parses the raw task data from the Tasks plugin into our internal, simplified CalendarTask format.
   */
  private parseTasksForCalendar(tasks: any[]): CalendarTask[] {
    if (!tasks) return [];

    // FIX: Use the stable, nested line number from taskLocation and convert to 1-based index.
    const calendarTasks = tasks.map((task, index) => {
      const oneBasedLineNumber = task.taskLocation.lineNumber + 1;
      return {
        // The ID must be based on the 0-indexed number to match the live-update diffing logic.
        id: `${task.path}::${task.taskLocation.lineNumber}`,
        title: task.description,
        startDate: task.startDate ? task.startDate.toDate() : null,
        dueDate: task.dueDate ? task.dueDate.toDate() : null,
        scheduledDate: task.scheduledDate ? task.scheduledDate.toDate() : null,
        originalMarkdown: task.originalMarkdown,
        filePath: task.path,
        // The internal lineNumber must be 1-based for surgical editing.
        lineNumber: oneBasedLineNumber,
        isDone: task.isDone || !!task.doneDatez
      };
    });

    return calendarTasks;
  }

  // ====================================================================
  // DATA-SERVING METHODS (READ)
  // ====================================================================

  async getEvents(): Promise<EditableEventResponse[]> {
    await this._ensureTasksCacheIsWarm();
    const events: EditableEventResponse[] = [];
    for (const task of this.allTasks) {
      const primaryDate = task.scheduledDate;
      if (primaryDate) {
        const ofcEvent: OFCEvent = {
          type: 'single',
          title: task.title,
          allDay: true,
          date: DateTime.fromJSDate(primaryDate).toFormat('yyyy-MM-dd'), // MODIFIED
          endDate: null,
          completed: task.isDone ? DateTime.now().toISO() : false, // MODIFIED
          uid: task.id
        };

        const location: EventLocation = {
          file: { path: task.filePath },
          lineNumber: task.lineNumber
        };
        events.push([ofcEvent, location]);
      }
    }
    return events;
  }

  // REPLACE getUndatedTasks with corrected logic
  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._ensureTasksCacheIsWarm();
    return (
      this.allTasks
        // An undated task for the backlog has no dates and is not done.
        .filter(t => !t.scheduledDate && !t.isDone) // !t.startDate && !t.dueDate &&
        // Map to the format expected by the backlog view.
        .map(t => ({
          title: t.title,
          isDone: t.isDone,
          location: {
            path: t.filePath,
            // FIX: The task ID used by the backlog MUST match the canonical 0-indexed ID.
            // Our internal lineNumber is 1-based, so subtract 1 to get the 0-based index for the ID.
            lineNumber: t.lineNumber - 1
          }
        }))
    );
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const events: EditableEventResponse[] = [];
    // Filter the live cache for tasks in the specified file. This is very fast.
    const tasksInFile = this.allTasks.filter(task => task.filePath === file.path);

    // REPLACE the for-loop with corrected date priority and single-day logic
    for (const task of tasksInFile) {
      const primaryDate = task.scheduledDate || task.dueDate || task.startDate;
      if (primaryDate) {
        const ofcEvent: OFCEvent = {
          type: 'single',
          title: task.title,
          allDay: true,
          date: DateTime.fromJSDate(primaryDate).toFormat('yyyy-MM-dd'), // MODIFIED
          endDate: null,
          completed: task.isDone ? DateTime.now().toISO() : false, // MODIFIED
          uid: task.id
        };

        const location: EventLocation = {
          file: { path: task.filePath },
          lineNumber: task.lineNumber
        };
        events.push([ofcEvent, location]);
      }
    }
    return events;
  }

  // ====================================================================
  // FILE-WRITING METHODS (CUD)
  // ====================================================================

  /**
   * Surgically replaces a line in a file.
   */
  private async replaceTaskInFile(filePath: string, lineNumber: number, newLines: string[]) {
    const file = this.app.getFileByPath(filePath);
    if (!file) throw new Error(`File not found: ${filePath}`);

    await this.app.rewrite(file, content => {
      const lines = content.split('\n');
      // line number is 1-based, convert to 0-based index.
      lines.splice(lineNumber - 1, 1, ...newLines);
      return lines.join('\n');
    });
  }

  /**
   * Updates the date component of a task's original markdown line.
   * Changed to use Scheduled Date (⏳) instead of Due Date (📅).
   */
  private updateTaskLine(originalMarkdown: string, newDate: Date): string {
    // CHANGE: Use scheduled emoji
    const scheduledSymbol = getScheduledDateEmoji();
    const newDateString = DateTime.fromJSDate(newDate).toFormat('yyyy-MM-dd'); // MODIFIED
    const newScheduledComponent = `${scheduledSymbol} ${newDateString}`;
    // CHANGE: Regex looks for scheduled icon
    const scheduledDateRegex = /⏳\s*\d{4}-\d{2}-\d{2}/;

    // If a scheduled date already exists, replace it.
    if (originalMarkdown.match(scheduledDateRegex)) {
      return originalMarkdown.replace(scheduledDateRegex, newScheduledComponent);
    } else {
      // Otherwise, append it, being careful to preserve any block links (^uuid).
      const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
      const blockLinkMatch = originalMarkdown.match(blockLinkRegex);
      if (blockLinkMatch) {
        const contentWithoutBlockLink = originalMarkdown.replace(blockLinkRegex, '');
        return `${contentWithoutBlockLink.trim()} ${newScheduledComponent}${blockLinkMatch[1]}`;
      } else {
        return `${originalMarkdown.trim()} ${newScheduledComponent}`;
      }
    }
  }

  // --- REPLACE createEvent and updateEvent with new versions ---
  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    new Notice('Use the Tasks plugin interface to create new tasks.');
    throw new Error(
      'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
    );
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEvent.type !== 'single' || !newEvent.date) {
      throw new Error('Tasks provider can only update single, dated events.');
    }

    const newDate = DateTime.fromISO(newEvent.date).toJSDate();
    const validation = await this.canBeScheduledAt(newEvent, newDate);
    if (!validation.isValid) {
      new Notice(validation.reason || 'This task cannot be scheduled on this date.');
      throw new Error(validation.reason || 'This task cannot be scheduled on this date.');
    }

    const taskId = handle.persistentId;
    await this._surgicallyUpdateTask(taskId, newDate);
    const [filePath, lineNumberStr] = taskId.split('::');
    return {
      file: { path: filePath },
      lineNumber: parseInt(lineNumberStr, 10)
    };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const [filePath, lineNumberStr] = handle.persistentId.split('::');
    if (!filePath || !lineNumberStr) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }
    // To delete a task, we replace its line with an empty string.
    // The line number in the handle is 0-indexed, but replaceTaskInFile expects a 1-based index.
    await this.replaceTaskInFile(filePath, parseInt(lineNumberStr, 10) + 1, []);
  }

  /**
   * Centralized helper for surgically updating a task line in a file.
   * This is called by both updateEvent (for drags) and scheduleTask (for backlog drops).
   * @param taskId The persistent ID of the task (filePath::lineNumber).
   * @param newDate The new date to apply to the task.
   */
  private async _surgicallyUpdateTask(taskId: string, newDate: Date): Promise<void> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Cannot find original task with ID ${taskId} to update.`);
    }
    const newLine = this.updateTaskLine(task.originalMarkdown, newDate);
    await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
  }

  public async scheduleTask(taskId: string, date: Date): Promise<void> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Cannot find original task to schedule at ${taskId}`);
    }
    const newLine = this.updateTaskLine(task.originalMarkdown, date);
    await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
    const tasksApi = (this.plugin.app as any).plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if (tasksApi) {
      const editedTaskLine = await tasksApi.editTaskLineModal(newLine);
      if (editedTaskLine !== undefined && editedTaskLine !== newLine) {
        await this.replaceTaskInFile(task.filePath, task.lineNumber, [editedTaskLine]);
      }
    } else {
      new Notice('Task scheduled, but could not open Tasks edit modal.');
    }
  }

  public async editInProviderUI(eventId: string): Promise<void> {
    const tasksApi = (this.plugin.app as any).plugins.plugins['obsidian-tasks-plugin']?.apiV1;
    if (!tasksApi) {
      new Notice('Obsidian Tasks plugin API not available.');
      return;
    }

    // Step 1: Use the eventId (Session ID) to look up the full OFCEvent from the main cache.
    const eventFromCache = this.plugin.cache?.getEventById(eventId);
    if (!eventFromCache || !eventFromCache.uid) {
      throw new Error(
        `Could not find event or its persistent UID in the main cache for session ID ${eventId}.`
      );
    }
    const persistentId = eventFromCache.uid; // This is the "filePath::lineNumber" ID.

    // Step 2: Use the persistentId to find the corresponding task in the provider's internal cache.
    const task = this.allTasks.find(t => t.id === persistentId);
    if (!task) {
      // This error is more specific and helpful for debugging.
      throw new Error(`Task with persistent ID ${persistentId} not found in the provider's cache.`);
    }

    // Step 3: Proceed with the rest of the logic, which is now guaranteed to have the correct data.
    const originalMarkdown = task.originalMarkdown;
    const editedTaskLine = await tasksApi.editTaskLineModal(originalMarkdown);

    if (editedTaskLine && editedTaskLine !== originalMarkdown) {
      // The lineNumber on the task object is 1-based, which is what replaceTaskInFile expects.
      await this.replaceTaskInFile(task.filePath, task.lineNumber, [editedTaskLine]);
    }
  }

  /**
   * Determines if an event can be scheduled at the given date.
   * This implements guardrail logic to prevent scheduling conflicts.
   */
  public async canBeScheduledAt(
    event: OFCEvent,
    date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (!event.uid) {
      // If there's no UID, we can't look up the task. Default to allowing it.
      return { isValid: true };
    }

    // The event UID is the persistent handle (e.g., "path/to/file.md::0").
    const task = this.allTasks.find(t => t.id === event.uid);
    if (!task) {
      // Task not found in the provider's cache. Allow the drop but log a warning.
      console.warn(`[Tasks Provider] Could not find task with ID ${event.uid} for validation.`);
      return { isValid: true };
    }

    // Use Luxon to perform a clean, time-zone-agnostic comparison of dates.
    const dropDate = DateTime.fromJSDate(date).startOf('day');

    // Rule 1: Cannot schedule before the start date.
    if (task.startDate) {
      const startDate = DateTime.fromJSDate(task.startDate).startOf('day');
      if (dropDate < startDate) {
        return {
          isValid: false,
          reason: `Cannot schedule before the start date (${startDate.toFormat('yyyy-MM-dd')}).`
        };
      }
    }

    // Rule 2: Cannot schedule after the due date.
    if (task.dueDate) {
      const dueDate = DateTime.fromJSDate(task.dueDate).startOf('day');
      if (dropDate > dueDate) {
        return {
          isValid: false,
          reason: `Cannot schedule after the due date (${dueDate.toFormat('yyyy-MM-dd')}).`
        };
      }
    }

    // If all checks pass, the drop is valid.
    return { isValid: true };
  }

  // ====================================================================
  // PROVIDER METADATA & CONFIG
  // ====================================================================

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: false, // Prevents UI creation and standard addEvent pathway.
      canEdit: true,
      canDelete: true,
      hasCustomEditUI: true
    };
  }

  getConfigurationComponent(): FCReactComponent<any> {
    return TasksConfigComponent;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  public isFileRelevant(file: TFile): boolean {
    return file.extension === 'md';
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    throw new Error('Tasks provider does not support recurring event overrides.');
  }

  // UI Components for settings remain the same.
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
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
}
