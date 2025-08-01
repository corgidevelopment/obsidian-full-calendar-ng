// src/ui/changelogData.ts

export interface Change {
  type: 'new' | 'fix' | 'improvement';
  title: string;
  description: string;
}

export interface Version {
  version: string;
  changes: Change[];
}

// Add new versions to the TOP of this array.
export const changelogData: Version[] = [
  {
    version: '0.11.6',
    changes: [
      {
        type: 'new',
        title: 'Advanced Categorization with Hierarchical Timeline View',
        description:
          'Events can now be organized by categories and sub-categories in a new Resource Timeline view. Expandable groups and aggregated parent rows make it easier to manage complex schedules.'
      },
      {
        type: 'new',
        title: 'License Update',
        description:
          'The plugin license has been updated to GPLv3 to comply with FullCalendar requirements.'
      },
      {
        type: 'improvement',
        title: 'Cleaner UI and Initial View Options',
        description:
          'The event modal and settings UI have been polished with dropdown options and a new initial view setting that supports the timeline view.'
      },
      {
        type: 'improvement',
        title: 'Smarter Event Titles and Filenames',
        description:
          'Events now display clearer titles (e.g., "SubCategory - Event Name") while keeping filenames and internal data consistent.'
      }
    ]
  },

  {
    version: '0.11.5-beta',
    changes: [
      {
        type: 'new',
        title: 'Monthly and Yearly Recurring Events',
        description:
          'You can now create events that repeat every month or every year — perfect for anniversaries, billing cycles, or annual planning.'
      },
      {
        type: 'new',
        title: 'Repeats Dropdown in Event Modal',
        description:
          'Replaced the old recurring checkbox with a dropdown menu for choosing None, Weekly, Monthly, or Yearly recurrence, with context-aware controls.'
      },
      {
        type: 'improvement',
        title: 'Descriptive Filenames for Recurring Notes',
        description:
          'Recurring events now generate clean, readable filenames like "(Every month on the 15th) My Event.md".'
      },
      {
        type: 'improvement',
        title: 'Improved Timezone and All-Day Support',
        description:
          'Timezone handling for recurring events has been refined, and all-day recurring events now display correctly.'
      },
      {
        type: 'fix',
        title: 'Right-Click Toggle for Recurring Tasks',
        description:
          'Recurring tasks can now be marked complete via right-click, just like one-time tasks.'
      }
    ]
  },
  {
    version: '0.11.4',
    changes: [
      {
        type: 'new',
        title: 'Smarter Recurring Events and Tasks',
        description:
          'Recurring events can now be edited per-instance — drag, resize, or complete a task without affecting the whole series. Changes are reversible and tracked cleanly.'
      },
      {
        type: 'improvement',
        title: 'Safe Deletion with Confirmation Options',
        description:
          'Deleting a recurring event now asks whether to remove just one instance, the entire series, or promote existing edits to standalone events.'
      },
      {
        type: 'improvement',
        title: 'Better Task Behavior for Repeating Events',
        description:
          'Recurring tasks now behave just like regular ones — you can check them off individually, and they show up correctly in the calendar.'
      },
      {
        type: 'fix',
        title: 'Multiday Allday events fix by @yalikebaz',
        description:
          'Multiday Allday events made inclusive for local calenders. Thanks to @yalikebaz for the fix!'
      },
      {
        type: 'fix',
        title: 'Performance and Architecture Improvements',
        description:
          'Refactored recurring event logic, improved performance on large calendars, and cleaned up the plugin architecture to prepare for future features.'
      }
    ]
  },
  {
    version: '0.11.3', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Insights Engine has smarter Dashboard with Personas',
        description:
          'Adding persona (predefined rules like "Productivity", "Routine") to Categories in Insight Config Setting now cater to more powerful analysis.'
      },
      {
        type: 'fix',
        title: 'Insights Panel and Dashboard Bugfixes',
        description: 'Multiple bugfixes and UI adjustments focused on the Insights panel.'
      }
    ]
  },
  {
    version: '0.11.2', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Insights Engine in ChronoAnalyser',
        description:
          'New intelligent engine that an Analyse your calender for past events and give you cool insights.'
      },
      {
        type: 'improvement',
        title: 'Redesigned ChronoAnalyser UI/UX',
        description:
          'Chronoanalyser now much more elegant. Check it using the `Analysis` button in the Full-Calendar Window.'
      },
      {
        type: 'fix',
        title: 'Multiple Bugfixes in ChronoAnalyser',
        description:
          'Make CHronoAnalyser more stable and reliable. Plotting and Insights now work more reliably.'
      }
    ]
  },
  {
    version: '0.11.1', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'new',
        title: 'Category Coloring Engine and Settings UI',
        description:
          "A new optional setting, 'Enable Category Coloring,' allows you to color events based on a category defined in the event's title (e.g., 'Work - Project Meeting'). This overrides the default calendar color for fine-grained visual organization."
      },
      {
        type: 'new',
        title: 'Category-Aware Event Modal',
        description:
          "The Edit/Create Event modal now features a dedicated 'Category' input field. It provides intelligent autocomplete suggestions based on all your previously used categories, making categorization fast and consistent."
      },
      {
        type: 'improvement',
        title: 'Redesigned Event Modal UI/UX',
        description:
          'The Edit/Create Event modal has been completely redesigned with a polished two-column layout, logical grouping of fields, and a dedicated footer for actions, improving clarity and ergonomics.'
      },
      {
        type: 'improvement',
        title: 'Color Palette Enhancements',
        description:
          'Colors no longer defaults to black, but is now rotated from a carefully choosen Palette.'
      },
      {
        type: 'improvement',
        title: '"Open Note" Workflow Enhancement',
        description:
          "Clicking 'Open Note' in the modal now opens the note in a split view, improving calendar-note navigation."
      }
    ]
  },
  {
    version: '0.10.13-beta', // This would be our current version with the timezone fixes
    changes: [
      {
        type: 'improvement',
        title: 'Robust Timezone Support',
        description:
          'Events from local and remote calendars are now fully timezone-aware, fixing bugs related to DST and travel.'
      },
      {
        type: 'new',
        title: 'Strict Timezone Mode for Daily Notes',
        description:
          'A new setting allows users to anchor daily note events to a specific timezone, just like regular notes.'
      },
      {
        type: 'fix',
        title: 'Correctly Parse UTC Events from ICS Feeds',
        description:
          'Fixed a critical bug where events specified in UTC from Google Calendar and other sources would appear at the wrong time.'
      }
    ]
  },
  {
    version: '0.10.8',
    changes: [
      {
        type: 'new',
        title: 'ChronoAnalyser Released',
        description:
          'ChronoAnalyser can now analyse you time spending! Check the new `Analysis` button in the Full-Calender Window.'
      }
    ]
  },
  {
    version: '0.10.7',
    changes: [
      {
        type: 'new',
        title: 'Initial Plugin Release',
        description: 'Welcome to the first version of the enhanced Full Calendar!'
      }
    ]
  }
];
