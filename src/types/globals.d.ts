// Global ambient declarations for window helpers used for debugging.
// Keeping these here allows us to remove @ts-ignore directives where we attach
// references for developer inspection.
import type EventCache from '../core/EventCache';
import type { Calendar } from '@fullcalendar/core';

declare global {
  interface Window {
    cache?: EventCache;
    fc?: Calendar; // FullCalendar instance (debug only)
  }
  interface HTMLElement {
    // Obsidian adds helper methods at runtime; declare them here so we avoid 'any' casts.
    empty(): void;
    createDiv(
      o?: { cls?: string; text?: string; attr?: Record<string, string> } | string
    ): HTMLDivElement;
    createSpan(
      o?: { cls?: string; text?: string; attr?: Record<string, string> } | string
    ): HTMLSpanElement;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: { cls?: string; text?: string; attr?: Record<string, string> } | string,
      callback?: (el: HTMLElementTagNameMap[K]) => void
    ): HTMLElementTagNameMap[K];
  }
}

export {}; // Ensure this file is treated as a module.
