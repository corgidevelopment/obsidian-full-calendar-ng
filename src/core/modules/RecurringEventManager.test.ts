/**
 * @file RecurringEventManager.test.ts
 * @brief Tests for RecurringEventManager bug fixes
 */

import { OFCEvent } from '../../types';
import { RecurringEventManager } from './RecurringEventManager';
import EventCache from '../EventCache';
import { EditableCalendar } from '../../calendars/EditableCalendar';
import { CalendarInfo } from '../../types';
import { DEFAULT_SETTINGS } from '../../types/settings';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: class {},
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
  }),
  { virtual: true }
);

// Mock dependencies
jest.mock('../EventCache');
jest.mock('../../calendars/EditableCalendar');

describe('RecurringEventManager', () => {
  let manager: RecurringEventManager;
  let mockCache: jest.Mocked<EventCache>;
  let mockCalendar: jest.Mocked<EditableCalendar>;

  beforeEach(() => {
    // Create mock calendar
    mockCalendar = {
      id: 'test-calendar',
      getLocalIdentifier: jest.fn((event: OFCEvent) => event.title)
    } as any;

    // Create mock cache
    mockCache = {
      getEventById: jest.fn(),
      getInfoForEditableEvent: jest.fn(),
      updateEventWithId: jest.fn(),
      deleteEvent: jest.fn(),
      processEvent: jest.fn(),
      addEvent: jest.fn(),
      flushUpdateQueue: jest.fn(),
      getSessionId: jest.fn(),
      store: {
        getEventDetails: jest.fn(),
        getAllEvents: jest.fn()
      } as any,
      calendars: new Map([['test-calendar', mockCalendar]])
    } as any;

    manager = new RecurringEventManager(mockCache);
  });

  describe('toggleRecurringInstance - undoing completed task', () => {
    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Weekly Meeting',
      daysOfWeek: ['M'],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      isTask: true,
      skipDates: ['2023-11-20']
    };

    const originalOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      completed: '2023-11-20T10:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    const modifiedTimingOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '10:00', // Modified from 09:00
      endTime: '11:00', // Modified from 10:00
      completed: '2023-11-20T11:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    it('should delete override when timing is unchanged from original', async () => {
      // Setup: child override has original timing
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: originalOverrideEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should delete the override
      expect(mockCache.deleteEvent).toHaveBeenCalledWith('child-event-id');
      expect(mockCache.updateEventWithId).not.toHaveBeenCalled();
    });

    it('should preserve override and change completion status when timing is modified', async () => {
      // Setup: child override has modified timing
      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedTimingOverrideEvent,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override but change completion status
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when endDate is modified', async () => {
      const modifiedEndDateOverride: OFCEvent = {
        ...originalOverrideEvent,
        endDate: '2023-11-21', // Multi-day event
        completed: '2023-11-20T10:00:00.000Z'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedEndDateOverride,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when allDay status is changed', async () => {
      const modifiedAllDayOverride: OFCEvent = {
        type: 'single',
        title: 'Weekly Meeting',
        date: '2023-11-20',
        endDate: null,
        allDay: true, // Changed from false
        completed: '2023-11-20T10:00:00.000Z',
        recurringEventId: 'Weekly Meeting'
      };

      mockCache.getInfoForEditableEvent.mockReturnValue({
        event: modifiedAllDayOverride,
        calendar: mockCalendar,
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });
  });
});
