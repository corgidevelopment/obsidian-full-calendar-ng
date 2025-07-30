/**
 * @file EditEvent.tsx
 * @brief React component for the "Create/Edit Event" modal form.
 *
 * @description
 * This file defines the `EditEvent` React component, which provides the form
 * for creating and editing events. It manages all form state, including title,
 * dates, times, recurrence rules, and associated calendar. It performs form
 * validation and calls a submit callback to persist changes.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarInfo, OFCEvent } from '../../types';
import { AutocompleteInput } from './forms/AutocompleteInput';

function makeChangeListener<T>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  fromString: (val: string) => T
): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
  return e => setState(fromString(e.target.value));
}

interface DayChoiceProps {
  code: string;
  label: string;
  isSelected: boolean;
  onClick: (code: string) => void;
}
const DayChoice = ({ code, label, isSelected, onClick }: DayChoiceProps) => (
  <button
    type="button"
    className={`day-choice-button ${isSelected ? 'is-selected' : ''}`}
    onClick={() => onClick(code)}
  >
    <b>{label[0]}</b>
  </button>
);

const DAY_MAP = {
  U: 'Sunday',
  M: 'Monday',
  T: 'Tuesday',
  W: 'Wednesday',
  R: 'Thursday',
  F: 'Friday',
  S: 'Saturday'
};

const DaySelect = ({
  value: days,
  onChange
}: {
  value: string[];
  onChange: (days: string[]) => void;
}) => {
  return (
    <div>
      {Object.entries(DAY_MAP).map(([code, label]) => (
        <DayChoice
          key={code}
          code={code}
          label={label}
          isSelected={days.includes(code)}
          onClick={() =>
            days.includes(code) ? onChange(days.filter(c => c !== code)) : onChange([code, ...days])
          }
        />
      ))}
    </div>
  );
};

interface EditEventProps {
  submit: (frontmatter: OFCEvent, calendarIndex: number) => Promise<void>;
  readonly calendars: {
    id: string;
    name: string;
    type: CalendarInfo['type'];
  }[];
  defaultCalendarIndex: number;
  initialEvent?: Partial<OFCEvent>;
  availableCategories?: string[];
  enableCategory: boolean; // <-- ADD NEW PROP
  open?: () => Promise<void>;
  deleteEvent?: () => Promise<void>;
  onAttemptEditInherited?: () => void; // Add this new prop
}

export const EditEvent = ({
  initialEvent,
  submit,
  open,
  deleteEvent,
  calendars,
  defaultCalendarIndex,
  availableCategories = [],
  enableCategory, // <-- GET NEW PROP
  onAttemptEditInherited // <-- GET NEW PROP
}: EditEventProps) => {
  const isChildOverride = !!initialEvent?.recurringEventId;

  const disabledTooltip = 'This property is inherited. Click to edit the parent recurring event.'; // Update tooltip

  const [date, setDate] = useState(
    initialEvent
      ? initialEvent.type === 'single'
        ? initialEvent.date
        : initialEvent.type === 'recurring'
          ? initialEvent.startRecur
          : initialEvent.type === 'rrule'
            ? initialEvent.startDate
            : ''
      : ''
  );
  const [endDate, setEndDate] = useState(
    initialEvent && initialEvent.type === 'single' ? initialEvent.endDate : undefined
  );
  const [startTime, setStartTime] = useState(
    initialEvent?.allDay === false ? initialEvent.startTime || '' : ''
  );
  const [endTime, setEndTime] = useState(
    initialEvent?.allDay === false ? initialEvent.endTime || '' : ''
  );
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [category, setCategory] = useState(initialEvent?.category || '');
  const [isRecurring, setIsRecurring] = useState(initialEvent?.type === 'recurring' || false);
  const [allDay, setAllDay] = useState(initialEvent?.allDay || false);
  const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);
  const [isTask, setIsTask] = useState(
    (initialEvent?.type === 'single' &&
      initialEvent.completed !== undefined &&
      initialEvent.completed !== null) ||
      (initialEvent?.type === 'recurring' && initialEvent.isTask) ||
      (initialEvent?.type === 'rrule' && initialEvent.isTask) ||
      false
  );
  const [complete, setComplete] = useState(
    initialEvent?.type === 'single' && initialEvent.completed
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    initialEvent?.type === 'recurring' ? initialEvent.daysOfWeek || [] : []
  );
  const [endRecur, setEndRecur] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.endRecur : undefined
  );

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  const selectedCalendar = calendars[calendarIndex];
  const isDailyNoteCalendar = selectedCalendar.type === 'dailynote';
  const recurringTooltip = isDailyNoteCalendar
    ? "Recurring events are not supported in Daily Notes. Please use a 'Full Note' calendar instead."
    : '';

  useEffect(() => {
    // If user switches to a daily note calendar, force 'isRecurring' to false.
    if (isDailyNoteCalendar) {
      setIsRecurring(false);
    }
  }, [isDailyNoteCalendar]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    let completedValue: string | false | null = null;
    if (isTask) {
      completedValue = complete || false;
    }

    await submit(
      {
        ...{ title, category: category || undefined },
        ...(allDay
          ? { allDay: true }
          : { allDay: false, startTime: startTime || '', endTime: endTime || null }),
        ...(isRecurring
          ? {
              type: 'recurring',
              daysOfWeek: daysOfWeek,
              startRecur: date || undefined,
              endRecur: endRecur,
              isTask: isTask,
              skipDates: initialEvent?.type === 'recurring' ? initialEvent.skipDates : []
            }
          : {
              type: 'single',
              date: date || '',
              endDate: endDate || null,
              completed: completedValue
            })
      } as OFCEvent,
      calendarIndex
    );
  };

  return (
    <div className="full-calendar-edit-modal">
      <form onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>{initialEvent?.title ? 'Edit Event' : 'New Event'}</h2>
          {open && (
            <button type="button" className="mod-subtle" onClick={open}>
              Open Note
            </button>
          )}
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Title</div>
          </div>
          <div
            className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
            onClick={isChildOverride ? onAttemptEditInherited : undefined}
            title={isChildOverride ? disabledTooltip : ''}
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder="Event Title"
              required
              onChange={e => setTitle(e.target.value)}
              readOnly={isChildOverride} // Change `disabled` to `readOnly`
            />
          </div>
        </div>

        {enableCategory && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Category</div>
            </div>
            <div
              className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
              onClick={isChildOverride ? onAttemptEditInherited : undefined}
              title={isChildOverride ? disabledTooltip : ''}
            >
              <AutocompleteInput
                id="category-autocomplete"
                value={category}
                onChange={setCategory}
                suggestions={availableCategories}
                placeholder="Category (optional)"
                readOnly={isChildOverride} // Change `disabled` to `readOnly`
              />
            </div>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">In Calendar</div>
          </div>
          <div className="setting-item-control">
            <select
              value={calendarIndex}
              onChange={e => setCalendarIndex(parseInt(e.target.value))}
            >
              {calendars.map((cal, idx) => (
                <option key={idx} value={idx}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="modal-hr" />

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Date</div>
          </div>
          <div className="setting-item-control">
            <input type="date" value={date} required onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className={`setting-item time-setting-item ${allDay ? 'is-disabled' : ''}`}>
          <div className="setting-item-info">
            <div className="setting-item-name">Time</div>
          </div>
          <div className="setting-item-control time-group">
            <input
              type="time"
              value={startTime}
              required={!allDay}
              disabled={allDay}
              onChange={e => setStartTime(e.target.value)}
            />
            <span>-</span>
            <input
              type="time"
              value={endTime}
              disabled={allDay}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {/* Options section */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Options</div>
          </div>
          <div className="setting-item-control options-group">
            <label title={isChildOverride ? disabledTooltip : ''}>
              {' '}
              {/* <-- ADD THIS LINE */}
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                disabled={isChildOverride}
              />{' '}
              All day
            </label>
            <label title={recurringTooltip} className={isDailyNoteCalendar ? 'is-disabled' : ''}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                disabled={isDailyNoteCalendar}
              />{' '}
              Recurring
            </label>
            <label>
              <input type="checkbox" checked={isTask} onChange={e => setIsTask(e.target.checked)} />{' '}
              Is a Task
            </label>
            {isTask && (
              <label
                title={
                  isRecurring
                    ? 'Completion for recurring tasks can be toggled on individual instances in the calendar view.'
                    : ''
                }
              >
                <input
                  type="checkbox"
                  checked={isRecurring ? false : !!complete}
                  onChange={e =>
                    !isRecurring && setComplete(e.target.checked ? DateTime.now().toISO() : false)
                  }
                  disabled={isRecurring}
                />{' '}
                Completed
              </label>
            )}
          </div>
        </div>

        {/* Recurring fields */}
        {isRecurring && (
          <>
            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">Repeat on</div>
              </div>
              <div className="setting-item-control">
                <DaySelect value={daysOfWeek} onChange={setDaysOfWeek} />
              </div>
            </div>
            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">End Repeat</div>
              </div>
              <div className="setting-item-control">
                <input
                  type="date"
                  value={endRecur || ''}
                  onChange={e => setEndRecur(e.target.value || undefined)}
                />
              </div>
            </div>
          </>
        )}

        <hr className="modal-hr" />

        <div className="modal-footer">
          <div className="footer-actions-left">
            {deleteEvent && (
              <button type="button" className="mod-warning" onClick={deleteEvent}>
                Delete
              </button>
            )}
          </div>
          <div className="footer-actions-right">
            <button type="submit" className="mod-cta">
              Save Event
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
