/**
 * @file TasksLifecycle.test.ts
 * @brief Tests for Tasks Provider lifecycle management fixes
 *
 * @description
 * This test suite verifies that the Tasks Backlog Manager lifecycle is properly
 * managed both during startup (with pre-existing Tasks calendars) and during
 * runtime (when Tasks calendars are added/removed).
 *
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../main';
import { ProviderRegistry } from '../ProviderRegistry';

// Mock the TasksBacklogManager to avoid CSS import issues
const mockTasksBacklogManager = {
  getIsLoaded: jest.fn(),
  onload: jest.fn(),
  onunload: jest.fn()
};

// Mock the TasksBacklogManager constructor
jest.mock('./TasksBacklogManager', () => ({
  TasksBacklogManager: jest.fn().mockImplementation(() => mockTasksBacklogManager)
}));

// Mock the plugin
const createMockPlugin = () => {
  const mockPlugin = {
    app: {
      workspace: {
        on: jest.fn(),
        off: jest.fn()
      }
    },
    settings: {
      calendarSources: []
    }
  } as unknown as FullCalendarPlugin;

  return mockPlugin;
};

describe('Tasks Provider Lifecycle Management', () => {
  let providerRegistry: ProviderRegistry;
  let mockPlugin: FullCalendarPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
    providerRegistry = new ProviderRegistry(mockPlugin);
  });

  describe('syncBacklogManagerLifecycle', () => {
    it('should load backlog when Tasks provider is available', () => {
      // Mock that a tasks provider exists
      jest.spyOn(providerRegistry, 'hasProviderOfType').mockReturnValue(true);
      mockTasksBacklogManager.getIsLoaded.mockReturnValue(false);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(providerRegistry.hasProviderOfType).toHaveBeenCalledWith('tasks');
      expect(mockTasksBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onload).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onunload).not.toHaveBeenCalled();
    });

    it('should not load backlog if already loaded', () => {
      // Mock that a tasks provider exists and backlog is already loaded
      jest.spyOn(providerRegistry, 'hasProviderOfType').mockReturnValue(true);
      mockTasksBacklogManager.getIsLoaded.mockReturnValue(true);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(providerRegistry.hasProviderOfType).toHaveBeenCalledWith('tasks');
      expect(mockTasksBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onload).not.toHaveBeenCalled();
      expect(mockTasksBacklogManager.onunload).not.toHaveBeenCalled();
    });

    it('should unload backlog when no Tasks provider is available', () => {
      // Mock that no tasks provider exists but backlog is loaded
      jest.spyOn(providerRegistry, 'hasProviderOfType').mockReturnValue(false);
      mockTasksBacklogManager.getIsLoaded.mockReturnValue(true);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(providerRegistry.hasProviderOfType).toHaveBeenCalledWith('tasks');
      expect(mockTasksBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onunload).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onload).not.toHaveBeenCalled();
    });

    it('should not unload backlog if already unloaded', () => {
      // Mock that no tasks provider exists and backlog is already unloaded
      jest.spyOn(providerRegistry, 'hasProviderOfType').mockReturnValue(false);
      mockTasksBacklogManager.getIsLoaded.mockReturnValue(false);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(providerRegistry.hasProviderOfType).toHaveBeenCalledWith('tasks');
      expect(mockTasksBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTasksBacklogManager.onload).not.toHaveBeenCalled();
      expect(mockTasksBacklogManager.onunload).not.toHaveBeenCalled();
    });
  });

  describe('Integration with startup flow', () => {
    it('should ensure syncBacklogManagerLifecycle is callable from main.ts', () => {
      // This test ensures the method exists and is public
      expect(typeof providerRegistry.syncBacklogManagerLifecycle).toBe('function');
      expect(providerRegistry.syncBacklogManagerLifecycle).toBeInstanceOf(Function);
    });
  });
});
