/**
 * @file DateNavigation.ts
 * @brief Handles date navigation logic for calendar views
 *
 * @description
 * This module provides functionality for quick date navigation including:
 * - Navigate to current month/week based on view type
 * - Custom date navigation with calendar picker
 * - Context-aware navigation options based on current calendar view
 *
 * Follows the Single Responsibility Principle by focusing solely on
 * date navigation concerns.
 *
 * @license See LICENSE.md
 */

import { Calendar, ViewApi } from '@fullcalendar/core';
import { Menu } from 'obsidian';
import { DatePicker, createHiddenDatePicker } from '../../ui/components/forms/DatePicker';
import { t } from '../i18n/i18n';

export type NavigationOption = 'thisMonth' | 'thisWeek' | 'customDate';

export interface NavigationContext {
  currentView: string;
  currentDate: Date;
  isNarrow: boolean;
}

/**
 * Determines which navigation options are available based on current view
 */
export function getAvailableNavigationOptions(context: NavigationContext): NavigationOption[] {
  const options: NavigationOption[] = [];

  // Add "This Month" for day and week views
  if (context.currentView.includes('Day') || context.currentView.includes('Week')) {
    options.push('thisMonth');
  }

  // Add "This Week" for day views only
  if (context.currentView.includes('Day')) {
    options.push('thisWeek');
  }

  // Always add custom date option
  options.push('customDate');

  return options;
}

/**
 * Gets the display label for a navigation option
 */
export function getNavigationLabel(option: NavigationOption): string {
  switch (option) {
    case 'thisMonth':
      return t('ui.navigation.thisMonth');
    case 'thisWeek':
      return t('ui.navigation.thisWeek');
    case 'customDate':
      return t('ui.navigation.customDate');
    default:
      return 'Unknown';
  }
}

/**
 * Gets the appropriate calendar view for a navigation option
 */
export function getNavigationView(option: NavigationOption, isNarrow: boolean): string {
  switch (option) {
    case 'thisMonth':
      return isNarrow ? 'timeGridWeek' : 'dayGridMonth';
    case 'thisWeek':
      return isNarrow ? 'timeGrid3Days' : 'timeGridWeek';
    case 'customDate':
      return 'timeGridDay'; // Show day view for specific dates
    default:
      return isNarrow ? 'timeGrid3Days' : 'timeGridWeek';
  }
}

/**
 * Main DateNavigation class that handles all navigation functionality
 */
export class DateNavigation {
  private calendar: Calendar;
  private datePicker: DatePicker | null = null;
  private container: HTMLElement;

  constructor(calendar: Calendar, container: HTMLElement) {
    this.calendar = calendar;
    this.container = container;
  }

