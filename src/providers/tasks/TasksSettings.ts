/**
 * @file TasksSettings.ts
 * @brief Utility functions for reading Obsidian Tasks plugin settings.
 *
 * @description
 * This module provides functionality to safely read configuration from the
 * Obsidian Tasks plugin, allowing zero-configuration integration by using
 * the user's existing task settings.
 *
 * @license See LICENSE.md
 */

export interface TasksPluginSettings {
  globalFilter: string;
  statusSettings?: {
    coreStatuses?: Array<{
      symbol: string;
      name: string;
      nextStatusSymbol: string;
      availableAsInitialStatus: boolean;
      type: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'NON_TASK';
    }>;
  };
}

// Standard task emojis used by the Obsidian Tasks plugin
export const TASK_EMOJIS = {
  DUE: '📅', // Due date
  START: '🛫', // Start date
  SCHEDULED: '⏳', // Scheduled date
  DONE: '✅', // Done/completion
  CANCELLED: '❌', // Cancelled
  DATE_CREATED: '➕' // Date added
} as const;

// Extend Window interface to include Obsidian's app object
declare global {
  interface Window {
    app?: {
      plugins?: {
        plugins?: Record<string, any>;
      };
    };
  }
}

/**
 * Reads the Obsidian Tasks plugin settings if available.
 * @returns The tasks plugin settings or default values
 */
export function getTasksPluginSettings(): TasksPluginSettings {
  // Try to access the Tasks plugin settings via the global app object
  // This is how plugins typically access other plugins' settings
  if (typeof window !== 'undefined' && window.app?.plugins?.plugins) {
    const tasksPlugin = window.app.plugins.plugins['obsidian-tasks-plugin'];
    if (tasksPlugin?.settings) {
      return {
        globalFilter: tasksPlugin.settings.globalFilter || '',
        statusSettings: tasksPlugin.settings.statusSettings,
        ...tasksPlugin.settings
      };
    }
  }

  // Return default settings if Tasks plugin is not found or settings unavailable
  return {
    globalFilter: '' // Default empty global filter means all checklist items are considered
  };
}

/**
 * Gets the due date emoji configured in the Tasks plugin.
 * @returns The emoji used for due dates (defaults to 📅)
 */
export function getDueDateEmoji(): string {
  return TASK_EMOJIS.DUE; // Always return the standard due date emoji
}

/**
 * Gets the start date emoji used by the Tasks plugin.
 * @returns The emoji used for start dates (🛫)
 */
export function getStartDateEmoji(): string {
  return TASK_EMOJIS.START;
}

/**
 * Gets the scheduled date emoji used by the Tasks plugin.
 * @returns The emoji used for scheduled dates (⏳)
 */
export function getScheduledDateEmoji(): string {
  return TASK_EMOJIS.SCHEDULED;
}

/**
 * Gets all task date emojis in order of precedence for parsing.
 * @returns Array of [emoji, type] tuples
 */
export function getTaskDateEmojis(): Array<[string, 'start' | 'scheduled' | 'due']> {
  return [
    [getStartDateEmoji(), 'start'],
    [getScheduledDateEmoji(), 'scheduled'],
    [getDueDateEmoji(), 'due']
  ];
}

/**
 * Determines if a task status symbol represents a completed task.
 * Uses the Tasks plugin's status settings if available, falls back to standard logic.
 * @param statusSymbol The character found inside the task brackets (e.g., 'x', '-', '/', ' ')
 * @returns true if the status represents a completed task, false otherwise
 */
export function isDone(statusSymbol: string): boolean {
  const settings = getTasksPluginSettings();

  // If Tasks plugin has custom status settings, use them
  if (settings.statusSettings?.coreStatuses) {
    const statusConfig = settings.statusSettings.coreStatuses.find(
      status => status.symbol === statusSymbol
    );

    if (statusConfig) {
      return statusConfig.type === 'DONE' || statusConfig.type === 'CANCELLED';
    }
  }

  // Fall back to standard logic for common status symbols
  // Standard "done" statuses: 'x' (completed), '-' (cancelled)
  // Standard "not done" statuses: ' ' (todo), '/' (in progress), '>' (deferred), etc.
  const doneStatuses = new Set(['x', 'X', '-']);
  return doneStatuses.has(statusSymbol);
}
