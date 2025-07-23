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
