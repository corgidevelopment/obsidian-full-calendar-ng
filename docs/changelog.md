# Full Calendar Changelog

This page provides a detailed breakdown of every version of the Full Calendar plugin, including new features, improvements, and bugfixes.

---

## Version 0.12.2

-   **New:** Multi-day Daily Note events with explicit endDate  
    _Daily Note calendar now supports explicit multi‑day events via `[endDate:: YYYY-MM-DD]` while remaining backward compatible with legacy overnight detection._

-   **New:** Central TimeEngine  
    _Single timer maintains a sorted time-sensitive cache and publishes a `time-tick` event consumed by status bar, notifications, and other listeners._

-   **New:** Status Bar current/upcoming events  
    _Lightweight status bar UI subscribes to `TimeEngine` to surface what's happening now and next._

-   **New:** Interactive time‑axis zoom (#96)  
    _Ctrl/Cmd + scroll to dynamically zoom the vertical (timeGrid) or horizontal (resourceTimeline) axis for fast focus changes._

-   **New:** Advanced recurrence intervals & positional monthly rules (#97)  
    _Support for interval-based repeats (e.g., every 2 weeks) and positional monthly rules (2nd Tuesday, last Friday) with iCal import/export parity._

-   **Improvement:** Codebase compliance & safety  
    _Replaced loose `any` casts, moved inline styles to CSS, added `instanceof` guards for file/folder objects, removed custom leaf detaching on unload._

-   **Improvement:** Reactive calendar view lifecycle  
    _`view-config-changed` now triggers targeted cache repopulation and a new `resync` event prompts precise re-renders for snappier UI updates._

-   **Improvement:** NotificationManager refactor  
    _No internal timer; now a passive subscriber to `TimeEngine`, reducing duplicate intervals and simplifying lifecycle management._

-   **Fix:** Robust timezone conversion for cross-day events  
    _`convertEvent` rewritten as a pure function; correctly handles explicit `endDate` and legacy overnight semantics with stricter type guards._

---

## Version 0.12.1

-   **New:** Event Reminder System with Desktop Notifications (BETA)
    _Introducing the `NotificationManager` for native desktop notifications. Users can opt-in to receive reminders 10 minutes before events start and, optionally, 10 minutes before they end. Perfect for never missing important meetings or deadlines._
    
-   **New:** Multi-Account Google Calendar Integration  
    _Google Calendar integration now supports connecting and managing multiple accounts simultaneously. Features a dedicated account management hub with a streamlined two-step wizard for adding new calendars from any connected account._

-   **Improvement:** Provider-Based Architecture with Multi-Account Support  
    _Complete architectural overhaul to a provider-based system where each calendar source (Local, Daily Notes, ICS, CalDAV, Google) is a self-contained, instanced provider. The new `ProviderRegistry` acts as a central persistence gateway, managing all I/O and abstracting storage details. This enables stateful features and robust multi-account Google Calendar integration._

-   **Improvement:** Event-Driven Settings with Instant Updates  
    _Settings persistence refactored to a publish/subscribe model. The `saveSettings` function now diffs old vs new state and publishes granular events (`sources-changed`, `view-config-changed`, `settings-updated`). Calendar views re-render instantly without flicker or unnecessary reloads._

-   **Improvement:** Lazy-Loading for Faster Startup Performance  
    _Heavy dependencies are now dynamically imported only when needed: FullCalendar engine loads when opening a calendar view, React modals load on demand. This dramatically reduces startup time and memory usage._

-   **Improvement:** Centralized Event Enhancement Pipeline  
    _New `EventEnhancer` module centralizes all timezone conversions and category parsing, essentially intercepting all raw events befor it reaches the Cache. Business logic extracted into dedicated stateless modules with a new `WorkspaceManager` handling all workspace filtering and display logic._

-   **Fix:** Timezone Handling for Recurring Events [#94](https://github.com/YouFoundJK/plugin-full-calendar/issues/94)
    _Recurring events now properly handle timezones with endDate support, resolving timezone branching issues and ensuring correct time display across different time zones._

-   **Fix:** ICS events now loads properly [#91](https://github.com/YouFoundJK/plugin-full-calendar/issues/91)
    _Parsing issues in Remote ICS calendar is fixed and should now load properly._

---

## Version 0.11.9

-   **New:** Calendar Workspaces (#90)  
    _Save and switch between customized calendar setups (sources, filters, and view preferences). Workspaces include a header switcher, a command palette action ("Full Calendar: Switch Workspace"), and an optional default workspace on startup. Saved state covers selected sources (Local, Daily Notes, ICS, CalDAV, Google), category/sub‑category filters, tasks visibility, all‑day toggle, initial view (month/week/day/timeline), week start, and time‑grid display options._

-   **Improvement:** Faster Switching and Rendering  
    _Workspace application is incremental (sources → filters → view) to avoid full calendar rebuilds. Switching preserves context where possible (e.g., scroll/selection) and significantly improves responsiveness on large vaults._

-   **Improvement:** Workspace Management UX  
    _Add Save as Workspace, Rename, Delete in the calendar header menu; set a Default Workspace in Settings; and assign hotkeys through Obsidian’s Hotkeys for one‑press switching._

-   **Fix:** Edit Modal Sub‑category Parsing  
    _Fixes a regression where sub‑categories could disappear when editing the title in the modal. The title parser now consistently preserves the `Category - SubCategory - Title` format on save._

-   **Fix:** Workspace Persistence Edge Cases  
    _Improved robustness when loading a workspace that references a removed or renamed source. Adds safe fallbacks to an "All Events" view and clearer status messaging._

---

## Version 0.11.8

-   **New:** Business Hours and Background Events Support
    _Highlight working hours in calendar views and display events as background highlights (e.g., vacations or focus blocks). Configurable via settings and event frontmatter._

-   **New:** Timeline View Category Shadow Events (#76)
    _Adds optional display of category shadow events in Timeline View for better visual context and planning._

-   **New:** Real-Time Duplicate Event Validation (#67)
    _Prevents creation of duplicate events in the calendar interface, improving scheduling accuracy._

-   **Improvement:** Edit Modal Now Supports Subcategory Editing
    _The "Edit Event" modal now parses and displays sub-categories directly in the event title. Users can edit them inline and changes are preserved._

-   **Improvement:** Settings Modal Reorganization and Footer
    _UI updates include reorganized settings for better clarity, hover hints for display options, and a new footer for versioning and help links._

-   **Improvement:** Configuration Migration for Legacy Support
    _Legacy settings like `subprojectKeywords_exclude` are migrated automatically, and missing fields (e.g., `persona`) are filled safely._

-   **Improvement:** Type Safety and Safer DOM Manipulations (#69, #71)
    _Removed unsafe type assertions across key modules (`DailyNoteCalendar`, `GoogleCalendar`, `interop`) and introduced robust DOM update utilities (`safeCreateEl`, `safeEmpty`)._

-   **Fix:** Recurring Task Completion Preserves Child Timing (#75)
    _Undoing completed recurring tasks now correctly retains the timing of override events. Adds full test coverage for various edge cases._

-   **Fix:** All-Day Events Treated as Floating in RRULE
    _All-day recurring events now behave correctly as floating events, fixing unintended start time offsets._

-   **Test:** Coverage for Business Hours, Background Events, and Override Logic
    _New test suites validate schema correctness, UI rendering, and recurring timing behavior._

---

## Version 0.11.7

-   **New:** Full Google Calendar Integration with Two‑Way Sync
    _Connect your Google account to create, modify, and delete events (including recurring events) directly in Obsidian. Includes OAuth 2.0 authentication, calendar selection, and proper token refresh handling._

-   **Improvement:** Centralized and Reusable Form Components
    _Inputs like URL, Username, Password, Directory Select, and Heading have been refactored into dual‑mode primitives with a `readOnly` mode for consistent display. A generic `TextInput` replaces one‑off components._

-   **Improvement:** Modularized Settings Tab and Changelog Component
    _Settings sections are now organized into dedicated renderers with improved type safety. A new `Changelog.tsx` component has been added for clearer update visibility._

-   **Improvement:** Unified Event Parsing Pipeline
    _Calendar parsers now output raw events without settings dependencies and pass them through a single `enhanceEvent` function for category logic. Tests have been updated to separately verify raw parsing and enhancement._

-   **Improvement:** Modular Event Cache Management
    _The `EventCache` logic is split into dedicated modules (`RemoteCacheUpdater`, `LocalCacheUpdater`, `IdentifierManager`, `RecurringEventManager`), making synchronization and recurring event handling more reliable._

-   **Fix:** Daily Note Calendar Parsing and Cache Update Logic
    _Parsing bugs in `DailyNoteCalendar` have been fixed, and `modifyEvent` now correctly flags dirty events to ensure the UI updates when frontmatter changes (e.g., `skipDate`)._

-   **Other:** Codebase Refactor for Type Safety and Maintainability
    _Shared types and utilities have been centralized, internal names clarified, and redundant code removed—all without changing user‑facing behavior._

---

## Version 0.11.6

-   **New:** Advanced Categorization with Hierarchical Timeline View  
    _Events can now be organized by categories and sub-categories in a new Resource Timeline view. Expandable groups and aggregated parent rows make it easier to manage complex schedules._

-   **New:** Drag-and-Drop Category Reassignment  
    _Change an event’s category or sub-category directly from the timeline view by dragging it to a different lane. Titles and metadata update automatically._

-   **Improvement:** Cleaner UI and Initial View Options  
    _The event modal and settings UI have been polished with dropdown options and a new initial view setting that supports the timeline view._

-   **Improvement:** Smarter Event Titles and Filenames  
    _Events now display clearer titles (e.g., `SubCategory - Event Name`) while keeping filenames and internal data consistent._

-   **Fix:** Multi-Level Category Parsing  
    _Parsing of event titles with multiple category levels (e.g., `Category - SubCategory - Title`) has been fixed, ensuring correct category and sub-category assignment._

-   **Other:** License Update  
    _The plugin license has been updated to GPLv3 to comply with FullCalendar requirements._

---

## Version 0.11.5-beta

-   **New:** Monthly and Yearly Recurring Events  
    _You can now create events that repeat every month or every year — perfect for things like anniversaries, billing cycles, or project reviews._

-   **New:** Smarter "Repeats" Menu in Event Modal  
    _The old "Recurring" checkbox is gone. Instead, use a new dropdown to choose from Weekly, Monthly, or Yearly recurrence. The UI updates dynamically to match your selection._

-   **Improvement:** Human-Friendly Filenames for Recurring Notes  
    _Recurring event notes now get cleaner, more descriptive names like `(Every year on July 30th) My Event.md`._

-   **Improvement:** Enhanced Timezone and All-Day Support  
    _Timezone handling for recurring events is now more accurate, and All-Day events display correctly across time boundaries._

-   **Fix:** Right-Click Task Toggle for Recurring Tasks  
    _Recurring tasks can now be marked as complete using the right-click menu, just like one-off tasks._

-   **Fix:** Safer Rendering and UI Cleanups  
    _Removed use of unsafe HTML injection in the UI. Improved event rendering, loading states, and general UI responsiveness._

---

## Version 0.11.4

-   **New:** Smarter Recurring Events and Tasks  
    _Recurring events can now be edited per-instance — drag, resize, or complete a task without affecting the whole series. Changes are reversible and tracked cleanly._

-   **Improvement:** Safe Deletion with Confirmation Options  
    _Deleting a recurring event now asks whether to remove just one instance, the entire series, or promote existing edits to standalone events._

-   **Improvement:** Better Task Behavior for Repeating Events  
    _Recurring tasks now behave just like regular ones — you can check them off individually, and they show up correctly in the calendar._

-   **Fix:** Multi-day all-day events fix by @yalikebaz 
  _Multi-day all-day events made inclusive for local calendars. Thanks to @yalikebaz for the fix!_

-   **Fix:** Performance and Architecture Improvements 
    _Refactored recurring event logic, improved performance on large calendars, and cleaned up the plugin architecture to prepare for future features._

---
## Version 0.11.3

- **New:** Insights Engine has smarter Dashboard with Personas  
  _Adding persona (predefined rules like "Productivity", "Routine") to Categories in Insight Config Setting now cater to more powerful analysis._
- **Fix:** Insights Panel and Dashboard Bugfixes  
  _Multiple bugfixes and UI adjustments focused on the Insights panel._

---

## Version 0.11.2

- **New:** Insights Engine in ChronoAnalyser  
  _New intelligent engine that can analyse your calendar for past events and give you cool insights._
- **Improvement:** Redesigned ChronoAnalyser UI/UX  
  _Chronoanalyser now much more elegant. Check it using the `Analysis` button in the Full-Calendar Window._
- **Fix:** Multiple Bugfixes in ChronoAnalyser  
  _Make ChronoAnalyser more stable and reliable. Plotting and Insights now work more reliably._

---

## Version 0.11.1

- **New:** Category Coloring Engine and Settings UI  
  _A new optional setting, 'Enable Category Coloring,' allows you to color events based on a category defined in the event's title (e.g., 'Work - Project Meeting'). This overrides the default calendar color for fine-grained visual organization._
- **New:** Category-Aware Event Modal  
  _The Edit/Create Event modal now features a dedicated 'Category' input field. It provides intelligent autocomplete suggestions based on all your previously used categories, making categorization fast and consistent._
- **Improvement:** Redesigned Event Modal UI/UX  
  _The Edit/Create Event modal has been completely redesigned with a polished two-column layout, logical grouping of fields, and a dedicated footer for actions, improving clarity and ergonomics._
- **Improvement:** Color Palette Enhancements  
  _Colors no longer default to black, but are now rotated from a carefully chosen Palette._
- **Improvement:** "Open Note" Workflow Enhancement  
  _Clicking 'Open Note' in the modal now opens the note in a split view, improving calendar-note navigation._

---

## Version 0.10.13-beta

- **Improvement:** Robust Timezone Support  
  _Events from local and remote calendars are now fully timezone-aware, fixing bugs related to DST and travel._
- **New:** Strict Timezone Mode for Daily Notes  
  _A new setting allows users to anchor daily note events to a specific timezone, just like regular notes._
- **Fix:** Correctly Parse UTC Events from ICS Feeds  
  _Fixed a critical bug where events specified in UTC from Google Calendar and other sources would appear at the wrong time._

---

## Version 0.10.8

- **New:** ChronoAnalyser Released  
  _ChronoAnalyser can now analyse your time spending! Check the new `Analysis` button in the Full-Calendar Window._

---

## Version 0.10.7

- **New:** Initial Plugin Release  
  _Welcome to the first version of the enhanced Full Calendar!_

---

_For a summary of major features, see [What's New](whats_new.md)._
