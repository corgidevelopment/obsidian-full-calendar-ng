import { DateTime } from "luxon";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { CalendarInfo } from "../../types";
import { type AnyEvent, DaysOfWeek } from "../../logic/Event";

function makeChangeListener<T>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  fromString: (val: string) => T
): React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement> {
  return (e) => setState(fromString(e.target.value));
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
      marginLeft: "0.25rem",
      marginRight: "0.25rem",
      padding: "0",
      backgroundColor: isSelected ? "var(--interactive-accent)" : "var(--interactive-normal)",
      color: isSelected ? "var(--text-on-accent)" : "var(--text-normal)",
      borderStyle: "solid",
      borderWidth: "1px",
      borderRadius: "50%",
      width: "25px",
      height: "25px"
    }}
    onClick={() => onClick(code)}
  >
    <b>{label[0]}</b>
  </button>
);

const DaySelect = ({ value: days, onChange }: { value: DaysOfWeek[]; onChange: (days: DaysOfWeek[]) => void }) => {
  return (
    <div>
      {Object.entries(DaysOfWeek).map(([code, label]) => (
        <DayChoice
          key={code}
          code={code}
          label={label}
          isSelected={days.includes(label)}
          onClick={() => (days.includes(label) ? onChange(days.filter((c) => c !== code)) : onChange([label, ...days]))}
        />
      ))}
    </div>
  );
};

interface EditEventProps {
  submit: (event: AnyEvent, calendarIndex: number) => Promise<void>;
  readonly calendars: {
    id: string;
    name: string;
    type: CalendarInfo["type"];
  }[];
  defaultCalendarIndex: number;
  initialEvent?: Partial<AnyEvent>;
  open?: () => Promise<void>;
  deleteEvent?: () => Promise<void>;
}

export const EditEvent = ({ initialEvent, submit, open, deleteEvent, calendars, defaultCalendarIndex }: EditEventProps) => {
  const [date, setDate] = useState(initialEvent?.start?.toISODate());
  let initialStartTime = "";
  let initialEndTime = "";
  if (initialEvent) {
    // @ts-ignore
    const { startTime, endTime } = initialEvent;
    initialStartTime = startTime || "";
    initialEndTime = endTime || "";
  }

  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [title, setTitle] = useState(initialEvent?.title || "");
  const [isRecurring, setIsRecurring] = useState(initialEvent && "daysOfWeek" in initialEvent);
  const [endRecur, setEndRecur] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<DaysOfWeek[]>(() => {
    if (initialEvent && "daysOfWeek" in initialEvent) {
      return initialEvent.daysOfWeek ?? [];
    }
    return [];
  });

  const [allDay, setAllDay] = useState(() => {
    if (initialEvent && "allDay" in initialEvent) {
      return initialEvent.allDay ?? false;
    }
    return false;
  });

  const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!date) {
      return;
    }
    let event: AnyEvent;
    const [sHours, sMinutes] = startTime.split(":");
    const start = DateTime.fromISO(date).plus({ hours: Number.parseInt(sHours), minutes: Number.parseInt(sMinutes) });
    const [eHours, eMinutes] = endTime.split(":");
    const end = DateTime.fromISO(date).plus({ hours: Number.parseInt(eHours), minutes: Number.parseInt(eMinutes) });
    if (isRecurring) {
      event = {
        title,
        start,
        end,
        daysOfWeek: daysOfWeek
      };
    } else {
      event = {
        title,
        start,
        end,
        allDay: allDay
      };
    }
    await submit(event, calendarIndex);
  };

  return (
    <>
      <div>
        <p style={{ float: "right" }}>{open && <button onClick={open}>Open Note</button>}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <p>
          <input
            ref={titleRef}
            type="text"
            id="title"
            value={title}
            placeholder={"Add title"}
            required
            onChange={makeChangeListener(setTitle, (x) => x)}
          />
        </p>
        <p>
          <select id="calendar" value={calendarIndex} onChange={makeChangeListener(setCalendarIndex, parseInt)}>
            {calendars
              .flatMap((cal) => (["local", "dailynote", "caldav"].includes(cal.type) ? [cal] : []))
              .map((cal, idx) => (
                <option key={idx} value={idx} disabled={!(initialEvent?.title === undefined || calendars[calendarIndex].type === cal.type)}>
                  {["local", "caldav"].includes(cal.type) ? cal.name : "Daily Note"}
                </option>
              ))}
          </select>
        </p>
        <p>
          {!isRecurring && (
            <input
              type="date"
              id="date"
              value={date}
              required={!isRecurring}
              // @ts-ignore
              onChange={makeChangeListener(setDate, (x) => x)}
            />
          )}

          {allDay ? (
            <></>
          ) : (
            <>
              <input type="time" id="startTime" value={startTime} required onChange={makeChangeListener(setStartTime, (x) => x)} />
              -
              <input type="time" id="endTime" value={endTime} required onChange={makeChangeListener(setEndTime, (x) => x)} />
            </>
          )}
        </p>
        <p>
          <label htmlFor="allDay">All day event </label>
          <input id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} type="checkbox" />
        </p>
        <p>
          <label htmlFor="recurring">Recurring Event </label>
          <input id="recurring" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} type="checkbox" />
        </p>

        {isRecurring && (
          <>
            <DaySelect value={daysOfWeek} onChange={setDaysOfWeek} />
            <p>
              Starts recurring
              <input
                type="date"
                id="startDate"
                value={date}
                // @ts-ignore
                onChange={makeChangeListener(setDate, (x) => x)}
              />
              and stops recurring
              <input type="date" id="endDate" value={endRecur} onChange={makeChangeListener(setEndRecur, (x) => x)} />
            </p>
          </>
        )}
        <p
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%"
          }}
        >
          <button type="submit"> Save Event</button>
          <span>
            {deleteEvent && (
              <button
                type="button"
                style={{
                  backgroundColor: "var(--interactive-normal)",
                  color: "var(--background-modifier-error)",
                  borderColor: "var(--background-modifier-error)",
                  borderWidth: "1px",
                  borderStyle: "solid"
                }}
                onClick={deleteEvent}
              >
                Delete Event
              </button>
            )}
          </span>
        </p>
      </form>
    </>
  );
};
