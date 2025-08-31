/**
 * @file DatePicker.ts
 * @brief Reusable flatpickr-based date picker component
 *
 * @description
 * This module provides a reusable DatePicker class that wraps flatpickr functionality.
 * It can be configured for single date or date range selection and provides a clean
 * interface for calendar date selection throughout the application.
 *
 * Extracted from ChronoAnalyser to follow DRY principles and enable reuse across
 * different parts of the Full Calendar plugin.
 *
 * @license See LICENSE.md
 */

import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';

export interface DatePickerOptions {
  /** Mode: 'single' for single date selection, 'range' for date range selection */
  mode?: 'single' | 'range';
  /** Date format for internal storage */
  dateFormat?: string;
  /** Alternative date format for display */
  altFormat?: string;
  /** Enable alternative input display */
  altInput?: boolean;
  /** Callback when date(s) are selected */
  onChange?: (selectedDates: Date[], dateStr: string, instance: FlatpickrInstance) => void;
  /** Default date(s) to set */
  defaultDate?: string | Date | (string | Date)[];
  /** Enable time selection */
  enableTime?: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
}

/**
 * Reusable DatePicker component that wraps flatpickr functionality
 */
export class DatePicker {
  private instance: FlatpickrInstance | null = null;
  private element: HTMLInputElement;
  private options: DatePickerOptions;

  constructor(element: HTMLInputElement, options: DatePickerOptions = {}) {
    this.element = element;
    this.options = {
      mode: 'single',
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'M j, Y',
      enableTime: false,
      ...options
    };

    this.initialize();
  }

  private initialize(): void {
    this.instance = flatpickr(this.element, {
      mode: this.options.mode,
      dateFormat: this.options.dateFormat,
      altInput: this.options.altInput,
      altFormat: this.options.altFormat,
      enableTime: this.options.enableTime,
      defaultDate: this.options.defaultDate,
      onChange: this.options.onChange
    });

    if (this.options.placeholder) {
      this.element.placeholder = this.options.placeholder;
    }
  }

  /**
   * Set the selected date(s)
   */
  public setDate(date: string | Date | (string | Date)[], triggerChange = true): void {
    if (this.instance) {
      this.instance.setDate(date, triggerChange);
    }
  }

  /**
   * Get the selected date(s)
   */
  public getSelectedDates(): Date[] {
    return this.instance?.selectedDates || [];
  }

  /**
   * Clear the selected date(s)
   */
  public clear(triggerChange = true): void {
    if (this.instance) {
      this.instance.clear(triggerChange);
    }
  }

  /**
   * Open the date picker
   */
  public open(): void {
    if (this.instance) {
      this.instance.open();
    }
  }

  /**
   * Close the date picker
   */
  public close(): void {
    if (this.instance) {
      this.instance.close();
    }
  }

  /**
   * Destroy the date picker instance
   */
  public destroy(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }

  /**
   * Check if the date picker is open
   */
  public isOpen(): boolean {
    return this.instance?.isOpen || false;
  }

  /**
   * Update the configuration
   */
  public updateOptions(options: Partial<DatePickerOptions>): void {
    this.options = { ...this.options, ...options };
    if (this.instance) {
      this.destroy();
      this.initialize();
    }
  }
}

/**
 * Factory function to create a date picker instance
 */
export function createDatePicker(
  element: HTMLInputElement,
  options: DatePickerOptions = {}
): DatePicker {
  return new DatePicker(element, options);
}

/**
 * Utility function to create a hidden date picker input for programmatic use
 */
export function createHiddenDatePicker(
  container: HTMLElement,
  options: DatePickerOptions = {}
): DatePicker {
  const input = container.createEl('input', {
    cls: 'hidden-date-picker-input',
    attr: { type: 'text' }
  });
  input.style.display = 'none';
  return new DatePicker(input, options);
}
