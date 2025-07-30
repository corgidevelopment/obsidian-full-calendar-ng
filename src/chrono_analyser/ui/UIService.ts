/**
 * @file Manages all DOM interactions, UI state, and event handling for the Chrono Analyser view.
 * This service acts as the interface between the user and the application, abstracting all direct
 * DOM manipulation away from the controller.
 */

import { App, debounce, Notice } from 'obsidian';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import * as UI from './ui';
import { AnalysisFilters } from '../data/DataManager';
import { TimeRecord } from '../data/types';
import * as Utils from '../data/utils';
import FullCalendarPlugin from '../../main';
import { InsightsConfig } from './ui';
import { Insight } from '../data/InsightsEngine';
import { DetailPopup } from './components/DetailPopup';
import { InsightsRenderer } from './components/InsightsRenderer';

export interface FilterPayload {
  analysisTypeSelect?: string;
  hierarchyFilterInput?: string;
  projectFilterInput?: string;
  dateRangePicker?: [Date, Date];
  levelSelect_pie?: string;
  levelSelect?: string;
  patternInput?: string;
  timeSeriesGranularitySelect?: string;
  timeSeriesTypeSelect?: string;
  timeSeriesStackingLevelSelect?: string;
  activityPatternTypeSelect?: string;
}

/**
 * Manages the main UI controls and delegates popups and complex rendering.
 */
export class UIService {
  private flatpickrInstance: FlatpickrInstance | null = null;
  private detailPopup: DetailPopup;
  private uiStateKey = 'ChronoAnalyzerUIState_v5';
  public insightsConfig: InsightsConfig | null = null;

  // --- PRO-TIPS PANEL PROPERTIES ---
  private proTipsPanel: HTMLElement | null = null;
  private proTipTextEl: HTMLElement | null = null;
  private currentTipIndex = -1;
  private readonly proTips: string[] = [
    'Enable "Category Coloring" in the main Full Calendar settings for the best experience. This allows ChronoAnalyser to group activities by their assigned category.',
    'Log your activities for at least a month to unlock more powerful and accurate trend insights, like the "Lapsed Habits" detector.',
    'Use the ⚙️ icon to create "Insight Groups" like "Work", "Learning", or "Exercise". This helps the engine understand your time on a deeper level.',
    'Click on any item in an insight card (e.g., "Project Phoenix") to instantly filter the main chart and explore the data behind the insight.',
    'The "Filter by Category" input is a powerful search tool. Use it to find specific tasks (e.g., "meeting") or exclude others (e.g., "-break -lunch").',
    'Combine filters! You can filter by Hierarchy, Project, Date Range, and Category all at once to drill down into your data.'
  ];
  // --- END PRO-TIPS PANEL PROPERTIES ---

  constructor(
    private app: App,
    private rootEl: HTMLElement,
    private plugin: FullCalendarPlugin,
    private onFilterChange: () => void,
    private onGenerateInsights: () => void,
    private onOpenConfig: () => void
  ) {
    this.detailPopup = new DetailPopup(this.app, this.rootEl);
  }

  public async initialize(): Promise<void> {
    this.setupEventListeners();
    this.loadFilterState();
    await this.loadInsightsConfig();
    this.setupProTips();
  }

  private async loadInsightsConfig() {
    this.insightsConfig = this.plugin.settings.chrono_analyser_config || null;
  }

