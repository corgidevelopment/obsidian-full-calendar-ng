
# Full Calendar Plugin for Obsidian

This plugin integrates FullCalendar.js into Obsidian, supporting local (Full Note, Daily Note) and remote (ICS, CalDAV, Google) calendars. It is TypeScript-based, modular, and designed for robust event management and calendar views.

## Essential Architecture

- **UI Layer**: React components (`src/ui/`), FullCalendar.js integration (`src/ui/view.ts`), and view models (e.g., `ViewEnhancer`).
- **Core Layer**: Central event management via `EventCache` (single source of truth) and `EventStore` (in-memory DB, indexes).
- **Calendar Layer**: Pluggable sources (`src/calendars/`): Full Note, Daily Note, ICS, CalDAV.
- **Abstraction Layer**: `ObsidianAdapter` for testable Obsidian API interactions.
- **ChronoAnalyser**: Data visualization (see `src/chrono_analyser/`), consumes `EventCache` via pub/sub for real-time updates.

**Data Flow Example**:
- User actions → EventCache → Calendar implementations → Obsidian vault
- File changes/remote sync → EventCache → UI updates (pub/sub)

## Developer Workflows

- **Bootstrap**:  
	- `npm install` (45s, never cancel)
- **Build/Test**:  
	- `npm run compile` (type check)  
	- `npm run lint` (Prettier)  
	- `npm run test` (Jest, 154 tests)  
	- `npm run build` (esbuild)  
	- `npm run prod` (type check + build)
- **Development**:  
	- `npm run dev` (esbuild watch)  
	- `npm run fix-lint` (auto-format)  
	- `npm run coverage` (test coverage)  
	- `npm run test-update` (update Jest snapshots)
- **Validation**:  
	- Always run `npm run lint && npm run compile && npm run test` before commit
	- Test in `obsidian-dev-vault/` (pre-configured dev vault)
	- Copy `manifest.json` to plugin build directory for Obsidian testing

## Project Conventions

- **Event Storage**:  
	- Full Note: events as separate notes with frontmatter  
	- Daily Note: events as list items with inline metadata
- **Category System**:  
	- Format: `Category - Title` or `Category - Subcategory - Title`
	- Color coding and parsing logic in core
- **Recurring Events**:  
	- Recurrence logic and instance modification supported
- **Internationalization**:  
	- Uses i18next, translation files in `src/features/i18n/locales/`, type-safe keys

## Key Files & Directories

- `src/main.ts` — Plugin entry
- `src/core/EventCache.ts` — Event management
- `src/core/EventStore.ts` — In-memory DB
- `src/calendars/` — Calendar sources
- `src/ui/view.ts` — Calendar view integration
- `src/types/schema.ts` — Zod schemas
- `test_helpers/MockVault.ts` — Obsidian API mocking
- `docs/` — MkDocs documentation

## Integration & Extensibility

- **External dependencies**: FullCalendar.js, React, Luxon (bundled), Obsidian APIs (external)
- **ChronoAnalyser**: Extensible charting via Strategy Pattern; subscribes to EventCache for real-time data
- **Testing**: Unit/integration tests, snapshot updates, coverage enforcement

## Troubleshooting

- Build failures: check TypeScript errors, esbuild config, CSS renaming
- Test failures: run `npm run test-update` for snapshots, check date/timezone issues
- Plugin loading: verify build output, copy manifest, check Obsidian console

## Best Practices

- Minimal, modular changes; follow SOLID/DRY
- Strict formatting (Prettier, Husky hooks)
- Always validate in dev vault before commit
- Reference [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)


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