import { CalendarInfo } from './calendar_settings';
// Import lazily-referenced type for chrono analyser configuration.
// Placed inside a type-only import to avoid pulling heavy modules at runtime here.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type { InsightsConfig } from '../chrono_analyser/ui/ui';

export interface BusinessHoursSettings {
  enabled: boolean;
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, etc.
  startTime: string; // Format: 'HH:mm'
  endTime: string; // Format: 'HH:mm'
}

export interface WorkspaceSettings {
  id: string;
  name: string;

  // View Configuration
  defaultView?: {
    desktop?: string;
    mobile?: string;
  };
  defaultDate?: string; // 'today' | 'start-of-month' | 'next-week' | ISO date string

  // Source & Content Filtering
  visibleCalendars?: string[]; // Calendar IDs to show (if empty, show all)
  categoryFilter?: {
    mode: 'show-only' | 'hide'; // Filter mode
    categories: string[]; // List of categories to show/hide
  };

  // Appearance Overrides
  businessHours?: BusinessHoursSettings; // Override global business hours setting
  timelineExpanded?: boolean; // Timeline categories expanded by default
}

export interface GoogleAccount {
  id: string; // A unique identifier for this account
  email: string; // The user's email for display purposes
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
}

export interface FullCalendarSettings {
  calendarSources: CalendarInfo[];
  defaultCalendar: number;
  firstDay: number;
  initialView: {
    desktop: string;
    mobile: string;
  };
  timeFormat24h: boolean;
  clickToCreateEventFromMonthView: boolean;
  displayTimezone: string | null;
  lastSystemTimezone: string | null;
  enableAdvancedCategorization: boolean;
  chrono_analyser_config: InsightsConfig | null;
  categorySettings: { name: string; color: string }[];
  useCustomGoogleClient: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleAccounts: GoogleAccount[];
  businessHours: BusinessHoursSettings;
  enableBackgroundEvents: boolean;
  enableReminders: boolean; // ADD THIS LINE
  workspaces: WorkspaceSettings[];
  activeWorkspace: string | null; // Workspace ID, null means default view
  showEventInStatusBar: boolean; // added
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
  calendarSources: [],
  defaultCalendar: 0,
  firstDay: 0,
  initialView: {
    desktop: 'timeGridWeek',
    mobile: 'timeGrid3Days'
  },
  timeFormat24h: false,
  clickToCreateEventFromMonthView: true,
  displayTimezone: null,
  lastSystemTimezone: null,
  enableAdvancedCategorization: false,
  chrono_analyser_config: null,
  categorySettings: [],
  useCustomGoogleClient: false,
  googleClientId: '',
  googleClientSecret: '',
  googleAccounts: [],
  businessHours: {
    enabled: false,
    daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
    startTime: '09:00',
    endTime: '17:00'
  },
  enableBackgroundEvents: true,
  enableReminders: false,
  workspaces: [],
  activeWorkspace: null,
  showEventInStatusBar: false // added
};

// Utility functions for workspace management
export function generateWorkspaceId(): string {
  return 'workspace_' + Math.random().toString(36).substr(2, 9);
}

export function createDefaultWorkspace(name: string): WorkspaceSettings {
  return {
    id: generateWorkspaceId(),
    name: name,
    defaultView: undefined,
    defaultDate: undefined,
    visibleCalendars: undefined,
    categoryFilter: undefined,
    businessHours: undefined,
    timelineExpanded: undefined
  };
}

export function getActiveWorkspace(settings: FullCalendarSettings): WorkspaceSettings | null {
  if (!settings.activeWorkspace) return null;
  return settings.workspaces.find(w => w.id === settings.activeWorkspace) || null;
}
