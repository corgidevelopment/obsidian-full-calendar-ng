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

interface DetailPopupContextBase {
  [key: string]: unknown;
  value?: number | null;
}
type ShowDetailPopupFn = (
  categoryName: string,
  recordsList: TimeRecord[],
  context?: DetailPopupContextBase
) => void;

type PlotlyPoint = {
  label?: string | number;
  value?: number | string;
  id?: string | number;
  x?: string | number;
  y?: string | number;
  z?: number | string;
};

type PlotlyEvent = { points?: PlotlyPoint[] } | null | undefined;

// Type guard for Obsidian HTMLElement extensions
interface ObsidianHTMLElement extends HTMLElement {
  empty(): void;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: { cls?: string; text?: string; attr?: Record<string, string> } | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void
  ): HTMLElementTagNameMap[K];
  createDiv(
    o?: { cls?: string; text?: string; attr?: Record<string, string> } | string
  ): HTMLDivElement;
}

// Helper functions to safely interact with DOM elements
function safeEmpty(element: HTMLElement): void {
  const maybe = element as Partial<ObsidianHTMLElement>;
  if (typeof maybe.empty === 'function') {
    maybe.empty();
    element.innerHTML = '';
  } else {
    element.textContent = '';
  }
}

interface CreateOptions {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
}
function safeCreateEl(element: HTMLElement, tag: string, options?: CreateOptions): HTMLElement {
  const maybe = element as Partial<ObsidianHTMLElement>;
  if (typeof maybe.createEl === 'function') {
    return maybe.createEl(
      tag as keyof HTMLElementTagNameMap,
      options as CreateOptions
    ) as HTMLElement;
  }

  const newEl = document.createElement(tag);
  if (options) {
    if (options.cls) newEl.className = options.cls;
    if (options.text) newEl.textContent = options.text;
    if (options.attr) {
      Object.entries(options.attr).forEach(([key, value]) => newEl.setAttribute(key, value));
    }
  }
  element.appendChild(newEl);
  return newEl;
}

function safeCreateDiv(element: HTMLElement, options?: CreateOptions): HTMLDivElement {
  return safeCreateEl(element, 'div', options) as HTMLDivElement;
}

function formatCategoryValue(value: TimeRecord[keyof TimeRecord], label: string): string {
  if (value === undefined || value === null || value === '') {
    return `(No ${label})`;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error('[ChronoAnalyzer] Failed to stringify category value:', error);
      return `(No ${label})`;
    }
  }

  return String(value);
}

function setupPlotlyEvents(
  element: HTMLElement,
  eventType: string,
  handler: (eventData: unknown) => void
): void {
  const maybe = element as unknown as {
    removeAllListeners?: (evt: string) => void;
    on?: (evt: string, cb: (d: unknown) => void) => void;
  };
  maybe.removeAllListeners?.(eventType);
  maybe.on?.(eventType, handler);
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  let timeout: number | null = null;
  return (...args: A): void => {
    if (timeout !== null) {
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

  safeEmpty(mainChartEl);
  safeCreateEl(mainChartEl, 'p', { cls: 'chart-message', text: message });
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
    void Plotly.react(mainChartEl, data, finalLayout, { responsive: true });
  } else {
    void Plotly.newPlot(mainChartEl, data, finalLayout, { responsive: true });
  }
  manageChartResizeObserver(mainChartEl);
}

export function renderPieChartDisplay(
  rootEl: HTMLElement,
  pieData: PieData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count'
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;

  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    safeEmpty(mainChartEl);
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
    title: {
      text: `${metric === 'count' ? 'Event Count' : 'Time'} Distribution by ${chartTitleText}`
    },
    showlegend: true,
    margin: { l: 40, r: 40, t: 60, b: 80 }
  };

  plotChart(mainChartEl, data, layout, useReact);

  // Set up event handling with proper typing
  setupPlotlyEvents(mainChartEl, 'plotly_click', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    const point = points?.[0];
    if (!point || point.label === undefined) return;
    const categoryName = String(point.label);
    if (pieData.recordsByCategory.has(categoryName)) {
      showDetailPopup(categoryName, pieData.recordsByCategory.get(categoryName)!, {
        type: 'pie',
        value: typeof point.value === 'number' ? point.value : Number(point.value) || null
      });
    }
  });
}

