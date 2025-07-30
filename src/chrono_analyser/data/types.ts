/**
 * @file Defines all shared data structures, interfaces, and type definitions for the Chrono Analyser.
 * This centralizes the data contracts used across different modules (parsing, aggregation, plotting).
 */

import Plotly from '../ui/plotly-custom';
import { OFCEvent } from '../../types';

export interface TimeRecord {
  _id: string;
  path: string;
  hierarchy: string;
  project: string;
  subproject: string;
  subprojectFull: string;
  duration: number;
  file: string;
  date: Date | null;
  metadata: OFCEvent; // Changed from FileMetadata to the more specific OFCEvent
  _effectiveDurationInPeriod?: number;
}

export interface ProcessingError {
  file: string;
  path: string;
  reason: string;
}

export interface SunburstData {
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  recordsByLabel: Map<string, TimeRecord[]>;
}

export interface PieData {
  hours: Map<string, number>;
  recordsByCategory: Map<string, TimeRecord[]>;
  error: boolean;
}

// FileMetadata is no longer needed as we now use OFCEvent directly.
// export interface FileMetadata { ... }

// --- PLOTLY THEME SYSTEM (Unchanged) ---

/**
 * Defines base layout properties common to both light and dark themes.
 * This ensures consistency and transparency.
 */
export const PLOTLY_BASE_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: 'var(--font-default)',
    size: 12
  },
  showlegend: true
};

/**
 * Defines layout properties specific to Obsidian's light theme.
 */
export const PLOTLY_LIGHT_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};

/**
 * Defines layout properties specific to Obsidian's dark theme.
 */
export const PLOTLY_DARK_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};

// --- REMOVED CACHE TYPES ---
// The following interfaces are no longer needed as we are using the main plugin's cache.
//
// export interface CacheEntry { ... }
// export type ChronoCache = Record<string, CacheEntry>;
// export interface ChronoAnalyserData { ... }
