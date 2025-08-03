# Full Calendar Changelog

This page provides a detailed breakdown of every version of the Full Calendar plugin, including new features, improvements, and bugfixes.

---

## Version 0.11.7

* **New:** Full Google Calendar Integration with Two‑Way Sync
  *Connect your Google account to create, modify, and delete events (including recurring events) directly in Obsidian. Includes OAuth 2.0 authentication, calendar selection, and proper token refresh handling.*

* **Improvement:** Centralized and Reusable Form Components
  *Inputs like URL, Username, Password, Directory Select, and Heading have been refactored into dual‑mode primitives with a `readOnly` mode for consistent display. A generic `TextInput` replaces one‑off components.*

* **Improvement:** Modularized Settings Tab and Changelog Component
  *Settings sections are now organized into dedicated renderers with improved type safety. A new `Changelog.tsx` component has been added for clearer update visibility.*

* **Improvement:** Unified Event Parsing Pipeline
  *Calendar parsers now output raw events without settings dependencies and pass them through a single `enhanceEvent` function for category logic. Tests have been updated to separately verify raw parsing and enhancement.*

* **Improvement:** Modular Event Cache Management
  *The `EventCache` logic is split into dedicated modules (`RemoteCacheUpdater`, `LocalCacheUpdater`, `IdentifierManager`, `RecurringEventManager`), making synchronization and recurring event handling more reliable.*

* **Fix:** Daily Note Calendar Parsing and Cache Update Logic
  *Parsing bugs in `DailyNoteCalendar` have been fixed, and `modifyEvent` now correctly flags dirty events to ensure the UI updates when frontmatter changes (e.g., `skipDate`).*

* **Other:** Codebase Refactor for Type Safety and Maintainability
  *Shared types and utilities have been centralized, internal names clarified, and redundant code removed—all without changing user‑facing behavior.*

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

-   **Fix:** Multiday Allday events fix by @yalikebaz 
    _Multiday Allday events made inclusive for local calenders. Thanks to @yalikebaz for the fix!_

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
