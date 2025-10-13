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
import { AutocompleteInput } from '../components/forms/AutocompleteInput';
import {
  constructTitle,
  parseTitle,
  parseSubcategoryTitle
} from '../../features/category/categoryParser';
import { t } from '../../features/i18n/i18n';

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

const getDayMap = () => ({
  U: t('settings.weekdays.sunday'),
  M: t('settings.weekdays.monday'),
  T: t('settings.weekdays.tuesday'),
  W: t('settings.weekdays.wednesday'),
  R: t('settings.weekdays.thursday'),
  F: t('settings.weekdays.friday'),
  S: t('settings.weekdays.saturday')
});

const DaySelect = ({
  value: days,
  onChange
}: {
  value: string[];
  onChange: (days: string[]) => void;
}) => {
  const DAY_MAP = getDayMap();
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

type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'yearly';

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
  enableCategory: boolean;
  enableBackgroundEvents?: boolean;
  enableReminders: boolean; // ADD THIS
  open?: () => Promise<void>;
  deleteEvent?: () => Promise<void>;
  onAttemptEditInherited?: () => void;
}

function getInitialRecurrenceType(event?: Partial<OFCEvent>): RecurrenceType {
  if (event?.type !== 'recurring') {
    return 'none';
  }
  if (event.daysOfWeek && event.daysOfWeek.length > 0) {
    return 'weekly';
  }
  if (event.month) {
    return 'yearly';
  }
  if (event.dayOfMonth) {
    return 'monthly';
  }
  return 'none';
}

