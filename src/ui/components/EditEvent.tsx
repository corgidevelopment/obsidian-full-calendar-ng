/**
 * @file EditEvent.tsx
 * @brief React component for the "Create/Edit Event" modal form.
 *
 * @description
 * This file defines the `EditEvent` React component, which provides the form
 * for creating and editing events. It manages all form state, including title,
 * dates, times, recurrence rules, and associated calendar. It performs form
- * validation and calls a submit callback to persist changes.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarInfo, OFCEvent } from '../../types';
import { AutocompleteInput } from './AutocompleteInput';

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
    style={{
      marginLeft: '0.25rem',
      marginRight: '0.25rem',
      padding: '0',
      backgroundColor: isSelected ? 'var(--interactive-accent)' : 'var(--interactive-normal)',
      color: isSelected ? 'var(--text-on-accent)' : 'var(--text-normal)',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: '50%',
      width: '25px',
      height: '25px'
    }}
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
}

export const EditEvent = ({
  initialEvent,
  submit,
  open,
  deleteEvent,
  calendars,
  defaultCalendarIndex,
  availableCategories = [],
  enableCategory // <-- GET NEW PROP
}: EditEventProps) => {
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
    initialEvent?.type === 'single' &&
      initialEvent.completed !== undefined &&
      initialEvent.completed !== null
  );
  const [complete, setComplete] = useState(
    initialEvent?.type === 'single' && initialEvent.completed
  );

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // CORRECTED LOGIC FOR 'completed' PROPERTY
    let completedValue: string | false | null;
    if (!isTask) {
      completedValue = null; // Not a task
    } else {
      // If it is a task, 'complete' holds either a date string or false.
      // We just need to ensure it's not undefined.
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
              // @ts-ignore
              daysOfWeek: [],
              startRecur: date || undefined,
              // @ts-ignore
              endRecur: undefined
            }
          : {
              type: 'single',
              date: date || '',
              endDate: endDate || null,
              completed: completedValue // Use the correctly typed value
            })
      },
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
          <div className="setting-item-control">
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder="Event Title"
              required
              onChange={e => setTitle(e.target.value)}
            />
          </div>
        </div>

        {/* POINT 3: CONDITIONAL CATEGORY INPUT */}
        {enableCategory && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">Category</div>
            </div>
            <div className="setting-item-control">
              <AutocompleteInput
                id="category-autocomplete"
                value={category}
                onChange={setCategory}
                suggestions={availableCategories}
                placeholder="Category (optional)"
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

        {/* POINT 4: DISABLE TIME INPUTS INSTEAD OF HIDING */}
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

        {/* ... (Options and Footer remain the same) */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Options</div>
          </div>
          <div className="setting-item-control options-group">
            <label>
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />{' '}
              All day
            </label>
            <label>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
              />{' '}
              Recurring
            </label>
            <label>
              <input type="checkbox" checked={isTask} onChange={e => setIsTask(e.target.checked)} />{' '}
              Is a Task
            </label>
            {isTask && (
              <label>
                <input
                  type="checkbox"
                  checked={!!complete}
                  onChange={e => setComplete(e.target.checked ? DateTime.now().toISO() : false)}
                />{' '}
                Completed
              </label>
            )}
          </div>
        </div>

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