  /**
   * Creates and shows the navigation dropdown menu
   */
  public showNavigationMenu(event: MouseEvent): void {
    const context = this.getCurrentContext();
    const availableOptions = getAvailableNavigationOptions(context);

    const menu = new Menu();

    availableOptions.forEach(option => {
      menu.addItem(item => {
        item.setTitle(getNavigationLabel(option)).onClick(() => {
          this.handleNavigationOption(option, context);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Handles navigation for right-click context menu on specific dates
   */
  public showDateContextMenu(event: MouseEvent, clickedDate: Date): void {
    const context = this.getCurrentContext();
    const menu = new Menu();

    // Add view options for the specific date
    const viewOptions = [
      {
        view: context.isNarrow ? 'timeGrid3Days' : 'dayGridMonth',
        label: t('ui.navigation.viewMonth')
      },
      {
        view: context.isNarrow ? 'timeGrid3Days' : 'timeGridWeek',
        label: t('ui.navigation.viewWeek')
      },
      { view: 'timeGridDay', label: t('ui.navigation.viewDay') }
    ];

    viewOptions.forEach(({ view, label }) => {
      menu.addItem(item => {
        item.setTitle(label).onClick(() => {
          this.navigateToDate(clickedDate, view);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Handles navigation for general view right-click context menu
   */
  public showViewContextMenu(event: MouseEvent, calendar: Calendar): void {
    const context = this.getCurrentContext();

    // For view-level right-clicks, use the current view's date or detect date from position
    let contextDate = context.currentDate;

    // Try to get a more specific date based on the clicked position
    // This uses FullCalendar's internal method to get date from coordinates
    try {
      // Get the date at the clicked position if possible
      const dateAtPosition = this.getDateFromPosition(event, calendar);
      if (dateAtPosition) {
        contextDate = dateAtPosition;
      }
    } catch (e) {
      // Fallback to current view date if position detection fails
      console.debug('Could not determine date from position, using current view date:', e);
    }

    const menu = new Menu();

    // Add view options for the detected/current date
    const viewOptions = [
      {
        view: context.isNarrow ? 'timeGrid3Days' : 'dayGridMonth',
        label: t('ui.navigation.viewMonth')
      },
      {
        view: context.isNarrow ? 'timeGrid3Days' : 'timeGridWeek',
        label: t('ui.navigation.viewWeek')
      },
      { view: 'timeGridDay', label: t('ui.navigation.viewDay') }
    ];

    viewOptions.forEach(({ view, label }) => {
      menu.addItem(item => {
        item.setTitle(label).onClick(() => {
          this.navigateToDate(contextDate, view);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Attempts to get the date at a specific mouse position in the calendar
   */
  private getDateFromPosition(event: MouseEvent, calendar: Calendar): Date | null {
    try {
      // Get the calendar view element
      const viewEl = calendar.el.querySelector('.fc-view');
      if (!viewEl) return null;

      const rect = viewEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Get current view info
      const view = calendar.view;
      const viewType = view.type;

      // For different view types, calculate the approximate date
      if (viewType.includes('dayGrid')) {
        // Month view - calculate based on grid position
        return this.getDateFromMonthGrid(x, y, rect, view);
      } else if (viewType.includes('timeGrid')) {
        // Week/day view - calculate based on column position
        return this.getDateFromTimeGrid(x, y, rect, view);
      } else {
        // For other views, return current date
        return view.currentStart;
      }
    } catch {
      return null;
    }
  }

  private getDateFromMonthGrid(x: number, y: number, rect: DOMRect, view: ViewApi): Date {
    // Simple approximation for month view
    // This is a basic implementation - could be enhanced
    const startOfMonth = new Date(view.currentStart);
    const cellWidth = rect.width / 7; // 7 days per week
    const headerHeight = 30; // Approximate header height
    const cellHeight = (rect.height - headerHeight) / 6; // Typically 6 weeks shown

    const col = Math.floor(x / cellWidth);
    const row = Math.floor((y - headerHeight) / cellHeight);

    const dayOffset = row * 7 + col;
    const targetDate = new Date(startOfMonth);
    targetDate.setDate(startOfMonth.getDate() + dayOffset);

    return targetDate;
  }

  private getDateFromTimeGrid(x: number, y: number, rect: DOMRect, view: ViewApi): Date {
    // Simple approximation for week/day view
    const startOfView = new Date(view.currentStart);
    const endOfView = new Date(view.currentEnd);
    const daysInView = Math.ceil(
      (endOfView.getTime() - startOfView.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Note: allDayHeight and headerHeight are not currently needed for the calculation
    // but their approximate values are: allDay=50px, header=30px
    const timeGridX = x;

    let dayIndex = 0;
    if (daysInView > 1) {
      const dayWidth = rect.width / daysInView;
      dayIndex = Math.floor(timeGridX / dayWidth);
      dayIndex = Math.max(0, Math.min(dayIndex, daysInView - 1));
    }

    const targetDate = new Date(startOfView);
    targetDate.setDate(startOfView.getDate() + dayIndex);

    return targetDate;
  }

  private getCurrentContext(): NavigationContext {
    const view = this.calendar.view;
    return {
      currentView: view.type,
      currentDate: view.currentStart,
      isNarrow: this.container.clientWidth < 768 // Assume narrow if width < 768px
    };
  }

  private handleNavigationOption(option: NavigationOption, context: NavigationContext): void {
    const now = new Date();

    switch (option) {
      case 'thisMonth':
        this.navigateToDate(now, getNavigationView(option, context.isNarrow));
        break;
      case 'thisWeek':
        this.navigateToDate(now, getNavigationView(option, context.isNarrow));
        break;
      case 'customDate':
        this.showCustomDatePicker(context);
        break;
    }
  }

  private showCustomDatePicker(context: NavigationContext): void {
    // Clean up existing picker
    if (this.datePicker) {
      this.datePicker.destroy();
    }

    // Create a hidden date picker for date selection
    this.datePicker = createHiddenDatePicker(this.container, {
      mode: 'single',
      defaultDate: context.currentDate,
      onChange: (selectedDates: Date[]) => {
        if (selectedDates.length > 0) {
          const view = getNavigationView('customDate', context.isNarrow);
          this.navigateToDate(selectedDates[0], view);
          this.datePicker?.close();
        }
      }
    });

    // Open the picker immediately
    this.datePicker.open();
  }

  private navigateToDate(date: Date, viewType?: string): void {
    // Change view first if specified
    if (viewType && viewType !== this.calendar.view.type) {
      this.calendar.changeView(viewType);
    }

    // Navigate to the date
    this.calendar.gotoDate(date);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.datePicker) {
      this.datePicker.destroy();
      this.datePicker = null;
    }
  }
}

/**
 * Factory function to create a DateNavigation instance
 */
export function createDateNavigation(calendar: Calendar, container: HTMLElement): DateNavigation {
  return new DateNavigation(calendar, container);
}
