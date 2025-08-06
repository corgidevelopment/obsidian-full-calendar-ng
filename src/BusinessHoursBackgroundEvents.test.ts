/**
 * @file BusinessHoursBackgroundEvents.test.ts
 * @brief Tests for Business Hours and Background Events functionality
 */

import { parseEvent } from './types/schema';
import { DEFAULT_SETTINGS } from './types/settings';

describe('Business Hours and Background Events', () => {
  describe('Business Hours Configuration', () => {
    it('should have default business hours settings', () => {
      expect(DEFAULT_SETTINGS.businessHours).toEqual({
        enabled: false,
        daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
        startTime: '09:00',
        endTime: '17:00'
      });
    });

    it('should have background events enabled by default', () => {
      expect(DEFAULT_SETTINGS.enableBackgroundEvents).toBe(true);
    });
  });

  describe('Background Events Schema', () => {
    it('should parse event with display property', () => {
      const eventData = {
        title: 'Focus Time',
        type: 'single',
        date: '2024-01-15',
        allDay: true,
        display: 'background'
      };

      const parsed = parseEvent(eventData);
      expect(parsed.display).toBe('background');
    });

    it('should parse event without display property (default)', () => {
      const eventData = {
        title: 'Regular Meeting',
        type: 'single',
        date: '2024-01-15',
        allDay: false,
        startTime: '10:00',
        endTime: '11:00'
      };

      const parsed = parseEvent(eventData);
      expect(parsed.display).toBeUndefined();
    });

    it('should accept all valid display values', () => {
      const validDisplayValues = [
        'auto',
        'block',
        'list-item',
        'background',
        'inverse-background',
        'none'
      ];

      validDisplayValues.forEach(display => {
        const eventData = {
          title: `Test Event - ${display}`,
          type: 'single',
          date: '2024-01-15',
          allDay: true,
          display
        };

        const parsed = parseEvent(eventData);
        expect(parsed.display).toBe(display);
      });
    });
  });

  describe('Business Hours Settings Validation', () => {
    it('should validate time format in business hours', () => {
      const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

      // Valid times
      expect(timePattern.test('09:00')).toBe(true);
      expect(timePattern.test('17:30')).toBe(true);
      expect(timePattern.test('00:00')).toBe(true);
      expect(timePattern.test('23:59')).toBe(true);
      expect(timePattern.test('9:00')).toBe(true); // Single digit hour is valid
      expect(timePattern.test('5:30')).toBe(true); // Single digit hour is valid

      // Invalid times
      expect(timePattern.test('25:00')).toBe(false);
      expect(timePattern.test('12:60')).toBe(false);
      expect(timePattern.test('abc:00')).toBe(false);
    });

    it('should validate days of week in business hours', () => {
      const validDaysOfWeek = [
        [1, 2, 3, 4, 5], // Monday to Friday
        [0, 1, 2, 3, 4, 5, 6], // Every day
        [1, 2, 3, 4], // Monday to Thursday
        [2, 3, 4, 5, 6] // Tuesday to Saturday
      ];

      validDaysOfWeek.forEach(days => {
        days.forEach(day => {
          expect(day).toBeGreaterThanOrEqual(0);
          expect(day).toBeLessThanOrEqual(6);
        });
      });
    });
  });
});
