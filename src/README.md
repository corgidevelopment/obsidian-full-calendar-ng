[![Version](https://img.shields.io/badge/Version-v0.12.0-blue)](https://github.com/YouFoundJK/plugin-full-calendar)

# Full Calendar Plugin - Developer Documentation

Obsidian Full Calendar's goal is to give users a robust and feature-ful calendar view into their Obsidian Vault. In addition to displaying and modifying events stored in note frontmatter and daily note bulleted lists, it can also read events from remote sources like Google Calendar, CalDAV servers, and public ICS feeds.

This plugin uses [FullCalendar.io](https://github.com/fullcalendar/fullcalendar) as its view layer. While the naming can be ambiguous, this document will always refer to the view library as `FullCalendar.io`. The plugin will be referred to as "the plugin," "Full Calendar," or "Obsidian Full Calendar."

As of now, the plugin supports events from the following sources:

*   **Local Notes**: Frontmatter of notes in the open Obsidian Vault.
*   **Daily Notes**: Bulleted list items under a specified heading in Daily Notes.
*   **Google Calendar**: Two-way synchronization with Google Calendar via OAuth 2.0.
*   **CalDAV**: Read-only access to CalDAV servers (e.g., iCloud, Fastmail).
*   **ICS**: Read-only access to public `.ics` URLs.

This document provides a comprehensive overview of the plugin's architecture, data flows, and key concepts for developers.

```
.--------------------------.        .--------------------------.
| LEGEND                   |        | DATA FLOWS               |
| ──►  Direct Call         |        | ┌──> User-Initiated Write|
| ◄──► Internal R/W        |        | ├──> Filesystem Sync     |
| ◄──  Service Call        |        | └──> Remote Sync         |
| ..> Pub/Sub Notification |        '--------------------------'
| ~>  Specialized Link     |
'--------------------------'

                         ┌───────────────────────────────────────┐
               ┌───────► │  UI Layer (CalendarView + React UI)   │
               |         └───────────────────────────────────────┘
.─────────────────────.                   |                  
|     ViewEnhancer    |                   │ (User clicks/edit modal)
| (Filtering/View VM) |                   │      "CRUD Ops"
'─────────────────────'                   ▼                  
               ▲         ┌───────────────────────────────────────────┐        
(..> Pub/Sub   │         │    CORE Layer: EventCache (Single SoT)    │         ┌───────────────────┐
update notify) │         │  - Optimistic updates                     │ <.....> |  ChronoAnalyser   |
               └──────── │  - Orchestrates C/U/D                     │         └───────────────────┘
                         │  - Pub/Sub hub                            │
                         └───────────────────────────────────────────┘
                                            │
                                            │ (Delegate I/O)
                                            ▼
                            ┌─────────────────────────────────┐
                            │         EventEnhancer           │
                            │   (Stateless Data Transformer)  │     (Potential location of
                            │ - Enhance raw → canonical       │        new features)
                            │ - Prepare canonical → raw       │
                            └─────────────────────────────────┘
                                            │
                                            │ (Provider dispatch)
                                            ▼
                            ┌─────────────────────────────────┐
                            │    ProviderRegistry (I/O Hub)   │
                            │ - Calls providers getEvents()   │
                            │ - Maps IDs ↔ session IDs        │
                            │ - Routes read/write ops         │
                            └─────────────────────────────────┘
                                          │
                        ┌─────────────────┴───────────────┐
                        ▼                                 ▼  
            ┌────────────────────┐              ┌────────────────────┐
            │  local Providers   │              │ remote Providers   │
            │                    │              │ - Google API auth  │
            └────────────────────┘              └────────────────────┘ 
                    │                                    │                
                    │ "Delegate File Ops"                │ 
                    ▼                                    |                     
        ┌───────────────────────────┐                    |
        │      ObsidianAdapter      │                    |
        │ - Wraps vault + file API  │                    |  "Remote Sync"            
        └───────────────────────────┘                    |
                        │                                |
                        |   "Filesystem Sync"            |
                        ▼                                ▼
           ┌───────────────────────────┐       ┌────────────────────┐
           │   Obsidian Vault APIs*    │       │     Internet*      │
           └───────────────────────────┘       └────────────────────┘

 * Components with an asterisk are not part of the plugin's code.
```

## Table of Contents

1.  [Architecture Overview](#architecture-overview)
2.  [Core Components In-Depth](#core-components-in-depth)
    *   [The Provider System (`providers/`)](#the-provider-system-providers)
    *   [EventCache & EventStore: The State Engine](#eventcache--eventstore-the-state-engine)
    *   [EventEnhancer: The Data Normalizer](#eventenhancer-the-data-normalizer)
    *   [ViewEnhancer & WorkspaceManager: The Presentation Layer](#viewenhancer--workspacemanager-the-presentation-layer)
    *   [Feature Managers (`features/`)](#feature-managers-features)
    *   [The UI Layer (`ui/`)](#the-ui-layer-ui)
3.  [Data Flow and State Management](#data-flow-and-state-management)
    *   [Flow 1: Initial Load & Remote Sync](#flow-1-initial-load--remote-sync)
    *   [Flow 2: User-Initiated Change (e.g., Drag-and-Drop)](#flow-2-user-initiated-change-eg-drag-and-drop)
    *   [Flow 3: Filesystem-Initiated Change (e.g., External Edit)](#flow-3-filesystem-initiated-change-eg-external-edit)
4.  [Key Concepts](#key-concepts)
    *   [Data Normalization Pipeline](#data-normalization-pipeline)
    *   [Event Identifier System](#event-identifier-system)
    *   [Recurring Event Overrides](#recurring-event-overrides)
5.  [Key Developer Hooks](#key-developer-hooks)
    *   [Adding a New Calendar Provider](#adding-a-new-calendar-provider)
    *   [Subscribing to Cache Updates](#subscribing-to-cache-updates)

## Architecture Overview

The plugin is architected in distinct layers to promote separation of concerns, testability, and extensibility.

1.  **UI Layer (`ui/`)**: The top-most layer, responsible for rendering the calendar and settings. It is composed of the main `CalendarView` (which hosts FullCalendar.io) and various React components for modals and settings panes. It is concerned only with presentation and user input.

2.  **Presentation Layer (`core/ViewEnhancer.ts`)**: A thin but critical layer that sits between the UI and the core business logic. The `ViewEnhancer` and its composed `WorkspaceManager` take raw data from the `EventCache` and apply all active workspace settings (filters, configuration overrides) before passing it to the UI. This keeps the UI "dumb" and centralizes presentation logic.

3.  **Core Layer (`core/`, `features/`)**: This is the plugin's brain.
    *   `EventCache` is the single source of truth for all event data, managing state and orchestrating updates.
    *   `EventStore` is the efficient in-memory database for events.
    *   `EventEnhancer` normalizes all incoming and outgoing event data (timezone conversion, category parsing).
    *   Specialized managers in `features/` (like `RecurringEventManager`) handle complex business logic delegated by the `EventCache`.

4.  **Provider Layer (`providers/`)**: This layer is responsible for data acquisition and persistence.
    *   `ProviderRegistry` manages the lifecycle of all available data sources.
    *   Each `CalendarProvider` implementation knows how to read, create, update, and delete events for a specific source (e.g., `FullNoteProvider`, `GoogleProvider`).

5.  **Abstraction Layer (`ObsidianAdapter.ts`)**: Decouples local providers from the core Obsidian API (`app`) by wrapping file I/O in a clean, testable interface.

## Core Components In-Depth

### The Provider System (`providers/`)

This is the new foundation for data sources, replacing the old inheritance-based calendar system.

*   **`Provider` Interface (`Provider.ts`)**: Defines the contract all data sources must adhere to. Key methods include `getEvents`, `createEvent`, `updateEvent`, `deleteEvent`, and `getCapabilities`.
*   **`ProviderRegistry` (`ProviderRegistry.ts`)**: A singleton that acts as the master controller for all data sources.
    *   **Responsibilities**:
        *   Registers all available `Provider` classes at startup.
        *   Instantiates and manages a `Provider` instance for each calendar source defined in the user's settings.
        *   Acts as the single entry point for the `EventCache` to fetch data (`fetchAllEvents`) and delegate I/O (`createEventInProvider`, etc.).
        *   Handles Vault event listeners (`on('changed')`, etc.) and routes file updates to the correct local provider instance.
        *   Manages the Event Identifier System.
*   **Implementations**: Each subdirectory contains a provider for a specific source (e.g., `fullnote/FullNoteProvider.ts`, `google/GoogleProvider.ts`). The provider encapsulates all logic for its source, including parsing raw data into `OFCEvent`s and serializing `OFCEvent`s back into the source format.

### EventCache & EventStore: The State Engine

*   **`EventCache` (`core/EventCache.ts`)**: The central nervous system of the plugin.
    *   **Responsibilities**:
        *   **State Management**: Holds the master list of all events in its internal `EventStore`.
        *   **Orchestration**: It does *not* fetch data directly. It requests data from the `ProviderRegistry` and receives updates.
        *   **CRUD API**: Provides the public API (`addEvent`, `deleteEvent`, `updateEventWithId`) for the UI and feature managers. These methods are optimistic: they update the local state and UI immediately, then asynchronously perform the real I/O via the `ProviderRegistry`, with rollback logic on failure.
        *   **Pub/Sub Hub**: The `CalendarView` subscribes to its `on('update', ...)` method to receive notifications of data changes.
        *   **Logic Delegation**: Uses specialized feature managers (e.g., `RecurringEventManager`) for complex operations.

*   **`EventStore` (`core/EventStore.ts`)**: An efficient in-memory database.
    *   **Responsibilities**:
        *   **Primary Index**: Stores all events in a `Map` keyed by a unique session ID.
        *   **Secondary Indexes**: Maintains indexes for fast lookups by calendar ID and file path, preventing costly full scans.

### EventEnhancer: The Data Normalizer

> `core/EventEnhancer.ts` is a critical new component that centralizes data transformation.

It provides a two-way pipeline for event data:

1.  **Read Path (`enhance`)**: When events are read from any provider, they pass through this function. It applies:
    *   **Category Parsing**: Splits titles like `"Work - Project Meeting"` into `{ category: 'Work', title: 'Project Meeting' }`.
    *   **Timezone Conversion**: Converts the event's time from its source timezone to the user's selected "Display Timezone."

2.  **Write Path (`prepareForStorage`)**: When an event is about to be saved back to a provider, it passes through this function. It applies the reverse transformations:
    *   **Title Construction**: Combines `category` and `title` fields back into a single string.
    *   **Timezone Conversion**: Converts the event's time from the "Display Timezone" back to its source timezone.

This ensures that all logic within the plugin's core operates on a consistent, normalized `OFCEvent` object, regardless of its origin or destination.

### ViewEnhancer & WorkspaceManager: The Presentation Layer

These components bridge the gap between the raw data in the `EventCache` and the final rendered view.

*   **`ViewEnhancer` (`core/ViewEnhancer.ts`)**: The single point of contact for the `CalendarView`. It takes all event sources from the cache and uses its composed `WorkspaceManager` to produce the final data package for rendering.
*   **`WorkspaceManager` (`features/workspaces/WorkspaceManager.ts`)**:
    *   **Responsibilities**:
        *   Determines the active workspace from settings.
        *   Applies workspace-specific **configuration overrides** (e.g., different initial view, custom business hours).
        *   Applies workspace-specific **data filters** by filtering the list of calendar sources and the events within them based on the active workspace's settings.

### Feature Managers (`features/`)

These classes are specialized services that encapsulate complex business logic, keeping the `EventCache` focused on state management.

*   **`RecurringEventManager`**: Manages all logic for recurring event overrides (the "skip and override" strategy), deletion prompts, and parent-child synchronization.
*   **`GoogleAuthManager`**: Centralizes all logic for Google account OAuth 2.0 flows, token storage, and token refreshing.
*   **`bulkCategorization.ts`**: Contains stateless functions for performing vault-wide category updates, triggered from the settings UI.

### The UI Layer (`ui/`)

*   **`CalendarView` (`ui/view.ts`)**: The main Obsidian `ItemView`.
    *   **Responsibilities**:
        *   Initializes and manages the FullCalendar.io instance.
        *   Subscribes to the `EventCache` for updates.
        *   Uses the `ViewEnhancer` to get the final, filtered data and configuration for rendering.
        *   Translates user interactions (clicks, drags) into calls to the `EventCache`'s CRUD API.
        *   Uses `core/interop.ts` to convert between the internal `OFCEvent` and FullCalendar.io's `EventInput` formats.
*   **React Components**: Used for all complex UI, such as the event creation modal (`EditEvent.tsx`) and the entire settings tab (`SettingsTab.tsx`).

## Data Flow and State Management

### Flow 1: Initial Load & Remote Sync

1.  **`main.ts`**: On load, `plugin.cache.populate()` is called.
2.  **`EventCache`**: Calls `plugin.providerRegistry.fetchAllEvents()`.
3.  **`ProviderRegistry`**: Iterates through all instantiated providers, calling `getEvents()` on each.
4.  **Providers**: Local providers read from the vault; remote providers make network requests. Each returns raw event data.
5.  **`ProviderRegistry`**: As results come in, they are passed through `cache.enhancer.enhance()` for normalization. The normalized events are aggregated.
6.  **`EventCache`**: Receives the full list of normalized events and populates its `EventStore`.
7.  **`CalendarView`**: On open, it gets the initial data from the cache via the `ViewEnhancer` and renders.
8.  **Remote Sync**: A re-validation is triggered (e.g., on mouse-enter). The flow from step 2 is repeated for remote providers only. `EventCache` then receives the new data, diffs it with the old state in its `EventStore`, and publishes an update notification to the `CalendarView`.

### Flow 2: User-Initiated Change (e.g., Drag-and-Drop)

1.  **`CalendarView`**: FullCalendar.io's `eventDrop` callback is triggered. It translates the UI event into an `OFCEvent` and calls `plugin.cache.updateEventWithId()`.
2.  **`EventCache`**:
    *   **Optimistic Update**: Immediately updates its internal `EventStore` with the new event data.
    *   **UI Notification**: Publishes an "update" event, causing the `CalendarView` to reflect the change instantly.
    *   **I/O Delegation**: Calls `plugin.providerRegistry.updateEventInProvider()`, passing the event data.
3.  **`ProviderRegistry`**: Looks up the correct provider instance and calls its `updateEvent` method.
4.  **`Provider`**:
    *   The event data is passed through `cache.enhancer.prepareForStorage()` to de-normalize it (e.g., reconstruct title, convert timezone back).
    *   The provider serializes the de-normalized event and writes it to the file or sends it to the API.
5.  **Rollback**: If the provider's write operation fails, an error is thrown. The `EventCache` catches it, reverts the change in its `EventStore`, and sends another UI notification to revert the optimistic update.

### Flow 3: Filesystem-Initiated Change (e.g., External Edit)

1.  **Obsidian**: A user edits a note. Obsidian fires a `metadataCache.on('changed', ...)` event.
2.  **`main.ts`**: The listener calls `plugin.providerRegistry.handleFileUpdate(file)`.
3.  **`ProviderRegistry`**:
    *   Identifies which local provider(s) are responsible for the changed file.
    *   Calls `getEventsInFile(file)` on the relevant provider(s).
4.  **`Provider`**: Reads the file, parses the new event data, and returns the raw events.
5.  **`ProviderRegistry`**: Aggregates the results and calls `cache.syncFile()` with the definitive new state of events for that file.
6.  **`EventCache`**:
    *   Passes the new raw events through `enhancer.enhance()` for normalization.
    *   Compares the new normalized events to the old state for that file in its `EventStore`.
    *   Atomically updates the `EventStore` (removes old, adds new).
    *   Publishes a single, batched update notification to the `CalendarView`.

## Key Concepts

### Data Normalization Pipeline

The `EventEnhancer` is central to ensuring data consistency. Every event, regardless of source, goes through this pipeline:

`Source (File/API)` -> `Provider.getEvents()` -> `EventEnhancer.enhance()` -> `EventCache` -> `ViewEnhancer` -> `UI`

And for writing data back:

`UI` -> `EventCache.updateEvent()` -> `EventEnhancer.prepareForStorage()` -> `Provider.updateEvent()` -> `Source (File/API)`

### Event Identifier System

Managed by the `ProviderRegistry`, this system enables stable cross-references (e.g., for recurring event overrides).

1.  **Session ID**: A transient, auto-incrementing number assigned to every event when the cache is populated. Used by the UI.
2.  **Global Identifier**: A persistent, unique string created by combining the calendar's ID and the event's source-specific persistent ID (e.g., `google_1::A_GOOGLE_EVENT_ID` or `local_1::path/to/note.md`).

The registry maintains a `Map` to look up the session ID from the global ID.

### Recurring Event Overrides

Handled by the `RecurringEventManager`, this uses a "skip and override" strategy. When a single instance of a recurring event is modified:

1.  **Skip**: The date of the original instance is added to the parent event's `skipDates` array.
2.  **Override**: A *new* `single` event is created with the modified properties. This new event has a `recurringEventId` property that points back to its parent's persistent ID.

## Key Developer Hooks

### Adding a New Calendar Provider

1.  **Create Config Type**: In a new `providers/mynewprovider/typesMyNewProvider.ts`, define the Zod schema and TypeScript type for the provider's configuration.
2.  **Create Config Component**: In `providers/mynewprovider/MyNewProviderConfigComponent.tsx`, create the React component for the settings modal. It will receive props like `onSave` and `onClose`.
3.  **Create Provider Class**: In `providers/mynewprovider/MyNewProvider.ts`, create a class that implements the `CalendarProvider` interface.
    *   Implement all required methods (`getEvents`, `createEvent`, etc.). For read-only providers, these can throw an error.
    *   Add static properties `type` and `displayName`, and a static method `getConfigurationComponent` that returns your React component.
4.  **Register Provider**: In `providers/ProviderRegistry.ts`, import your new provider class and add it in the `registerBuiltInProviders` method.
5.  **Instantiate Provider**: In `ProviderRegistry.initializeInstances()`, add a `case` for your new provider's type to correctly instantiate it.
6.  **Update Settings UI**: In `ui/settings/SettingsTab.tsx`, add your new provider to the dropdown in `addCalendarButton`.

### Subscribing to Cache Updates

If you build a new UI component that needs to display live event data, subscribe to the `EventCache`.

```typescript
// In your view's onOpen() or component's useEffect
const callback = this.plugin.cache.on('update', payload => {
    if (payload.type === 'events') {
        // Handle payload.toAdd and payload.toRemove
    } else if (payload.type === 'resync') {
        // Re-fetch all events from the cache and re-render
    } else if (payload.type === 'calendar') {
        // A specific calendar source has been updated
    }
});

// In your view's onunload() or component's cleanup function
this.plugin.cache.off('update', callback);
```

## Development and Tooling

*   **Language**: TypeScript
*   **UI Framework**: React for modals and complex settings panes.
*   **Data Validation**: Zod (`types/schema.ts`) is used for robust parsing and validation of event data.
*   **Calendar Engine**: [FullCalendar.io](https://fullcalendar.io/) is the core library used for rendering the calendar view.
*   **Testing**: The project uses Jest for unit testing. The `ObsidianAdapter` is key to making components testable. To run tests, use `npm test`.