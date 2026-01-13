[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-green.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Version](https://img.shields.io/badge/Version-v_0.10.12-blue)](https://youfoundjk.github.io/Time-Analyser-Full-Calendar/)

# Chrono Analyser Subproject

> Note that `chrono_analyser` subproject is licensed under [CC-by-nc-sa-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) and not under MIT as the main plugin!

## 1. Overview

ChronoAnalyser is the interactive data visualization component for the Full Calendar plugin. Its primary purpose is to parse time-tracking data from "Full Note" calendars, aggregate it, and render interactive charts and statistics for analysis.

This document details the internal architecture and data flow, intended for developers working on or extending this module.

## 2. Core Architectural Principles

The ChronoAnalyser has been refactored to follow modern development principles, ensuring it is efficient, robust, and easy to maintain.

### Principle 1: Single Source of Truth

The ChronoAnalyser is a **data consumer**, not a data source. It does **not** perform any file I/O or maintain its own separate cache.

-   **Upstream Data:** All event data is sourced directly from the main plugin's `EventCache`. This eliminates data duplication, parsing inconsistencies, and race conditions.
-   **Real-Time Updates:** It subscribes to the `EventCache` and receives real-time updates whenever an event is created, modified, or deleted anywhere in the vault, ensuring the analysis is always up-to-date.

### Principle 2: Decoupled & Modular Design

The system is broken down into distinct, single-responsibility modules, following a pattern similar to Model-View-Controller (MVC):

-   **Data Layer (`DataService`, `DataManager`, `translator`):** Responsible for fetching, translating, and indexing data for analysis.
-   **Controller Layer (`controller.ts`):** The central orchestrator that manages application state and connects the data layer to the UI.
-   **View/UI Layer (`UIService`, `plotter.ts`, `dom.ts`):** Manages all DOM rendering, user interactions, and event handling.

### Principle 3: Extensible Charting via Strategy Pattern

Adding new chart types is designed to be a straightforward process. The `AnalysisController` uses a **Strategy Pattern**, where each chart type is a self-contained "strategy" that defines how to process data and render itself. This keeps the core controller logic clean and makes the system highly extensible.

## 3. Data Flow

The flow of data from the main plugin to a rendered chart is unidirectional and clear:

```mermaid
graph TD
    A[Obsidian Vault Events] --> B{EventCache (Main Plugin)};
    B --> C[DataService];
    subgraph ChronoAnalyser
        C -- StoredEvent[] --> D[translator.ts];
        D -- TimeRecord[] --> E[DataManager];
        E -- Filtered TimeRecords --> F[AnalysisController];
        F -- Data & Config --> G[Chart Strategy];
        G -- Formatted Data --> H[plotter.ts / aggregator.ts];
        H -- Rendered Chart --> I[DOM];
    end
```

1.  **EventCache:** The main plugin's cache holds all `StoredEvent` objects from configured calendar sources.
2.  **DataService:** Subscribes to `EventCache`. On update, it retrieves all events from relevant calendar sources (currently `FullNoteCalendar` types).
3.  **translator.ts:** For each `StoredEvent`, it runs a translation function to convert it into a `TimeRecord`, enriching it with analyser-specific data like `hierarchy`, `project`, and `subproject`.
4.  **DataManager:** Receives all `TimeRecord`s and builds in-memory indexes (`hierarchy`, `project`) for high-performance filtering.
5.  **AnalysisController:** When a user changes a filter, it queries the `DataManager` to get a filtered list of `TimeRecord`s.
6.  **Chart Strategy:** The controller passes the filtered data to the currently active chart strategy.
7.  **plotter.ts / aggregator.ts:** The strategy uses helper modules to perform final aggregations (if needed) and calls the appropriate `Plotter` function to render the chart using Plotly.js.

## 4. Module Breakdown

### Core Logic
-   **`controller.ts` (The Orchestrator):**
    -   Initializes all services.
    -   Triggers the initial population of the main `EventCache` if necessary.
    -   Holds the map of chart strategies (`createChartStrategies`).
    -   Listens for UI filter changes (via `UIService`) and orchestrates the analysis pipeline.
    -   Manages the overall rendering state (`isChartRendered`, `useReact`).

-   **`AnalysisView.ts` (The Entry Point):**
    -   The `ItemView` class registered with Obsidian.
    -   Responsible for creating the base DOM structure and initializing the `AnalysisController` when the view is opened.

### Data Layer
-   **`DataService.ts` (The Bridge):**
    -   Subscribes to the main `EventCache`.
    -   Its primary role is to trigger a repopulation of the `DataManager` whenever the source data changes.
    -   It iterates through the main plugin's configured calendars to find relevant events.

-   **`translator.ts` (The Interpreter):**
    -   Contains the critical business logic for converting a generic `StoredEvent` into a meaningful `TimeRecord`.
    -   **Hierarchy:** Defined as the path of the calendar source folder (e.g., `Calender/Work`).
    -   **Project/Subproject:** Parsed from the event's filename/title. **This is the file to modify if parsing rules need to change.**

-   **`DataManager.ts` (The In-Memory DB):**
    -   Stores all translated `TimeRecord`s in a map.
    -   Maintains indexes on `hierarchy` and `project` for fast filtering.
    -   The `getAnalyzedData()` method is the primary query engine, applying all user-selected filters.

-   **`aggregator.ts` (The Specialist):**
    -   Handles complex, multi-level aggregations that don't fit the single-pass model of `DataManager`.
    -   Currently only used for preparing data for Sunburst charts.

### UI & View Layer
-   **`UIService.ts` (The DOM Manager):**
    -   Manages all DOM event listeners (e.g., dropdown changes, button clicks).
    -   Reads the state of all filter inputs (`getFilterState`).
    -   Handles showing/hiding UI elements and the details popup.
    -   Persists the UI filter state to `localStorage`.

-   **`plotter.ts` (The Renderer):**
    -   A collection of functions that take prepared data and render a specific chart using Plotly.js.
    -   Handles theme integration (dark/light mode) and chart-specific interactions (like click events).

-   **`dom.ts` (The Blueprint):**
    -   A single function that injects the entire static HTML structure of the view into the DOM.

-   **`ui.ts` (UI Components):**
    -   Contains reusable UI components like the `FolderSuggestModal` (currently unused but kept for potential future use) and the `setupAutocomplete` helper.

### Shared
-   **`types.ts`:** Defines shared data structures, most importantly the `TimeRecord` interface.
-   **`utils.ts`:** A collection of pure, stateless helper functions for date manipulation and duration calculation.

## 5. Future Development & Extension Hooks

### Hook 1: Adding a New Chart Type

This is the most common extension point. Follow these steps:

1.  **Add UI Controls (`dom.ts` & `UIService.ts`):**
    -   Add a new `<option>` to the `#analysisTypeSelect` dropdown in `dom.ts`.
    -   If your chart needs specific controls (like a new dropdown), add the HTML for it in `dom.ts` and ensure `UIService.handleAnalysisTypeChange` shows/hides it correctly.
    -   Add logic to `UIService.getChartSpecificFilter` to read the values from your new controls.

2.  **Create Renderer (`plotter.ts` or `aggregator.ts`):**
    -   If the data aggregation is simple, create a new `renderMyNewChart(...)` function in `plotter.ts`.
    -   If the aggregation is complex and hierarchical, add a new function to `aggregator.ts`.

3.  **Implement the Strategy (`controller.ts`):**
    -   In `AnalysisController.createChartStrategies()`, add a new entry to the `strategies` map.
    -   The key should match the `value` of the `<option>` you added in `dom.ts`.
    -   The `render` function will call your new aggregation/plotting functions. It receives the `controller`, `filteredRecords`, `useReact`, and `isNewChartType` as arguments.

### Hook 2: Modifying Data Parsing Logic

If you need to change how `project` or `subproject` are determined (e.g., to read from YAML frontmatter instead of the filename), all the logic is centralized in one place:

-   **Modify `src/chrono_analyser/modules/translator.ts`**.
-   The `storedEventToTimeRecord` function gives you access to the full `StoredEvent`, including the event's frontmatter via `storedEvent.event`. You can add any custom parsing logic here.

### Hook 3: Improving Filter Performance

If the dataset grows very large and filtering becomes slow, the place to add new optimizations is:

-   **Modify `src/chrono_analyser/modules/DataManager.ts`**.
-   You can add new indexes (e.g., by subproject, by date) and update the `getAnalyzedData` method to use them to reduce the number of records it needs to loop through.