/**
 * @file TasksSettings.test.ts
 * @brief Unit tests for TasksSettings functionality.
 *
 * @license See LICENSE.md
 */

import { getTasksPluginSettings, getDueDateEmoji, isDone } from './TasksSettings';

describe('TasksSettings', () => {
  // Store the original window object
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset window object before each test
    global.window = {} as any;
  });

  afterAll(() => {
    // Restore original window object
    global.window = originalWindow;
  });

  describe('getTasksPluginSettings', () => {
    it('should return default settings when window.app is not available', () => {
      const settings = getTasksPluginSettings();

      expect(settings.globalFilter).toBe(''); // Empty string means all checklist items are considered
    });

    it('should return default settings when Tasks plugin is not installed', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {}
          }
        }
      } as any;

      const settings = getTasksPluginSettings();

      expect(settings.globalFilter).toBe(''); // Empty string means all checklist items are considered
    });

    it('should return Tasks plugin settings when available', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: '#task',
                  otherSetting: 'test-value'
                }
              }
            }
          }
        }
      } as any;

      const settings = getTasksPluginSettings();

      expect(settings.globalFilter).toBe('#task');
      expect((settings as any).otherSetting).toBe('test-value');
    });

    it('should use empty string when Tasks plugin settings exist but globalFilter is missing', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  // globalFilter is missing
                  otherSetting: 'test'
                }
              }
            }
          }
        }
      } as any;

      const settings = getTasksPluginSettings();

      expect(settings.globalFilter).toBe(''); // Empty string is the default
    });
  });

  describe('getDueDateEmoji', () => {
    it('should return standard due date emoji', () => {
      const emoji = getDueDateEmoji();

      expect(emoji).toBe('📅'); // Always returns the standard due date emoji
    });

    it('should return standard due date emoji regardless of Tasks plugin settings', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: '#task' // This is a text filter, not the due date emoji
                }
              }
            }
          }
        }
      } as any;

      const emoji = getDueDateEmoji();

      expect(emoji).toBe('📅'); // Always returns the standard due date emoji
    });
  });

  describe('isDone', () => {
    it('should return true for standard completed status (x)', () => {
      expect(isDone('x')).toBe(true);
      expect(isDone('X')).toBe(true);
    });

    it('should return true for standard cancelled status (-)', () => {
      expect(isDone('-')).toBe(true);
    });

    it('should return false for standard todo status (space)', () => {
      expect(isDone(' ')).toBe(false);
    });

    it('should return false for in-progress status (/)', () => {
      expect(isDone('/')).toBe(false);
    });

    it('should return false for unknown status symbols', () => {
      expect(isDone('>')).toBe(false);
      expect(isDone('?')).toBe(false);
      expect(isDone('!')).toBe(false);
    });

    it('should use Tasks plugin status settings when available', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  statusSettings: {
                    coreStatuses: [
                      {
                        symbol: '!',
                        name: 'Important',
                        nextStatusSymbol: 'x',
                        availableAsInitialStatus: true,
                        type: 'DONE'
                      },
                      {
                        symbol: '?',
                        name: 'Question',
                        nextStatusSymbol: 'x',
                        availableAsInitialStatus: true,
                        type: 'CANCELLED'
                      },
                      {
                        symbol: '>',
                        name: 'Deferred',
                        nextStatusSymbol: ' ',
                        availableAsInitialStatus: true,
                        type: 'TODO'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      } as any;

      // Custom DONE and CANCELLED should be true
      expect(isDone('!')).toBe(true);
      expect(isDone('?')).toBe(true);

      // Custom TODO should be false
      expect(isDone('>')).toBe(false);

      // Standard statuses should still work
      expect(isDone('x')).toBe(true);
      expect(isDone(' ')).toBe(false);
    });
  });
});
