/**
 * @file RecurringEventManager.test.ts
 * @brief Tests for RecurringEventManager bug fixes
 */

import { OFCEvent } from '../../types';
import { RecurringEventManager } from './RecurringEventManager';
import EventCache from '../../core/EventCache';
import { CalendarProvider } from '../../providers/Provider';
import { DEFAULT_SETTINGS } from '../../types/settings';
import FullCalendarPlugin from '../../main';

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
jest.mock('../../core/EventCache');

describe('RecurringEventManager', () => {
  let manager: RecurringEventManager;
  let mockCache: jest.Mocked<EventCache>;
  let mockProvider: jest.Mocked<CalendarProvider<unknown>>;

  const mockPlugin = {
    app: {},
    settings: DEFAULT_SETTINGS,
    providerRegistry: {
      getSource: jest.fn(),
      getInstance: jest.fn()
    }
  } as unknown as FullCalendarPlugin;

  beforeEach(() => {
    (mockPlugin.providerRegistry.getSource as jest.Mock).mockClear();
    (mockPlugin.providerRegistry.getInstance as jest.Mock)?.mockClear();

    // Create mock calendar
    mockProvider = {
      type: 'test',
      displayName: 'Test Provider',
      getEventHandle: jest.fn((event: OFCEvent) => ({ persistentId: event.title }))
    } as unknown as jest.Mocked<CalendarProvider<unknown>>;

    // Create mock cache
    mockCache = {
      getEventById: jest.fn(),
      updateEventWithId: jest.fn(),
      deleteEvent: jest.fn(),
      processEvent: jest.fn(),
      addEvent: jest.fn(),
      flushUpdateQueue: jest.fn(),
      getSessionId: jest.fn(),
      getGlobalIdentifier: jest.fn(
        (event: OFCEvent, calendarId: string) => `${calendarId}::${event.title}`
      ),
      store: {
        getEventDetails: jest.fn(),
        getAllEvents: jest.fn().mockReturnValue([])
      },
      calendars: new Map([['test-calendar', mockProvider as CalendarProvider<unknown>]]),
      plugin: mockPlugin
    } as unknown as jest.Mocked<EventCache>;

    manager = new RecurringEventManager(mockCache, mockPlugin);
  });

  describe('toggleRecurringInstance - undoing completed task', () => {
    beforeEach(() => {
      // Mock the provider registry to return our test provider and config
      (mockPlugin.providerRegistry.getSource as jest.Mock).mockReturnValue({
        type: 'test',
        config: { directory: 'events' }
      });
      // The getProviderAndConfig helper now uses getInstance, so we mock that.
      (mockPlugin.providerRegistry.getInstance as jest.Mock).mockReturnValue(mockProvider);
    });

    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Weekly Meeting',
      daysOfWeek: ['M'],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      isTask: true,
      skipDates: ['2023-11-20'],
      endDate: null
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
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: originalOverrideEvent,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should delete the override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).toHaveBeenCalledWith('child-event-id');
      expect(safeMockCache.updateEventWithId).not.toHaveBeenCalled();
    });

    it('should preserve override and change completion status when timing is modified', async () => {
      // Setup: child override has modified timing
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedTimingOverrideEvent,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override but change completion status
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
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

      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedEndDateOverride,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
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

      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedAllDayOverride,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });
  });
});
