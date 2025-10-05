/**
 * @file TasksPluginProvider.test.ts
 * @brief Unit tests for TasksPluginProvider functionality.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksPluginProvider } from '../TasksPluginProvider';
import { TasksProviderConfig } from '../typesTask';
import { TFile } from 'obsidian';

// Mock the dependencies
jest.mock('../../../ObsidianAdapter');
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
        },
        workspace: {
          trigger: jest.fn((eventName, callback) => {
            if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
              callback({ state: 'Warm', tasks: [] }); // MODIFIED: resolves cache warm promise
            }
          })
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

      expect(capabilities.canCreate).toBe(false);
      expect(capabilities.canEdit).toBe(true);
      expect(capabilities.canDelete).toBe(true);
    });
  });

  describe('Tasks API integration', () => {
    it('should reject creating events directly', async () => {
      const event: any = { title: 'Test Event', type: 'single', date: '2024-01-01' };

      await expect(provider.createEvent(event)).rejects.toThrow(
        'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
      );
    });

    it('should reject recurring events for update', async () => {
      const handle = { persistentId: 'test::1' };
      const oldEvent: any = { title: 'Old', type: 'single' };
      const newEvent: any = { title: 'New', type: 'recurring' };

      await expect(provider.updateEvent(handle, oldEvent, newEvent)).rejects.toThrow(
        'Tasks provider can only update single, dated events.'
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
      ).rejects.toThrow('Tasks provider does not support recurring event overrides.');
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
});
