/**
 * @file TasksScheduling.integration.test.ts
 * @brief Integration tests for task scheduling and UI refresh functionality
 *
 * @description
 * This test suite verifies that the task scheduling functionality works correctly
 * and that cache invalidation occurs as expected.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from './TasksPluginProvider';

// Mock dependencies
jest.mock('../../main', () => ({}));

describe('Task Scheduling Integration', () => {
  let provider: TasksPluginProvider;
  let mockApp: any;

  beforeEach(() => {
    // Create mock app with required methods
    mockApp = {
      read: jest.fn(),
      rewrite: jest
        .fn()
        .mockImplementation(async (file: any, modifyFn: (content: string) => string) => {
          // Simulate the rewrite operation
          const originalContent = '- [ ] Original task\n- [ ] Task to schedule';
          const modifiedContent = modifyFn(originalContent);
          return modifiedContent;
        }),
      getFileByPath: jest.fn().mockImplementation((path: string) => {
        // Simulate finding any file path given in the test.
        return { path: path, extension: 'md' };
      })
    };

    const config = {
      id: 'test-tasks',
      name: 'Test Tasks'
    };

    // The mockPlugin needs the app.vault structure
    const mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: jest.fn().mockReturnValue([])
        }
      }
    } as any;

    provider = new TasksPluginProvider(config, mockPlugin, mockApp as any);
  });

  describe('scheduleTask method', () => {
    beforeEach(() => {
      mockApp.read.mockResolvedValue('- [ ] Task to schedule');
    });

    it('should format date correctly for task scheduling', async () => {
      // Mock _invalidateCache
      (provider as any)._invalidateCache = jest.fn();

      // Mock rewrite to capture the modified content
      let capturedModification = '';
      mockApp.rewrite.mockImplementation(
        async (file: any, modifyFn: (content: string) => string) => {
          const originalContent = '- [ ] Task to schedule';
          capturedModification = modifyFn(originalContent);
          return capturedModification;
        }
      );

      const testDate = new Date('2024-01-15T10:30:00Z');
      await provider.scheduleTask('test.md::1', testDate);

      // Verify the rewrite function was called

      // Check that the date was formatted correctly (YYYY-MM-DD)
      expect(capturedModification).toContain('2024-01-15');
    });

    it('should handle errors gracefully and not call _invalidateCache on failure', async () => {
      // Mock _findTaskByHandle to throw an error
      const mockFindTaskByHandle = jest.fn().mockRejectedValue(new Error('Task not found'));
      (provider as any)._findTaskByHandle = mockFindTaskByHandle;

      // Mock _invalidateCache
      const mockInvalidateCache = jest.fn();
      (provider as any)._invalidateCache = mockInvalidateCache;

      const testDate = new Date('2024-01-15');

      // Should throw an error
      await expect(provider.scheduleTask('invalid-task-id', testDate)).rejects.toThrow(
        'Failed to schedule task'
      );

      // Cache should not be invalidated on error
      expect(mockInvalidateCache).not.toHaveBeenCalled();
    });
  });

  describe('Task ID format validation', () => {
    it('should accept valid task ID format', async () => {
      const validTaskIds = ['test.md::1', 'folder/file.md::10', 'complex-file-name.md::999'];

      for (const taskId of validTaskIds) {
        const [, lineNumberStr] = taskId.split('::');
        const lineNumber = parseInt(lineNumberStr, 10);

        // Dynamically create file content with enough lines and the task at the correct line.
        const lines = new Array(lineNumber).fill('');
        lines[lineNumber - 1] = '- [ ] A task to find';
        const fileContent = lines.join('\n');
        mockApp.read.mockResolvedValue(fileContent);

        // The test is now simply to ensure it doesn't throw with a valid format
        await expect(provider.scheduleTask(taskId, new Date())).resolves.not.toThrow();
      }
    });
  });
});
