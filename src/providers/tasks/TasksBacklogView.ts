/**
 * @file TasksBacklogView.ts
 * @brief A sidebar view that displays undated tasks from the Tasks plugin.
 *
 * @description
 * This view provides a dedicated space for managing undated tasks (the "backlog").
 * Tasks are displayed in a list and can be dragged onto the calendar to schedule them.
 * The view supports pagination for large numbers of undated tasks.
 *
 * @license See LICENSE.md
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Draggable } from '@fullcalendar/interaction';
import FullCalendarPlugin from '../../main';
import { TasksPluginProvider } from './TasksPluginProvider';
import { ParsedUndatedTask } from './TasksParser';
import './backlog-styles.css';

export const TASKS_BACKLOG_VIEW_TYPE = 'tasks-backlog-view';

export class TasksBacklogView extends ItemView {
  private plugin: FullCalendarPlugin;
  private tasksProvider: TasksPluginProvider | null = null;
  private undatedTasks: ParsedUndatedTask[] = [];
  private displayedTasks: ParsedUndatedTask[] = [];
  private readonly TASKS_PER_PAGE = 200;
  private currentPage = 1;
  private draggable: Draggable | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TASKS_BACKLOG_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Tasks Backlog';
  }

  getIcon(): string {
    return 'list-todo';
  }

  async onOpen(): Promise<void> {
    // Find the TasksPluginProvider instance
    this.tasksProvider = this.findTasksProvider();

    if (!this.tasksProvider) {
      this.renderNoTasksProvider();
      return;
    }

    await this.loadTasks();
    this.render();
  }

  onClose(): Promise<void> {
    // Clean up any event listeners or resources
    if (this.draggable) {
      this.draggable.destroy();
    }
    return Promise.resolve();
  }

  /**
   * Finds the active TasksPluginProvider instance from the registry.
   */
  private findTasksProvider(): TasksPluginProvider | null {
    for (const provider of this.plugin.providerRegistry.getActiveProviders()) {
      if (provider.type === 'tasks') {
        return provider as TasksPluginProvider;
      }
    }
    return null;
  }

  /**
   * Loads undated tasks from the Tasks provider.
   */
  private async loadTasks(): Promise<void> {
    if (!this.tasksProvider) return;

    try {
      this.undatedTasks = await this.tasksProvider.getUndatedTasks();
      this.updateDisplayedTasks();
    } catch (error) {
      console.error('Failed to load undated tasks:', error);
      this.undatedTasks = [];
      this.displayedTasks = [];
    }
  }

  /**
   * Updates the displayed tasks based on current page and pagination settings.
   */
  private updateDisplayedTasks(): void {
    const startIndex = (this.currentPage - 1) * this.TASKS_PER_PAGE;
    const endIndex = startIndex + this.TASKS_PER_PAGE;
    this.displayedTasks = this.undatedTasks.slice(startIndex, endIndex);
  }

  /**
   * Renders the view when no Tasks provider is configured.
   */
  private renderNoTasksProvider(): void {
    const container = this.containerEl;
    container.empty();

    container.createEl('div', {
      text: 'No Tasks calendar configured.',
      attr: { class: 'tasks-backlog-empty' }
    });

    container.createEl('div', {
      text: 'Add a Tasks calendar source to use the backlog view.',
      attr: { class: 'tasks-backlog-help' }
    });
  }

  /**
   * Renders the main backlog view.
   */
  private render(): void {
    const container = this.containerEl;
    container.empty();

    // Add CSS classes
    container.addClass('tasks-backlog-view');

    // Header
    const header = container.createEl('div', { cls: 'tasks-backlog-header' });
    header.createEl('h3', { text: 'Tasks Backlog' });

    if (this.undatedTasks.length > 0) {
      header.createEl('div', {
        text: `${this.undatedTasks.length} undated tasks`,
        cls: 'tasks-backlog-count'
      });
    }

    // Tasks list
    if (this.displayedTasks.length === 0) {
      this.renderEmptyState(container);
    } else {
      this.renderTasksList(container);
      this.renderPaginationControls(container);
    }
  }

  /**
   * Renders the empty state when there are no undated tasks.
   */
  private renderEmptyState(container: HTMLElement): void {
    const emptyState = container.createEl('div', { cls: 'tasks-backlog-empty' });
    emptyState.createEl('div', { text: 'No undated tasks found.' });
    emptyState.createEl('div', {
      text: 'Tasks without due dates will appear here.',
      cls: 'tasks-backlog-help'
    });
  }

  /**
   * Renders the list of tasks.
   */
  private renderTasksList(container: HTMLElement): void {
    const tasksList = container.createEl('div', { cls: 'tasks-backlog-list' });

    for (const task of this.displayedTasks) {
      const taskItem = tasksList.createEl('div', {
        cls: 'tasks-backlog-item',
        attr: {
          draggable: 'true',
          'data-task-id': `${task.location.path}::${task.location.lineNumber}`
        }
      });

      // Task status (checkbox)
      const checkbox = taskItem.createEl('input', {
        cls: 'tasks-backlog-checkbox',
        attr: { type: 'checkbox' }
      });
      checkbox.checked = task.isDone;
      checkbox.disabled = true; // Read-only for now

      // Task title
      const title = taskItem.createEl('span', {
        text: task.title,
        cls: 'tasks-backlog-title'
      });
      if (task.isDone) {
        title.addClass('tasks-backlog-done');
      }

      // Task location info
      const location = taskItem.createEl('div', {
        text: `${task.location.path}:${task.location.lineNumber}`,
        cls: 'tasks-backlog-location'
      });
    }

    // Set up FullCalendar's Draggable API for the entire task list
    if (this.draggable) {
      this.draggable.destroy();
    }
    this.draggable = new Draggable(tasksList, {
      itemSelector: '.tasks-backlog-item'
      // No eventData needed as the drop callback in view.ts
      // reads the data-task-id attribute directly.
    });
  }

  /**
   * Renders pagination controls if needed.
   */
  private renderPaginationControls(container: HTMLElement): void {
    const totalPages = Math.ceil(this.undatedTasks.length / this.TASKS_PER_PAGE);

    if (totalPages <= 1) return;

    const pagination = container.createEl('div', { cls: 'tasks-backlog-pagination' });

    // Previous button
    const prevBtn = pagination.createEl('button', {
      text: '← Previous',
      cls: 'tasks-backlog-nav-btn'
    });
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.addEventListener('click', () => this.goToPreviousPage());

    // Page info
    pagination.createEl('span', {
      text: `Page ${this.currentPage} of ${totalPages}`,
      cls: 'tasks-backlog-page-info'
    });

    // Next button
    const nextBtn = pagination.createEl('button', {
      text: 'Next →',
      cls: 'tasks-backlog-nav-btn'
    });
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.addEventListener('click', () => this.goToNextPage());

    // Load More button (alternative to pagination)
    if (this.currentPage < totalPages) {
      const loadMoreBtn = pagination.createEl('button', {
        text: `Load More (${Math.min(this.TASKS_PER_PAGE, this.undatedTasks.length - this.currentPage * this.TASKS_PER_PAGE)} more)`,
        cls: 'tasks-backlog-load-more'
      });
      loadMoreBtn.addEventListener('click', () => this.loadMore());
    }
  }

  /**
   * Navigates to the previous page.
   */
  private goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateDisplayedTasks();
      this.render();
    }
  }

  /**
   * Navigates to the next page.
   */
  private goToNextPage(): void {
    const totalPages = Math.ceil(this.undatedTasks.length / this.TASKS_PER_PAGE);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.updateDisplayedTasks();
      this.render();
    }
  }

  /**
   * Loads more tasks by increasing the page size for current page.
   */
  private loadMore(): void {
    const newEndIndex = this.currentPage * this.TASKS_PER_PAGE + this.TASKS_PER_PAGE;
    this.displayedTasks = this.undatedTasks.slice(0, newEndIndex);
    this.render();
  }

  /**
   * Refreshes the tasks from the provider and re-renders.
   */
  public async refresh(): Promise<void> {
    await this.loadTasks();
    this.render();
  }
}