  public setControlPanelState(payload: FilterPayload) {
    // Clear inputs first
    this.rootEl.querySelector<HTMLInputElement>('#hierarchyFilterInput')!.value = '';
    this.rootEl.querySelector<HTMLInputElement>('#projectFilterInput')!.value = '';
    this.rootEl.querySelector<HTMLInputElement>('#patternInput')!.value = '';

    for (const key in payload) {
      if (key === 'dateRangePicker') {
        const dates = payload[key as 'dateRangePicker'];
        if (dates && this.flatpickrInstance) {
          this.flatpickrInstance.setDate(dates, false);
        }
      } else {
        const element = this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${key}`);
        if (element) {
          element.value = payload[key as keyof FilterPayload] as string;
        }
      }
    }

    this.handleAnalysisTypeChange(false);
    this.handleTimeSeriesTypeVis();
    this.onFilterChange();
    this.rootEl.querySelector('.controls')?.scrollIntoView({ behavior: 'smooth' });
  }

  // UIService.ts

  public setInsightsLoading(isLoading: boolean) {
    const generateBtn = this.rootEl.querySelector<HTMLButtonElement>('#generateInsightsBtn');
    const resultContainer = this.rootEl.querySelector<HTMLElement>('#insightsResultContainer');
    if (!generateBtn || !resultContainer) return;

    if (isLoading) {
      generateBtn.textContent = 'Processing...';
      generateBtn.disabled = true;
      generateBtn.classList.add('is-loading');
      // MODIFIED: Programmatically create the loading indicator
      const container = resultContainer as any;
      container.empty();
      const loadingContainer = container.createDiv({ cls: 'loading-container' });
      loadingContainer.createDiv({ cls: 'loading-spinner' });
      loadingContainer.createDiv({ text: 'Analyzing your data...' });
    } else {
      generateBtn.textContent = 'Generate Insights';
      generateBtn.disabled = false;
      generateBtn.classList.remove('is-loading');
    }
  }

  public renderInsights(insights: Insight[]) {
    const resultContainer = this.rootEl.querySelector<HTMLElement>('#insightsResultContainer');
    if (!resultContainer) return;

    const renderer = new InsightsRenderer(resultContainer, insights, payload => {
      this.setControlPanelState(payload);
    });
    renderer.render();
  }

  // Delegate to the DetailPopup instance
  public showDetailPopup = (categoryName: string, recordsList: TimeRecord[], context: any = {}) => {
    this.detailPopup.show(categoryName, recordsList, context);
  };

  public destroy(): void {
    this.flatpickrInstance?.destroy();
  }

  public getFilterState(): { filters: AnalysisFilters; newChartType: string | null } {
    const hierarchyFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#hierarchyFilterInput')
        ?.value.trim()
        .toLowerCase() || undefined;
    const projectFilter =
      this.rootEl
        .querySelector<HTMLInputElement>('#projectFilterInput')
        ?.value.trim()
        .toLowerCase() || undefined;
    const dates = this.flatpickrInstance?.selectedDates;
    const filterStartDate = dates && dates.length === 2 ? dates[0] : null;
    const filterEndDate = dates && dates.length === 2 ? dates[1] : null;
    // ADDED: Pattern is now a global filter
    const pattern = this.rootEl.querySelector<HTMLInputElement>('#patternInput')?.value ?? '';

    const filters: AnalysisFilters = {
      hierarchy: hierarchyFilter,
      project: projectFilter,
      filterStartDate,
      filterEndDate,
      pattern: pattern // Now part of the main filter object
    };

    const newChartType =
      this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value ?? null;
    return { filters, newChartType };
  }

  public getChartSpecificFilter(type: string | null): Record<string, any> {
    switch (type) {
      case 'pie':
        return {
          breakdownBy: (this.rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie')?.value ||
            'hierarchy') as keyof TimeRecord
          // The 'pattern' property is now removed from here
        };
      case 'sunburst':
        return {
          level: this.rootEl.querySelector<HTMLSelectElement>('#levelSelect')?.value ?? ''
          // The 'pattern' property is now removed from here
        };
      case 'time-series':
        return {
          granularity:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesGranularitySelect')?.value ??
            'daily',
          type:
            this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value ?? 'line'
        };
      case 'activity':
        return {
          patternType:
            this.rootEl.querySelector<HTMLSelectElement>('#activityPatternTypeSelect')?.value ??
            'dayOfWeek'
        };
      default:
        return {};
    }
  }

  public renderStats(totalHours: number | string, fileCount: number | string): void {
    (this.rootEl.querySelector('#totalHours') as HTMLElement).textContent =
      typeof totalHours === 'number' ? totalHours.toFixed(2) : totalHours;
    (this.rootEl.querySelector('#totalFiles') as HTMLElement).textContent = String(fileCount);
  }

  public updateActiveAnalysisStat(name: string): void {
    const el = this.rootEl.querySelector('#currentAnalysisTypeStat') as HTMLElement;
    if (el) el.textContent = name;
  }

  public showMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.classList.remove('hidden-controls');
    this.rootEl
      .querySelector<HTMLElement>('#mainChartContainer')!
      .classList.remove('hidden-controls');
  }

  public hideMainContainers(): void {
    this.rootEl.querySelector<HTMLElement>('#statsGrid')!.classList.add('hidden-controls');
    this.rootEl.querySelector<HTMLElement>('#mainChartContainer')!.classList.add('hidden-controls');
  }

  private setupEventListeners = () => {
    // Insights Buttons
    this.rootEl
      .querySelector('#configureInsightsBtn')
      ?.addEventListener('click', () => this.onOpenConfig());
    this.rootEl
      .querySelector('#generateInsightsBtn')
      ?.addEventListener('click', () => this.onGenerateInsights());

    // Date Picker
    const datePickerEl = this.rootEl.querySelector<HTMLInputElement>('#dateRangePicker');
    if (datePickerEl) {
      this.flatpickrInstance = flatpickr(datePickerEl, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'M j, Y',
        onChange: this.onFilterChange
      });
    }

    // Date Preset Buttons
    this.rootEl.querySelector('#clearDatesBtn')?.addEventListener('click', this.clearDateFilters);
    this.rootEl
      .querySelector('#setTodayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('today'));
    this.rootEl
      .querySelector('#setYesterdayBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('yesterday'));
    this.rootEl
      .querySelector('#setThisWeekBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisWeek'));
    this.rootEl
      .querySelector('#setThisMonthBtn')
      ?.addEventListener('click', () => this.setPresetDateRange('thisMonth'));

    // Analysis Controls
    this.rootEl
      .querySelector('#analysisTypeSelect')
      ?.addEventListener('change', () => this.handleAnalysisTypeChange());
    this.rootEl.querySelector('#levelSelect_pie')?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#levelSelect')?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#patternInput')
      ?.addEventListener('input', debounce(this.onFilterChange, 300));
    this.rootEl
      .querySelector('#timeSeriesGranularitySelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl.querySelector('#timeSeriesTypeSelect')?.addEventListener('change', () => {
      this.handleTimeSeriesTypeVis();
      this.onFilterChange();
    });
    this.rootEl
      .querySelector('#timeSeriesStackingLevelSelect')
      ?.addEventListener('change', this.onFilterChange);
    this.rootEl
      .querySelector('#activityPatternTypeSelect')
      ?.addEventListener('change', this.onFilterChange);
  };

  public saveState = (lastFolderPath: string | null) => {
    const getElValue = (id: string) =>
      this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value;
    const state: any = {
      analysisTypeSelect: getElValue('analysisTypeSelect'),
      hierarchyFilter: getElValue('hierarchyFilterInput'),
      projectFilter: getElValue('projectFilterInput'),
      levelSelect_pie: getElValue('levelSelect_pie'),
      levelSelect: getElValue('levelSelect'),
      patternInput: getElValue('patternInput'),
      timeSeriesGranularity: getElValue('timeSeriesGranularitySelect'),
      timeSeriesType: getElValue('timeSeriesTypeSelect'),
      timeSeriesStackingLevel: getElValue('timeSeriesStackingLevelSelect'),
      activityPatternType: getElValue('activityPatternTypeSelect')
    };

    if (this.flatpickrInstance && this.flatpickrInstance.selectedDates.length === 2) {
      state.startDate = Utils.getISODate(this.flatpickrInstance.selectedDates[0]);
      state.endDate = Utils.getISODate(this.flatpickrInstance.selectedDates[1]);
    } else {
      state.startDate = '';
      state.endDate = '';
    }
    localStorage.setItem(
      this.uiStateKey,
      JSON.stringify(Object.fromEntries(Object.entries(state).filter(([_, v]) => v != null)))
    );
  };

  private loadFilterState = () => {
    const savedState = localStorage.getItem(this.uiStateKey);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        const setVal = (id: string, val: string | undefined) => {
          const el = this.rootEl.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
          if (el && val !== undefined) el.value = val;
        };
        setVal('analysisTypeSelect', state.analysisTypeSelect);
        setVal('hierarchyFilterInput', state.hierarchyFilter);
        setVal('projectFilterInput', state.projectFilter);
        if (state.startDate && state.endDate && this.flatpickrInstance) {
          setTimeout(
            () => this.flatpickrInstance?.setDate([state.startDate, state.endDate], false),
            0
          );
        }
        setVal('levelSelect_pie', state.levelSelect_pie);
        setVal('levelSelect', state.levelSelect);
        setVal('patternInput', state.patternInput);
        setVal('timeSeriesGranularitySelect', state.timeSeriesGranularity);
        setVal('timeSeriesTypeSelect', state.timeSeriesType);
        setVal('timeSeriesStackingLevelSelect', state.timeSeriesStackingLevel);
        setVal('activityPatternTypeSelect', state.activityPatternType);
        this.handleAnalysisTypeChange(false);
      } catch (error) {
        console.error('[ChronoAnalyzer] Error loading UI state:', error);
        localStorage.removeItem(this.uiStateKey);
      }
    }
  };

  private handleAnalysisTypeChange = (triggerAnalysis = true) => {
    const analysisType = this.rootEl.querySelector<HTMLSelectElement>('#analysisTypeSelect')?.value;
    const allSpecificControls = [
      'sunburstBreakdownLevelContainer',
      'pieBreakdownLevelContainer',
      'timeSeriesGranularityContainer',
      'timeSeriesTypeContainer',
      'timeSeriesStackingLevelContainer',
      'activityPatternTypeContainer'
    ];

    // Hide all specific controls first
    allSpecificControls.forEach(id =>
      this.rootEl.querySelector(`#${id}`)?.classList.add('hidden-controls')
    );

    // Then show the relevant ones
    if (analysisType === 'sunburst') {
      this.rootEl
        .querySelector('#sunburstBreakdownLevelContainer')
        ?.classList.remove('hidden-controls');
    } else if (analysisType === 'pie') {
      this.rootEl.querySelector('#pieBreakdownLevelContainer')?.classList.remove('hidden-controls');
    } else if (analysisType === 'time-series') {
      this.rootEl
        .querySelector('#timeSeriesGranularityContainer')
        ?.classList.remove('hidden-controls');
      this.rootEl.querySelector('#timeSeriesTypeContainer')?.classList.remove('hidden-controls');
      this.handleTimeSeriesTypeVis(); // This correctly shows/hides the stacking level
    } else if (analysisType === 'activity') {
      this.rootEl
        .querySelector('#activityPatternTypeContainer')
        ?.classList.remove('hidden-controls');
    }

    if (triggerAnalysis) {
      this.onFilterChange();
    }
  };

  private handleTimeSeriesTypeVis = () => {
    const timeSeriesType =
      this.rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value;
    const stackingLevelContainer = this.rootEl.querySelector<HTMLElement>(
      '#timeSeriesStackingLevelContainer'
    );
    if (stackingLevelContainer) {
      stackingLevelContainer.classList.toggle('hidden-controls', timeSeriesType !== 'stackedArea');
    }
  };

  private setPresetDateRange(preset: string) {
    const today = new Date();
    let startDate, endDate;
    switch (preset) {
      case 'today':
        startDate = today;
        endDate = today;
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = startDate;
        break;
      case 'thisWeek':
        startDate = new Date(today);
        const day = today.getDay();
        startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); // Assumes Monday is the start of the week
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      default:
        return;
    }
    if (this.flatpickrInstance) this.flatpickrInstance.setDate([startDate, endDate], true);
  }