export const EditEvent = ({
  initialEvent,
  submit,
  open,
  deleteEvent,
  calendars,
  defaultCalendarIndex,
  availableCategories = [],
  enableCategory,
  enableBackgroundEvents = false,
  enableReminders, // ADD THIS
  onAttemptEditInherited
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
  const [title, setTitle] = useState(
    enableCategory
      ? constructTitle(undefined, initialEvent?.subCategory, initialEvent?.title || '')
      : initialEvent?.title || ''
  );
  const [category, setCategory] = useState(initialEvent?.category || '');
  // const [isRecurring, setIsRecurring] = useState(initialEvent?.type === 'recurring' || false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    getInitialRecurrenceType(initialEvent)
  );
  const isRecurring = recurrenceType !== 'none';
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
  const [repeatInterval, setRepeatInterval] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatInterval || 1 : 1
  );
  // START ADDITION
  type MonthlyMode = 'dayOfMonth' | 'onThe';
  const getInitialMonthlyMode = (): MonthlyMode =>
    initialEvent?.type === 'recurring' && initialEvent.repeatOn ? 'onThe' : 'dayOfMonth';

  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(getInitialMonthlyMode());
  const [repeatOnWeek, setRepeatOnWeek] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatOn?.week || 1 : 1
  );
  const [repeatOnWeekday, setRepeatOnWeekday] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatOn?.weekday || 0 : 0
  );
  // END ADDITION
  const [display, setDisplay] = useState<
    'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none'
  >(initialEvent?.display || 'auto');

  // Add state for endReminder
  const [endReminder, setEndReminder] = useState(initialEvent?.endReminder || false);

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  const selectedCalendar = calendars[calendarIndex];
  const isDailyNoteCalendar = selectedCalendar.type === 'dailynote';
  const recurringTooltip = isDailyNoteCalendar
    ? t('modals.editEvent.tooltips.dailyNoteRecurring')
    : '';

  useEffect(() => {
    // If user switches to a daily note calendar, force recurrence off.
    if (isDailyNoteCalendar) {
      setRecurrenceType('none');
    }
  }, [isDailyNoteCalendar]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    let completedValue: string | false | null = null;
    if (isTask) {
      completedValue = complete || false;
    }

    const timeInfo = allDay
      ? { allDay: true as const }
      : { allDay: false as const, startTime: startTime || '', endTime: endTime || null };

    let eventData: Partial<OFCEvent>;

    if (recurrenceType === 'none') {
      eventData = {
        type: 'single',
        date: date || '',
        endDate: endDate || null,
        completed: completedValue
      };
    } else {
      const recurringData: Partial<OFCEvent> & { type: 'recurring' } = {
        type: 'recurring',
        startRecur: date || undefined,
        endRecur: endRecur,
        isTask: isTask,
        skipDates: initialEvent?.type === 'recurring' ? initialEvent.skipDates : [],
        repeatInterval: repeatInterval > 1 ? repeatInterval : undefined
      };

      if (recurrenceType === 'weekly') {
        recurringData.daysOfWeek = daysOfWeek as ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
      } else if (recurrenceType === 'monthly' && date) {
        // START MODIFICATION
        if (monthlyMode === 'onThe') {
          recurringData.repeatOn = { week: repeatOnWeek, weekday: repeatOnWeekday };
          recurringData.dayOfMonth = undefined; // Ensure mutual exclusivity
        } else {
          recurringData.dayOfMonth = DateTime.fromISO(date).day;
          recurringData.repeatOn = undefined; // Ensure mutual exclusivity
        }
        // END MODIFICATION
      } else if (recurrenceType === 'yearly' && date) {
        const dt = DateTime.fromISO(date);
        recurringData.month = dt.month;
        recurringData.dayOfMonth = dt.day;
      }
      eventData = recurringData;
    }

    let parsedSubCategory: string | undefined;
    let parsedTitle: string;

    if (enableCategory) {
      // When advanced categorization is enabled, the title input contains "SubCategory - Title"
      // and the category is managed separately in the category input field
      const parsed = parseSubcategoryTitle(title);
      parsedSubCategory = parsed.subCategory;
      parsedTitle = parsed.title;
    } else {
      // When advanced categorization is disabled, parse the full title format
      const parsed = parseTitle(title);
      parsedSubCategory = parsed.subCategory;
      parsedTitle = parsed.title;
    }

    const finalEvent = {
      title: parsedTitle,
      category: category || undefined,
      display: display !== 'auto' ? display : undefined,
      subCategory: parsedSubCategory,
      endReminder: endReminder || undefined,
      ...timeInfo,
      ...eventData
    } as OFCEvent;

    await submit(finalEvent, calendarIndex);
  };

  return (
    <div className="full-calendar-edit-modal">
      <form onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>
            {initialEvent?.title
              ? t('modals.editEvent.title.edit')
              : t('modals.editEvent.title.new')}
          </h2>
          {open && (
            <button type="button" className="mod-subtle" onClick={open}>
              {t('modals.editEvent.buttons.openNote')}
            </button>
          )}
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.title.label')}</div>
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
              placeholder={t('modals.editEvent.fields.title.placeholder')}
              required
              onChange={e => setTitle(e.target.value)}
              readOnly={isChildOverride} // Change `disabled` to `readOnly`
            />
          </div>
        </div>

        {enableCategory && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">{t('modals.editEvent.fields.category.label')}</div>
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
                placeholder={t('modals.editEvent.fields.category.placeholder')}
                readOnly={isChildOverride} // Change `disabled` to `readOnly`
              />
            </div>
          </div>
        )}

        {enableBackgroundEvents && (
          <div className="setting-item">
            <div
              className="setting-item-info"
              title="Choose how this event appears on the calendar"
            >
              <div className="setting-item-name">{t('modals.editEvent.fields.display.label')}</div>
            </div>
            <div
              className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
              onClick={isChildOverride ? onAttemptEditInherited : undefined}
              title={isChildOverride ? disabledTooltip : ''}
            >
              <select
                value={display}
                onChange={e => setDisplay(e.target.value as typeof display)}
                disabled={isChildOverride}
              >
                <option value="auto">{t('modals.editEvent.fields.display.options.auto')}</option>
                <option value="background">
                  {t('modals.editEvent.fields.display.options.background')}
                </option>
                <option value="inverse-background">
                  {t('modals.editEvent.fields.display.options.inverseBackground')}
                </option>
                <option value="none">{t('modals.editEvent.fields.display.options.none')}</option>
              </select>
            </div>
          </div>
        )}

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.inCalendar.label')}</div>
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
            <div className="setting-item-name">{t('modals.editEvent.fields.date.label')}</div>
          </div>
          <div className="setting-item-control">
            <input type="date" value={date} required onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className={`setting-item time-setting-item ${allDay ? 'is-disabled' : ''}`}>
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.time.label')}</div>
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

        {/* Options section replaced */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.options.label')}</div>
          </div>
          <div className="setting-item-control options-group">
            <label title={isChildOverride ? disabledTooltip : ''}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                disabled={isChildOverride}
              />{' '}
              {t('modals.editEvent.fields.options.allDay')}
            </label>
            <label>
              <input type="checkbox" checked={isTask} onChange={e => setIsTask(e.target.checked)} />{' '}
              {t('modals.editEvent.fields.options.isTask')}
            </label>
            {isTask && (
              <label
                title={isRecurring ? t('modals.editEvent.tooltips.recurringTaskCompletion') : ''}
              >
                <input
                  type="checkbox"
                  checked={isRecurring ? false : !!complete}
                  onChange={e =>
                    !isRecurring && setComplete(e.target.checked ? DateTime.now().toISO() : false)
                  }
                  disabled={isRecurring}
                />{' '}
                {t('modals.editEvent.fields.options.completed')}
              </label>
            )}
            {/* ADD THIS WRAPPER AROUND THE REMINDER CHECKBOX LABEL */}
            {enableReminders && (
              <label
                className={allDay || !endTime ? 'is-disabled' : ''}
                title={
                  allDay || !endTime ? t('modals.editEvent.fields.options.endReminderTooltip') : ''
                }
              >
                <input
                  type="checkbox"
                  checked={endReminder}
                  onChange={e => setEndReminder(e.target.checked)}
                  disabled={allDay || !endTime}
                />{' '}
                {t('modals.editEvent.fields.options.endReminder')}
              </label>
            )}
          </div>
        </div>

        {/* New "Repeats" section */}
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.repeats.label')}</div>
          </div>
          <div className="setting-item-control">
            <select
              value={recurrenceType}
              onChange={e => setRecurrenceType(e.target.value as RecurrenceType)}
              disabled={isDailyNoteCalendar}
              title={recurringTooltip}
            >
              <option value="none">{t('modals.editEvent.fields.repeats.options.none')}</option>
              <option value="weekly">{t('modals.editEvent.fields.repeats.options.weekly')}</option>
              <option value="monthly">
                {t('modals.editEvent.fields.repeats.options.monthly')}
              </option>
              <option value="yearly">{t('modals.editEvent.fields.repeats.options.yearly')}</option>
            </select>
          </div>
        </div>
        {isRecurring && (
          <div className="setting-item">
            <div className="setting-item-info"></div>
            <div className="setting-item-control" style={{ alignItems: 'center', gap: '8px' }}>
              <span>{t('modals.editEvent.fields.repeats.repeatEvery')}</span>
              <input
                type="number"
                min="1"
                value={repeatInterval}
                onChange={e => setRepeatInterval(parseInt(e.target.value, 10) || 1)}
                style={{ width: '60px' }}
              />
              <span>
                {recurrenceType === 'weekly' &&
                  (repeatInterval > 1
                    ? t('modals.editEvent.fields.repeats.weeks')
                    : t('modals.editEvent.fields.repeats.week'))}
                {recurrenceType === 'monthly' &&
                  (repeatInterval > 1
                    ? t('modals.editEvent.fields.repeats.months')
                    : t('modals.editEvent.fields.repeats.month'))}
                {recurrenceType === 'yearly' &&
                  (repeatInterval > 1
                    ? t('modals.editEvent.fields.repeats.years')
                    : t('modals.editEvent.fields.repeats.year'))}
              </span>
            </div>
          </div>
        )}

        {/* Recurring fields fragment replaced */}
        {isRecurring && (
          <>
            {recurrenceType === 'weekly' && (
              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">
                    {t('modals.editEvent.fields.repeats.repeatOn')}
                  </div>
                </div>
                <div className="setting-item-control">
                  <DaySelect value={daysOfWeek} onChange={setDaysOfWeek} />
                </div>
              </div>
            )}
            {/* REPLACE monthly block */}
            {recurrenceType === 'monthly' && date && (
              <div className="setting-item">
                <div className="setting-item-info"></div>
                <div className="setting-item-control" style={{ display: 'block' }}>
                  {/* Radio button for "On day X" */}
                  <div>
                    <input
                      type="radio"
                      id="monthly-day-of-month"
                      name="monthly-mode"
                      value="dayOfMonth"
                      checked={monthlyMode === 'dayOfMonth'}
                      onChange={() => setMonthlyMode('dayOfMonth')}
                    />
                    <label htmlFor="monthly-day-of-month">
                      {' '}
                      {t('modals.editEvent.fields.repeats.onDay', {
                        day: DateTime.fromISO(date).day
                      })}
                    </label>
                  </div>
                  {/* Radio button for "On the Nth weekday" */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px'
                    }}
                  >
                    <input
                      type="radio"
                      id="monthly-on-the"
                      name="monthly-mode"
                      value="onThe"
                      checked={monthlyMode === 'onThe'}
                      onChange={() => setMonthlyMode('onThe')}
                    />
                    <label htmlFor="monthly-on-the">
                      {t('modals.editEvent.fields.repeats.onThe')}
                    </label>
                    <select
                      value={repeatOnWeek}
                      onChange={e => setRepeatOnWeek(parseInt(e.target.value, 10))}
                      disabled={monthlyMode !== 'onThe'}
                    >
                      <option value="1">
                        {t('modals.editEvent.fields.repeats.ordinal.first')}
                      </option>
                      <option value="2">
                        {t('modals.editEvent.fields.repeats.ordinal.second')}
                      </option>
                      <option value="3">
                        {t('modals.editEvent.fields.repeats.ordinal.third')}
                      </option>
                      <option value="4">
                        {t('modals.editEvent.fields.repeats.ordinal.fourth')}
                      </option>
                      <option value="-1">
                        {t('modals.editEvent.fields.repeats.ordinal.last')}
                      </option>
                    </select>
                    <select
                      value={repeatOnWeekday}
                      onChange={e => setRepeatOnWeekday(parseInt(e.target.value, 10))}
                      disabled={monthlyMode !== 'onThe'}
                    >
                      {[
                        t('settings.weekdays.sunday'),
                        t('settings.weekdays.monday'),
                        t('settings.weekdays.tuesday'),
                        t('settings.weekdays.wednesday'),
                        t('settings.weekdays.thursday'),
                        t('settings.weekdays.friday'),
                        t('settings.weekdays.saturday')
                      ].map((day, index) => (
                        <option key={index} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {/* END monthly block replacement */}
            {recurrenceType === 'yearly' && date && (
              <div className="setting-item">
                <div className="setting-item-info"></div>
                <div className="setting-item-control">
                  {t('modals.editEvent.fields.repeats.yearlyText', {
                    date: DateTime.fromISO(date).toFormat('MMMM d')
                  })}
                </div>
              </div>
            )}

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t('modals.editEvent.fields.repeats.endRepeat')}
                </div>
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
