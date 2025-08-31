# Full Calendar Plugin for Obsidian

Full Calendar is a TypeScript-based Obsidian plugin that integrates FullCalendar.js to provide calendar views for notes and events. It supports both local calendars (Full Note and Daily Note formats) and remote calendars (ICS and CalDAV).

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

Bootstrap, build, and test the repository:

- `npm install` -- takes 45 seconds. NEVER CANCEL. Set timeout to 2+ minutes.
- `npm run compile` -- TypeScript type checking, takes 5 seconds
- `npm run lint` -- Prettier formatting check, takes 1.5 seconds  
- `npm run test` -- Jest test suite (154 tests), takes 3 seconds
- `npm run build` -- esbuild production build, takes 0.5 seconds
- `npm run prod` -- TypeScript check + production build, takes 5.5 seconds

Development workflow:
- `npm run dev` -- starts esbuild in watch mode for rapid iteration
- `npm run fix-lint` -- auto-fixes Prettier formatting issues
- `npm run coverage` -- runs tests with coverage report, takes 4.5 seconds
- `npm run test-update` -- updates Jest snapshots when tests fail due to expected changes

## Build Output and Plugin Testing

The plugin builds to `obsidian-dev-vault/.obsidian/plugins/Full-Calender/` containing:
- `main.js` -- bundled plugin code
- `styles.css` -- plugin styles (renamed from main.css by build script)
- `manifest.json` -- copy manually with `cp manifest.json obsidian-dev-vault/.obsidian/plugins/Full-Calender/`

Development vault setup (already exists):
- Development vault is pre-configured at `obsidian-dev-vault/`
- Plugin directory structure is already created
- Simply run builds and copy manifest to test in Obsidian
- Sample test files are available for testing Full Note and Daily Note formats

## Validation

ALWAYS run through complete user scenarios after making changes:

**Core Plugin Functionality Tests:**
1. **Full Note Calendar**: Create a new event that generates a separate note file with frontmatter
2. **Daily Note Calendar**: Create events as list items in daily notes with inline metadata
3. **Event Management**: Test creating, editing, deleting, and drag-and-drop operations
4. **Category System**: Test the category parsing (`Category - Title` and `Category - Subcategory - Title` format) and color coding
5. **Recurring Events**: Test recurring event creation and individual instance modifications

**Required Validation Steps:**
- ALWAYS run `npm run lint && npm run compile && npm run test` before committing (takes 9 seconds total)
- If tests fail due to snapshot mismatches, run `npm run test-update` first to fix expected changes
- ALWAYS test actual plugin functionality by loading in development vault
- Test both Full Note and Daily Note calendar types when modifying core event logic
- Run `npm run coverage` to verify test coverage stays high (current: 53% overall)

**CI/CD Validation:**
- GitHub Actions runs lint, compile, and test on every push via `.github/workflows/check.yml`
- Release workflow builds and packages the plugin via `.github/workflows/release.yml`
- NEVER skip linting - the CI will fail if code is not properly formatted

## Common Tasks

### Repository Structure
```
.
├── README.md
├── CONTRIBUTING.md 
├── package.json           # npm scripts and dependencies
├── esbuild.config.mjs     # build configuration  
├── jest.config.js         # test configuration
├── manifest.json          # Obsidian plugin manifest
├── src/                   # TypeScript source code
│   ├── main.ts           # plugin entry point
│   ├── calendars/        # calendar source implementations
│   ├── core/             # core logic (EventCache, EventStore)
│   ├── ui/               # React components and views
│   └── types/            # TypeScript types and schemas
├── test_helpers/         # test utilities and mocks
├── docs/                 # documentation (MkDocs)
├── tools/                # Python development utilities
└── obsidian-dev-vault/   # development Obsidian vault
```

### Key Source Files
- `src/main.ts` -- Plugin entry point and initialization
- `src/core/EventCache.ts` -- Central event management (single source of truth)
- `src/core/EventStore.ts` -- In-memory event database with indexes
- `src/calendars/FullNoteCalendar.ts` -- Full note calendar implementation
- `src/calendars/DailyNoteCalendar.ts` -- Daily note calendar implementation
- `src/ui/view.ts` -- Main calendar view integration with FullCalendar.js
- `src/types/schema.ts` -- Zod schemas for data validation

### Build System Details
- **Bundler**: esbuild with custom configuration
- **CSS Handling**: Automatically renames main.css to styles.css for Obsidian compatibility
- **TypeScript**: Strict type checking with `tsc --noEmit`
- **External Dependencies**: FullCalendar.js, React, Luxon, and others bundled but Obsidian APIs marked as external

### Testing Framework
- **Framework**: Jest with ts-jest preset
- **Test Types**: Unit tests, integration tests with mock Obsidian vault
- **Coverage**: Run `npm run coverage` for detailed coverage report
- **Test Files**: `*.test.ts` files alongside source code and in `test_helpers/`
- **Mocking**: `test_helpers/MockVault.ts` provides Obsidian API mocking

### Development Tools
- **Linting**: Prettier for code formatting (strict enforcement)
- **Git Hooks**: Husky for pre-commit formatting checks
- **Python Tools**: Optional utilities in `tools/` for Android testing and event generation
- **Documentation**: MkDocs setup for documentation site

## Time Expectations and Timeouts

CRITICAL: NEVER CANCEL builds or long-running commands:
- `npm install`: 45 seconds (one-time setup)
- `npm run test`: 3 seconds  
- `npm run compile`: 5 seconds
- `npm run build`: 0.5 seconds
- `npm run prod`: 5.5 seconds
- `npm run coverage`: 4.5 seconds
- `npm run lint`: 1.5 seconds
- Combined validation: `npm run lint && npm run compile && npm run test` takes 9 seconds

Set timeouts to at least 2x the expected time for safety.

## Architecture Overview

The plugin follows a modular architecture:

1. **UI Layer**: React components and FullCalendar.js integration
2. **Core Layer**: EventCache (single source of truth) + EventStore (in-memory database)
3. **Calendar Layer**: Pluggable calendar sources (Full Note, Daily Note, ICS, CalDAV)
4. **Abstraction Layer**: ObsidianAdapter for testable Obsidian API interactions

Key data flows:
- User actions → EventCache → Calendar implementations → Obsidian vault
- File changes → EventCache → UI updates via pub/sub pattern
- Remote calendar sync → EventCache → UI updates

## Common Issues and Solutions

**Build Issues:**
- If esbuild fails, check TypeScript errors with `npm run compile`
- If styles missing, ensure CSS renaming plugin works in esbuild.config.mjs

**Test Issues:**  
- Jest tests are fast and reliable - if failing, check recent code changes
- Use `npm run test-dev` for watch mode during development
- Snapshot test failures: Run `npm run test-update` to update snapshots when changes are expected
- Some date/timezone related tests may fail due to environment differences - use test-update to fix these

**Plugin Loading Issues:**
- Ensure manifest.json is copied to build directory
- Check Obsidian console for plugin loading errors
- Verify all required files (main.js, styles.css, manifest.json) are present

**Development Workflow:**
- Use `npm run dev` for watch mode during active development
- Run full validation suite before committing changes
- Test plugin functionality in obsidian-dev-vault for real-world validation

## Important Notes
- Keep the codebase clean, lean, modular. Follow the SOLID and DRY principle.
- Allows follow the Obsidian plugin development [guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Try to Follow the minimal code changes principle - only modify what is necessary for the feature or fix, unless SOLID and DRY principles dictate otherwise.
- Commit message should be precise and detailed and should contain what changes were made and why. 