import { join } from 'path';
import { TFile, normalizePath } from 'obsidian';
import { load } from 'js-yaml'; // Import 'load' from js-yaml

import { ObsidianInterface } from '../../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../../test_helpers/AppBuilder';
import { OFCEvent } from '../../types';
import { FileBuilder } from '../../../test_helpers/FileBuilder';
import { parseEvent } from '../../types/schema';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import { CalendarInfo } from '../../types';
import FullCalendarPlugin from '../../main';

// Import the new provider and its types
import { FullNoteProvider } from './FullNoteProvider';

// Mock Obsidian module
jest.mock(
  'obsidian',
  () => {
    // Basic mock for TAbstractFile to have a `path` property.
    class TAbstractFile {
      name: string = '';
      parent: TFolder | null = null;
      get path(): string {
        if (this.parent && this.parent.path) {
          return `${this.parent.path}/${this.name}`;
        }
        return this.name;
      }
    }

    class TFile extends TAbstractFile {}

    class TFolder extends TAbstractFile {
      children: TAbstractFile[] = [];
      isRootVal: boolean = false;

      // The root folder's path is an empty string.
      get path(): string {
        if (this.isRootVal) return '';
        return super.path;
      }

      isRoot(): boolean {
        return this.isRootVal;
      }
    }

    return {
      normalizePath: (path: string) => path.replace(/\\/g, '/'),
      TFile,
      TFolder,
      Notice: class {},
      // Use the imported 'load' function as our mock implementation
      parseYaml: (s: string) => load(s)
    };
  },
  { virtual: true }
);

// keep assertFailed helper
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

const makeApp = (app: MockApp): ObsidianInterface => ({
  getAbstractFileByPath: path => app.vault.getAbstractFileByPath(path),
  getFileByPath(path: string): TFile | null {
    return app.vault.getFileByPath(path);
  },
  getMetadata: file => app.metadataCache.getFileCache(file),
  waitForMetadata: file =>
    new Promise((resolve, reject) => {
      const cache = app.metadataCache.getFileCache(file);
      if (cache) {
        resolve(cache);
      } else {
        reject(new Error(`No metadata cache found for ${file.path}`));
      }
    }),
  read: file => app.vault.read(file),
  create: jest.fn(),
  rewrite: jest.fn(),
  rename: jest.fn(),
  delete: jest.fn(),
  process: jest.fn()
});

const dirName = 'events';
const color = '#BADA55';

const makePlugin = (settings: Partial<FullCalendarSettings> = {}): FullCalendarPlugin =>
  ({
    app: {}, // Mock app if needed, though not used by constructor directly
    settings: { ...DEFAULT_SETTINGS, ...settings },
    nonBlockingProcess: jest.fn(async (files, processor) => {
      for (const file of files) {
        await processor(file);
      }
    })
  }) as unknown as FullCalendarPlugin;

