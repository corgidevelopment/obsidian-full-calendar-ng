// src/core/EventCache.test.ts

import { TFile } from 'obsidian';

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

import FullCalendarPlugin from '../main';
import { EventPathLocation, StoredEvent } from './EventStore';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import { CalendarProvider, CalendarProviderCapabilities } from '../providers/Provider';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../types/settings';
import EventCache, { CacheEntry, OFCEventSource, CachedEvent } from './EventCache';
import { EventHandle } from '../providers/typesProvider';

jest.mock('../types/schema', () => ({
  validateEvent: (e: any) => e
}));

const withCounter = <T>(f: (x: string) => T, label?: string) => {
  const counter = () => {
    let count = 0;
    return () => (label || '') + count++;
  };
  const c = counter();
  return () => f(c());
};

const mockEvent = withCounter((title): OFCEvent => ({ title }) as OFCEvent, 'event');

// Replace the entire TestReadonlyCalendar class with this function:
const makeCache = (events: OFCEvent[]) => {
  const mockProvider: CalendarProvider<any> = {
    type: 'FOR_TEST_ONLY',
    displayName: 'Test Provider',
    isRemote: false,
    getEvents: async () => events.map(e => [e, null] as [OFCEvent, null]),
    getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
    getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    createInstanceOverride: jest.fn(),
    getConfigurationComponent: jest.fn()
  };

  const calendarInfo: CalendarInfo = {
    type: 'FOR_TEST_ONLY',
    color: '#000000',
    id: 'test',
    config: {}
  };

  // Update mockPlugin to include getAllSources and required registry mocks
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, calendarSources: [calendarInfo] },
    providerRegistry: {
      getProvider: () => mockProvider,
      fetchAllEvents: async () =>
        events.map(e => ({
          calendarId: 'test',
          event: e,
          location: null
        })),
      getAllSources: () => [calendarInfo],
      getInstance: () => mockProvider,
      // Added mocks for registry
      generateId: withCounter(x => x, 'test-id'),
      buildMap: jest.fn(),
      addMapping: jest.fn(),
      removeMapping: jest.fn(),
      getSource: () => calendarInfo,
      getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }) // Added
    }
  } as any;

  const cache = new EventCache(mockPlugin);
  return cache;
};

const extractEvents = (source: OFCEventSource): OFCEvent[] =>
  source.events.map(({ event }: CachedEvent) => event);
async function assertFailed(func: () => Promise<any>, message: RegExp) {
  try {
    await func();
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(message);
    return;
  }
  expect(false).toBeTruthy();
}

