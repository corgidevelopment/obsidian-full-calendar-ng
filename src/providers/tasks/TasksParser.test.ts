/**
 * @file TasksParser.test.ts
 * @brief Unit tests for TasksParser functionality.
 *
 * @license See LICENSE.md
 */

import { TasksParser } from './TasksParser';
import { cleanTaskTitleRobust } from './utils/splitter';
import { TASK_EMOJIS } from './TasksSettings';

describe('TasksParser', () => {
  let parser: TasksParser;

  beforeEach(() => {
    parser = new TasksParser();
  });

  describe('parseLine', () => {
    it('should parse a simple task with due date', () => {
      const line = '- [ ] Complete the report 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Complete the report');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.isDone).toBe(false);
        expect(result.task.location.path).toBe('test.md');
        expect(result.task.location.lineNumber).toBe(1);
      }
    });

    // New tests for enhanced parsing
    it('should parse a task with start date only', () => {
      const line = '- [ ] Task with start date 🛫 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with start date');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate).toBeUndefined();
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Legacy compatibility
      }
    });

    it('should parse a task with scheduled date only', () => {
      const line = '- [ ] Task with scheduled date ⏳ 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with scheduled date');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate).toBeUndefined();
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Legacy compatibility
      }
    });

    it('should parse a multi-day task with start and due dates', () => {
      const line = '- [ ] Multi-day project 🛫 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Multi-day project');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Primary date is start date
      }
    });

    it('should parse a task with scheduled and due dates', () => {
      const line = '- [ ] Task with schedule and due ⏳ 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with schedule and due');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Primary date is start date
      }
    });

    it('should prefer start date over scheduled date when both present', () => {
      const line =
        '- [ ] Task with both start and scheduled 🛫 2024-01-10 ⏳ 2024-01-15 📅 2024-01-18';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Task with both start and scheduled');
        expect(result.task.startDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-10'); // Start has precedence
        expect(result.task.endDate?.toFormat('yyyy-MM-dd')).toBe('2024-01-18');
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-10');
      }
    });

    it('should recognize completed tasks with done emoji', () => {
      const line = '- [x] Completed task ✅ 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Completed task');
        expect(result.task.isDone).toBe(true);
      }
    });

    it('should recognize cancelled tasks', () => {
      const line = '- [ ] Cancelled task ❌ 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Cancelled task');
        expect(result.task.isDone).toBe(true); // Cancelled is treated as done
      }
    });

    it('should clean title by removing all task emojis', () => {
      const line = '- [ ] Complex task 🛫 2024-01-15 📅 2024-01-18 ✅ #tag @person';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Complex task #tag @person'); // Should preserve non-date metadata
      }
    });

    it('should parse a completed task', () => {
      const line = '- [x] Buy groceries 📅 2024-01-10';
      const result = parser.parseLine(line, 'test.md', 5);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title).toBe('Buy groceries');
        expect(result.task.isDone).toBe(true);
        expect(result.task.location.lineNumber).toBe(5);
      }
    });

    it('should return none for non-checklist items', () => {
      const line = 'Just a regular line of text 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('none');
    });

    it('should return undated for tasks without due dates', () => {
      const line = '- [ ] Task without date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title).toBe('Task without date');
        expect(result.task.isDone).toBe(false);
        expect(result.task.location.path).toBe('test.md');
        expect(result.task.location.lineNumber).toBe(1);
      }
    });

    it('should handle different date formats', () => {
      const testCases = [
        '- [ ] Task 1 📅 2024-01-15',
        '- [ ] Task 2 📅 2024/01/15',
        '- [ ] Task 3 📅 15-01-2024',
        '- [ ] Task 4 📅 15/01/2024',
        '- [ ] Task 5 📅 15.01.2024'
      ];

      testCases.forEach((line, index) => {
        const result = parser.parseLine(line, 'test.md', index + 1);
        expect(result.type).toBe('dated');
        if (result.type === 'dated') {
          expect(result.task.title).toBe(`Task ${index + 1}`);
          // All should parse to the same date (January 15, 2024)
          expect(result.task.date.month).toBe(1);
          expect(result.task.date.day).toBe(15);
          expect(result.task.date.year).toBe(2024);
        }
      });
    });

    it('should return undated for invalid dates', () => {
      const line = '- [ ] Task with bad date 📅 invalid-date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title.trim()).toBe('Task with bad date'); // Invalid date gets removed for backward compatibility
        expect(result.task.isDone).toBe(false);
      }
    });

    it('should handle tasks with extra content after date', () => {
      const line = '- [ ] Meeting 📅 2024-01-15 #important @john';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Meeting #important @john'); // Should preserve tags and mentions
        expect(result.task.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
      }
    });

    it('should clean task titles by removing emoji', () => {
      const line = '- [ ] Important task ⭐ 📅 2024-01-15 🔥';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('dated');
      if (result.type === 'dated') {
        expect(result.task.title.trim()).toBe('Important task ⭐ 🔥'); // Should preserve non-date emojis
      }
    });

    it('should handle completed undated tasks', () => {
      const line = '- [x] Completed task without date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result.type).toBe('undated');
      if (result.type === 'undated') {
        expect(result.task.title).toBe('Completed task without date');
        expect(result.task.isDone).toBe(true);
      }
    });

    it('should respect Tasks plugin global filter when set', () => {
      // Mock Tasks plugin with global filter
      const originalWindow = global.window;
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: '#task'
                }
              }
            }
          }
        }
      } as any;

      const line1 = '- [ ] This is a task #task 📅 2024-01-15';
      const line2 = '- [ ] This is not a task 📅 2024-01-15';

      const result1 = parser.parseLine(line1, 'test.md', 1);
      const result2 = parser.parseLine(line2, 'test.md', 2);

      expect(result1.type).toBe('dated'); // Should be parsed as it contains #task
      expect(result2.type).toBe('none'); // Should be ignored as it doesn't contain #task

      // Restore original window
      global.window = originalWindow;
    });

    it('should treat all checklist items as tasks when no global filter is set', () => {
      // Mock Tasks plugin with no global filter
      const originalWindow = global.window;
      global.window = {
        app: {
          plugins: {
            plugins: {
              'obsidian-tasks-plugin': {
                settings: {
                  globalFilter: ''
                }
              }
            }
          }
        }
      } as any;

      const line1 = '- [ ] Task with tag #work 📅 2024-01-15';
      const line2 = '- [ ] Task without tag 📅 2024-01-15';

      const result1 = parser.parseLine(line1, 'test.md', 1);
      const result2 = parser.parseLine(line2, 'test.md', 2);

      expect(result1.type).toBe('dated'); // Should be parsed
      expect(result2.type).toBe('dated'); // Should also be parsed

      // Restore original window
      global.window = originalWindow;
    });

    it('should use custom status symbols from Tasks plugin', () => {
      // Mock Tasks plugin with custom status settings
      const originalWindow = global.window;
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
                        symbol: '/',
                        name: 'In Progress',
                        nextStatusSymbol: 'x',
                        availableAsInitialStatus: true,
                        type: 'IN_PROGRESS'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      } as any;

      const completedLine = '- [!] Custom completed task 📅 2024-01-15';
      const inProgressLine = '- [/] In progress task 📅 2024-01-15';
      const todoLine = '- [ ] Regular todo task 📅 2024-01-15';

      const completedResult = parser.parseLine(completedLine, 'test.md', 1);
      const inProgressResult = parser.parseLine(inProgressLine, 'test.md', 2);
      const todoResult = parser.parseLine(todoLine, 'test.md', 3);

      expect(completedResult.type).toBe('dated');
      if (completedResult.type === 'dated') {
        expect(completedResult.task.isDone).toBe(true); // Custom '!' should be recognized as done
      }

      expect(inProgressResult.type).toBe('dated');
      if (inProgressResult.type === 'dated') {
        expect(inProgressResult.task.isDone).toBe(false); // Custom '/' should not be recognized as done
      }

      expect(todoResult.type).toBe('dated');
      if (todoResult.type === 'dated') {
        expect(todoResult.task.isDone).toBe(false); // Regular ' ' should not be done
      }

      // Restore original window
      global.window = originalWindow;
    });

    it('should use removeTagsFromTaskTitle setting when provided', () => {
      const settingsWithTagRemoval = {
        removeTagsFromTaskTitle: true
      } as any; // Mock minimal settings

      const settingsWithoutTagRemoval = {
        removeTagsFromTaskTitle: false
      } as any; // Mock minimal settings

      const parserWithTagRemoval = new TasksParser(settingsWithTagRemoval);
      const parserWithoutTagRemoval = new TasksParser(settingsWithoutTagRemoval);

      const line = '- [ ] Review PR #urgent #project 📅 2024-01-15';

      const resultWithTagRemoval = parserWithTagRemoval.parseLine(line, 'test.md', 1);
      const resultWithoutTagRemoval = parserWithoutTagRemoval.parseLine(line, 'test.md', 1);

      expect(resultWithTagRemoval.type).toBe('dated');
      expect(resultWithoutTagRemoval.type).toBe('dated');

      if (resultWithTagRemoval.type === 'dated' && resultWithoutTagRemoval.type === 'dated') {
        expect(resultWithTagRemoval.task.title).toBe('Review PR'); // Tags removed
        expect(resultWithoutTagRemoval.task.title).toBe('Review PR #urgent #project'); // Tags preserved
      }
    });
  });

  describe('parseFileContent', () => {
    it('should parse multiple tasks from file content', () => {
      const content = `# My Tasks

- [ ] First task 📅 2024-01-15
- [x] Second task 📅 2024-01-10
- [ ] Regular task without date
- Third line is not a task

## More tasks
- [ ] Another task 📅 2024-02-01`;

      const results = parser.parseFileContent(content, 'tasks.md');

      expect(results.dated).toHaveLength(3);

      expect(results.dated[0].title).toBe('First task');
      expect(results.dated[0].isDone).toBe(false);
      expect(results.dated[0].location.lineNumber).toBe(3);

      expect(results.dated[1].title).toBe('Second task');
      expect(results.dated[1].isDone).toBe(true);
      expect(results.dated[1].location.lineNumber).toBe(4);

      expect(results.dated[2].title).toBe('Another task');
      expect(results.dated[2].date.toFormat('yyyy-MM-dd')).toBe('2024-02-01');
      expect(results.dated[2].location.lineNumber).toBe(9);
    });

    it('should return empty array for content without tasks', () => {
      const content = `# No Tasks Here

Just some regular content.
No checkboxes or due dates.`;

      const results = parser.parseFileContent(content, 'notes.md');

      expect(results.dated).toHaveLength(0);
    });
  });
});

