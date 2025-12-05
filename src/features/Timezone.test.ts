/**
 * @file Timezone.test.ts
 * @brief Comprehensive tests for timezone and DST (Daylight Saving Time) handling.
 *
 * @description
 * This test suite validates the correct behavior of timezone conversions across:
 * - Single events with timezone conversion
 * - Events spanning DST transitions
 * - All-day events (should remain timezone-agnostic)
 * - Cross-day events that may change dates when converted
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { convertEvent } from './Timezone';
import { OFCEvent } from '../types';

jest.mock(
  'obsidian',
  () => ({
    Notice: class {
      constructor() {}
    }
  }),
  { virtual: true }
);

// Mock i18n
jest.mock('./i18n/i18n', () => ({
  t: (key: string) => key
}));

// Type for single timed events (used for test assertions)
interface SingleTimedEvent {
  type: 'single';
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: false;
  endDate: string | null;
}

// Helper to create single timed events for testing
const singleEvent = (props: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endDate?: string | null;
}): SingleTimedEvent =>
  ({
    type: 'single',
    allDay: false,
    endDate: props.endDate ?? null,
    ...props
  }) as SingleTimedEvent;

// Type-safe convert for single timed events
const convertSingleEvent = (
  event: SingleTimedEvent,
  sourceTimezone: string,
  targetTimezone: string
): SingleTimedEvent =>
  convertEvent(event as OFCEvent, sourceTimezone, targetTimezone) as SingleTimedEvent;

describe('Timezone conversion tests', () => {
  describe('convertEvent for single events', () => {
    it('should convert event from Europe/Prague to Europe/Budapest (same offset)', () => {
      const event = singleEvent({
        title: 'Test Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

      const result = convertSingleEvent(event, 'Europe/Prague', 'Europe/Budapest');

      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('10:00');
      expect(result.endTime).toBe('11:00');
    });

    it('should convert event from UTC to Europe/Prague (UTC+2 in summer)', () => {
      const event = singleEvent({
        title: 'UTC Event',
        date: '2025-06-15',
        startTime: '08:00',
        endTime: '09:00'
      });

      const result = convertSingleEvent(event, 'UTC', 'Europe/Prague');

      // 8:00 UTC = 10:00 Prague (CEST, UTC+2)
      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('10:00');
      expect(result.endTime).toBe('11:00');
    });

    it('should convert event from Europe/Prague to UTC', () => {
      const event = singleEvent({
        title: 'Prague Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

      const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

      // 10:00 Prague (CEST, UTC+2) = 8:00 UTC
      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('08:00');
      expect(result.endTime).toBe('09:00');
    });

    it('should handle cross-day conversion when going west', () => {
      const event = singleEvent({
        title: 'Late Night Event',
        date: '2025-06-15',
        startTime: '01:00',
        endTime: '02:00'
      });

      const result = convertSingleEvent(event, 'Europe/Prague', 'America/New_York');

      // 1:00 Prague (CEST, UTC+2) = 19:00 previous day NY (EDT, UTC-4)
      expect(result.date).toBe('2025-06-14');
      expect(result.startTime).toBe('19:00');
      expect(result.endTime).toBe('20:00');
    });

    it('should handle cross-day conversion when going east', () => {
      const event = singleEvent({
        title: 'Evening Event',
        date: '2025-06-15',
        startTime: '22:00',
        endTime: '23:00'
      });

      const result = convertSingleEvent(event, 'America/New_York', 'Asia/Tokyo');

      // 22:00 NY (EDT, UTC-4) = 11:00 next day Tokyo (JST, UTC+9)
      expect(result.date).toBe('2025-06-16');
      expect(result.startTime).toBe('11:00');
      expect(result.endTime).toBe('12:00');
    });

    it('should not modify all-day events', () => {
      const event = {
        type: 'single',
        title: 'All Day Event',
        date: '2025-06-15',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const result = convertEvent(event, 'America/Los_Angeles', 'Asia/Tokyo');

      expect((result as { date: string }).date).toBe('2025-06-15');
    });

    it('should not modify recurring events (handled in interop)', () => {
      const event = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2025-01-01',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M', 'W', 'F'],
        allDay: false
      } as OFCEvent;

      const result = convertEvent(event, 'Europe/Prague', 'America/New_York');

      // Recurring events should be returned unchanged
      expect(result).toEqual(event);
    });
  });

  describe('DST transition handling', () => {
    describe('Spring forward (March 30, 2025)', () => {
      it('should correctly convert event before DST starts', () => {
        const event = singleEvent({
          title: 'Before Spring Forward',
          date: '2025-03-29',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // Prague is CET (UTC+1) before DST
        expect(result.date).toBe('2025-03-29');
        expect(result.startTime).toBe('09:00');
        expect(result.endTime).toBe('10:00');
      });

      it('should correctly convert event after DST starts', () => {
        const event = singleEvent({
          title: 'After Spring Forward',
          date: '2025-03-30',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // Prague is CEST (UTC+2) after DST starts
        expect(result.date).toBe('2025-03-30');
        expect(result.startTime).toBe('08:00');
        expect(result.endTime).toBe('09:00');
      });

      it('should handle event spanning DST transition', () => {
        const event = singleEvent({
          title: 'Spanning DST',
          date: '2025-03-30',
          startTime: '01:00',
          endTime: '04:00'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // 1:00 CET = 0:00 UTC, 4:00 CEST = 2:00 UTC
        expect(result.date).toBe('2025-03-30');
        expect(result.startTime).toBe('00:00');
        expect(result.endTime).toBe('02:00');
      });
    });

    describe('Fall back (October 26, 2025)', () => {
      it('should correctly convert event before DST ends', () => {
        const event = singleEvent({
          title: 'Before Fall Back',
          date: '2025-10-25',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // Prague is CEST (UTC+2) before DST ends
        expect(result.date).toBe('2025-10-25');
        expect(result.startTime).toBe('08:00');
        expect(result.endTime).toBe('09:00');
      });

      it('should correctly convert event after DST ends', () => {
        const event = singleEvent({
          title: 'After Fall Back',
          date: '2025-10-26',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // Prague is CET (UTC+1) after DST ends
        expect(result.date).toBe('2025-10-26');
        expect(result.startTime).toBe('09:00');
        expect(result.endTime).toBe('10:00');
      });

      it('should handle morning event on DST transition day', () => {
        const event = singleEvent({
          title: 'Morning After Fall Back',
          date: '2025-10-26',
          startTime: '08:00',
          endTime: '09:30'
        });

        const result = convertSingleEvent(event, 'Europe/Prague', 'UTC');

        // 8:00 CET = 7:00 UTC
        expect(result.date).toBe('2025-10-26');
        expect(result.startTime).toBe('07:00');
        expect(result.endTime).toBe('08:30');
      });
    });

    describe('US DST transitions', () => {
      it('should correctly handle US spring forward', () => {
        const event = singleEvent({
          title: 'US Spring Forward',
          date: '2025-03-09',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'America/New_York', 'UTC');

        // After spring forward: EDT (UTC-4)
        expect(result.date).toBe('2025-03-09');
        expect(result.startTime).toBe('14:00');
        expect(result.endTime).toBe('15:00');
      });

      it('should correctly handle US fall back', () => {
        const event = singleEvent({
          title: 'US Fall Back',
          date: '2025-11-02',
          startTime: '10:00',
          endTime: '11:00'
        });

        const result = convertSingleEvent(event, 'America/New_York', 'UTC');

        // After fall back: EST (UTC-5)
        expect(result.date).toBe('2025-11-02');
        expect(result.startTime).toBe('15:00');
        expect(result.endTime).toBe('16:00');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle midnight events', () => {
      const event = singleEvent({
        title: 'Midnight Event',
        date: '2025-06-15',
        startTime: '00:00',
        endTime: '01:00'
      });

      const result = convertSingleEvent(event, 'UTC', 'Europe/Prague');

      // 00:00 UTC = 02:00 Prague (CEST)
      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('02:00');
      expect(result.endTime).toBe('03:00');
    });

    it('should handle end of day events that cross to next day', () => {
      const event = singleEvent({
        title: 'Late Night',
        date: '2025-06-15',
        startTime: '23:00',
        endTime: '23:30'
      });

      const result = convertSingleEvent(event, 'UTC', 'Asia/Tokyo');

      // 23:00 UTC = 08:00 next day Tokyo (JST, UTC+9)
      expect(result.date).toBe('2025-06-16');
      expect(result.startTime).toBe('08:00');
      expect(result.endTime).toBe('08:30');
    });

    it('should handle Pacific timezone (far west)', () => {
      const event = singleEvent({
        title: 'Pacific Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

      const result = convertSingleEvent(event, 'America/Los_Angeles', 'UTC');

      // LA is PDT (UTC-7) in summer
      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('17:00');
      expect(result.endTime).toBe('18:00');
    });

    it('should handle Japan timezone (no DST)', () => {
      const event = singleEvent({
        title: 'Tokyo Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

      const result = convertSingleEvent(event, 'Asia/Tokyo', 'UTC');

      // Tokyo is always JST (UTC+9)
      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('01:00');
      expect(result.endTime).toBe('02:00');
    });

    it('should handle same source and target timezone', () => {
      const event = singleEvent({
        title: 'Same Zone',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00'
      });

      const result = convertSingleEvent(event, 'Europe/Prague', 'Europe/Prague');

      expect(result.date).toBe('2025-06-15');
      expect(result.startTime).toBe('10:00');
      expect(result.endTime).toBe('11:00');
    });
  });
});

describe('Luxon DST handling verification', () => {
  it('should correctly identify DST status for European timezone', () => {
    const summer = DateTime.fromISO('2025-06-15T12:00:00', { zone: 'Europe/Prague' });
    const winter = DateTime.fromISO('2025-12-15T12:00:00', { zone: 'Europe/Prague' });

    expect(summer.isInDST).toBe(true);
    expect(winter.isInDST).toBe(false);
  });

  it('should correctly calculate offset changes at DST boundaries', () => {
    // Before spring forward (CET, UTC+1)
    const beforeSpring = DateTime.fromISO('2025-03-30T01:00:00', { zone: 'Europe/Prague' });
    // After spring forward (CEST, UTC+2)
    const afterSpring = DateTime.fromISO('2025-03-30T04:00:00', { zone: 'Europe/Prague' });

    expect(beforeSpring.offset).toBe(60); // UTC+1 = 60 minutes
    expect(afterSpring.offset).toBe(120); // UTC+2 = 120 minutes
  });

  it('should correctly handle setZone for timezone conversion', () => {
    const prague = DateTime.fromISO('2025-06-15T10:00:00', { zone: 'Europe/Prague' });
    const tokyo = prague.setZone('Asia/Tokyo');
    const newYork = prague.setZone('America/New_York');

    // Prague 10:00 CEST (UTC+2) = UTC 08:00
    // Tokyo = UTC+9, so 17:00
    // New York = EDT (UTC-4), so 04:00
    expect(tokyo.hour).toBe(17);
    expect(newYork.hour).toBe(4);
  });
});
