// src/core/EventCache.test.ts

import { TFile } from 'obsidian';

// Add this mock
jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: class {},
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/') // <-- ADD THIS LINE
  }),
  { virtual: true }
);
// End of new code

import FullCalendarPlugin from '../main';
import { EventPathLocation } from './EventStore';
import { Calendar, EventResponse } from '../calendars/Calendar';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../types/settings';
import { EditableCalendar, EditableEventResponse } from '../calendars/EditableCalendar';
import EventCache, {
  CacheEntry,
  CalendarInitializerMap,
  OFCEventSource,
  CachedEvent // <-- ADD THIS
} from './EventCache';

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

class TestReadonlyCalendar extends Calendar {
  get name(): string {
    return 'test';
  }
  private _id: string;
  events: OFCEvent[] = [];
  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
    const testInfo = info as Extract<CalendarInfo, { type: 'FOR_TEST_ONLY' }>;
    this._id = testInfo.id;
    this.events = testInfo.events || [];
  }
  get type(): 'FOR_TEST_ONLY' {
    return 'FOR_TEST_ONLY';
  }

  get identifier(): string {
    return this._id;
  }

  async getEvents(): Promise<EventResponse[]> {
    return this.events.map(event => [event, null]);
  }

  // Add getLocalIdentifier for tests
  public getLocalIdentifier(event: OFCEvent): string | null {
    return event.title;
  }
}

// For tests, we only want test calendars to
const initializerMap = (
  cb: (info: CalendarInfo, settings: FullCalendarSettings) => Calendar | null
): CalendarInitializerMap => ({
  FOR_TEST_ONLY: cb,
  local: () => null,
  dailynote: () => null,
  ical: () => null,
  caldav: () => null,
  google: () => null
});

const extractEvents = (source: OFCEventSource): OFCEvent[] =>
  source.events.map(({ event }: CachedEvent) => event); // <-- ADD `: CachedEvent`

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
  const makeCache = (events: OFCEvent[]) => {
    const cache = new EventCache(
      { settings: DEFAULT_SETTINGS } as FullCalendarPlugin,
      initializerMap((info, settings) => {
        if (info.type !== 'FOR_TEST_ONLY') {
          return null;
        }
        return new TestReadonlyCalendar(info, settings);
      })
    );
    cache.reset([{ type: 'FOR_TEST_ONLY', color: '#000000', id: 'test', events }]);
    return cache;
  };

  it('populates a single event', async () => {
    const event = mockEvent();
    const cache = makeCache([event]);

    expect(cache.initialized).toBeFalsy();
    await cache.populate();
    expect(cache.initialized).toBeTruthy();

    const calId = 'FOR_TEST_ONLY::test';
    const calendar = cache.getCalendarById(calId);
    expect(calendar).toBeTruthy();
    expect(calendar?.id).toBe(calId);
    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([event]);
    expect(sources[0].color).toEqual('#000000');
    expect(sources[0].editable).toBeFalsy();
  });

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
    const cache = makeCache([]);
    const events1 = [mockEvent()];
    const events2 = [mockEvent(), mockEvent()];
    cache.reset([
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal1',
        color: 'red',
        events: events1
      },
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal2',
        color: 'blue',
        events: events2
      }
    ]);
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
      async (cache: EventCache, id: string) =>
        await cache.addEvent('FOR_TEST_ONLY::test', mockEvent())
    ],
    ['deleteEvent', async (cache: EventCache, id: string) => await cache.deleteEvent(id)],
    [
      'modifyEvent',
      async (cache: EventCache, id: string) => await cache.updateEventWithId(id, mockEvent())
    ]
  ])('does not allow editing via %p', async (_, f) => {
    const event = mockEvent();
    const cache = makeCache([event]);
    await cache.populate();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    const eventId = sources[0].events[0].id;

    await assertFailed(async () => await f(cache, eventId), /read-only/i);
  });
});

class TestEditable extends EditableCalendar {
  get name(): string {
    return 'test';
  }
  private _directory: string;
  events: EditableEventResponse[];
  shouldContainPath = true;
  constructor(info: CalendarInfo, settings: FullCalendarSettings) {
    super(info, settings);
    const testInfo = info as Extract<CalendarInfo, { type: 'FOR_TEST_ONLY' }>;
    this._directory = testInfo.id;
    this.events = [];
  }
  get directory(): string {
    return this._directory;
  }

  containsPath(path: string): boolean {
    return this.shouldContainPath;
  }

  getEvents = jest.fn(async () => this.events);
  getEventsInFile = jest.fn();

  createEvent = jest.fn();

  checkForDuplicate = jest.fn(async () => false);

  deleteEvent = jest.fn();
  move = jest.fn();
  modifyEvent = jest.fn();

  // ADD THE MOCK IMPLEMENTATIONS HERE
  bulkAddCategories = jest.fn(async () => {});
  bulkRemoveCategories = jest.fn(async () => {});

  get type(): 'FOR_TEST_ONLY' {
    return 'FOR_TEST_ONLY';
  }
  get identifier(): string {
    return this.directory;
  }

