# Full Calendar Changelog

This page provides a detailed breakdown of every version of the Full Calendar plugin, including new features, improvements, and bugfixes.

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
