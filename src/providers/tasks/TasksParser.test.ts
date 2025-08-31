/**
 * @file TasksParser.test.ts
 * @brief Unit tests for TasksParser functionality.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { TasksParser } from './TasksParser';

describe('TasksParser', () => {
  let parser: TasksParser;

  beforeEach(() => {
    parser = new TasksParser();
  });

  describe('parseLine', () => {
    it('should parse a simple task with due date', () => {
      const line = '- [ ] Complete the report 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Complete the report');
      expect(result!.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
      expect(result!.isDone).toBe(false);
      expect(result!.location.path).toBe('test.md');
      expect(result!.location.lineNumber).toBe(1);
    });

    it('should parse a completed task', () => {
      const line = '- [x] Buy groceries 📅 2024-01-10';
      const result = parser.parseLine(line, 'test.md', 5);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Buy groceries');
      expect(result!.isDone).toBe(true);
      expect(result!.location.lineNumber).toBe(5);
    });

    it('should return null for non-checklist items', () => {
      const line = 'Just a regular line of text 📅 2024-01-15';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).toBeNull();
    });

    it('should return null for tasks without due dates', () => {
      const line = '- [ ] Task without date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).toBeNull();
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
        expect(result).not.toBeNull();
        expect(result!.title).toBe(`Task ${index + 1}`);
        // All should parse to the same date (January 15, 2024)
        expect(result!.date.month).toBe(1);
        expect(result!.date.day).toBe(15);
        expect(result!.date.year).toBe(2024);
      });
    });

    it('should return null for invalid dates', () => {
      const line = '- [ ] Task with bad date 📅 invalid-date';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).toBeNull();
    });

    it('should handle tasks with extra content after date', () => {
      const line = '- [ ] Meeting 📅 2024-01-15 #important @john';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Meeting');
      expect(result!.date.toFormat('yyyy-MM-dd')).toBe('2024-01-15');
    });

    it('should clean task titles by removing emoji', () => {
      const line = '- [ ] Important task ⭐ 📅 2024-01-15 🔥';
      const result = parser.parseLine(line, 'test.md', 1);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Important task ⭐');
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

      expect(results).toHaveLength(3);

      expect(results[0].title).toBe('First task');
      expect(results[0].isDone).toBe(false);
      expect(results[0].location.lineNumber).toBe(3);

      expect(results[1].title).toBe('Second task');
      expect(results[1].isDone).toBe(true);
      expect(results[1].location.lineNumber).toBe(4);

      expect(results[2].title).toBe('Another task');
      expect(results[2].date.toFormat('yyyy-MM-dd')).toBe('2024-02-01');
      expect(results[2].location.lineNumber).toBe(9);
    });

    it('should return empty array for content without tasks', () => {
      const content = `# No Tasks Here

Just some regular content.
No checkboxes or due dates.`;

      const results = parser.parseFileContent(content, 'notes.md');

      expect(results).toHaveLength(0);
    });
  });
});
