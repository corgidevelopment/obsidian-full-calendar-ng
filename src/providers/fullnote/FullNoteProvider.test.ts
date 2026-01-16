import { TFile, normalizePath } from 'obsidian';
import { load } from 'js-yaml'; // Import 'load' from js-yaml

import { ObsidianInterface } from '../../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../../test_helpers/AppBuilder';
import { OFCEvent } from '../../types';
import { FileBuilder } from '../../../test_helpers/FileBuilder';
import { parseEvent } from '../../types/schema';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
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
// function _assertFailed removed because it's unused

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

interface MockObsidian {
  create: jest.Mock;
  rewrite: jest.Mock;
  read: jest.Mock;
  getAbstractFileByPath: jest.Mock;
}

const dirName = 'events';

const makePlugin = (settings: Partial<FullCalendarSettings> = {}): FullCalendarPlugin =>
  ({
    app: {}, // Mock app if needed, though not used by constructor directly
    settings: { ...DEFAULT_SETTINGS, ...settings },
    nonBlockingProcess: jest.fn(
      async (files: TFile[], processor: (file: TFile) => Promise<void>) => {
        for (const file of files) {
          await processor(file);
        }
      }
    )
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

    const mockObsidian = obsidian as unknown as MockObsidian;

    mockObsidian.create.mockReturnValue({
      path: `${dirName}/2022-01-01 Work - Test Event.md`
    });
    await calendar.createEvent(parseEvent(event));
    expect(mockObsidian.create).toHaveBeenCalledTimes(1);
    const mockCreate = mockObsidian.create;
    const [path, content] = mockCreate.mock.calls[0] as [string, string];

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

    // The event we pass to modifyEvent is the *structured* event with separate properties.
    const newEvent = parseEvent({
      ...initialEvent,
      category: 'Work' // Add the category
    });

    const handle = calendar.getEventHandle(initialEvent as OFCEvent);
    if (!handle) throw new Error('Could not get event handle.');

    await calendar.updateEvent(handle, initialEvent as OFCEvent, newEvent);

    const mockObsidian = obsidian as unknown as MockObsidian;
    const mockRewrite = mockObsidian.rewrite;
    expect(mockRewrite).toHaveBeenCalledTimes(1);
    const [, rewriteCallback] = mockRewrite.mock.calls[0] as [string, (content: string) => string];
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
    // Mock TFile objects using TFile prototype to satisfying instanceof check
    const makeMockFile = (path: string): TFile => {
      const file = new TFile();
      Object.defineProperty(file, 'path', { value: path });
      return file;
    };
    const fileInDirectory = makeMockFile('events/test-event.md');
    const fileInSubdirectory = makeMockFile('events/2023/test-event.md');
    const fileOutsideDirectory = makeMockFile('notes/other.md');
    const fileInSimilarPath = makeMockFile('events-archive/old.md');

    // File in the configured directory should be relevant
    expect(calendar.isFileRelevant(fileInDirectory)).toBe(true);

    // File in subdirectory should be relevant
    expect(calendar.isFileRelevant(fileInSubdirectory)).toBe(true);

    // File outside directory should not be relevant
    expect(calendar.isFileRelevant(fileOutsideDirectory)).toBe(false);

    // File in similar but different path should not be relevant
    expect(calendar.isFileRelevant(fileInSimilarPath)).toBe(false);
  });

  it('creates a recurring event with repeatOn', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }), // Using advanced categorization to ensure we exercise that path too, though not strictly necessary
      obsidian
    );
    const event = {
      title: 'Monthly Meeting',
      type: 'recurring',
      startTime: '10:00',
      endTime: '11:00',
      repeatOn: { week: 2, weekday: 0 }, // 2nd Sunday
      startRecur: '2022-01-01',
      isTask: false
    };

    (obsidian.create as jest.Mock).mockReturnValue({
      path: `${dirName}/Monthly Meeting.md`
    });

    await calendar.createEvent(parseEvent(event));

    const mockObsidian = obsidian as unknown as MockObsidian;
    const mockCreate = mockObsidian.create;
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [, content] = mockCreate.mock.calls[0] as [string, string];

    // This expectation should FAIL currently because it will be [object Object]
    expect(content).toContain('repeatOn: {"week":2,"weekday":0}');
  });
});
