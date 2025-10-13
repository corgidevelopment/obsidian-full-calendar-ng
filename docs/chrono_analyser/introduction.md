# Chrono Analyser

![Analyser Dashboard with Insights](../assets/chronoAnalyser.gif)

Chrono Analyser is an intelligent, built-in dashboard that transforms your calendar events into powerful, actionable insights. It goes beyond simple charting to help you understand, analyze, and optimize how you spend your time.

Whether you're tracking complex work projects, building consistent habits, or aiming for a better work-life balance, the Chrono Analyser provides the tools you need to see the bigger picture.

---

**See the standalong implementation:** 
➡️ [Iriginal Implementation](https://youfoundjk.github.io/Time-Analyser-Full-Calender/)

**Explore real-world scenarios:**  
➡️ [See User Use Cases](usecases.md)

**Got questions?**  
➡️ [Read the FAQ & Troubleshooting Guide](faq.md)

---

### Two Powerful Modes of Analysis

The Chrono Analyser adapts to your workflow. It operates in one of two modes, depending on your main Full Calendar plugin settings.

!!! success "Mode 1: Category-Based Analysis (Recommended)"
    -   **Requirement:** The **"Category Coloring"** feature is **enabled** in the main plugin settings.
    -   **How it Works:** The analyser uses the `Category` of your events as the top-level grouping (`Hierarchy`). This is the most powerful mode.
    -   **Supported Calendars:** ✅ **All of them!** Full Note, Daily Note, Google Calendar, CalDAV, and ICS calendars are all included in the analysis, giving you a complete picture of your time.

!!! info "Mode 2: Folder-Based Analysis (Legacy)"
    -   **Requirement:** The **"Category Coloring"** feature is **disabled**.
    -   **How it Works:** The analyser uses the **folder path** of your `FullNoteCalendar` sources as the `Hierarchy`.
    -   **Supported Calendars:** ⚠️ Only events from **Full Note Calendars** are processed in this mode.

---

## Opening the Analyser

You can access the Chrono Analyser directly from the main calendar view. A button labeled **"Analysis"** is available in the top-right header bar.

---

## Features

The Chrono Analyser is composed of two main features: the Proactive Insights Engine and the Interactive Charting Dashboard.

### ✨ The Proactive Insights Engine

This is the intelligent core of the analyser. Instead of forcing you to hunt for patterns, the engine analyzes your entire history and presents key findings automatically.

**How it Works:**

1.  **Configure (`⚙️` icon):** The first step is to teach the engine about your life. Click the `⚙️` icon to open the configuration wizard.
2.  **Create Insight Groups:** Define your own custom groups, like "Client Work," "Study," "Fitness," or "Family Time." For each group, you create simple rules based on your existing hierarchies (categories or folders), projects, and keywords.
3.  **Generate Insights:** Click the **"Generate Insights"** button. The engine will perform a non-blocking analysis of your data in the background.
4.  **Get Actionable Results:** The panel will populate with easy-to-read cards, highlighting trends, inconsistencies, and important summaries.
5.  **Explore Further:** Many insight cards are interactive. **Click on an insight** to instantly configure the main chart below to show you the relevant data for a deeper dive.

### 📊 The Interactive Charting Dashboard

This is your powerful, hands-on tool for exploring your data visually.

-   **Global Filters:** Filter all charts by Hierarchy (Category/Folder) and Project using intuitive autocomplete inputs.
-   **Date Range Selector:** Use the interactive date picker or preset buttons (Today, This Week, etc.) to narrow your analysis to a specific period.
-   **Analysis Types:**
    -   **Category Breakdown (Pie/Sunburst):** See how your time is distributed. Click any segment to open a detailed popup with every contributing event.
    -   **Time-Series Trend:** Visualize your effort over time. See an overall trend line or a stacked area chart to compare categories.
    -   **Activity Patterns:** Discover your peak productivity windows with heatmaps and charts for the day of the week and hour of the day.

---

## Common Use Cases

**The Freelancer / Consultant:**
-   Create an "Insight Group" for each client.
-   Use the "Activity Overview" insight to quickly see how many hours you've spent on each client in the last month.
-   Use the Time-Series chart to ensure your time allocation matches your project timelines.

**The Student:**
-   Create Insight Groups like "Lectures," "Revision," and "Assignments."
-   Use the "Habit Consistency" insight to see if you're falling behind on revision for a specific subject (e.g., "It's been over a week since you've logged 'Calculus Revision'").
-   Use the Activity Patterns heatmap to find your best study times.

**The Habit Builder:**
-   Create an Insight Group for "Wellness" with projects like "Gym," "Meditation," and "Reading."
-   The "Habit Consistency" table will instantly show you which habits you've missed, helping you get back on track.
-   Use the "Activity Overview" to celebrate your successes (e.g., "You spent 8.5 hours on 'Wellness' activities this month!").

---

## Frequently Asked Questions (FAQ)

**Q: Why aren't my Google Calendar / remote events showing up in the analysis?**
A: This happens when you are in Folder-Based (Legacy) Mode. To include all calendar sources, go to the main **Full Calendar plugin settings** and **enable the** ["Category Coloring" feature](events/categories.md). The analyser will then automatically switch to the more powerful Category-Based mode.

**Q: My insights look wrong or are empty. What should I do?**
A: The quality of your insights depends entirely on your configuration. Click the `⚙️` icon in the Insights panel and carefully review your **Insight Groups**. Ensure that the hierarchies, projects, and keywords you've entered exactly match the data in your events.

**Q: How does the "Habit Consistency" insight work?**
A: It looks for activities that you performed consistently in the past but have missed recently. By default, it flags any project that was logged 2 or more times in the last 30 days but has not been logged at all in the last 7 days.

**Q: Will generating insights slow down Obsidian?**
A: No. The core charting dashboard is designed to be fast and lightweight. The Insight Engine only runs when you explicitly click the **"Generate Insights"** button, and it performs its analysis in non-blocking chunks so the Obsidian interface remains responsive.