import os
import random
from datetime import datetime, timedelta

output_dir = "events_md"
os.makedirs(output_dir, exist_ok=True)

prefixes = ["[x] ", ""]
title1 = ["Productive -", "Strategic -", "Casual -", "Focused-", "Creative -", "Urgent", "Fun  -"]
title2 = ["Meeting", "Workshop", "Session", "Call", "Training", "Review", "Briefing", "Discussion", "Planning"]
title3 = ["test", "- Alpha", "- Plus", "- Beta", "", "Prime", "- Pro", "-  Grocery", " - Lunch", "- Dinner"]

def random_title():
    return f"{random.choice(prefixes)}{random.choice(title1)} {random.choice(title2)} {random.choice(title3)}"

def format_time(minutes):
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"

for i in range(20):
    date = (datetime.today() - timedelta(days=10) + timedelta(days=i)).strftime("%Y-%m-%d")
    filename = f"{output_dir}/{date}.md"

    lines = ["## Events\n"]
    events_count = random.randint(3, 8)

    # Start day at a random time (between 6:00–9:00)
    current_time = random.randint(3 * 60, 8 * 60)

    for _ in range(events_count):
        title = random_title()

        # Random duration for the event
        duration = random.randint(30, 240)  # 30–120 min
        start_time_str = format_time(current_time)
        end_time_minutes = current_time + duration
        end_time_str = format_time(end_time_minutes)

        # Add event line
        lines.append(f"- {title}  [startTime:: {start_time_str}]  [endTime:: {end_time_str}]  [timezone:: Europe/Budapest]\n")
        # Gap before next event (30–90 min)
        current_time = end_time_minutes + random.randint(-30, 90)

        # Avoid scheduling past 22:00
        if current_time > 23 * 60:
            break

    lines.append("\n\n\n## Diary\n")
    with open(filename, "w") as f:
        f.writelines(lines)

print(f"✅ Created 20 markdown files in ./{output_dir}")
