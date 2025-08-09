"""
Generate Full Note (one note per event) calendar test data for the Obsidian Full Calendar plugin.

This script creates individual markdown files with YAML frontmatter for each
single or recurring event, matching the plugin's FullNoteCalendar expectations
and event schema.

Filename format (mirrors plugin):
- Single: "YYYY-MM-DD <Constructed Title>.md"
- Recurring weekly: "(Every M,T,...) <Constructed Title>.md"
- Recurring yearly: "(Every year on <Mon> <DD>) <Constructed Title>.md"
- Recurring monthly: "(Every month on the <DD>) <Constructed Title>.md"

Frontmatter keys used (subset of OFCEvent):
- title: string (includes category prefix when categories are enabled)
- type: "single" | "recurring"
- date: YYYY-MM-DD (for single)
- startTime, endTime: HH:MM (optional if allDay)
- allDay: true|false
- timezone: IANA TZ name
- (recurring) daysOfWeek: ["M","T","W","R","F","S","U"] or month/dayOfMonth

Usage (PowerShell):
  python tools/generate_full_note_calendar.py -o .\\events_fullnote -n 30
"""

from __future__ import annotations

import argparse
import os
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

TZ_CHOICES = [
    "Europe/Budapest",
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Australia/Sydney",
]

CATEGORIES: Dict[str, List[str]] = {
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

DOW = ["U", "M", "T", "W", "R", "F", "S"]


def fmt_hhmm(total_minutes: int) -> str:
    h = max(0, total_minutes) // 60
    m = max(0, total_minutes) % 60
    return f"{h:02d}:{m:02d}"


def build_constructed_title(category: Optional[str], sub: Optional[str], title: str) -> str:
    if category and sub:
        return f"{category} - {sub} - {title}"
    if category:
        return f"{category} - {title}"
    return title


def pick_category() -> Tuple[str, str]:
    cat = random.choice(list(CATEGORIES.keys()))
    sub = random.choice(CATEGORIES[cat])
    return cat, sub


@dataclass
class SingleEvent:
    date: date
    all_day: bool
    start: Optional[int]
    end: Optional[int]
    tz: str
    category: Optional[str]
    subcategory: Optional[str]
    title: str


@dataclass
class RecurringEvent:
    # Either daysOfWeek is set (weekly), or dayOfMonth/month (monthly/yearly)
    days_of_week: Optional[List[str]]
    month: Optional[int]
    day_of_month: Optional[int]
    start_time: Optional[int]
    end_time: Optional[int]
    tz: str
    category: Optional[str]
    subcategory: Optional[str]
    title: str


def gen_single_event(d: date) -> SingleEvent:
    tz = random.choice(TZ_CHOICES)
    category, sub = pick_category()
    tail = random.choice(TITLE_TAILS)
    title = tail

    # 20% all-day
    if random.random() < 0.2:
        return SingleEvent(d, True, None, None, tz, category, sub, title)

    # Timeboxed event
    start_of_day = random.randint(7 * 60, 10 * 60)
    start = start_of_day + random.choice([0, 15, 30, 45, 60, 90, 120])
    dur = random.choice([30, 45, 60, 75, 90, 120, 150])
    end = min(start + dur, 22 * 60)
    return SingleEvent(d, False, start, end, tz, category, sub, title)


def gen_recurring_event() -> RecurringEvent:
    tz = random.choice(TZ_CHOICES)
    category, sub = pick_category()
    tail = random.choice(TITLE_TAILS)
    title = tail

    # Choose recurrence type: weekly (60%), monthly (25%), yearly (15%)
    r = random.random()
    if r < 0.6:
        days = random.sample(DOW[1:6], k=random.randint(1, 3))  # Mon-Fri mix
        start = random.randint(8 * 60, 11 * 60)
        end = start + random.choice([30, 45, 60, 90])
        return RecurringEvent(days, None, None, start, end, tz, category, sub, title)
    elif r < 0.85:
        dom = random.randint(1, 28)
        start = random.randint(18 * 60, 20 * 60)
        end = start + random.choice([60, 90, 120])
        return RecurringEvent(None, None, dom, start, end, tz, category, sub, title)
    else:
        month = random.randint(1, 12)
        dom = random.randint(1, 28)
        start = random.randint(9 * 60, 17 * 60)
        end = start + random.choice([60, 90, 120])
        return RecurringEvent(None, month, dom, start, end, tz, category, sub, title)


def write_single(out_dir: str, ev: SingleEvent) -> None:
    constructed_title = build_constructed_title(ev.category, ev.subcategory, ev.title)
    filename = f"{ev.date.isoformat()} {constructed_title}.md"
    path = os.path.join(out_dir, filename)

    fm: List[str] = ["---\n"]
    fm.append(f"title: {constructed_title}\n")
    fm.append("type: single\n")
    fm.append(f"date: {ev.date.isoformat()}\n")
    if ev.all_day:
        fm.append("allDay: true\n")
    else:
        fm.append("allDay: false\n")
        fm.append(f"startTime: {fmt_hhmm(ev.start or 0)}\n")
        fm.append(f"endTime: {fmt_hhmm(ev.end or (ev.start or 0) + 60)}\n")
    fm.append(f"timezone: {ev.tz}\n")
    fm.append("---\n\n")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(fm)
        f.write(f"# {constructed_title}\n\n")
        f.write("Notes...\n")


def write_recurring(out_dir: str, ev: RecurringEvent) -> None:
    constructed_title = build_constructed_title(ev.category, ev.subcategory, ev.title)

    # Build filename base similar to plugin
    if ev.days_of_week:
        base = f"(Every {','.join(ev.days_of_week)}) {constructed_title}"
    elif ev.month and ev.day_of_month:
        # Use short month name like the plugin (approximate; exact text is not critical for tests)
        import calendar

        mon_name = calendar.month_abbr[ev.month]
        base = f"(Every year on {mon_name} {ev.day_of_month}) {constructed_title}"
    elif ev.day_of_month:
        base = f"(Every month on the {ev.day_of_month}) {constructed_title}"
    else:
        base = f"(Recurring) {constructed_title}"

    filename = f"{base}.md"
    path = os.path.join(out_dir, filename)

    fm: List[str] = ["---\n"]
    fm.append(f"title: {constructed_title}\n")
    fm.append("type: recurring\n")

    if ev.days_of_week:
        # YAML array like [M,T,W]
        fm.append("daysOfWeek: [" + ",".join(ev.days_of_week) + "]\n")
    if ev.month is not None:
        fm.append(f"month: {ev.month}\n")
    if ev.day_of_month is not None:
        fm.append(f"dayOfMonth: {ev.day_of_month}\n")

    if ev.start_time is None:
        fm.append("allDay: true\n")
    else:
        fm.append("allDay: false\n")
        fm.append(f"startTime: {fmt_hhmm(ev.start_time)}\n")
        fm.append(f"endTime: {fmt_hhmm(ev.end_time or (ev.start_time + 60))}\n")

    fm.append(f"timezone: {ev.tz}\n")
    fm.append("---\n\n")

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(fm)
        f.write(f"# {constructed_title}\n\n")
        f.write("Recurring event note...\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Full Note calendar test data.")
    parser.add_argument("-o", "--output", default="events_fullnote", help="Output directory")
    parser.add_argument("-n", "--num", type=int, default=30, help="Number of single events")
    parser.add_argument("-r", "--recurring", type=int, default=6, help="Number of recurring events")
    parser.add_argument(
        "-s",
        "--start",
        default=date.today().isoformat(),
        help="Start date for single events (YYYY-MM-DD)",
    )

    args = parser.parse_args()
    out_dir = args.output
    os.makedirs(out_dir, exist_ok=True)

    start_dt = datetime.strptime(args.start, "%Y-%m-%d").date()

    # Generate singles spread over ~num days
    for i in range(args.num):
        d = start_dt + timedelta(days=i % max(1, args.num // 2))
        write_single(out_dir, gen_single_event(d))

    # Generate recurring definitions
    for _ in range(args.recurring):
        write_recurring(out_dir, gen_recurring_event())

    print(
        f"✅ Created {args.num} single and {args.recurring} recurring event notes in {out_dir}"
    )


if __name__ == "__main__":
    random.seed()
    main()
