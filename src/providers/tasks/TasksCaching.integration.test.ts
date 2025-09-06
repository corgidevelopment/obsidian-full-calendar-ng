/**
 * @file TasksCaching.integration.test.ts
 * @brief Integration tests for TasksPluginProvider caching functionality.
 *
 * @description
 * These tests validate that the single-pass scanning and caching functionality
 * works correctly without mocking the TasksParser.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';

describe('TasksPluginProvider Integration (Caching)', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;
  let mockPlugin: any;

  beforeEach(() => {
    // Mock ObsidianInterface (no mocking of TasksParser)
    mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn()
        }
      },
      settings: {}
    };

    const config: TasksProviderConfig = {
      id: 'tasks_integration_test',
      name: 'Integration Test Tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin, mockApp);
  });

  describe('single-pass scanning with real parser', () => {
    it('should correctly parse and separate dated vs undated tasks', async () => {
      const testContent = `# My Tasks

- [ ] Dated task 📅 2024-01-15
- [x] Completed dated task 📅 2024-01-10
- [ ] Undated task
- [x] Completed undated task
Regular text line
- Task without checkbox 📅 2024-02-01
  - [ ] Indented task 📅 2024-02-15
- [ ] Task with invalid date 📅 not-a-date

## More content
Another regular line`;

      mockPlugin.app.vault.getMarkdownFiles = jest
        .fn()
        .mockReturnValue([{ path: 'test-tasks.md' }]);
      mockApp.read = jest.fn().mockResolvedValue(testContent);

      // Get dated and undated tasks
      const datedEvents = await provider.getEvents();
      const undatedTasks = await provider.getUndatedTasks();

      // Verify dated tasks (should include indented task)
      expect(datedEvents).toHaveLength(3);
      const datedEventTitles = datedEvents.map(([event]) => event.title);
      expect(datedEventTitles).toContain('Dated task');
      expect(datedEventTitles).toContain('Completed dated task');
      expect(datedEventTitles).toContain('Indented task');

      // Verify undated tasks (includes invalid date)
      expect(undatedTasks).toHaveLength(3);
      const undatedTaskTitles = undatedTasks.map(task => task.title);
      expect(undatedTaskTitles).toContain('Undated task');
      expect(undatedTaskTitles).toContain('Completed undated task');
      expect(undatedTaskTitles).toContain('Task with invalid date');

      // Verify completion status
      const completedDatedEvent = datedEvents.find(
        ([event]) => event.title === 'Completed dated task'
      );
      expect(completedDatedEvent?.[0]).toBeDefined();
      if (completedDatedEvent?.[0].type === 'single') {
        expect(completedDatedEvent[0].completed).toBeTruthy();
      }

      const completedUndatedTask = undatedTasks.find(
        task => task.title === 'Completed undated task'
      );
      expect(completedUndatedTask?.isDone).toBe(true);
    });

    it('should cache results between calls', async () => {
      const testContent = '- [ ] Test task 📅 2024-01-15\n- [ ] Undated task';

      mockPlugin.app.vault.getMarkdownFiles = jest
        .fn()
        .mockReturnValue([{ path: 'cache-test.md' }]);
      mockApp.read = jest.fn().mockResolvedValue(testContent);

      // First calls should trigger file reads
      const events1 = await provider.getEvents();
      const undated1 = await provider.getUndatedTasks();

      expect(events1).toHaveLength(1);
      expect(undated1).toHaveLength(1);
      expect(mockApp.read).toHaveBeenCalledTimes(1);

      // Second calls should use cache (no additional reads)
      const events2 = await provider.getEvents();
      const undated2 = await provider.getUndatedTasks();

      expect(events2).toHaveLength(1);
      expect(undated2).toHaveLength(1);
      expect(mockApp.read).toHaveBeenCalledTimes(1); // Still only called once

      // Results should be identical
      expect(events2).toEqual(events1);
      expect(undated2).toEqual(undated1);
    });

    it('should handle empty files and files with no tasks', async () => {
      const emptyContent = '';
      const noTasksContent = `# Header
Regular paragraph
- Regular list item (not a task)
Another paragraph`;

      mockPlugin.app.vault.getMarkdownFiles = jest
        .fn()
        .mockReturnValue([{ path: 'empty.md' }, { path: 'no-tasks.md' }]);

      mockApp.read = jest
        .fn()
        .mockResolvedValueOnce(emptyContent)
        .mockResolvedValueOnce(noTasksContent);

      const events = await provider.getEvents();
      const undatedTasks = await provider.getUndatedTasks();

      expect(events).toHaveLength(0);
      expect(undatedTasks).toHaveLength(0);
      expect(mockApp.read).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple files correctly', async () => {
      const file1Content = `- [ ] Task 1 📅 2024-01-15
- [ ] Undated task 1`;

      const file2Content = `- [x] Completed task 📅 2024-01-10
- [x] Completed undated task`;

      mockPlugin.app.vault.getMarkdownFiles = jest
        .fn()
        .mockReturnValue([{ path: 'file1.md' }, { path: 'file2.md' }]);

      mockApp.read = jest
        .fn()
        .mockResolvedValueOnce(file1Content)
        .mockResolvedValueOnce(file2Content);

      const events = await provider.getEvents();
      const undatedTasks = await provider.getUndatedTasks();

      // Should have tasks from both files
      expect(events).toHaveLength(2); // 1 from each file
      expect(undatedTasks).toHaveLength(2); // 1 from each file

      // Verify tasks from both files are present
      const eventTitles = events.map(([event]) => event.title);
      expect(eventTitles).toContain('Task 1');
      expect(eventTitles).toContain('Completed task');

      const undatedTaskTitles = undatedTasks.map(task => task.title);
      expect(undatedTaskTitles).toContain('Undated task 1');
      expect(undatedTaskTitles).toContain('Completed undated task');
    });
  });
});