export function renderSunburstChartDisplay(
  rootEl: HTMLElement,
  sunburstData: SunburstData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count'
) {
  const mainContainerEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainContainerEl) return;

  if (isNewChartType) {
    Plotly.purge(mainContainerEl);
    safeEmpty(mainContainerEl);
    const wrapper = safeCreateDiv(mainContainerEl, { cls: 'sunburst-wrapper' });
    safeCreateDiv(wrapper, { cls: 'sunburst-chart-div' });
    safeCreateDiv(wrapper, {
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
      hoverinfo: 'text'
      // Note: insidetextorientation property exists in Plotly but not in TypeScript types
    } as Plotly.PlotData
  ];

  const layout: Partial<Plotly.Layout> = {
    title: { text: metric === 'count' ? 'Event Count Breakdown' : 'Time Breakdown' },
    margin: { l: 0, r: 0, b: 0, t: 40 },
    showlegend: false
  };

  plotChart(chartEl, data, layout, useReact);
  if (legendEl) {
    safeEmpty(legendEl);
  }

  setupPlotlyEvents(chartEl, 'plotly_sunburstclick', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    const point = points?.[0];
    if (!point || point.id === undefined || point.label === undefined) return;
    if (sunburstData.recordsByLabel.has(String(point.id))) {
      showDetailPopup(String(point.label), sunburstData.recordsByLabel.get(String(point.id))!, {
        type: 'sunburst',
        value: typeof point.value === 'number' ? point.value : Number(point.value) || null
      });
    }
  });
}