describe('event cache with readonly calendar', () => {
  it('populates multiple events', async () => {
    const event1 = mockEvent();
    const event2 = mockEvent();
    const event3 = mockEvent();
    const cache = makeCache([event1, event2, event3]);

    await cache.populate();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([event1, event2, event3]);
    expect(sources[0].color).toEqual('#000000');
    expect(sources[0].editable).toBeFalsy();
  });

  it('properly sorts events into separate calendars', async () => {
    const events1 = [mockEvent()];
    const events2 = [mockEvent(), mockEvent()];

    const mockProvider: CalendarProvider<any> = {
      type: 'FOR_TEST_ONLY',
      displayName: 'Test Provider',
      isRemote: false,
      getEvents: async () => events1.map(e => [e, null]),
      getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
      getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      createInstanceOverride: jest.fn(),
      getConfigurationComponent: jest.fn()
    };

    const calendarSources = [
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal1',
        color: 'red',
        config: { id: 'cal1' }
      },
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal2',
        color: 'blue',
        config: { id: 'cal2' }
      }
    ];
    // Update mockPlugin to include getAllSources and fetchAllEvents
    const mockPlugin = {
      settings: { ...DEFAULT_SETTINGS, calendarSources },
      providerRegistry: {
        getProvider: () => mockProvider,
        getAllSources: () => calendarSources,
        fetchAllEvents: async () => [
          ...events1.map(e => ({ calendarId: 'cal1', event: e, location: null })),
          ...events2.map(e => ({ calendarId: 'cal2', event: e, location: null }))
        ],
        getSource: (id: string) => calendarSources.find(source => source.id === id),
        getInstance: () => mockProvider,
        generateId: withCounter(x => x, 'test-id'),
        buildMap: jest.fn(),
        addMapping: jest.fn(),
        removeMapping: jest.fn()
      }
    } as any;
    const cache = new EventCache(mockPlugin);

    await cache.populate();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(2);
    expect(extractEvents(sources[0])).toEqual(events1);
    expect(sources[0].color).toEqual('red');
    expect(sources[0].editable).toBeFalsy();
    expect(extractEvents(sources[1])).toEqual(events2);
    expect(sources[1].color).toEqual('blue');
    expect(sources[1].editable).toBeFalsy();
  });

  it.each([
    [
      'addEvent',
      async (cache: EventCache, id: string) => {
        const result = await cache.addEvent('test', mockEvent());
        expect(result).toBe(false);
      },
      /read-only/i // Placeholder, not used for this specific test case
    ],
    [
      'deleteEvent',
      async (cache: EventCache, id: string) => await cache.deleteEvent(id),
      /does not support deleting/i
    ],
    [
      'modifyEvent',
      async (cache: EventCache, id: string) => await cache.updateEventWithId(id, mockEvent()),
      /does not support editing/i
    ]
  ])('does not allow editing via %p', async (name, f, message) => {
    const event = mockEvent();
    const cache = makeCache([event]);
    await cache.populate();

    const sources = cache.getAllEvents();
    const eventId = sources[0].events[0].id;

    if (name === 'addEvent') {
      await f(cache, eventId); // This test case has its own `expect`
    } else {
      await assertFailed(async () => await f(cache, eventId), message);
    }
  });

  it('populates a single event', async () => {
    const event = mockEvent();
    const cache = makeCache([event]);

    expect(cache.initialized).toBeFalsy();
    await cache.populate();
    expect(cache.initialized).toBeTruthy();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([event]);
    expect(sources[0].color).toEqual('#000000');
    expect(sources[0].editable).toBeFalsy();
  });
});

type EditableEventResponse = [OFCEvent, EventLocation | null];

// Replace the entire TestEditable class with this function:
const makeEditableCache = (events: EditableEventResponse[]) => {
  const calendar: jest.Mocked<CalendarProvider<any>> = {
    type: 'FOR_TEST_ONLY',
    displayName: 'Editable Test Provider',
    isRemote: false,
    getEvents: jest.fn(async () => events),
    getEventsInFile: jest.fn(async () => []),
    getCapabilities: jest.fn(() => ({
      canCreate: true,
      canEdit: true,
      canDelete: true
    })),
    getEventHandle: jest.fn((e: OFCEvent) => ({ persistentId: e.title })),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    createInstanceOverride: jest.fn(),
    getConfigurationComponent: jest.fn()
  };

  const calendarInfo: CalendarInfo = {
    type: 'FOR_TEST_ONLY',
    id: 'test',
    config: { id: 'test' },
    color: 'black'
  };
  // Update mockPlugin to include getAllSources and required registry mocks
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, calendarSources: [calendarInfo] },
    providerRegistry: {
      getProvider: () => calendar,
      fetchAllEvents: async () =>
        events.map(([event, location]) => ({
          calendarId: 'test',
          event,
          location
        })),
      getAllSources: () => [calendarInfo],
      getInstance: () => calendar,
      generateId: withCounter(x => x, 'test-id'),
      buildMap: jest.fn(),
      addMapping: jest.fn(),
      removeMapping: jest.fn(),
      createEventInProvider: jest.fn(async (id, event) => calendar.createEvent(event)),
      // UPDATED MOCK: delegate to provider's updateEvent
      updateEventInProvider: jest.fn(async (sessionId, calendarId, oldEventData, newEventData) =>
        calendar.updateEvent(calendar.getEventHandle(oldEventData)!, oldEventData, newEventData)
      ),
      deleteEventInProvider: jest.fn(),
      getSource: () => calendarInfo,
      getCapabilities: () => ({ canCreate: true, canEdit: true, canDelete: true }) // Added
    }
  } as any;
  const cache = new EventCache(mockPlugin);

  // Ensure createEvent returns [event, location] as expected by addEvent
  calendar.createEvent.mockImplementation(async (event: OFCEvent) => [event, mockLocation()]);

  return [cache, calendar, mockPlugin] as const;
};

