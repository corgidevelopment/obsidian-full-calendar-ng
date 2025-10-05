export interface ParsedUndatedTask {
  title: string;
  isDone: boolean;
  location: {
    path: string;
    lineNumber: number;
  };
}
/**
 * @file typesTask.ts
 * @brief Type definitions for the Tasks provider.
 *
 * @license See LICENSE.md
 */

export type TasksProviderConfig = {
  id: string; // The settings-level ID, e.g., "tasks_1"
  name?: string; // Display name for the calendar
};
