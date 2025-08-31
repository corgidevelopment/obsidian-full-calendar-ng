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
  // Add other settings as needed
}

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
        globalFilter: tasksPlugin.settings.globalFilter || '📅',
        ...tasksPlugin.settings
      };
    }
  }

  // Return default settings if Tasks plugin is not found or settings unavailable
  return {
    globalFilter: '📅' // Default due date emoji
  };
}

/**
 * Gets the due date emoji configured in the Tasks plugin.
 * @returns The emoji used for due dates (defaults to 📅)
 */
export function getDueDateEmoji(): string {
  return getTasksPluginSettings().globalFilter;
}
