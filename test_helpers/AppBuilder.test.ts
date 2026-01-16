import { TFile } from 'obsidian';
import { MockAppBuilder } from './AppBuilder';
import { FileBuilder, ListBuilder } from './FileBuilder';

function normalizePaths(obj: unknown, seen = new WeakSet()): unknown {
  if (typeof obj === 'string') {
    const normalized = obj.split('\\').join('/');
    // Strip leading slash to standardize paths across OSes
    return normalized.startsWith('/') ? normalized.slice(1) : normalized;
  }

  if (obj && typeof obj === 'object') {
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => normalizePaths(item, seen));
    }

    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = normalizePaths((obj as Record<string, unknown>)[key], seen);
    }
    return result;
  }

  return obj;
}

describe('AppBuilder read tests', () => {
  let builder: MockAppBuilder;
  beforeEach(() => {
    builder = MockAppBuilder.make();
  });
  it('Basic file', async () => {
    const app = builder
      .file(
        'name.md',
        new FileBuilder()
          .frontmatter({ one: 1, two: 2 })
          .heading(2, 'my heading')
          .list(new ListBuilder().item('list item'))
      )
      .done();
    const files = app.vault.getAllLoadedFiles();
    expect(normalizePaths(files)).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "name": "name.md",
              "parent": "[Circular]",
            },
          ],
          "isRootVal": true,
          "name": "",
          "parent": null,
        },
        "[Circular]",
      ]
    `);
    expect(normalizePaths(files[0].path)).toMatchInlineSnapshot(`"."`);
    const file = app.vault.getAbstractFileByPath('name.md');
    expect(normalizePaths(file)).toMatchInlineSnapshot(`
      {
        "name": "name.md",
        "parent": {
          "children": [
            "[Circular]",
          ],
          "isRootVal": true,
          "name": "",
          "parent": null,
        },
      }
    `);

    if (!(file instanceof TFile)) throw new Error('Expected TFile');
    const contents = await app.vault.read(file);
    expect(contents).toMatchInlineSnapshot(`
      		"---
      		one: 1
      		two: 2
      		---
      		## my heading
      		- list item
      		"
    	`);
    const metadata = app.metadataCache.getFileCache(file);
    expect(metadata).toMatchInlineSnapshot(`
      		{
      		  "frontmatter": {
      		    "one": 1,
      		    "position": {
      		      "end": {
      		        "col": 3,
      		        "line": 3,
      		        "offset": 21,
      		      },
      		      "start": {
      		        "col": 0,
      		        "line": 0,
      		        "offset": 0,
      		      },
      		    },
      		    "two": 2,
      		  },
      		  "headings": [
      		    {
      		      "heading": "my heading",
      		      "level": 2,
      		      "position": {
      		        "end": {
      		          "col": 13,
      		          "line": 4,
      		          "offset": 35,
      		        },
      		        "start": {
      		          "col": 0,
      		          "line": 4,
      		          "offset": 22,
      		        },
      		      },
      		    },
      		  ],
      		  "listItems": [
      		    {
      		      "parent": -5,
      		      "position": {
      		        "end": {
      		          "col": 11,
      		          "line": 5,
      		          "offset": 47,
      		        },
      		        "start": {
      		          "col": 0,
      		          "line": 5,
      		          "offset": 36,
      		        },
      		      },
      		    },
      		  ],
      		}
    	`);
  });
  it('multiple files', async () => {
    const app = builder
      .file('file1.md', new FileBuilder().heading(2, 'file1 heading'))
      .file('file2.md', new FileBuilder().heading(2, 'file2 heading'))
      .file('file3.md', new FileBuilder().heading(2, 'file3 heading'))
      .file('file4.md', new FileBuilder().heading(2, 'file4 heading'))
      .done();
    expect(app.vault.getAllLoadedFiles().length).toBe(5);
    for (let i = 1; i <= 4; i++) {
      const basename = `file${i}`;
      const file = app.vault.getAbstractFileByPath(`${basename}.md`);
      if (!(file instanceof TFile)) throw new Error('Expected TFile');
      const contents = await app.vault.read(file);
      const metadata = app.metadataCache.getFileCache(file);
      expect(contents).toBe(`## ${basename} heading\n`);
      const headings = metadata?.headings || [];
      expect(headings[0].heading).toBe(`${basename} heading`);
      expect(headings[0].level).toBe(2);
      expect(await app.vault.cachedRead(file)).toBe(contents);
    }
  });
  it('nested folders', async () => {
    const app = builder
      .file('root.md', new FileBuilder().heading(2, 'Root'))
      .folder(
        new MockAppBuilder('nested').file('nestedfile.md', new FileBuilder().heading(2, 'Nested'))
      )
      .done();

    const files = app.vault.getAllLoadedFiles();
    expect(files.length).toBe(4);
    const rootFile = app.vault.getAbstractFileByPath('root.md');
    if (!(rootFile instanceof TFile)) throw new Error('Expected TFile');
    expect(rootFile).toBeTruthy();
    expect([await app.vault.read(rootFile), app.metadataCache.getFileCache(rootFile)])
      .toMatchInlineSnapshot(`
      		[
      		  "## Root
      		",
      		  {
      		    "headings": [
      		      {
      		        "heading": "Root",
      		        "level": 2,
      		        "position": {
      		          "end": {
      		            "col": 7,
      		            "line": 0,
      		            "offset": 7,
      		          },
      		          "start": {
      		            "col": 0,
      		            "line": 0,
      		            "offset": 0,
      		          },
      		        },
      		      },
      		    ],
      		  },
      		]
    	`);
    const nestedFile = app.vault.getAbstractFileByPath('nested/nestedfile.md');
    if (!(nestedFile instanceof TFile)) throw new Error('Expected TFile');
    expect(nestedFile).toBeTruthy();
    expect([await app.vault.read(nestedFile), app.metadataCache.getFileCache(nestedFile)])
      .toMatchInlineSnapshot(`
      		[
      		  "## Nested
      		",
      		  {
      		    "headings": [
      		      {
      		        "heading": "Nested",
      		        "level": 2,
      		        "position": {
      		          "end": {
      		            "col": 9,
      		            "line": 0,
      		            "offset": 9,
      		          },
      		          "start": {
      		            "col": 0,
      		            "line": 0,
      		            "offset": 0,
      		          },
      		        },
      		      },
      		    ],
      		  },
      		]
    	`);
  });
  it('nested a few', async () => {
    const app = builder
      .file('root.md', new FileBuilder().heading(2, 'Root'))
      .folder(
        new MockAppBuilder('nested')
          .file('nestedfile.md', new FileBuilder().heading(2, 'Nested'))
          .folder(
            new MockAppBuilder('double').file('double.md', new FileBuilder().heading(2, 'Double'))
          )
      )
      .done();
    const files = app.vault.getAllLoadedFiles();
    expect(normalizePaths(files.map(f => f.path))).toMatchInlineSnapshot(`
      [
        ".",
        "root.md",
        "nested",
        "nested/nestedfile.md",
        "nested/double",
        "nested/double/double.md",
      ]
    `);
    const nestedFile = app.vault.getAbstractFileByPath('nested/double/double.md');
    if (!(nestedFile instanceof TFile)) throw new Error('Expected TFile');
    expect(nestedFile).toBeTruthy();
    expect(
      normalizePaths([
        nestedFile,
        await app.vault.read(nestedFile),
        app.metadataCache.getFileCache(nestedFile)
      ])
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "double.md",
          "parent": {
            "children": [
              "[Circular]",
            ],
            "name": "double",
            "parent": {
              "children": [
                {
                  "name": "nestedfile.md",
                  "parent": "[Circular]",
                },
                "[Circular]",
              ],
              "name": "nested",
              "parent": {
                "children": [
                  {
                    "name": "root.md",
                    "parent": "[Circular]",
                  },
                  "[Circular]",
                ],
                "isRootVal": true,
                "name": "",
                "parent": null,
              },
            },
          },
        },
        "## Double
      ",
        {
          "headings": [
            {
              "heading": "Double",
              "level": 2,
              "position": {
                "end": {
                  "col": 9,
                  "line": 0,
                  "offset": 9,
                },
                "start": {
                  "col": 0,
                  "line": 0,
                  "offset": 0,
                },
              },
            },
          ],
        },
      ]
    `);
  });
});