  // Add getLocalIdentifier for tests
  public getLocalIdentifier(event: OFCEvent): string | null {
    return event.title;
  }
}

const mockFile = withCounter(path => ({ path }) as TFile, 'file');
const mockLocation = (withLine = false) => ({
  file: mockFile(),
  lineNumber: withLine ? Math.floor(Math.random() * 100) : undefined
});

const mockEventResponse = (): EditableEventResponse => [mockEvent(), mockLocation()];

const assertCacheContentCounts = (
  cache: EventCache,
  { calendars, files, events }: { calendars: number; files: number; events: number }
) => {
  expect(cache._storeForTest.calendarCount).toBe(calendars);
  expect(cache._storeForTest.fileCount).toBe(files);
  expect(cache._storeForTest.eventCount).toBe(events);
};

describe('editable calendars', () => {
  const makeCache = (events: EditableEventResponse[]) => {
    const cache = new EventCache(
      { settings: DEFAULT_SETTINGS } as FullCalendarPlugin,
      initializerMap((info, settings) => {
        if (info.type !== 'FOR_TEST_ONLY') {
          return null;
        }
        const calendar = new TestEditable(info, settings);
        calendar.events = events;
        return calendar;
      })
    );
    cache.reset([{ type: 'FOR_TEST_ONLY', id: 'test', events: [], color: 'black' }]);
    return cache;
  };

  const getId = (id: string) => `FOR_TEST_ONLY::${id}`;

  const getCalendar = (cache: EventCache, id: string) => {
    const calendar = cache.getCalendarById(getId(id));
    expect(calendar).toBeTruthy();
    expect(calendar).toBeInstanceOf(TestEditable);
    return calendar as TestEditable;
  };

  it('populates a single event', async () => {
    const e1 = mockEventResponse();
    const cache = makeCache([e1]);

    await cache.populate();

    const calendar = getCalendar(cache, 'test');

    const sources = cache.getAllEvents();

    expect((calendar as TestEditable).getEvents.mock.calls.length).toBe(1);
    expect(sources.length).toBe(1);

    expect(extractEvents(sources[0])).toEqual([e1[0]]);
    expect(sources[0].color).toEqual('black');
    expect(sources[0].editable).toBeTruthy();
  });

  describe('add events', () => {
    it('empty cache', async () => {
      const cache = makeCache([]);

      await cache.populate();

      const calendar = getCalendar(cache, 'test');

      const event = mockEvent();
      const loc = mockLocation();
      calendar.createEvent.mockReturnValueOnce(new Promise(resolve => resolve([event, loc])));
      expect(await cache.addEvent(getId('test'), event)).toBeTruthy();
      expect(calendar.createEvent.mock.calls.length).toBe(1);
      expect(calendar.createEvent.mock.calls[0]).toEqual([event]);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });

    it('in the same file', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);

      await cache.populate();

      const calendar = getCalendar(cache, 'test');

      const event2 = mockEvent();
      const loc = { file: event[1].file, lineNumber: 102 };
      calendar.createEvent.mockReturnValueOnce(new Promise(resolve => resolve([event2, loc])));
      expect(await cache.addEvent(getId('test'), event2)).toBeTruthy();
      expect(calendar.createEvent.mock.calls.length).toBe(1);
      expect(calendar.createEvent.mock.calls[0]).toEqual([event2]);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 2
      });
    });

    it('in a different file', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);

      await cache.populate();

      const event2 = mockEvent();
      const loc = mockLocation();

      const calendar = getCalendar(cache, 'test');
      calendar.createEvent.mockReturnValueOnce(new Promise(resolve => resolve([event2, loc])));
      expect(await cache.addEvent(getId('test'), event2)).toBeTruthy();
      expect(calendar.createEvent.mock.calls.length).toBe(1);
      expect(calendar.createEvent.mock.calls[0]).toEqual([event2]);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 2,
        events: 2
      });
    });

    it('adding many events', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);

      await cache.populate();

      const calendar = getCalendar(cache, 'test');

      const mockAndResolve = () => new Promise(resolve => resolve([mockEvent(), mockLocation()]));
      calendar.createEvent
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve());

      expect(await cache.addEvent(getId('test'), mockEvent())).toBeTruthy();
      expect(await cache.addEvent(getId('test'), mockEvent())).toBeTruthy();
      expect(await cache.addEvent(getId('test'), mockEvent())).toBeTruthy();

      expect(calendar.createEvent.mock.calls.length).toBe(3);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 4,
        events: 4
      });
    });
  });
  const pathResult = (loc: EventLocation): EventPathLocation => ({
    path: loc.file.path,
    lineNumber: loc.lineNumber
  });
  describe('delete events', () => {
    it('delete one', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);

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

      const calendar = getCalendar(cache, 'test');
      expect(calendar.deleteEvent.mock.calls.length).toBe(1);
      expect(calendar.deleteEvent.mock.calls[0]).toEqual([event[0], pathResult(event[1])]);

      assertCacheContentCounts(cache, {
        calendars: 0,
        files: 0,
        events: 0
      });
    });

    it('delete non-existing event', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);

      await cache.populate();
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      expect(cache._storeForTest.calendarCount).toBe(1);
      expect(cache._storeForTest.fileCount).toBe(1);
      expect(cache._storeForTest.eventCount).toBe(1);

      assertFailed(() => cache.deleteEvent('unknown ID'), /not present in event store/);

      const calendar = getCalendar(cache, 'test');
      expect(calendar.deleteEvent.mock.calls.length).toBe(0);

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
          { file: oldEvent[1].file, numEvents: 0 },
          { file: newLoc.file, numEvents: 1 }
        ],
        1 // The old file is gone, so the total count is now 1.
      ],
      [
        'calendar keeps event in the same file, but moves it around',
        { file: oldEvent[1].file, lineNumber: newLoc.lineNumber },
        [{ file: oldEvent[1].file, numEvents: 1 }],
        1 // The file count never changes.
      ]
    ])('%p', async (_, newLocation, fileDetails, expectedFileCount) => {
      const cache = makeCache([oldEvent]);
      await cache.populate();

      assertCacheContentCounts(cache, { calendars: 1, files: 1, events: 1 });

      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;

      const calendar = getCalendar(cache, 'test');
      calendar.modifyEvent.mockImplementation(async (old, n, loc, updateCallback) => {
        updateCallback(newLocation);
        return { isDirty: false }; // isDirty: false ensures immediate UI update for testing
      });

      await cache.updateEventWithId(id, newEvent);

      expect(calendar.modifyEvent.mock.calls.length).toBe(1);
      const [oldEventArg, newEventArg, oldLocationArg] = calendar.modifyEvent.mock.calls[0];
      expect(oldEventArg).toEqual(oldEvent[0]);
      expect(newEventArg).toEqual(newEvent);
      expect(oldLocationArg).toEqual(pathResult(oldEvent[1]));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: expectedFileCount,
        events: 1
      });

      expect(cache._storeForTest.getEventById(id)).toEqual(newEvent);

      for (const { file, numEvents } of fileDetails) {
        const eventsInFile = cache._storeForTest.getEventsInFile({ path: file.path });
        expect(eventsInFile).toHaveLength(numEvents);
      }
    });

    it('modify non-existing event', async () => {
      const event = mockEventResponse();
      const cache = makeCache([event]);
      await cache.populate();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      assertFailed(
        () => cache.updateEventWithId('unknown ID', mockEvent()),
        /not present in event store/
      );

      const sources = cache.getAllEvents();
      expect(sources.length).toBe(1);
      const id = sources[0].events[0].id;

      const calendar = getCalendar(cache, 'test');
      expect(calendar.modifyEvent.mock.calls.length).toBe(0);
      expect(cache._storeForTest.getEventById(id)).toEqual(event[0]);

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
    beforeEach(() => {
      cache = makeCache([oldEvent]);
      cache.populate();
      callbackMock.mockClear();
      cache.on('update', callbackMock);
    });

    it.each([
      {
        test: 'New event in a new file',
        eventsInFile: [newEvent],
        file: newEvent[1].file,
        counts: { files: 2, events: 2 },
        callback: { toRemoveLength: 0, eventsToAdd: [newEvent[0]] }
      },
      {
        test: 'Changing events in an existing location',
        eventsInFile: [[newEvent[0], oldEvent[1]]],
        file: oldEvent[1].file,
        counts: { files: 1, events: 1 },
        callback: { toRemoveLength: 1, eventsToAdd: [newEvent[0]] }
      },
      {
        test: 'No callback fired if event does not change.',
        eventsInFile: [oldEvent],
        file: oldEvent[1].file,
        counts: { files: 1, events: 1 },
        callback: null
      }
    ])('$test', async ({ eventsInFile, file, counts: { files, events }, callback }) => {
      const calendar = getCalendar(cache, 'test');

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      calendar.getEventsInFile.mockReturnValue(new Promise(resolve => resolve(eventsInFile)));

      await cache.fileUpdated(file as TFile);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files,
        events
      });

      if (callback) {
        expect(callbackMock).toHaveBeenCalled();
        const { toRemoveLength, eventsToAdd } = callback;
        const callbackInvocation: {
          toRemove: string[];
          toAdd: CacheEntry[];
        } = callbackMock.mock.calls[0][0];

        expect(callbackInvocation.toAdd).toBeDefined();
        expect(callbackInvocation.toRemove).toBeDefined();

        expect(callbackInvocation.toRemove.length).toBe(toRemoveLength);
        expect(callbackInvocation.toAdd.length).toBe(eventsToAdd.length);
        expect(callbackInvocation.toAdd.map(e => e.event)).toEqual(eventsToAdd);
      } else {
        expect(callbackMock.mock.calls.length).toBe(0);
      }
    });
    it.todo('updates when events are the same but locations are different');
  });

  describe('make sure cache is populated before doing anything', () => {});
});
