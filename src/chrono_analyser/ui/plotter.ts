/**
 * @file Handles all chart rendering logic using the Plotly.js library.
 * Each function in this module takes prepared data and renders a specific type of chart to the DOM.
 */

import Plotly from './plotly-custom';
import {
  TimeRecord,
  SunburstData,
  PieData,
  PLOTLY_BASE_LAYOUT,
  PLOTLY_LIGHT_THEME,
  PLOTLY_DARK_THEME,
  ProcessingError
} from '../data/types';
import * as Utils from '../data/utils';

type ShowDetailPopupFn = (categoryName: string, recordsList: TimeRecord[], context?: any) => void;

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeout: number | null = null;
  return (...args: Parameters<T>): void => {
    if (timeout) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

const debouncedResize = debounce((element: HTMLElement) => {
  Plotly.Plots.resize(element);
}, 100);

const chartResizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const element = entry.target as HTMLElement;
    if (element.offsetParent !== null) {
      debouncedResize(element);
    }
  }
});

let currentlyObservedChart: HTMLElement | null = null;

function manageChartResizeObserver(element: HTMLElement) {
  if (currentlyObservedChart) {
    chartResizeObserver.unobserve(currentlyObservedChart);
  }
  chartResizeObserver.observe(element);
  currentlyObservedChart = element;
}

export function renderChartMessage(rootEl: HTMLElement, message: string) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;

  if (currentlyObservedChart) {
    chartResizeObserver.unobserve(currentlyObservedChart);
    currentlyObservedChart = null;
  }
  Plotly.purge(mainChartEl);

  (mainChartEl as any).empty(); // Safely clear content
  (mainChartEl as any).createEl('p', { cls: 'chart-message', text: message });
}

function getThemedLayout(chartLayout: Partial<Plotly.Layout>): Partial<Plotly.Layout> {
  const isDarkMode = document.body.classList.contains('theme-dark');
  const theme = isDarkMode ? PLOTLY_DARK_THEME : PLOTLY_LIGHT_THEME;
  return { ...PLOTLY_BASE_LAYOUT, ...theme, ...chartLayout };
}

function plotChart(
  mainChartEl: HTMLElement,
  data: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  useReact: boolean
) {
  const finalLayout = getThemedLayout(layout);
  if (useReact) {
    Plotly.react(mainChartEl, data, finalLayout, { responsive: true });
  } else {
    Plotly.newPlot(mainChartEl, data, finalLayout, { responsive: true });
  }
  manageChartResizeObserver(mainChartEl);
}

export function renderPieChartDisplay(
  rootEl: HTMLElement,
  pieData: PieData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;

  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    (mainChartEl as any).empty();
  }

  const levelSelect = rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie');
  const chartTitleText = levelSelect
    ? levelSelect.selectedOptions[0].text.split('(')[0].trim()
    : 'Category';
  const data: Plotly.Data[] = [
    {
      type: 'pie',
      labels: Array.from(pieData.hours.keys()),
      values: Array.from(pieData.hours.values()),
      textinfo: 'label+percent',
      textposition: 'outside',
      hoverinfo: 'label+value+percent',
      marker: { line: { color: 'white', width: 2 } }
    }
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: `Time Distribution by ${chartTitleText}` },
    showlegend: true,
    margin: { l: 40, r: 40, t: 60, b: 80 }
  };

  plotChart(mainChartEl, data, layout, useReact);

  const plotlyChart = mainChartEl as any;
  plotlyChart.removeAllListeners('plotly_click');
  plotlyChart.on('plotly_click', (eventData: any) => {
    if (eventData.points && eventData.points.length > 0) {
      const point = eventData.points[0];
      const categoryName = point.label;
      if (pieData.recordsByCategory.has(categoryName)) {
        showDetailPopup(categoryName, pieData.recordsByCategory.get(categoryName)!, {
          type: 'pie',
          value: point.value
        });
      }
    }
  });
}