describe('cleanTaskTitleRobust', () => {
  describe('basic functionality', () => {
    it('should return unchanged title when no task emojis are present', () => {
      expect(cleanTaskTitleRobust('Simple task with no metadata')).toBe(
        'Simple task with no metadata'
      );
      expect(cleanTaskTitleRobust('Task with regular emojis 🚀 ⭐ 🎉')).toBe(
        'Task with regular emojis 🚀 ⭐ 🎉'
      );
    });

    it('should handle empty or whitespace-only strings', () => {
      expect(cleanTaskTitleRobust('')).toBe('');
      expect(cleanTaskTitleRobust('   ')).toBe('');
      expect(cleanTaskTitleRobust('\t\n  ')).toBe('');
    });
  });

  describe('date-related emoji cleaning', () => {
    it('should remove due date emoji and associated date', () => {
      expect(cleanTaskTitleRobust('Complete report 📅 2024-01-15')).toBe('Complete report');
      expect(cleanTaskTitleRobust('Meeting 📅 2024/01/15')).toBe('Meeting');
      expect(cleanTaskTitleRobust('Task 📅 15-01-2024')).toBe('Task');
    });

    it('should remove start date emoji and associated date', () => {
      expect(cleanTaskTitleRobust('Project kickoff 🛫 2024-01-15')).toBe('Project kickoff');
      expect(cleanTaskTitleRobust('Begin work 🛫 2024/01/15')).toBe('Begin work');
    });

    it('should remove scheduled date emoji and associated date', () => {
      expect(cleanTaskTitleRobust('Review meeting ⏳ 2024-01-15')).toBe('Review meeting');
      expect(cleanTaskTitleRobust('Call client ⏳ 2024/01/15')).toBe('Call client');
    });

    it('should remove date created emoji and associated date', () => {
      expect(cleanTaskTitleRobust('New task ➕ 2024-01-15')).toBe('New task');
    });

    it('should remove date emoji even when no valid date follows', () => {
      expect(cleanTaskTitleRobust('Task 📅 invalid-date')).toBe('Task'); // non-date-pattern text gets removed for backward compatibility
      expect(cleanTaskTitleRobust('Task 📅 sometext')).toBe('Task');
      expect(cleanTaskTitleRobust('Task 📅')).toBe('Task');
    });
  });

  describe('completion emoji cleaning', () => {
    it('should remove completion emojis without affecting dates', () => {
      expect(cleanTaskTitleRobust('Finished task ✅')).toBe('Finished task');
      expect(cleanTaskTitleRobust('Cancelled work ❌')).toBe('Cancelled work');
    });

    it('should handle completion emojis with following text', () => {
      expect(cleanTaskTitleRobust('Done task ✅ with notes')).toBe('Done task with notes');
      expect(cleanTaskTitleRobust('Cancelled ❌ due to reasons')).toBe('Cancelled due to reasons');
    });
  });

  describe('mixed emoji scenarios', () => {
    it('should handle multiple different emojis in various orders', () => {
      expect(cleanTaskTitleRobust('Task 📅 2024-01-15 ✅')).toBe('Task');
      expect(cleanTaskTitleRobust('Work ✅ 📅 2024-01-15')).toBe('Work');
      expect(cleanTaskTitleRobust('Project 🛫 2024-01-10 📅 2024-01-15 ✅')).toBe('Project');
    });

    it('should preserve user content between task emojis', () => {
      expect(cleanTaskTitleRobust('Review PR #42 🚀 📅 2024-09-01 ✅')).toBe('Review PR #42 🚀');
      expect(cleanTaskTitleRobust('Meeting with @john #work ⏳ 2024-01-15 📅 2024-01-18')).toBe(
        'Meeting with @john #work'
      );
    });

    it('should handle emojis at the beginning of the title', () => {
      expect(cleanTaskTitleRobust('📅 2024-01-15 Important task')).toBe('Important task');
      expect(cleanTaskTitleRobust('✅ 🛫 2024-01-10 Task completed')).toBe('Task completed');
    });

    it('should handle multiple occurrences of the same emoji', () => {
      expect(cleanTaskTitleRobust('Task 📅 2024-01-15 more text 📅 2024-01-20')).toBe(
        'Task more text'
      );
      expect(cleanTaskTitleRobust('Work ✅ done ✅ really')).toBe('Work done really');
    });
  });

  describe('complex real-world scenarios', () => {
    it('should handle the example from the issue description', () => {
      expect(cleanTaskTitleRobust('Review PR #42 🚀 📅 2025-09-01 ✅')).toBe('Review PR #42 🚀');
    });

    it('should handle tasks with all types of metadata', () => {
      const input =
        'Finalize Q3 report 🛫 2025-08-01 📅 2025-08-15 ⏳ 2025-08-10 ➕ 2025-07-20 ✅ ❌';
      expect(cleanTaskTitleRobust(input)).toBe('Finalize Q3 report');
    });

    it('should preserve links and other markdown syntax', () => {
      expect(cleanTaskTitleRobust('Check [[Important Note]] 📅 2024-01-15')).toBe(
        'Check [[Important Note]]'
      );
      expect(cleanTaskTitleRobust('Review [GitHub PR](https://github.com/repo/pr/1) ✅')).toBe(
        'Review [GitHub PR](https://github.com/repo/pr/1)'
      );
    });

    it('should handle edge cases with special spacing', () => {
      expect(cleanTaskTitleRobust('Task   📅   2024-01-15   ✅   ')).toBe('Task');
      expect(cleanTaskTitleRobust('   📅 2024-01-15 Task with leading spaces')).toBe(
        'Task with leading spaces'
      );
    });

    it('should handle tasks with invalid date formats gracefully', () => {
      expect(cleanTaskTitleRobust('Task 📅 2024-13-40 more content')).toBe(
        'Task 2024-13-40 more content'
      );
      expect(cleanTaskTitleRobust('Task 📅 not-a-date ✅')).toBe('Task'); // not-a-date gets removed for backward compatibility
    });

    it('should preserve invalid date text when removeInvalidDateText is false', () => {
      expect(cleanTaskTitleRobust('Task 📅 not-a-date', TASK_EMOJIS, false)).toBe(
        'Task not-a-date'
      );
      expect(cleanTaskTitleRobust('Task 📅 invalid-date more text', TASK_EMOJIS, false)).toBe(
        'Task invalid-date more text'
      );
    });
  });

  describe('edge cases and robustness', () => {
    it('should handle emojis within words (though unlikely)', () => {
      expect(cleanTaskTitleRobust('prefix📅2024-01-15suffix')).toBe('prefix 2024-01-15suffix'); // Date pattern is preserved
    });

    it('should handle overlapping/adjacent emojis', () => {
      expect(cleanTaskTitleRobust('Task📅2024-01-15✅❌')).toBe('Task');
    });

    it('should maintain proper spacing after cleaning', () => {
      expect(cleanTaskTitleRobust('A 📅 2024-01-15 B ✅ C')).toBe('A B C');
      expect(cleanTaskTitleRobust('Start 🛫 2024-01-10 middle 📅 2024-01-15 end')).toBe(
        'Start middle end'
      );
    });
  });

  describe('tag removal functionality', () => {
    it('should preserve tags when removeTags is false (default)', () => {
      expect(cleanTaskTitleRobust('Review PR #urgent #project', TASK_EMOJIS, true, false)).toBe(
        'Review PR #urgent #project'
      );
      expect(cleanTaskTitleRobust('Meeting with team #work 📅 2024-01-15')).toBe(
        'Meeting with team #work'
      );
    });

    it('should remove tags when removeTags is true', () => {
      expect(cleanTaskTitleRobust('Review PR #urgent #project', TASK_EMOJIS, true, true)).toBe(
        'Review PR'
      );
      expect(cleanTaskTitleRobust('Meeting with team #work', TASK_EMOJIS, true, true)).toBe(
        'Meeting with team'
      );
    });

    it('should remove both task metadata and tags when removeTags is true', () => {
      expect(
        cleanTaskTitleRobust(
          'Complete task #urgent 📅 2024-01-15 ✅ #project',
          TASK_EMOJIS,
          true,
          true
        )
      ).toBe('Complete task');
      expect(
        cleanTaskTitleRobust(
          'Meeting #work 🛫 2024-01-10 📅 2024-01-15 #important',
          TASK_EMOJIS,
          true,
          true
        )
      ).toBe('Meeting');
    });

    it('should handle tags at different positions', () => {
      expect(cleanTaskTitleRobust('#urgent Review PR', TASK_EMOJIS, true, true)).toBe('Review PR');
      expect(cleanTaskTitleRobust('Review #urgent PR', TASK_EMOJIS, true, true)).toBe('Review PR');
      expect(cleanTaskTitleRobust('Review PR #urgent', TASK_EMOJIS, true, true)).toBe('Review PR');
    });

    it('should handle multiple tags', () => {
      expect(
        cleanTaskTitleRobust('#project #urgent Review #important PR #work', TASK_EMOJIS, true, true)
      ).toBe('Review PR');
    });

    it('should preserve other content like @mentions and regular text', () => {
      expect(cleanTaskTitleRobust('Review PR @john #urgent', TASK_EMOJIS, true, true)).toBe(
        'Review PR @john'
      );
      expect(
        cleanTaskTitleRobust('Meeting with @team #work 📅 2024-01-15', TASK_EMOJIS, true, true)
      ).toBe('Meeting with @team');
    });

    it('should handle edge cases with tags', () => {
      expect(cleanTaskTitleRobust('#', TASK_EMOJIS, true, true)).toBe('#'); // Single # should be preserved
      expect(cleanTaskTitleRobust('# Header', TASK_EMOJIS, true, true)).toBe('# Header'); // Markdown header should be preserved
      expect(cleanTaskTitleRobust('Task with #', TASK_EMOJIS, true, true)).toBe('Task with #'); // Trailing # should be preserved
    });
  });
});
