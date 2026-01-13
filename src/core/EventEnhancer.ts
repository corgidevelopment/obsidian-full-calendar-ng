/**
 * @file EventEnhancer.ts
 * @brief Defines the event enhancement pipeline for advanced categorization.
 *
 * @description
 * This class provides a stateless pipeline for transforming OFCEvents. It decouples
 * the core data engine from the "Advanced Categorization" feature by centralizing
 * the logic for parsing categories from titles on the read path and reconstructing
 * titles for storage on the write path.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';
import { constructTitle, parseTitle } from '../features/category/categoryParser';
import { convertEvent } from '../features/Timezone';

export class EventEnhancer {
  private settings: FullCalendarSettings;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  /**
   * Updates the settings object used by the enhancer.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
  }

  /**
   * The "read path" transformation.
   * Takes a raw event from a provider, parses its title for categories,
   * and converts its timezone to the user's display timezone.
   *
   * @param rawEvent The event object from a provider with an un-parsed title and source timezone.
   * @returns An enhanced OFCEvent ready for the cache and UI.
   */
  public enhance(rawEvent: OFCEvent): OFCEvent {
    // 1. First, parse categories from the title if the feature is enabled.
    let categorizedEvent = rawEvent;
    if (this.settings.enableAdvancedCategorization) {
      // Create a set of defined category names for validation
      const definedCategories = new Set(this.settings.categorySettings.map(cat => cat.name));
      const { category, subCategory, title } = parseTitle(rawEvent.title, definedCategories);
      categorizedEvent = {
        ...rawEvent,
        title,
        category: category || rawEvent.category,
        subCategory: subCategory || rawEvent.subCategory
      };
    }

    // 2. Second, perform timezone conversion for display.
    const displayZone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const sourceZone = rawEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (sourceZone === displayZone) {
      return categorizedEvent; // No conversion needed.
    }

    const convertedEvent = convertEvent(categorizedEvent, sourceZone, displayZone);

    // 3. Preserve the original timezone on the event object for the write-back path.
    // `convertEvent` doesn't modify this, so it's preserved from the original `rawEvent`.
    return convertedEvent;
  }

  /**
   * The "write path" transformation.
   * Takes a structured event from the cache/UI, converts it back to its source timezone,
   * and constructs a flat title string for storage.
   *
   * @param structuredEvent An event from the cache, in the display timezone.
   * @returns A new event object ready to be written to a provider.
   */
  public prepareForStorage(structuredEvent: OFCEvent): OFCEvent {
    // 1. First, perform timezone conversion.
    const displayZone =
      this.settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Determine the target timezone for storage. If the event has one, use it.
    // Otherwise, it's a floating event that should be stored in the system's local time.
    const targetZone = structuredEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    let eventForStorage = { ...structuredEvent };

    if (displayZone !== targetZone) {
      eventForStorage = convertEvent(structuredEvent, displayZone, targetZone);
    }

    // After conversion, explicitly set/remove the timezone property to ensure
    // it is correctly serialized into the note file.
    if (!eventForStorage.allDay) {
      // For any timed event, ensure the timezone property is set to its target zone.
      // This "upgrades" legacy floating events to have an explicit timezone upon saving.
      eventForStorage.timezone = targetZone;
    } else {
      // All-day events MUST NOT have a timezone property.
      delete eventForStorage.timezone;
    }

    // 2. Second, construct the full title if categorization is enabled.
    if (!this.settings.enableAdvancedCategorization) {
      return eventForStorage;
    }

    // Create a new object for title construction to avoid mutating the one we just fixed.
    const finalEvent = { ...eventForStorage };
    finalEvent.title = constructTitle(
      finalEvent.category,
      finalEvent.subCategory,
      finalEvent.title
    );

    // Remove the separate category fields to avoid them being written to storage.
    delete finalEvent.category;
    delete finalEvent.subCategory;

    return finalEvent;
  }
}
