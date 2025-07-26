"""
converter.py

Used to convert FullNoteCalender to DailyNoteCalender.

This script scans the current directory (recursively), processes markdown files with frontmatter,
and writes aggregated event and diary entries into an 'exported' directory.

Usage:
    python converter.py

Exports:
    - For each date found in the frontmatter, creates a markdown file in 'exported/' containing
      all events and diary entries for that date.

Frontmatter fields used:
    - date: Date string (YYYY-MM-DD)
    - title: Event title
    - timezone: Timezone string
    - startTime: Event start time
    - endTime: Event end time
    - endDate: Event end date (optional)
    - completed: Completion status (optional)
"""

import os
import re
from pathlib import Path
from collections import defaultdict

# Directory to export final files
EXPORT_DIR = Path("exported")
EXPORT_DIR.mkdir(exist_ok=True)

# Dictionary to hold entries per date
events_by_date = defaultdict(lambda: {"events": [], "diary": []})

def extract_frontmatter(text):
    """
    Extracts YAML frontmatter from a markdown text.

    Args:
        text (str): The markdown file content.

    Returns:
        tuple: (frontmatter_dict, body_text)
            frontmatter_dict (dict): Parsed key-value pairs from frontmatter.
            body_text (str): Markdown content after frontmatter.
    """
    match = re.match(r"^---\s*\n(.*?)\n---\s*", text, re.DOTALL)
    if not match:
        return {}, text

    frontmatter_text = match.group(1)
    body = text[match.end():].strip()

    frontmatter = {}
    for line in frontmatter_text.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            frontmatter[key.strip()] = value.strip()

    return frontmatter, body

def process_markdown_file(file_path):
    """
    Processes a markdown file, extracting frontmatter and body, and aggregates events/diary by date.

    Args:
        file_path (Path): Path to the markdown file.

    Returns:
        None
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if not content.startswith("---"):
        return  # skip non-frontmatter files

    try:
        frontmatter, body = extract_frontmatter(content)

        date = frontmatter.get("date")
        if not date:
            return

        title = frontmatter.get("title", "Untitled")
        timezone = frontmatter.get("timezone", "")
        start = frontmatter.get("startTime", "")
        end = frontmatter.get("endTime", "")
        end_date = frontmatter.get("endDate", "")
        completed = frontmatter.get("completed", "")

        # if str(date) != "2025-07-21":
        #     return
        # print(start, end, end_date, completed)
        # print(frontmatter)

        if completed is not None and completed != "":
            checkbox = "[x]" if bool(completed) else "[ ]"
        else:
            checkbox = ""

        if end_date is not None and end_date != "":
            event_line = (
                f"- {checkbox} {title}  [startTime:: {start}]  "
                f"[endTime:: {end}]  [endDate:: {end_date}]  [timezone:: {timezone}]"
            )
        else:
            event_line = (
                f"- {checkbox} {title}  [startTime:: {start}]  "
                f"[endTime:: {end}]  [timezone:: {timezone}]"
            )

        events_by_date[date]["events"].append(event_line)

        if body:
            events_by_date[date]["diary"].append(body)

    except Exception as e:
        print(f"Failed to parse {file_path}: {e}")

def write_aggregated_files():
    """
    Writes aggregated events and diary entries per date into markdown files in the export directory.

    Returns:
        None
    """
    for date, data in events_by_date.items():
        output_path = EXPORT_DIR / f"{date}.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("## Events\n")
            for event in data["events"]:
                f.write(f"{event}\n")
            f.write("## Diary\n")
            for diary in data["diary"]:
                f.write(f"{diary}\n")

def main():
    """
    Main entry point. Walks the directory, processes markdown files, and writes aggregated output.

    Returns:
        None
    """
    for root, dirs, files in os.walk("."):
        if EXPORT_DIR.name in dirs:
            dirs.remove(EXPORT_DIR.name)

        for file in files:
            if file.endswith(".md"):
                process_markdown_file(Path(root) / file)

    write_aggregated_files()
    print(f"Conversion complete. Files written to '{EXPORT_DIR}/'.")

if __name__ == "__main__":
    main()
