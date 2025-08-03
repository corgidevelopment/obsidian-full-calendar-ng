import os
import random
from datetime import datetime, timedelta

# Output directory
output_dir = "events_with_titles"
os.makedirs(output_dir, exist_ok=True)

# Title parts
title1_list = ["Productive", "Strategic", "Casual", "Focused", "Creative", "Urgent", "Fun"]
title2_list = ["Meeting", "Workshop", "Session", "Call", "Training", "Review", "Briefing", "Discussion", "Planning"]
title3_list = ["2025", "Alpha", "Plus", "Beta", "Deluxe", "Prime", "Pro", "Grocery", "Lunch", "Dinner"]

def random_title_parts():
    return (
        random.choice(title1_list),
        random.choice(title2_list),
        random.choice(title3_list),
    )

for i in range(20):
    # Pick date for the file
    date_obj = datetime.today() - timedelta(days=10) + timedelta(days=i)
    date_str = date_obj.strftime("%Y-%m-%d")

    # Pick random title parts
    t1, t2, t3 = random_title_parts()

    # File name
    filename = f"{output_dir}/{date_str} {t1} {t2} {t3}.md"

    # Content with frontmatter
    content = f"""---
title: {t3}
allDay: false
startTime: 12:00
endTime: 13:00
date: {date_str}
timezone: Europe/Budapest
---
"""

    with open(filename, "w") as f:
        f.write(content)

print(f"✅ Created 20 markdown files in ./{output_dir}")
