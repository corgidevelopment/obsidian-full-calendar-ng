# Chrono Analyser

![Analyser Dashboard](assets/ChronoAnalyser.png)

Chrono Analyser is a powerful, built-in data visualization tool that allows you to analyze how you spend your time. It reads events from your "Full Note" calendars and generates interactive charts and statistics to help you understand your productivity, habits, and scheduling patterns.

!!! success "Supported Calendars"
    Currently, the Chrono Analyser only processes events from **Full Note Calendars**. Events from Daily Note or remote calendars are not yet included in the analysis.

## Opening the Analyser

You can access the Chrono Analyser directly from the main calendar view. A button labeled **"Analysis"** is available in the top-right header bar.

<!-- ![Open Analyser](assets/open-analyser.gif) -->

## Features

The Chrono Analyser provides a rich dashboard with multiple ways to explore your data.

### Interactive Dashboard

The main view consists of several key components:
-   **Global Filters:** Filter all charts by Calendar Source (Hierarchy) and Project.
-   **Date Range Selector:** Use the interactive date picker or preset buttons (Today, This Week, etc.) to narrow your analysis to a specific period.
-   **Analysis Type:** Choose from several different chart types to visualize your data in different ways.
-   **Statistics:** See high-level statistics like total hours and the number of events in your filtered selection.
-   **Interactive Chart:** The main chart area, which updates dynamically as you change filters.

### Analysis Types

-   **Category Breakdown (Pie/Sunburst):** See how your time is distributed across different projects or calendar hierarchies. Click on a slice to drill down and see the underlying event data.
-   **Time-Series Trend:** See how your time spent on tasks changes over time. You can view the overall trend or a stacked area chart broken down by category.
-   **Activity Patterns:** Discover your most productive times by analyzing your activity by day of the week, hour of the day, or with a detailed heatmap.

### Drilling Down into Data

Almost every element in the Chrono Analyser is interactive.
-   **Click on a chart segment** (like a pie slice or a bar) to open a detailed popup.
-   The popup shows summary statistics for that specific category and a detailed table of every event that contributed to it.