/**
 * @file interop.test.ts
 * @brief Tests for interop module, focusing on timezone-aware event conversion.
 *
 * @description
 * This test suite validates the toEventInput function's handling of:
 * - Recurring events with RRULE and DTSTART timezone specification
 * - Display timezone conversion for rrule events
 * - Correct RRULE string generation with TZID
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { toEventInput } from './interop';
import { OFCEvent } from '../types';
import { FullCalendarSettings, DEFAULT_SETTINGS } from '../types/settings';

jest.mock(
  'obsidian',
  () => ({
    Notice: class {
      constructor() {}
    }
  }),
  { virtual: true }
);

// Mock the view module for category colors
jest.mock('../ui/view', () => ({
  getCalendarColors: (color: string) => ({ color, textColor: '#ffffff' })
}));

describe('interop toEventInput tests', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Budapest'
  };

  describe('Single event conversion', () => {
    it('should convert a simple single event to EventInput', () => {
      const event = {
        type: 'single',
        title: 'Test Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('test-id');
      expect(result!.title).toBe('Test Event');
      expect(result!.allDay).toBe(false);
    });

    it('should handle all-day single events', () => {
      const event = {
        type: 'single',
        title: 'All Day',
        date: '2025-06-15',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.allDay).toBe(true);
    });
  });

  describe('Recurring event RRULE generation', () => {
    it('should generate weekly RRULE with TZID', () => {
      const event = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M', 'W', 'F'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('weekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.rrule).toBeDefined();

      const rrule = result!.rrule as string;
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
      expect(rrule).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should generate monthly by day RRULE', () => {
      const event = {
        type: 'recurring',
        title: 'Monthly Payment',
        startRecur: '2025-01-15',
        startTime: '09:00',
        endTime: '09:30',
        dayOfMonth: 15,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('monthly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
    });

    it('should include EXDATE for skipDates', () => {
      const event = {
        type: 'recurring',
        title: 'With Exceptions',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        skipDates: ['2025-01-13', '2025-01-20'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('exceptions-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('EXDATE;TZID=Europe/Prague:20250113');
      expect(rrule).toContain('EXDATE;TZID=Europe/Prague:20250120');
    });

    it('should handle repeat interval', () => {
      const event = {
        type: 'recurring',
        title: 'Bi-weekly',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        repeatInterval: 2,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('biweekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('INTERVAL=2');
    });
  });

  describe('rrule type event conversion (Google Calendar style)', () => {
    it('should convert rrule event with display timezone', () => {
      const event = {
        type: 'rrule',
        title: 'Football',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('football-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // Should have DTSTART with display timezone
      expect(rrule).toContain('DTSTART;TZID=Europe/Budapest');
    });

    it('should calculate correct duration for timed events', () => {
      const event = {
        type: 'rrule',
        title: 'Long Meeting',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '17:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('long-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.duration).toBeDefined();
      // Duration is returned as ISO time string
      expect(result!.duration).toBe('08:00');
    });

    it('should handle events crossing midnight', () => {
      const event = {
        type: 'rrule',
        title: 'Night Shift',
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        startDate: '2025-01-03',
        startTime: '22:00',
        endTime: '06:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('night-id', event, baseSettings);

      expect(result).not.toBeNull();
      // Duration should be 8 hours
      expect(result!.duration).toBe('08:00');
    });
  });

  describe('Display timezone conversion for rrule events', () => {
    it('should convert rrule event from source to display timezone', () => {
      const event = {
        type: 'rrule',
        title: 'Prague Event',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-06-05',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('prague-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('DTSTART;TZID=Europe/Budapest:20250605T080000');
    });

    it('should adjust time when converting between different offset timezones', () => {
      const event = {
        type: 'rrule',
        title: 'Tokyo Event',
        rrule: 'FREQ=DAILY',
        startDate: '2025-06-15',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('tokyo-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // 8:00 Tokyo (UTC+9) = 1:00 Prague (CEST, UTC+2)
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague:20250615T010000');
    });
  });

  describe('Category and extended properties', () => {
    it('should apply category coloring when enabled', () => {
      const event = {
        type: 'single',
        title: 'Categorized Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'Work',
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        enableAdvancedCategorization: true,
        categorySettings: [{ name: 'Work', color: '#ff0000' }]
      };

      const result = toEventInput('cat-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.color).toBe('#ff0000');
    });

    it('should include extended properties', () => {
      const event = {
        type: 'single',
        title: 'Full Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        uid: 'unique-123',
        category: 'Work',
        subCategory: 'Meeting',
        endDate: null
      } as OFCEvent;

      const result = toEventInput('full-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.extendedProps).toEqual(
        expect.objectContaining({
          uid: 'unique-123',
          category: 'Work',
          subCategory: 'Meeting',
          cleanTitle: 'Full Event',
          isShadow: false
        })
      );
    });
  });
});

describe('DST edge cases in RRULE generation', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Prague'
  };

  it('should maintain local time in RRULE across DST change', () => {
    const event = {
      type: 'recurring',
      title: 'Football Practice',
      startRecur: '2025-10-01',
      endRecur: '2025-11-30',
      startTime: '08:00',
      endTime: '09:30',
      daysOfWeek: ['T', 'R'],
      allDay: false,
      timezone: 'Europe/Prague'
    } as OFCEvent;

    const result = toEventInput('dst-football-id', event, baseSettings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    // DTSTART should specify 08:00 in Prague timezone
    expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
    expect(rrule).toContain('T080000');
  });

  it('should handle US timezone with different DST dates', () => {
    const event = {
      type: 'recurring',
      title: 'US Meeting',
      startRecur: '2025-03-01',
      startTime: '09:00',
      endTime: '10:00',
      daysOfWeek: ['M', 'W', 'F'],
      allDay: false,
      timezone: 'America/New_York'
    } as OFCEvent;

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      displayTimezone: 'America/New_York'
    };

    const result = toEventInput('us-meeting-id', event, settings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    expect(rrule).toContain('TZID=America/New_York');
    expect(rrule).toContain('T090000');
  });
});

/**
 * Critical test suite for rrule-type events with exdate (skipDates) handling.
 *
 * This suite tests the fix for the bug where deleted instances of Google Calendar
 * recurring events were still showing in the UI. The root cause was a mismatch between:
 * - How the monkeypatched rrule expander generates instances (local time in UTC components)
 * - How exdates were being calculated (actual UTC conversion)
 *
 * The fix ensures exdates use "fake UTC" where local time components are stored in UTC,
 * matching the rrule expander's output format.
 */