  private clearDateFilters = () => {
    if (this.flatpickrInstance) this.flatpickrInstance.clear(true, true);
  };

  public populateFilterDataSources(getHierarchies: () => string[], getProjects: () => string[]) {
    const hierarchyWrapper = this.rootEl
      .querySelector<HTMLInputElement>('#hierarchyFilterInput')
      ?.closest('.autocomplete-wrapper');
    if (hierarchyWrapper instanceof HTMLElement) {
      UI.setupAutocomplete(
        hierarchyWrapper,
        value => {
          const input = hierarchyWrapper.querySelector('input');
          if (input) input.value = value;
          this.onFilterChange();
        },
        getHierarchies
      );
    }
    const projectWrapper = this.rootEl
      .querySelector<HTMLInputElement>('#projectFilterInput')
      ?.closest('.autocomplete-wrapper');
    if (projectWrapper instanceof HTMLElement) {
      UI.setupAutocomplete(
        projectWrapper,
        value => {
          const input = projectWrapper.querySelector('input');
          if (input) input.value = value;
          this.onFilterChange();
        },
        getProjects
      );
    }
  }

  // --- PRO-TIPS PANEL LOGIC ---
  private setupProTips = () => {
    this.proTipsPanel = this.rootEl.querySelector<HTMLElement>('#proTipsPanel');
    this.proTipTextEl = this.rootEl.querySelector<HTMLElement>('#proTipText');

    if (!this.proTipsPanel || !this.proTipTextEl) return;

    const showNextTip = () => {
      if (!this.proTipTextEl) return;
      this.proTipTextEl.style.opacity = '0';
      setTimeout(() => {
        if (!this.proTipTextEl) return;
        this.currentTipIndex = (this.currentTipIndex + 1) % this.proTips.length;
        this.proTipTextEl.textContent = this.proTips[this.currentTipIndex];
        this.proTipTextEl.style.opacity = '1';
      }, 150);
    };

    showNextTip();
    this.proTipsPanel.addEventListener('click', showNextTip);
  };
}
