/**
 * @file TasksSurgicalWatching.test.ts
 * @brief Tests for surgical file watching integration in Tasks Provider
 *
 * @description
 * This test verifies that the Tasks Provider correctly integrates with the
 * ProviderRegistry's surgical file watching system, eliminating the need for
 * full-vault scans on file changes.
 *
 * @license See LICENSE.md
 */

import { TFile } from 'obsidian';
import { TasksPluginProvider } from './TasksPluginProvider';
import { TasksProviderConfig } from './typesTask';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';

// Mock the parser to return predictable results
const mockParser = {
  parseFileContent: jest.fn(),
  parseLine: jest.fn()
};

jest.mock('./TasksParser', () => ({
  TasksParser: jest.fn().mockImplementation(() => mockParser)
}));

describe('Tasks Provider Surgical File Watching', () => {
  let provider: TasksPluginProvider;
  let mockApp: jest.Mocked<ObsidianInterface>;
  let mockPlugin: Partial<FullCalendarPlugin>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = {
      read: jest.fn(),
      getFileByPath: jest.fn()
    } as unknown as jest.Mocked<ObsidianInterface>;

    const mockVaultGetMarkdownFiles = jest.fn().mockReturnValue([]);

    mockPlugin = {
      app: {
        vault: {
          getMarkdownFiles: mockVaultGetMarkdownFiles
        }
      }
    } as unknown as Partial<FullCalendarPlugin>;

    const config: TasksProviderConfig = {
      name: 'Test Tasks',
      id: 'test-tasks'
    };

    provider = new TasksPluginProvider(config, mockPlugin as FullCalendarPlugin, mockApp);
  });

  describe('getEventsInFile method', () => {
    // Ensure the cache is populated once before this test runs,
    // so we can assert that getEventsInFile doesn't trigger a *second* scan.
    beforeEach(async () => {
      await provider.getEvents();
    });
    it('should parse only the specified file, not trigger full vault scan', async () => {
      const mockFile = { path: 'specific-file.md', extension: 'md' } as TFile;
      const fileContent = '- [ ] Test task 📅 2023-01-01\n- [x] Done task ✅ 2023-01-02';

      mockApp.read.mockResolvedValue(fileContent);
      mockParser.parseFileContent.mockReturnValue([
        {
          title: 'Test task',
          date: '2023-01-01',
          isDone: false,
          location: { path: 'specific-file.md', lineNumber: 1 }
        }
      ]);

      const events = await provider.getEventsInFile(mockFile);

      // Should read only the specified file
      expect(mockApp.read).toHaveBeenCalledWith(mockFile);
      expect(mockApp.read).toHaveBeenCalledTimes(1);

      // Should parse the file content
      expect(mockParser.parseFileContent).toHaveBeenCalledWith(fileContent, mockFile.path);

      // Should NOT trigger full vault scan
      const mockGetMarkdownFiles = (mockPlugin as any).app.vault.getMarkdownFiles;
      // Allow one call for initial cache population, but not more
      expect(mockGetMarkdownFiles.mock.calls.length).toBeLessThanOrEqual(1);

      // Should return events array
      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle file read errors gracefully', async () => {
      const mockFile = { path: 'error-file.md', extension: 'md' } as TFile;

      mockApp.read.mockRejectedValue(new Error('File read failed'));

      const events = await provider.getEventsInFile(mockFile);

      // Should return empty array on error
      expect(events).toEqual([]);

      // Should not crash or throw
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('isFileRelevant method', () => {
    it('should identify markdown files as relevant', () => {
      const markdownFile = { extension: 'md' } as TFile;
      const result = provider.isFileRelevant(markdownFile);
      expect(result).toBe(true);
    });

    it('should identify non-markdown files as irrelevant', () => {
      const textFile = { extension: 'txt' } as TFile;
      const result = provider.isFileRelevant(textFile);
      expect(result).toBe(false);

      const imageFile = { extension: 'png' } as TFile;
      const result2 = provider.isFileRelevant(imageFile);
      expect(result2).toBe(false);
    });
  });

  describe('caching behavior', () => {
    it('should only scan vault once for initial population', async () => {
      const mockGetMarkdownFiles = jest.fn().mockReturnValue([]);
      (mockPlugin as any).app.vault.getMarkdownFiles = mockGetMarkdownFiles;

      // First call should trigger scan
      await provider.getEvents();
      const firstScanCount = mockGetMarkdownFiles.mock.calls.length;
      expect(firstScanCount).toBe(1);

      // Second call should use cache
      await provider.getEvents();
      const secondScanCount = mockGetMarkdownFiles.mock.calls.length;
      expect(secondScanCount).toBe(1); // No additional scans

      // Third call should still use cache
      await provider.getUndatedTasks();
      const thirdScanCount = mockGetMarkdownFiles.mock.calls.length;
      expect(thirdScanCount).toBe(1); // No additional scans
    });
  });

  describe('integration with ProviderRegistry surgical updates', () => {
    it('should provide the methods required by ProviderRegistry', () => {
      // ProviderRegistry expects these methods to exist
      expect(typeof provider.getEventsInFile).toBe('function');
      expect(typeof provider.isFileRelevant).toBe('function');

      // These methods are optional in the Provider interface but required for surgical watching
      expect(provider.getEventsInFile).toBeInstanceOf(Function);
      expect(provider.isFileRelevant).toBeInstanceOf(Function);
    });
  });
});
