import { join } from 'path';
import { TFile, normalizePath } from 'obsidian'; // Import normalizePath here

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

import { ObsidianInterface } from '../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../test_helpers/AppBuilder';
import { FileBuilder } from '../../test_helpers/FileBuilder';
import { OFCEvent } from '../types';
import FullNoteCalendar from './FullNoteCalendar';
import { parseEvent } from '../types/schema';
import { DEFAULT_SETTINGS } from '../types/settings';
import { CalendarInfo } from '../types';
import FullCalendarPlugin from '../main';
import { load } from 'js-yaml';

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

// Create a mock plugin instance to satisfy the constructor
const mockPlugin = {
  app: {}, // Mock app if needed, though not used by constructor directly
  settings: DEFAULT_SETTINGS,
  nonBlockingProcess: jest.fn(async (files, processor) => {
    for (const file of files) {
      await processor(file);
    }
  })
} as unknown as FullCalendarPlugin;

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
            title: 'Test Event',
            category: 'Work',
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
            title: 'Test Event',
            category: 'Work',
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
        color,
        directory: dirName
      };
      const calendar = new FullNoteCalendar(obsidian, mockPlugin, info, {
        ...DEFAULT_SETTINGS,
        enableAdvancedCategorization: true
      });
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
      color,
      directory: dirName
    };
    const calendar = new FullNoteCalendar(obsidian, mockPlugin, info, {
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true
    });
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
    // The created frontmatter should have the FULL title.
    expect(content).toContain('title: Work - Test Event');
    // It should NOT have a separate category field.
    expect(content).not.toContain('category: Work');
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
      color,
      directory: dirName
    };
    const calendar = new FullNoteCalendar(obsidian, mockPlugin, info, {
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true
    });

    const path = normalizePath(`events/${filename}`); // Use forward slash instead of join
    const firstFile = obsidian.getAbstractFileByPath(path) as TFile;

    const contents = await obsidian.read(firstFile);

    const mockFn = jest.fn();

    // The event we pass to modifyEvent is the *structured* event with separate properties.
    const newEvent = parseEvent({
      ...initialEvent,
      category: 'Work' // Add the category
    });

    await calendar.modifyEvent(
      { path, lineNumber: undefined }, // Use the same path variable
      newEvent,
      mockFn
    );

    expect(obsidian.rewrite).toHaveBeenCalledTimes(1);
    const [file, rewriteCallback] = (obsidian.rewrite as jest.Mock).mock.calls[0];
    const newContent = rewriteCallback(contents);

    // The rewritten content should have the new, full title.
    expect(newContent).toContain('title: Work - Test Event');
    // It should not have a separate category field.
    expect(newContent).not.toContain('category: Work');
  });
});
