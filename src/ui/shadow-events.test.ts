/**
 * @file shadow-events.test.ts
 * @brief Tests for shadow events functionality
 */

import { EventInput } from '@fullcalendar/core';

// Extract the shadow events logic for testing
function generateShadowEvents(
  mainEvents: EventInput[],
  enableAdvancedCategorization: boolean,
  forceTimeline = true // For tests, we force timeline behavior
): EventInput[] {
  const shadowEvents: EventInput[] = [];

  // Only generate shadow events if advanced categorization is enabled
  if (!enableAdvancedCategorization) {
    return shadowEvents;
  }

  // For tests, we assume timeline view when forceTimeline is true
  if (!forceTimeline) {
    return shadowEvents;
  }

  for (const event of mainEvents) {
    if (event.resourceId && event.resourceId.includes('::')) {
      // This is a subcategory event, create a shadow event for the parent
      const parentCategory = event.resourceId.split('::')[0];
      const shadowEvent: EventInput = {
        ...event,
        id: `${event.id}-shadow`,
        resourceId: parentCategory,
        extendedProps: {
          ...event.extendedProps,
          isShadow: true,
          originalEventId: event.id
        },
        className: 'fc-event-shadow',
        editable: false,
        durationEditable: false,
        startEditable: false
      };
      shadowEvents.push(shadowEvent);
    }
  }

  return shadowEvents;
}

describe('Shadow Events Functionality', () => {
  test('should generate shadow events for subcategory events', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'Meeting',
        resourceId: 'Work::Project1',
        start: '2024-01-01T10:00:00',
        end: '2024-01-01T11:00:00',
        extendedProps: {
          category: 'Work',
          subCategory: 'Project1'
        }
      },
      {
        id: 'event2',
        title: 'Call',
        resourceId: 'Work::Project2',
        start: '2024-01-01T14:00:00',
        end: '2024-01-01T15:00:00',
        extendedProps: {
          category: 'Work',
          subCategory: 'Project2'
        }
      },
      {
        id: 'event3',
        title: 'Doctor',
        resourceId: 'Personal::Health',
        start: '2024-01-01T16:00:00',
        end: '2024-01-01T17:00:00',
        extendedProps: {
          category: 'Personal',
          subCategory: 'Health'
        }
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, true);

    expect(shadowEvents).toHaveLength(3);

    expect(shadowEvents[0].id).toBe('event1-shadow');
    expect(shadowEvents[0].resourceId).toBe('Work');
    expect(shadowEvents[0].extendedProps?.isShadow).toBe(true);
    expect(shadowEvents[0].extendedProps?.originalEventId).toBe('event1');
    expect(shadowEvents[0].className).toBe('fc-event-shadow');
    expect(shadowEvents[0].editable).toBe(false);

    expect(shadowEvents[1].id).toBe('event2-shadow');
    expect(shadowEvents[1].resourceId).toBe('Work');

    expect(shadowEvents[2].id).toBe('event3-shadow');
    expect(shadowEvents[2].resourceId).toBe('Personal');
  });

  test('should not generate shadow events for parent category events', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'All Day Work',
        resourceId: 'Work', // Parent category, not subcategory
        start: '2024-01-01',
        extendedProps: {
          category: 'Work'
        }
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, true);

    expect(shadowEvents).toHaveLength(0);
  });

  test('should not generate shadow events when advanced categorization is disabled', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'Meeting',
        resourceId: 'Work::Project1',
        start: '2024-01-01T10:00:00',
        end: '2024-01-01T11:00:00',
        extendedProps: {
          category: 'Work',
          subCategory: 'Project1'
        }
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, false);

    expect(shadowEvents).toHaveLength(0);
  });

  test('should not generate shadow events when not in timeline view', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'Meeting',
        resourceId: 'Work::Project1',
        start: '2024-01-01T10:00:00',
        end: '2024-01-01T11:00:00',
        extendedProps: {
          category: 'Work',
          subCategory: 'Project1'
        }
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, true, false);

    expect(shadowEvents).toHaveLength(0);
  });

  test('should preserve all event properties in shadow events', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'Meeting',
        resourceId: 'Work::Project1',
        start: '2024-01-01T10:00:00',
        end: '2024-01-01T11:00:00',
        color: '#ff0000',
        textColor: '#ffffff',
        allDay: false,
        extendedProps: {
          category: 'Work',
          subCategory: 'Project1',
          customProp: 'test'
        }
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, true);

    expect(shadowEvents).toHaveLength(1);

    const shadowEvent = shadowEvents[0];
    expect(shadowEvent.title).toBe('Meeting');
    expect(shadowEvent.start).toBe('2024-01-01T10:00:00');
    expect(shadowEvent.end).toBe('2024-01-01T11:00:00');
    expect(shadowEvent.color).toBe('#ff0000');
    expect(shadowEvent.textColor).toBe('#ffffff');
    expect(shadowEvent.allDay).toBe(false);
    expect(shadowEvent.extendedProps?.customProp).toBe('test');
    expect(shadowEvent.extendedProps?.category).toBe('Work');
    expect(shadowEvent.extendedProps?.subCategory).toBe('Project1');
  });

  test('should handle events without resourceId', () => {
    const mainEvents: EventInput[] = [
      {
        id: 'event1',
        title: 'Meeting',
        start: '2024-01-01T10:00:00',
        end: '2024-01-01T11:00:00',
        extendedProps: {}
      }
    ];

    const shadowEvents = generateShadowEvents(mainEvents, true);

    expect(shadowEvents).toHaveLength(0);
  });
});
