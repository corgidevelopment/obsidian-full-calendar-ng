/**
 * @file TasksBacklogManager.ts
 * @brief Manages the lifecycle of the Tasks Backlog view.
 *
 * @description
 * This manager handles the registration, creation, and cleanup of the Tasks Backlog view.
 * It ensures the view is only available when a Tasks provider is configured and handles
 * proper cleanup when Tasks providers are removed.
 *
 * @license See LICENSE.md
 */

import { WorkspaceLeaf } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { TasksBacklogView, TASKS_BACKLOG_VIEW_TYPE } from './TasksBacklogView';

export class TasksBacklogManager {
  private plugin: FullCalendarPlugin;
  private isLoaded = false;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Loads and registers the Tasks Backlog view.
   * Called when at least one Tasks provider is configured.
   */
  public onload(): void {
    if (this.isLoaded) {
      return; // Already loaded
    }

    this.isLoaded = true;

    // Register the view type
    this.plugin.registerView(
      TASKS_BACKLOG_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TasksBacklogView(leaf, this.plugin)
    );

    // Add command to open the backlog view
    this.plugin.addCommand({
      id: 'open-tasks-backlog',
      name: 'Open tasks backlog',
      callback: () => {
        void this.openBacklogView();
      }
    });

    // Add ribbon icon for quick access
    this.plugin.addRibbonIcon('list-todo', 'Tasks backlog', () => {
      void this.openBacklogView();
    });
  }

  /**
   * Unloads and deregisters the Tasks Backlog view.
   * Called when no Tasks providers are configured.
   */
  public onunload(): void {
    if (!this.isLoaded) {
      return; // Not loaded
    }

    this.isLoaded = false;

    // Close any existing backlog views
    this.closeAllBacklogViews();
  }

  /**
   * Opens the Tasks Backlog view in the sidebar.
   */
  private async openBacklogView(): Promise<void> {
    const workspace = this.plugin.app.workspace;

    // Check if a backlog view is already open
    const existingLeaf = workspace.getLeavesOfType(TASKS_BACKLOG_VIEW_TYPE)[0];
    if (existingLeaf) {
      // Focus the existing view
      void workspace.revealLeaf(existingLeaf);
      return;
    }

    // Create a new leaf in the right sidebar
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: TASKS_BACKLOG_VIEW_TYPE,
        active: true
      });

      // Reveal the leaf to make sure it's visible
      void workspace.revealLeaf(leaf);
    }
  }

  /**
   * Closes all open Tasks Backlog views.
   */
  private closeAllBacklogViews(): void {
    const workspace = this.plugin.app.workspace;
    const leaves = workspace.getLeavesOfType(TASKS_BACKLOG_VIEW_TYPE);

    for (const leaf of leaves) {
      leaf.detach();
    }
  }

  /**
   * Refreshes all open Tasks Backlog views.
   * Called when task data changes.
   */
  public refreshViews(): void {
    const workspace = this.plugin.app.workspace;
    const leaves = workspace.getLeavesOfType(TASKS_BACKLOG_VIEW_TYPE);

    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TasksBacklogView) {
        void view.refresh();
      }
    }
  }

  /**
   * Returns whether the backlog manager is currently loaded.
   */
  public getIsLoaded(): boolean {
    return this.isLoaded;
  }
}