export function renderSunburstChartDisplay(
  rootEl: HTMLElement,
  sunburstData: SunburstData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean
) {
  const mainContainerEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainContainerEl) return;

  if (isNewChartType) {
    Plotly.purge(mainContainerEl);
    const container = mainContainerEl as any;
    container.empty();
    const wrapper = container.createDiv({ cls: 'sunburst-wrapper' });
    wrapper.createDiv({ cls: 'sunburst-chart-div' });
    wrapper.createDiv({
      cls: 'custom-legend',
      attr: { id: 'customLegend' } // Keep ID for now, style with class
    });
  }

  const chartEl = mainContainerEl.querySelector<HTMLElement>('.sunburst-chart-div');
  const legendEl = mainContainerEl.querySelector<HTMLElement>('.custom-legend');
  if (!chartEl || !legendEl) return;

  const data: Plotly.Data[] = [
    {
      type: 'sunburst',
      ids: sunburstData.ids,
      labels: sunburstData.labels,
      parents: sunburstData.parents,
      values: sunburstData.values,
      branchvalues: 'total',
      hoverinfo: 'label+value+percent root',
      insidetextorientation: 'radial'
    } as any
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: 'Time Breakdown' },
    margin: { l: 0, r: 0, b: 0, t: 40 },
    showlegend: false
  };

  plotChart(chartEl, data, layout, useReact);
  if (legendEl) {
    (legendEl as any).empty();
  }

  const plotlyChart = chartEl as any;
  plotlyChart.removeAllListeners('plotly_sunburstclick');
  plotlyChart.on('plotly_sunburstclick', (eventData: any) => {
    if (eventData.points && eventData.points.length > 0) {
      const point = eventData.points[0];
      if (point.id && sunburstData.recordsByLabel.has(point.id)) {
        showDetailPopup(point.label, sunburstData.recordsByLabel.get(point.id)!, {
          type: 'sunburst',
          value: point.value
        });
      }
    }
  });
}

export function renderTimeSeriesChart(
  rootEl: HTMLElement,
  filteredRecords: TimeRecord[],
  useReact: boolean,
  isNewChartType: boolean
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    (mainChartEl as any).empty();
  }

  if (!filteredRecords || filteredRecords.length === 0) {
    renderChartMessage(rootEl, 'No data available for Time-Series chart.');
    return;
  }

  const granularity = rootEl.querySelector<HTMLSelectElement>(
    '#timeSeriesGranularitySelect'
  )?.value;
  const chartType = rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value;
  const stackingLevel = rootEl.querySelector<HTMLSelectElement>('#timeSeriesStackingLevelSelect')
    ?.value as keyof TimeRecord;
  if (!granularity || !chartType || !stackingLevel) return;

  const dataByPeriod = new Map<string, { total: number; categories: { [key: string]: number } }>();

  // REFACTORED: Simple, unified loop. All records are now dated instances.
  filteredRecords.forEach(record => {
    if (!record.date || isNaN(record.date.getTime())) return;
    const duration = record._effectiveDurationInPeriod || 0;
    if (duration <= 0) return;

    let periodKey: string | null;
    if (granularity === 'daily') periodKey = Utils.getISODate(record.date);
    else if (granularity === 'weekly')
      periodKey = Utils.getISODate(Utils.getWeekStartDate(record.date));
    else periodKey = Utils.getISODate(Utils.getMonthStartDate(record.date));

    if (!periodKey) return;

    if (!dataByPeriod.has(periodKey)) dataByPeriod.set(periodKey, { total: 0, categories: {} });
    const periodData = dataByPeriod.get(periodKey)!;
    periodData.total += duration;

    if (chartType === 'stackedArea') {
      const category = String(record[stackingLevel] || `(No ${stackingLevel})`);
      periodData.categories[category] = (periodData.categories[category] || 0) + duration;
    }
  });

  const sortedPeriods = Array.from(dataByPeriod.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );
  const traces: Partial<Plotly.PlotData>[] = [];

  if (sortedPeriods.length === 0) {
    renderChartMessage(rootEl, 'No data points to plot for Time-Series.');
    return;
  }

  if (chartType === 'line') {
    traces.push({
      x: sortedPeriods,
      y: sortedPeriods.map(p => dataByPeriod.get(p)!.total.toFixed(2)),
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Total Hours'
    });
  } else {
    const allCategories = new Set<string>();
    sortedPeriods.forEach(p =>
      Object.keys(dataByPeriod.get(p)!.categories).forEach(cat => allCategories.add(cat))
    );

    Array.from(allCategories)
      .sort()
      .forEach(category => {
        traces.push({
          x: sortedPeriods,
          y: sortedPeriods.map(p => (dataByPeriod.get(p)!.categories[category] || 0).toFixed(2)),
          type: 'scatter',
          mode: 'lines',
          stackgroup: 'one',
          name: category,
          hoverinfo: 'x+y+name'
        });
      });
  }

  const layout: Partial<Plotly.Layout> = {
    title: {
      text: `Time Spent (${granularity}) - ${
        chartType === 'line' ? 'Overall Trend' : `Stacked by ${stackingLevel}`
      }`
    },
    xaxis: { title: { text: 'Period' }, type: 'date' },
    yaxis: { title: { text: 'Hours' } },
    margin: { t: 50, b: 80, l: 60, r: 30 },
    hovermode: 'x unified'
  };
  plotChart(mainChartEl, traces as Plotly.Data[], layout, useReact);
}

