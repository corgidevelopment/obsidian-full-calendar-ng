/**
 * @file TasksSettings.test.ts
 * @brief Unit tests for TasksSettings functionality.
 *
 * @license See LICENSE.md
 */

import { getTasksPluginSettings, getDueDateEmoji } from './TasksSettings';

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

      expect(settings.globalFilter).toBe('📅');
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

      expect(settings.globalFilter).toBe('📅');
    });

    it('should return Tasks plugin settings when available', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: '📋',
                  otherSetting: 'test-value'
                }
              }
            }
          }
        }
      } as any;

      const settings = getTasksPluginSettings();

      expect(settings.globalFilter).toBe('📋');
      expect((settings as any).otherSetting).toBe('test-value');
    });

    it('should use default emoji when Tasks plugin settings exist but globalFilter is missing', () => {
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

      expect(settings.globalFilter).toBe('📅');
    });
  });

  describe('getDueDateEmoji', () => {
    it('should return default emoji when Tasks plugin is not available', () => {
      const emoji = getDueDateEmoji();

      expect(emoji).toBe('📅');
    });

    it('should return configured emoji from Tasks plugin', () => {
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: '🗓️'
                }
              }
            }
          }
        }
      } as any;

      const emoji = getDueDateEmoji();

      expect(emoji).toBe('🗓️');
    });
  });
});