const mockFile = withCounter(path => ({ path }) as TFile, 'file');
const mockLocation = (withLine = false): EventLocation => ({
  file: mockFile(),
  lineNumber: withLine ? Math.floor(Math.random() * 100) : undefined
});

const mockEventResponse = (): EditableEventResponse => [mockEvent(), mockLocation()];

const assertCacheContentCounts = (
  cache: EventCache,
  { calendars, files, events }: { calendars: number; files: number; events: number }
) => {
  expect(cache.getAllEvents().length).toBe(calendars);
  expect(cache.store.fileCount).toBe(files);
  expect(cache.store.eventCount).toBe(events);
};

describe('editable calendars', () => {
  it('populates a single event', async () => {
    const e1 = mockEventResponse();
    const [cache, calendar] = makeEditableCache([e1]);

    await cache.populate();

    const sources = cache.getAllEvents();

    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([e1[0]]);
    expect(sources[0].color).toEqual('black');
    expect(sources[0].editable).toBeTruthy();
  });

  describe('add events', () => {
    it('empty cache', async () => {
      const [cache, calendar] = makeEditableCache([]);

      await cache.populate();

      const event = mockEvent();
      const loc = mockLocation();
      calendar.createEvent.mockResolvedValue([event, loc]);
      expect(await cache.addEvent('test', event)).toBeTruthy();
      expect(calendar.createEvent).toHaveBeenCalledTimes(1);
      expect(calendar.createEvent).toHaveBeenCalledWith(expect.objectContaining(event));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });

    it('in the same file', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const event2 = mockEvent();
      const loc = { file: event[1]!.file, lineNumber: 102 };
      calendar.createEvent.mockResolvedValue([event2, loc]);
      expect(await cache.addEvent('test', event2)).toBeTruthy();
      expect(calendar.createEvent).toHaveBeenCalledTimes(1);
      expect(calendar.createEvent).toHaveBeenCalledWith(expect.objectContaining(event2));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 2
      });
    });

    it('in a different file', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const event2 = mockEvent();
      const loc = mockLocation();

      calendar.createEvent.mockResolvedValue([event2, loc]);
      expect(await cache.addEvent('test', event2)).toBeTruthy();
      expect(calendar.createEvent).toHaveBeenCalledTimes(1);
      expect(calendar.createEvent).toHaveBeenCalledWith(expect.objectContaining(event2));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 2,
        events: 2
      });
    });

    it('adding many events', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const mockAndResolve = (): Promise<EditableEventResponse> =>
        Promise.resolve([mockEvent(), mockLocation()]);
      calendar.createEvent
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve());

      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();
      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();
      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();

      expect(calendar.createEvent).toHaveBeenCalledTimes(3);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 4,
        events: 4
      });
    });
  });

  describe('delete events', () => {
    it('delete one', async () => {
      const event = mockEventResponse();
      const [cache, calendar, mockPlugin] = makeEditableCache([event]);

      await cache.populate();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      const sources = cache.getAllEvents();
      expect(sources.length).toBe(1);
      const id = sources[0].events[0].id;

      await cache.deleteEvent(id);

      // Updated assertion to registry mock
      expect(mockPlugin.providerRegistry.deleteEventInProvider).toHaveBeenCalledTimes(1);
      expect(mockPlugin.providerRegistry.deleteEventInProvider).toHaveBeenCalledWith(
        id,
        event[0],
        'test'
      );

      assertCacheContentCounts(cache, {
        calendars: 1, // Calendar source still exists
        files: 0,
        events: 0
      });
    });

    it('delete non-existing event', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      await assertFailed(() => cache.deleteEvent('unknown ID'), /not found for deletion/);

      expect(calendar.deleteEvent).not.toHaveBeenCalled();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });
  });

  describe('modify event', () => {
    const oldEvent = mockEventResponse();
    const newLoc = mockLocation();
    const newEvent = mockEvent();

    it.each([
      [
        'calendar moves event to a new file',
        newLoc,
        [
          { file: oldEvent[1]!.file, numEvents: 0 },
          { file: newLoc.file, numEvents: 1 }
        ],
        1 // The old file is gone, so the total count is now 1.
      ],
      [
        'calendar keeps event in the same file, but moves it around',
        { file: oldEvent[1]!.file, lineNumber: newLoc.lineNumber },
        [{ file: oldEvent[1]!.file, numEvents: 1 }],
        1 // The file count never changes.
      ]
    ])('%p', async (_, newLocation, fileDetails, expectedFileCount) => {
      const [cache, calendar, mockPlugin] = makeEditableCache([oldEvent]);
      await cache.populate();

      assertCacheContentCounts(cache, { calendars: 1, files: 1, events: 1 });

      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;

      calendar.updateEvent.mockResolvedValue(newLocation);

      await cache.updateEventWithId(id, newEvent);

      // Updated assertion to registry mock
      const { updateEventInProvider } = mockPlugin.providerRegistry;
      expect(updateEventInProvider).toHaveBeenCalledTimes(1);
      expect(updateEventInProvider).toHaveBeenCalledWith(
        id,
        'test',
        expect.objectContaining(oldEvent[0]), // Corrected line
        expect.objectContaining(newEvent)
      );

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: expectedFileCount,
        events: 1
      });

      expect(cache.store.getEventById(id)).toEqual(newEvent);

      for (const { file, numEvents } of fileDetails) {
        const eventsInFile = cache.store.getEventsInFile(file);
        expect(eventsInFile).toHaveLength(numEvents);
      }
    });

    it('modify non-existing event', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);
      await cache.populate();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      await assertFailed(
        () => cache.updateEventWithId('unknown ID', mockEvent()),
        /not present in event store/
      );

      const sources = cache.getAllEvents();
      expect(sources.length).toBe(1);
      const id = sources[0].events[0].id;

      expect(calendar.updateEvent).not.toHaveBeenCalled();
      expect(cache.store.getEventById(id)).toEqual(event[0]);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });
  });

  describe('filesystem update callback', () => {
    const callbackMock = jest.fn();
    const oldEvent = mockEventResponse();
    const newEvent = mockEventResponse();
    let cache: EventCache;
    let calendar: jest.Mocked<CalendarProvider<any>>;

    beforeEach(async () => {
      [cache, calendar] = makeEditableCache([oldEvent]);
      await cache.populate();
      callbackMock.mockClear();
      cache.on('update', callbackMock);
    });

    it.each([
      {
        test: 'New event in a new file',
        eventsInFile: [newEvent],
        file: newEvent[1]!.file,
        counts: { files: 2, events: 2 },
        callback: { toRemoveLength: 0, eventsToAddLength: 1 }
      },
      {
        test: 'Changing events in an existing location',
        eventsInFile: [[newEvent[0], oldEvent[1]] as EditableEventResponse],
        file: oldEvent[1]!.file,
        counts: { files: 1, events: 1 },
        callback: { toRemoveLength: 1, eventsToAddLength: 1 }
      },
      {
        test: 'No callback fired if event does not change.',
        eventsInFile: [oldEvent],
        file: oldEvent[1]!.file,
        counts: { files: 1, events: 1 },
        callback: null
      }
    ])('$test', async ({ eventsInFile, file, counts: { files, events }, callback }) => {
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      if (calendar.getEventsInFile) {
        // Type guard
        (calendar.getEventsInFile as jest.Mock).mockResolvedValue(eventsInFile);
      }

      // Simulate ProviderRegistry fetching events and calling syncFile
      const newEventsForSync = eventsInFile.map(([event, location]) => ({
        event,
        location,
        calendarId: 'test'
      }));
      await cache.syncFile(file as TFile, newEventsForSync);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files,
        events
      });

      if (callback) {
        expect(callbackMock).toHaveBeenCalled();
        const { toRemoveLength, eventsToAddLength } = callback;
        const callbackInvocation: {
          toRemove: string[];
          toAdd: CacheEntry[];
        } = callbackMock.mock.calls[0][0];

        expect(callbackInvocation.toAdd).toBeDefined();
        expect(callbackInvocation.toRemove).toBeDefined();

        expect(callbackInvocation.toRemove.length).toBe(toRemoveLength);
        expect(callbackInvocation.toAdd.length).toBe(eventsToAddLength);
        if (eventsToAddLength > 0) {
          expect(callbackInvocation.toAdd[0].event).toEqual(eventsInFile[0][0]);
        }
      } else {
        expect(callbackMock).not.toHaveBeenCalled();
      }
    });
    it.todo('updates when events are the same but locations are different');
  });

  describe('make sure cache is populated before doing anything', () => {});
});