export function renderActivityPatternChart(
  rootEl: HTMLElement,
  filteredRecords: TimeRecord[],
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    (mainChartEl as any).empty();
  }

  if (!filteredRecords || filteredRecords.length === 0) {
    renderChartMessage(rootEl, 'No data available for Activity Patterns.');
    return;
  }

  const patternTypeEl = rootEl.querySelector<HTMLSelectElement>('#activityPatternTypeSelect');
  if (!patternTypeEl) return;
  const patternType = patternTypeEl.value;
  const analysisTypeName = patternTypeEl.selectedOptions[0]?.text || 'Activity Pattern';

  let data: Partial<Plotly.PlotData>[] = [];
  let layout: Partial<Plotly.Layout> = {};
  let plotType: 'bar' | 'heatmap' = 'bar';
  const daysOfWeekLabels = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}`);
  const activityLayoutMargin = { t: 50, b: 60, l: 70, r: 30 };

  if (patternType === 'dayOfWeek') {
    const hoursByDay = Array(7).fill(0);
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      if (record.date && !isNaN(record.date.getTime())) {
        const dayIndex = record.date.getUTCDay();
        hoursByDay[dayIndex] += record._effectiveDurationInPeriod || 0;
      }
    });
    data = [{ x: daysOfWeekLabels, y: hoursByDay.map(h => h.toFixed(2)), type: 'bar' }];
    layout = {
      title: { text: 'Total Hours by Day of Week' },
      yaxis: { title: { text: 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'hourOfDay') {
    const hoursByHour = Array(24).fill(0);
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
      const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
      if (startHour !== null) {
        hoursByHour[startHour] += record._effectiveDurationInPeriod || 0;
      }
    });
    data = [{ x: hourLabels, y: hoursByHour.map(h => h.toFixed(2)), type: 'bar' }];
    layout = {
      title: { text: 'Total Hours by Task Start Hour' },
      xaxis: { title: { text: 'Hour of Day (0-23)' } },
      yaxis: { title: { text: 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'heatmapDOWvsHOD') {
    plotType = 'heatmap';
    const heatmapData = Array(7)
      .fill(null)
      .map(() => Array(24).fill(0));
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
      const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
      if (startHour === null) return;
      if (record.date && !isNaN(record.date.getTime())) {
        const dayIndex = record.date.getUTCDay();
        heatmapData[dayIndex][startHour] += record._effectiveDurationInPeriod || 0;
      }
    });
    data = [
      {
        z: heatmapData.map(row => row.map(val => (val > 0 ? val.toFixed(2) : null))),
        x: hourLabels,
        y: daysOfWeekLabels,
        type: 'heatmap',
        colorscale: 'Viridis',
        hoverongaps: false
      }
    ];
    layout = {
      title: { text: 'Activity Heatmap (Day vs Task Start Hour)' },
      xaxis: { title: { text: 'Hour of Day (0-23)' } },
      margin: activityLayoutMargin
    };
  }

  if (
    !data.length ||
    (plotType === 'bar' && (data[0] as any).y.every((val: string) => parseFloat(val) === 0)) ||
    (plotType === 'heatmap' &&
      (data[0] as any).z.flat().every((val: string | null) => val === null))
  ) {
    renderChartMessage(rootEl, `No data to plot for ${analysisTypeName}.`);
    return;
  }
  plotChart(mainChartEl, data as Plotly.Data[], layout, useReact);

  const plotlyChart = mainChartEl as any;
  plotlyChart.removeAllListeners('plotly_click');
  plotlyChart.on('plotly_click', (eventData: any) => {
    if (!eventData.points || eventData.points.length === 0) return;
    const point = eventData.points[0];
    let recordsForPopup: TimeRecord[] = [];
    let categoryNameForPopup = '';
    let clickedValue: number | null = null;

    if (plotType === 'bar') {
      const categoryClicked = point.x;
      clickedValue = parseFloat(point.y);

      if (patternType === 'dayOfWeek') {
        const dayIndexClicked = daysOfWeekLabels.indexOf(categoryClicked);
        if (dayIndexClicked === -1) return;
        categoryNameForPopup = `${categoryClicked} (Day)`;
        recordsForPopup = filteredRecords.filter(
          r => r.date && r.date.getUTCDay() === dayIndexClicked
        );
      } else if (patternType === 'hourOfDay') {
        const hourClicked = parseInt(categoryClicked, 10);
        if (isNaN(hourClicked)) return;
        categoryNameForPopup = `${categoryClicked}:00 (Start Hour)`;
        recordsForPopup = filteredRecords.filter(r => {
          const startTime = 'startTime' in r.metadata ? r.metadata.startTime : null;
          return startTime && Utils.getHourFromTimeStr(startTime) === hourClicked;
        });
      }
    } else if (plotType === 'heatmap') {
      const clickedHour = parseInt(point.x, 10);
      const clickedDayIndex = daysOfWeekLabels.indexOf(point.y);
      clickedValue = parseFloat(point.z);

      if (isNaN(clickedHour) || clickedDayIndex === -1 || !clickedValue || clickedValue === 0)
        return;
      const nextHour = (clickedHour + 1) % 24;
      categoryNameForPopup = `Activity: ${point.y}, ${String(clickedHour).padStart(2, '0')}:00 - ${String(nextHour).padStart(2, '0')}:00`;
      recordsForPopup = filteredRecords.filter(r => {
        const startTime = 'startTime' in r.metadata ? r.metadata.startTime : null;
        return (
          startTime &&
          Utils.getHourFromTimeStr(startTime) === clickedHour &&
          r.date &&
          r.date.getUTCDay() === clickedDayIndex
        );
      });
    }

    if (recordsForPopup.length > 0) {
      showDetailPopup(categoryNameForPopup, recordsForPopup, { value: clickedValue });
    }
  });
}

export function renderErrorLog(
  rootEl: HTMLElement,
  processingErrors: ProcessingError[],
  recordsCount: number
) {
  const errorLogContainer = rootEl.querySelector<HTMLElement>('#errorLogContainer');
  const errorLogSummary = rootEl.querySelector<HTMLElement>('#errorLogSummary');
  const errorLogEntries = rootEl.querySelector<HTMLElement>('#errorLogEntries');
  if (!errorLogContainer || !errorLogSummary || !errorLogEntries) return;

  const entriesContainer = errorLogEntries as any;
  entriesContainer.empty();

  if (processingErrors.length === 0) {
    errorLogSummary.textContent =
      'No processing issues found. All data is sourced from the main Full Calendar cache.';
    errorLogContainer.style.display = 'none';
    return;
  }

  errorLogSummary.textContent = `Found ${processingErrors.length} issue(s) during data translation:`;

  processingErrors.forEach(err => {
    const details = entriesContainer.createEl('details', { cls: 'log-entry' });

    const summary = details.createEl('summary');
    summary.textContent = `⚠️ ${err.file || 'Unknown File'}`;

    const content = details.createDiv({ cls: 'log-entry-content' });

    content.createEl('strong', { text: 'Path: ' });
    content.appendText(err.path || 'N/A');
    content.createEl('br');
    content.createEl('strong', { text: 'Reason: ' });
    content.appendText(err.reason || 'No specific reason provided.');
    details.appendChild(summary);
    details.appendChild(content);
    errorLogEntries.appendChild(details);
  });
  errorLogContainer.style.display = 'block';
}