describe('FullNoteCalendar Tests', () => {
  it.each([
    [
      'One event with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          }
        }
      ]
    ],
    [
      'Two events, one with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          }
        },
        {
          filename: '2022-01-02 Another Test Event.md',
          frontmatter: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          },
          expected: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          }
        }
      ]
    ]
  ])(
    '%p',
    async (
      _,
      inputs: { filename: string; frontmatter: Partial<OFCEvent>; expected: Partial<OFCEvent> }[]
    ) => {
      const obsidian = makeApp(
        MockAppBuilder.make()
          .folder(
            inputs.reduce(
              (builder, { filename, frontmatter }) =>
                builder.file(filename, new FileBuilder().frontmatter(frontmatter)),
              new MockAppBuilder(dirName)
            )
          )
          .done()
      );
      // CORRECTED CONSTRUCTOR CALL
      const info: CalendarInfo = {
        type: 'local',
        id: 'local_1',
        name: 'Test Calendar', // <-- ADD THIS LINE
        color,
        directory: dirName
      };
      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1' },
        makePlugin({ enableAdvancedCategorization: true }),
        obsidian
      );
      const res = await calendar.getEvents();
      expect(res.length).toBe(inputs.length);

      const receivedEvents = res.map(e => e[0]);

      for (const { expected } of inputs) {
        // The parsed event should be structurally similar to our expected event.
        // We use expect.objectContaining because the parser adds default fields.
        expect(receivedEvents).toContainEqual(expect.objectContaining(expected));
      }
    }
  );

  it('creates an event with a category', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    // CORRECTED CONSTRUCTOR CALL
    const info: CalendarInfo = {
      type: 'local',
      id: 'local_1',
      name: 'Test Calendar', // <-- ADD THIS LINE
      color,
      directory: dirName
    };
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }),
      obsidian
    );
    const event = {
      title: 'Test Event',
      category: 'Work',
      date: '2022-01-01',
      allDay: false,
      startTime: '11:00',
      endTime: '12:30'
    };

    (obsidian.create as jest.Mock).mockReturnValue({
      path: join(dirName, '2022-01-01 Work - Test Event.md')
    });
    await calendar.createEvent(parseEvent(event));
    expect(obsidian.create).toHaveBeenCalledTimes(1);
    const [path, content] = (obsidian.create as jest.Mock).mock.calls[0];

    expect(path).toBe('events/2022-01-01 Work - Test Event.md');
    // The frontmatter content will now have separate fields.
    expect(content).toContain('title: Test Event');
    expect(content).toContain('category: Work');
  });

  it('modify an existing event to add a category', async () => {
    const initialEvent = {
      title: 'Test Event',
      allDay: false,
      date: '2022-01-01',
      startTime: '11:00',
      endTime: '12:30'
    };
    const filename = '2022-01-01 Test Event.md';
    const obsidian = makeApp(
      MockAppBuilder.make()
        .folder(
          new MockAppBuilder('events').file(filename, new FileBuilder().frontmatter(initialEvent))
        )
        .done()
    );
    // CORRECTED CONSTRUCTOR CALL
    const info: CalendarInfo = {
      type: 'local',
      id: 'local_1',
      name: 'Test Calendar', // <-- ADD THIS LINE
      color,
      directory: dirName
    };
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }),
      obsidian
    );

    const path = normalizePath(`events/${filename}`); // Use forward slash instead of join
    const abstractFile = obsidian.getAbstractFileByPath(path);
    if (!(abstractFile instanceof TFile)) {
      throw new Error(
        `Expected ${path} to be a file, but got ${abstractFile?.constructor.name || 'null'}`
      );
    }
    const firstFile = abstractFile;

    const contents = await obsidian.read(firstFile);

    const mockFn = jest.fn();

    // The event we pass to modifyEvent is the *structured* event with separate properties.
    const newEvent = parseEvent({
      ...initialEvent,
      category: 'Work' // Add the category
    });

    const handle = calendar.getEventHandle(initialEvent as OFCEvent);
    if (!handle) throw new Error('Could not get event handle.');

    await calendar.updateEvent(handle, initialEvent as OFCEvent, newEvent);

    expect(obsidian.rewrite).toHaveBeenCalledTimes(1);
    const [file, rewriteCallback] = (obsidian.rewrite as jest.Mock).mock.calls[0];
    const newContent = rewriteCallback(contents);

    // The rewritten content should have the new structured data.
    expect(newContent).toContain('title: Test Event');
    expect(newContent).toContain('category: Work');
  });

  it('should correctly determine file relevance', () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteProvider(
      { directory: 'events', id: 'test_id' },
      makePlugin(),
      obsidian
    );

    // Mock TFile objects
    const fileInDirectory = { path: 'events/test-event.md' } as any;
    const fileInSubdirectory = { path: 'events/2023/test-event.md' } as any;
    const fileOutsideDirectory = { path: 'notes/other.md' } as any;
    const fileInSimilarPath = { path: 'events-archive/old.md' } as any;

    // File in the configured directory should be relevant
    expect(calendar.isFileRelevant(fileInDirectory)).toBe(true);

    // File in subdirectory should be relevant
    expect(calendar.isFileRelevant(fileInSubdirectory)).toBe(true);

    // File outside directory should not be relevant
    expect(calendar.isFileRelevant(fileOutsideDirectory)).toBe(false);

    // File in similar but different path should not be relevant
    expect(calendar.isFileRelevant(fileInSimilarPath)).toBe(false);
  });
});
