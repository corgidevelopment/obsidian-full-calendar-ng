"""
Generate Daily Note calendar test data for the Obsidian Full Calendar plugin.

This script creates one markdown file per date (YYYY-MM-DD.md) and writes
events as list items under a chosen heading (default: "Events") using
Dataview-style inline fields that match the plugin's DailyNoteCalendar parser.

Event line format (examples):

- [ ] Work - Project Alpha - Sprint Planning  [startTime:: 09:00]  [endTime:: 10:30]  [timezone:: Europe/Budapest]
- [x] Personal - Health - Morning Run  [startTime:: 06:30]  [endTime:: 07:15]  [timezone:: America/New_York]
- [ ] Learning - Course - Deep Work Block  [startTime:: 13:00]  [endTime:: 15:00]  [timezone:: Europe/Budapest]

Notes
- Category and Subcategory are encoded in the title using the format:
  "Category - Sub-Category - Title". The plugin will parse these if advanced
  categorization is enabled.
- Times are 24h HH:MM.
- A mix of tasks (checkboxes) and non-tasks is included.

Usage (PowerShell):
  python tools/generate_daily_note_calendar.py -o .\\events_dailynote -d 14 -H "Events"
"""

from __future__ import annotations

import argparse
import os
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List, Tuple


TZ_CHOICES = [
    "Europe/Budapest",
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
]


CATEGORIES: dict[str, List[str]] = {
    "Work": ["Project Alpha", "Project Beta", "Team", "Clients"],
    "Personal": ["Health", "Family", "Finance", "Hobby"],
    "Fitness": ["Running", "Gym", "Yoga"],
    "Learning": ["Course", "Reading", "Practice"],
    "Errands": ["Shopping", "Home", "Car"],
}


TITLE_TAILS = [
    "Sprint Planning",
    "Daily Standup",
    "1:1",
    "Client Call",
    "Design Session",
    "Code Review",
    "Deep Work",
    "Workshop",
    "Brainstorm",
    "Morning Run",
    "Gym Session",
    "Yoga Flow",
    "Study Block",
    "Reading",
    "Grocery Run",
]


def fmt_hhmm(total_minutes: int) -> str:
    h = max(0, total_minutes) // 60
    m = max(0, total_minutes) % 60
    return f"{h:02d}:{m:02d}"


def pick_category() -> Tuple[str, str]:
    cat = random.choice(list(CATEGORIES.keys()))
    sub = random.choice(CATEGORIES[cat])
    return cat, sub


def build_title() -> str:
    cat, sub = pick_category()
    tail = random.choice(TITLE_TAILS)
    return f"{cat} - {sub} - {tail}"


@dataclass
class GeneratedEvent:
    title: str
    start: int  # minutes from 00:00
    end: int    # minutes from 00:00
    tz: str
    completed: bool


def gen_events_for_day(min_events: int = 4, max_events: int = 8) -> List[GeneratedEvent]:
    count = random.randint(min_events, max_events)
    events: List[GeneratedEvent] = []

    # Day start between 06:00 and 09:00
    t = random.randint(6 * 60, 9 * 60)
    for _ in range(count):
        dur = random.choice([30, 45, 60, 75, 90, 120])
        start = t
        end = start + dur
        tz = random.choice(TZ_CHOICES)
        title = build_title()
        completed = random.random() < 0.25  # 25% chance completed
        events.append(GeneratedEvent(title, start, end, tz, completed))

        # Next block after a gap of -15 to +60 mins
        t = end + random.randint(-15, 60)
        if t > 22 * 60:  # stop if too late
            break

    # Sort by start time
    events.sort(key=lambda e: e.start)
    return events


def write_day_file(path: str, heading: str, evs: List[GeneratedEvent]) -> None:
    lines: List[str] = []
    lines.append(f"## {heading}\n\n")
    for ev in evs:
        box = "[x]" if ev.completed else "[ ]"
        lines.append(
            f"- {box} {ev.title}  [startTime:: {fmt_hhmm(ev.start)}]  "
            f"[endTime:: {fmt_hhmm(ev.end)}]  [timezone:: {ev.tz}]\n"
        )
    lines.append("\n\n## Diary\n\n")
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Daily Note calendar test data.")
    parser.add_argument("-o", "--output", default="events_dailynote", help="Output directory")
    parser.add_argument("-d", "--days", type=int, default=14, help="Number of days to generate")
    parser.add_argument(
        "-s",
        "--start",
        default=date.today().isoformat(),
        help="Start date (YYYY-MM-DD); defaults to today",
    )
    parser.add_argument("-H", "--heading", default="Events", help="Heading to write under")

    args = parser.parse_args()
    out_dir = args.output
    os.makedirs(out_dir, exist_ok=True)

    start_dt = datetime.strptime(args.start, "%Y-%m-%d").date()
    for i in range(args.days):
        d = start_dt + timedelta(days=i)
        evs = gen_events_for_day()
        write_day_file(os.path.join(out_dir, f"{d.isoformat()}.md"), args.heading, evs)

    print(f"✅ Created {args.days} daily notes in {out_dir}")


if __name__ == "__main__":
    random.seed()
    main()