describe('rrule type events with exdate/skipDates handling', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Budapest'
  };

  describe('exdate format matching rrule expander', () => {
    it('should generate exdates with local time in UTC components (same timezone)', () => {
      const event = {
        type: 'rrule',
        title: 'Weekly Event',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Budapest',
        skipDates: ['2025-11-13', '2025-11-20'],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('exdate-test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toBeDefined();
      expect(result!.exdate).toHaveLength(2);

      // Exdates should have 08:00 in UTC components (fake UTC)
      // NOT the actual UTC conversion (which would be 07:00Z in winter)
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-11-13T08:00:00.000Z');
      expect(exdates[1]).toBe('2025-11-20T08:00:00.000Z');
    });

    it('should handle source timezone different from display timezone', () => {
      // Event created in Prague, but displayed in Budapest (same UTC offset, but different zones)
      const event = {
        type: 'rrule',
        title: 'Football',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-11-13', '2025-11-20', '2025-11-27'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('football-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toHaveLength(3);

      // Both Prague and Budapest are in the same UTC offset, so 08:00 Prague = 08:00 Budapest
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-11-13T08:00:00.000Z');
      expect(exdates[1]).toBe('2025-11-20T08:00:00.000Z');
      expect(exdates[2]).toBe('2025-11-27T08:00:00.000Z');
    });

    it('should correctly adjust exdate time when source and display timezones differ', () => {
      // Event at 08:00 Tokyo (UTC+9), displayed in Prague (UTC+1 in winter)
      // 08:00 Tokyo = 00:00 Prague (same day)
      const event = {
        type: 'rrule',
        title: 'Tokyo Call',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: ['2025-01-13', '2025-01-20'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('tokyo-call-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toHaveLength(2);

      // 08:00 Tokyo = 00:00 Prague (UTC+9 - UTC+1 = 8 hours difference)
      // Exdates should show 00:00 in fake UTC (the Prague local time)
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-01-13T00:00:00.000Z');
      expect(exdates[1]).toBe('2025-01-20T00:00:00.000Z');
    });

    it('should handle US timezone with different DST transition dates', () => {
      // Event at 09:00 New York, displayed in New York
      // March 9, 2025 is when US DST starts (clocks spring forward)
      const event = {
        type: 'rrule',
        title: 'Morning Standup',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
        startDate: '2025-03-03',
        startTime: '09:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'America/New_York',
        skipDates: ['2025-03-07', '2025-03-10', '2025-03-14'], // Around DST transition
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('standup-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toHaveLength(3);

      // All exdates should have 09:00 in fake UTC (the local time stays consistent)
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-03-07T09:00:00.000Z');
      expect(exdates[1]).toBe('2025-03-10T09:00:00.000Z');
      expect(exdates[2]).toBe('2025-03-14T09:00:00.000Z');
    });
  });

  describe('DST transition handling for exdates', () => {
    it('should maintain consistent local time across European DST transition', () => {
      // Europe DST ends on Oct 26, 2025 (clocks go back 1 hour)
      const event = {
        type: 'rrule',
        title: 'Weekly Review',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-10-23', '2025-10-30'], // Before and after DST ends
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('dst-review-id', event, settings);

      expect(result).not.toBeNull();
      const exdates = result!.exdate as string[];

      // Both exdates should be at 10:00 local time (in fake UTC)
      // Even though one is in CEST (UTC+2) and one is in CET (UTC+1)
      expect(exdates[0]).toBe('2025-10-23T10:00:00.000Z');
      expect(exdates[1]).toBe('2025-10-30T10:00:00.000Z');
    });

    it('should handle source in one DST state and skip dates in another', () => {
      // Event starts Oct 2 (CEST, UTC+2), but skip dates are in November (CET, UTC+1)
      const event = {
        type: 'rrule',
        title: 'Training',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-11-06', '2025-11-13', '2025-11-20'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('training-id', event, settings);

      expect(result).not.toBeNull();
      const exdates = result!.exdate as string[];

      // All exdates should be at 08:00 local time
      expect(exdates).toHaveLength(3);
      exdates.forEach(exdate => {
        expect(exdate).toMatch(/T08:00:00\.000Z$/);
      });
    });
  });

  describe('DTSTART and exdate timezone consistency', () => {
    it('should use display timezone in DTSTART', () => {
      const event = {
        type: 'rrule',
        title: 'Test Event',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('tz-test-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // DTSTART should use the display timezone
      expect(rrule).toContain('DTSTART;TZID=America/New_York');
    });

    it('should convert event time from source to display timezone in DTSTART', () => {
      // Event at 10:00 Prague (UTC+1 in winter), displayed in New York (UTC-5 in winter)
      // 10:00 Prague = 04:00 New York
      const event = {
        type: 'rrule',
        title: 'Cross-TZ Event',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-13'],
        endDate: null
      } as unknown as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('cross-tz-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // DTSTART should show 04:00 in New York timezone
      expect(rrule).toContain('DTSTART;TZID=America/New_York:20250106T040000');

      // Exdate should also be at 04:00 (fake UTC, representing New York local time)
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-01-13T04:00:00.000Z');
    });
  });

  describe('edge cases', () => {
    it('should handle empty skipDates array', () => {
      const event = {
        type: 'rrule',
        title: 'No Skips',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('no-skips-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toEqual([]);
    });

    it('should handle event time at midnight', () => {
      const event = {
        type: 'rrule',
        title: 'Midnight Event',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SA',
        startDate: '2025-01-04',
        startTime: '00:00',
        endTime: '01:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-11'],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('midnight-id', event, baseSettings);

      expect(result).not.toBeNull();
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-01-11T00:00:00.000Z');
    });

    it('should handle event time at end of day', () => {
      const event = {
        type: 'rrule',
        title: 'Late Night Event',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=FR',
        startDate: '2025-01-03',
        startTime: '23:30',
        endTime: '00:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-10'],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('late-night-id', event, baseSettings);

      expect(result).not.toBeNull();
      const exdates = result!.exdate as string[];
      expect(exdates[0]).toBe('2025-01-10T23:30:00.000Z');
    });

    it('should handle single skipDate', () => {
      const event = {
        type: 'rrule',
        title: 'One Skip',
        rrule: 'RRULE:FREQ=DAILY',
        startDate: '2025-01-01',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-15'],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('one-skip-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toHaveLength(1);
    });

    it('should handle many skipDates', () => {
      const skipDates = Array.from({ length: 52 }, (_, i) => {
        const date = DateTime.fromISO('2025-01-06').plus({ weeks: i });
        return date.toISODate()!;
      });

      const event = {
        type: 'rrule',
        title: 'Many Skips',
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: skipDates,
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('many-skips-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.exdate).toHaveLength(52);

      // All should be at 09:00 fake UTC
      const exdates = result!.exdate as string[];
      exdates.forEach(exdate => {
        expect(exdate).toMatch(/T09:00:00\.000Z$/);
      });
    });
  });
});