export function renderTimeSeriesChart(
  rootEl: HTMLElement,
  filteredRecords: TimeRecord[],
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count'
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    safeEmpty(mainChartEl);
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
    const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
    if (metric === 'duration' && value <= 0) return;

    let periodKey: string | null;
    if (granularity === 'daily') periodKey = Utils.getISODate(record.date);
    else if (granularity === 'weekly')
      periodKey = Utils.getISODate(Utils.getWeekStartDate(record.date));
    else periodKey = Utils.getISODate(Utils.getMonthStartDate(record.date));

    if (!periodKey) return;

    if (!dataByPeriod.has(periodKey)) dataByPeriod.set(periodKey, { total: 0, categories: {} });
    const periodData = dataByPeriod.get(periodKey)!;
    periodData.total += value;

    if (chartType === 'stackedArea') {
      const category = formatCategoryValue(record[stackingLevel], stackingLevel);
      periodData.categories[category] = (periodData.categories[category] || 0) + value;
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
      y: sortedPeriods.map(p => Number(dataByPeriod.get(p)!.total.toFixed(2))),
      type: 'scatter',
      mode: 'lines+markers',
      name: metric === 'count' ? 'Total Events' : 'Total Hours'
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
          y: sortedPeriods.map(p =>
            Number((dataByPeriod.get(p)!.categories[category] || 0).toFixed(2))
          ),
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
      text: `${metric === 'count' ? 'Event Count' : 'Time Spent'} (${granularity}) - ${
        chartType === 'line' ? 'Overall Trend' : `Stacked by ${stackingLevel}`
      }`
    },
    xaxis: { title: { text: 'Period' }, type: 'date' },
    yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
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
  isNewChartType: boolean,
  metric: 'duration' | 'count'
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    Plotly.purge(mainChartEl);
    safeEmpty(mainChartEl);
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
    const hoursByDay: number[] = Array.from({ length: 7 }, () => 0);
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      if (record.date && !isNaN(record.date.getTime())) {
        const dayIndex = record.date.getUTCDay();
        const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
        hoursByDay[dayIndex] += value;
      }
    });
    data = [{ x: daysOfWeekLabels, y: hoursByDay.map(h => Number(h.toFixed(2))), type: 'bar' }];
    layout = {
      title: { text: `Total ${metric === 'count' ? 'Events' : 'Hours'} by Day of Week` },
      yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'hourOfDay') {
    const hoursByHour: number[] = Array.from({ length: 24 }, () => 0);
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
      const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
      if (startHour !== null) {
        const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
        hoursByHour[startHour] += value;
      }
    });
    data = [{ x: hourLabels, y: hoursByHour.map(h => Number(h.toFixed(2))), type: 'bar' }];
    layout = {
      title: { text: `Total ${metric === 'count' ? 'Events' : 'Hours'} by Task Start Hour` },
      xaxis: { title: { text: 'Hour of Day (0-23)' } },
      yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'heatmapDOWvsHOD') {
    plotType = 'heatmap';
    const heatmapData: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0)
    );
    // REFACTORED: Simple, unified loop.
    filteredRecords.forEach(record => {
      const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
      const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
      if (startHour === null) return;
      if (record.date && !isNaN(record.date.getTime())) {
        const dayIndex = record.date.getUTCDay();
        const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
        heatmapData[dayIndex][startHour] += value;
      }
    });
    data = [
      {
        z: heatmapData.map(row => row.map(val => (val > 0 ? Number(val.toFixed(2)) : null))),
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

  // Type-safe data validation
  function hasEmptyBarData(plotData: Partial<Plotly.PlotData>[]): boolean {
    if (!plotData.length) return true;
    const firstData = plotData[0];
    if (plotType === 'bar' && firstData && 'y' in firstData && Array.isArray(firstData.y)) {
      return firstData.y.every(val => parseFloat(String(val)) === 0);
    }
    return false;
  }

  function hasEmptyHeatmapData(plotData: Partial<Plotly.PlotData>[]): boolean {
    if (!plotData.length) return true;
    const firstData = plotData[0];
    if (plotType === 'heatmap' && firstData && 'z' in firstData && Array.isArray(firstData.z)) {
      const zData = firstData.z as Array<Array<string | null>>;
      return zData.flat().every(val => val === null);
    }
    return false;
  }

  if (!data.length || hasEmptyBarData(data) || hasEmptyHeatmapData(data)) {
    renderChartMessage(rootEl, `No data to plot for ${analysisTypeName}.`);
    return;
  }
  plotChart(mainChartEl, data as Plotly.Data[], layout, useReact);

  setupPlotlyEvents(mainChartEl, 'plotly_click', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    if (!points || points.length === 0) return;
    const point = points[0];
    let recordsForPopup: TimeRecord[] = [];
    let categoryNameForPopup = '';
    let clickedValue: number | null = null;

    if (plotType === 'bar') {
      const categoryClickedRaw = point.x;
      if (categoryClickedRaw === undefined || categoryClickedRaw === null) return;
      const categoryClicked = String(categoryClickedRaw);
      clickedValue = typeof point.y === 'number' ? point.y : parseFloat(String(point.y));

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
      const clickedHour = typeof point.x === 'number' ? point.x : parseInt(String(point.x), 10);
      const clickedDayIndex = daysOfWeekLabels.indexOf(String(point.y));
      clickedValue = typeof point.z === 'number' ? point.z : parseFloat(String(point.z));

      if (
        Number.isNaN(clickedHour) ||
        clickedDayIndex === -1 ||
        !clickedValue ||
        clickedValue === 0
      )
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

  // Clear entries safely
  safeEmpty(errorLogEntries);

  if (processingErrors.length === 0) {
    errorLogSummary.textContent =
      'No processing issues found; all data is sourced from the main cache.';
    errorLogContainer.addClass('is-hidden');
    errorLogContainer.removeClass('is-visible');
    return;
  }

  errorLogSummary.textContent = `Found ${processingErrors.length} issue(s) during data translation:`;

  processingErrors.forEach(err => {
    const details = safeCreateEl(errorLogEntries, 'details', {
      cls: 'log-entry'
    }) as HTMLDetailsElement;
    const summary = safeCreateEl(details, 'summary');
    const content = safeCreateDiv(details, { cls: 'log-entry-content' });

    summary.textContent = `⚠️ ${err.file || 'Unknown file'}`;

    safeCreateEl(content, 'strong', { text: 'Path: ' });
    content.appendChild(document.createTextNode(err.path || 'N/A'));
    safeCreateEl(content, 'br');

    safeCreateEl(content, 'strong', { text: 'Reason: ' });
    content.appendChild(document.createTextNode(err.reason || 'No specific reason provided.'));
  });
  errorLogContainer.removeClass('is-hidden');
  errorLogContainer.addClass('is-visible');
}
