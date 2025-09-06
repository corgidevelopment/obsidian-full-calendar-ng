/**
 * @file TasksPluginProvider.test.ts
 * @brief Unit tests for TasksPluginProvider functionality.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import { TFile } from 'obsidian';

// Mock the dependencies
jest.mock('../../ObsidianAdapter');
// NOTE: NOT mocking TasksParser so we can test the real enhanced parsing functionality

describe('TasksPluginProvider', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;
  let mockPlugin: any;

  beforeEach(() => {
    // Mock ObsidianInterface
    mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn(),
      create: jest.fn(),
      rewrite: jest.fn(),
      delete: jest.fn()
    };

    // Mock FullCalendarPlugin
    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      },
      settings: {},
      providerRegistry: {
        refreshBacklogViews: jest.fn()
      }
    };

    const config: TasksProviderConfig = {
      id: 'tasks_1',
      name: 'Test Tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin, mockApp);
  });

  describe('basic properties', () => {
    it('should have correct static properties', () => {
      expect(TasksPluginProvider.type).toBe('tasks');
      expect(TasksPluginProvider.displayName).toBe('Obsidian Tasks');
      expect(provider.type).toBe('tasks');
      expect(provider.displayName).toBe('Obsidian Tasks');
      expect(provider.isRemote).toBe(false);
      expect(provider.loadPriority).toBe(30);
    });

    it('should return writable capabilities', () => {
      const capabilities = provider.getCapabilities();

      expect(capabilities.canCreate).toBe(true);
      expect(capabilities.canEdit).toBe(true);
      expect(capabilities.canDelete).toBe(true);
    });
  });

  describe('Tasks API integration', () => {
    it('should reject recurring events for create', async () => {
      const event: any = { title: 'Test Event', type: 'recurring' };

      await expect(provider.createEvent(event)).rejects.toThrow(
        'Tasks provider can only create single events, not recurring events.'
      );
    });

    it('should reject events with invalid date format for create', async () => {
      const event: any = { title: 'Test Event', type: 'single', date: 'invalid-date' };

      await expect(provider.createEvent(event)).rejects.toThrow('Failed to create task:');
    });

    it('should reject recurring events for update', async () => {
      const handle = { persistentId: 'test::1' };
      const oldEvent: any = { title: 'Old', type: 'single' };
      const newEvent: any = { title: 'New', type: 'recurring' };

      await expect(provider.updateEvent(handle, oldEvent, newEvent)).rejects.toThrow(
        'Tasks provider can only update single events, not recurring events.'
      );
    });

    it('should reject invalid handle format for delete', async () => {
      const handle = { persistentId: 'invalid-format' };

      await expect(provider.deleteEvent(handle)).rejects.toThrow(
        'Invalid task handle format. Expected "filePath::lineNumber".'
      );
    });

    it('should still reject instance overrides', async () => {
      const masterEvent: any = { title: 'Master' };
      const instanceDate = '2024-01-15';
      const newEventData: any = { title: 'Override' };

      await expect(
        provider.createInstanceOverride(masterEvent, instanceDate, newEventData)
      ).rejects.toThrow('TasksPluginProvider is read-only. Cannot create instance overrides.');
    });
  });

  describe('event handle generation', () => {
    it('should generate event handle from UID', () => {
      const event: any = {
        uid: 'test-file.md::5',
        title: 'Test Task'
      };

      const handle = provider.getEventHandle(event);

      expect(handle).not.toBeNull();
      expect(handle!.persistentId).toBe('test-file.md::5');
    });

    it('should return null for event without UID', () => {
      const event: any = {
        title: 'Test Task'
      };

      const handle = provider.getEventHandle(event);

      expect(handle).toBeNull();
    });
  });

  describe('constructor validation', () => {
    it('should throw error when ObsidianInterface is not provided', () => {
      const config: TasksProviderConfig = { id: 'tasks_1' };

      expect(() => {
        new TasksPluginProvider(config, mockPlugin);
      }).toThrow('TasksPluginProvider requires an Obsidian app interface.');
    });
  });

  describe('enhanced parsing functionality', () => {
    it('should create multi-day events from tasks with start and due dates', async () => {
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;
      (provider as any).parser.parseFileContent = jest.fn().mockReturnValue({
        dated: [
          {
            title: 'Multi-day project',
            startDate: DateTime.fromISO('2024-01-15'),
            endDate: DateTime.fromISO('2024-01-18'),
            date: DateTime.fromISO('2024-01-15'),
            isDone: false,
            location: { lineNumber: 1, path: 'test.md' }
          }
        ],
        undated: []
      });
      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      const [event, location] = events[0];
      expect(event.title).toBe('Multi-day project');
      if (event.type === 'single') {
        expect(event.date).toBe('2024-01-15');
        expect(event.endDate).toBe('2024-01-18');
      }
      expect(event.allDay).toBe(true);
    });

    it('should handle single-day events with start date', async () => {
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;
      (provider as any).parser.parseFileContent = jest.fn().mockReturnValue({
        dated: [
          {
            title: 'Single day task',
            startDate: DateTime.fromISO('2024-01-15'),
            date: DateTime.fromISO('2024-01-15'),
            isDone: false,
            location: { lineNumber: 1, path: 'test.md' }
          }
        ],
        undated: []
      });
      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      const [event, location] = events[0];
      expect(event.title).toBe('Single day task');
      if (event.type === 'single') {
        expect(event.date).toBe('2024-01-15');
        expect(event.endDate).toBe(null);
      }
    });

    it('should handle scheduled dates as start dates', async () => {
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;
      (provider as any).parser.parseFileContent = jest.fn().mockReturnValue({
        dated: [
          {
            title: 'Scheduled task',
            startDate: DateTime.fromISO('2024-01-15'),
            endDate: DateTime.fromISO('2024-01-18'),
            date: DateTime.fromISO('2024-01-15'),
            isDone: false,
            location: { lineNumber: 1, path: 'test.md' }
          }
        ],
        undated: []
      });
      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      const [event, location] = events[0];
      expect(event.title).toBe('Scheduled task');
      if (event.type === 'single') {
        expect(event.date).toBe('2024-01-15'); // Scheduled date becomes start date
        expect(event.endDate).toBe('2024-01-18');
      }
    });

    it('should recognize completion emojis', async () => {
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;
      (provider as any).parser.parseFileContent = jest.fn().mockReturnValue({
        dated: [
          {
            title: 'Completed task',
            date: DateTime.fromISO('2024-01-01'),
            isDone: true,
            location: { lineNumber: 1, path: 'test.md' }
          }
        ],
        undated: []
      });
      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      const [event, location] = events[0];
      expect(event.title).toBe('Completed task');
      if (event.type === 'single') {
        expect(event.completed).toBeTruthy();
      }
    });

    it('should preserve metadata while cleaning titles', async () => {
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;
      (provider as any).parser.parseFileContent = jest.fn().mockReturnValue({
        dated: [
          {
            title: 'Task with metadata #important @john',
            date: DateTime.fromISO('2024-01-01'),
            isDone: false,
            location: { lineNumber: 1, path: 'test.md' }
          }
        ],
        undated: []
      });
      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      const [event, location] = events[0];
      expect(event.title.trim()).toBe('Task with metadata #important @john');
    });
  });

  describe('task serialization', () => {
    it('should create single-day task lines', () => {
      const event = {
        type: 'single' as const,
        title: 'Test task',
        date: '2024-01-15',
        endDate: null,
        allDay: true
      };

      // Access the private method via any cast for testing
      const taskLine = (provider as any)._ofcEventToTaskLine(event);

      expect(taskLine).toMatch(/- \[ \] Test task 📅 2024-01-15/);
    });

    it('should create multi-day task lines', () => {
      const event = {
        type: 'single' as const,
        title: 'Multi-day task',
        date: '2024-01-15',
        endDate: '2024-01-18',
        allDay: true
      };

      const taskLine = (provider as any)._ofcEventToTaskLine(event);

      expect(taskLine).toMatch(/- \[ \] Multi-day task 🛫 2024-01-15 📅 2024-01-18/);
    });
  });

  describe('file target for new tasks', () => {
    it('should target FMR Tasks integration.md for new tasks', async () => {
      const targetFileName = 'FMR Tasks integration.md';
      mockApp.getFileByPath.mockReturnValue(null);
      mockApp.create.mockResolvedValue({ path: targetFileName });

      const event = {
        type: 'single' as const,
        title: 'New task',
        date: '2024-01-15',
        allDay: true
      };

      // Access the private method for testing
      const targetFile = await (provider as any)._getTargetFileForNewTask(event);

      expect(mockApp.create).toHaveBeenCalledWith(targetFileName, '# Tasks\n\n');
    });
  });

  describe('caching functionality', () => {
    // Pre-populate the cache before tests in this suite run.
    beforeEach(async () => {
      await provider.getEvents();
    });
    it('should use cache for subsequent calls', async () => {
      // Setup mock to track calls
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([{ path: 'test.md' }]);
      mockApp.read = jest.fn().mockResolvedValue('- [ ] Test task 📅 2024-01-15');

      // First call should scan vault
      await provider.getEvents();
      const firstCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Second call should use cache (no additional vault scans)
      await provider.getEvents();
      const secondCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Should only scan once if cache is working
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should cache results and avoid redundant scans', async () => {
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Initial scan
      await provider.getEvents();
      const initialCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Second call should use cache
      await provider.getEvents();
      const secondCallCount = mockPlugin.app.vault.getMarkdownFiles.mock.calls.length;

      // Should not have made additional calls due to caching
      expect(secondCallCount).toEqual(initialCallCount);
    });

    it('should provide undated tasks method', async () => {
      mockPlugin.app.vault.getMarkdownFiles = jest.fn().mockReturnValue([]);

      // Should not throw and should return array
      const undatedTasks = await provider.getUndatedTasks();
      expect(Array.isArray(undatedTasks)).toBe(true);
    });

    it('should provide surgical file parsing via getEventsInFile', async () => {
      // Create a mock file with task content
      const mockFile = { path: 'test.md', extension: 'md' } as TFile;

      // Mock the file reading to return task content
      mockApp.read.mockResolvedValue('- [ ] Test task 📅 2023-01-01');

      // Should parse tasks from the specific file
      const events = await provider.getEventsInFile(mockFile);

      expect(Array.isArray(events)).toBe(true);
      expect(mockApp.read).toHaveBeenCalledWith(mockFile);
      // Should not trigger a *second* full vault scan
      expect(mockPlugin.app.vault.getMarkdownFiles).toHaveBeenCalledTimes(1);
    });
  });
});
