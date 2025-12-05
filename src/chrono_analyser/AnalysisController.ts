import { App, Notice } from 'obsidian';
import FullCalendarPlugin from '../main';
import * as Plotter from './ui/plotter';
import { DataManager } from './data/DataManager';
import { UIService, ChartType, ChartSpecificFilter } from './ui/UIService';
import { DataService } from './data/DataService';
import { TimeRecord } from './data/types';
import { InsightsEngine } from './data/InsightsEngine';
import { InsightConfigModal, InsightsConfig } from './ui/ui';
import { t } from '../features/i18n/i18n';

export class AnalysisController {
  public uiService: UIService;
  public dataService: DataService;
  public dataManager: DataManager;
  public insightsEngine: InsightsEngine;
  public rootEl: HTMLElement;

  private activeChartType: ChartType | null = null;
  private isChartRendered = false;

  private activePieBreakdown: string | null = null;
  private activeSunburstLevel: string | null = null;
  private activeTimeSeriesGranularity: string | null = null;
  private activeTimeSeriesType: string | null = null;
  private activeActivityPattern: string | null = null;

  constructor(
    private app: App,
    rootEl: HTMLElement,
    private plugin: FullCalendarPlugin
  ) {
    this.rootEl = rootEl;
    this.dataManager = new DataManager();
    this.insightsEngine = new InsightsEngine();

    this.uiService = new UIService(
      app,
      rootEl,
      plugin,
      () => this.updateAnalysis(),
      () => this.handleGenerateInsights(),
      () => this.openInsightsConfigModal()
    );

    this.dataService = new DataService(
      this.plugin.cache,
      this.dataManager,
      this.plugin.settings,
      () => this.handleDataReady()
    );
  }

  private async handleGenerateInsights() {
    const config = this.uiService.insightsConfig;
    if (!config || Object.keys(config.insightGroups).length === 0) {
      new Notice(t('notices.chronoAnalyserConfigureFirst'), 5000);
      return;
    }

    new Notice(t('notices.chronoAnalyserGeneratingInsights'));
    this.uiService.setInsightsLoading(true);

    const allRecords = this.dataManager.getAllRecords();
    try {
      const insights = await this.insightsEngine.generateInsights(allRecords, config);
      this.uiService.renderInsights(insights);
    } catch (error) {
      console.error('Error generating insights:', error);
      new Notice(t('notices.chronoAnalyserInsightsFailed'));
    } finally {
      this.uiService.setInsightsLoading(false);
    }
  }

  private openInsightsConfigModal() {
    new InsightConfigModal(
      this.app,
      this.uiService.insightsConfig,
      this.dataManager.getKnownHierarchies(),
      this.dataManager.getKnownProjects(),
      (newConfig: InsightsConfig) => {
        this.plugin.settings.chrono_analyser_config = newConfig;
        this.plugin.saveSettings();
        this.uiService.insightsConfig = newConfig;
        new Notice(t('notices.chronoAnalyserInsightsSaved'));
      }
    ).open();
  }

  public async initialize(): Promise<void> {
    await this.uiService.initialize();

    if (!this.plugin.cache.initialized) {
      new Notice(t('notices.chronoAnalyserInitializing'), 2000);
      await this.plugin.cache.populate();
    }

    this.dataService.initialize();
  }

  public destroy(): void {
    this.uiService.destroy();
    this.dataService.destroy();
  }

  private handleDataReady(): void {
    this.activeChartType = null;
    this.isChartRendered = false;
    this.uiService.populateFilterDataSources(
      () => this.dataManager.getKnownHierarchies(),
      () => this.dataManager.getKnownProjects()
    );
    this.updateAnalysis();
  }

  private updateAnalysis(): void {
    this.uiService.saveState(null);

    const { filters, newChartType, metric } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    const isNewChartType = this.activeChartType !== newChartType;
    let useReact = !isNewChartType && this.isChartRendered;

    if (!isNewChartType) {
      switch (chartSpecificFilters.chart) {
        case 'pie':
          if (this.activePieBreakdown !== chartSpecificFilters.breakdownBy) useReact = false;
          break;
        case 'sunburst':
          if (this.activeSunburstLevel !== chartSpecificFilters.level) useReact = false;
          break;
        case 'time-series':
          if (
            this.activeTimeSeriesGranularity !== chartSpecificFilters.granularity ||
            this.activeTimeSeriesType !== chartSpecificFilters.type
          )
            useReact = false;
          break;
        case 'activity':
          if (this.activeActivityPattern !== chartSpecificFilters.patternType) useReact = false;
          break;
      }
    }

    // REFACTOR: Tell DataManager to expand events for time-based charts
    const expandRecurring =
      chartSpecificFilters.chart === 'time-series' || chartSpecificFilters.chart === 'activity';
    const { records, totalHours, fileCount } = this.dataManager.getAnalyzedData(
      filters,
      null, // breakdown is handled by the chart strategy if needed
      { expandRecurring }
    );

    this.renderUI(records, totalHours, fileCount, useReact, isNewChartType, metric);

    this.activeChartType = newChartType;
    switch (chartSpecificFilters.chart) {
      case 'pie':
        this.activePieBreakdown = chartSpecificFilters.breakdownBy;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
        break;
      case 'sunburst':
        this.activeSunburstLevel = chartSpecificFilters.level;
        this.activePieBreakdown = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
        break;
      case 'time-series':
        this.activeTimeSeriesGranularity = chartSpecificFilters.granularity;
        this.activeTimeSeriesType = chartSpecificFilters.type;
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeActivityPattern = null;
        break;
      case 'activity':
        this.activeActivityPattern = chartSpecificFilters.patternType;
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        break;
      default:
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
    }
  }

  private renderUI(
    records: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean,
    isNewChartType: boolean,
    metric: 'duration' | 'count'
  ): void {
    Plotter.renderErrorLog(this.rootEl, [], this.dataManager.getTotalRecordCount());

    if (this.dataManager.getTotalRecordCount() === 0) {
      this.uiService.hideMainContainers();
      Plotter.renderChartMessage(
        this.rootEl,
        'No time-tracking events found in your configured Full Calendar sources.'
      );
      this.isChartRendered = false;
      return;
    }

    this.uiService.showMainContainers();

    if (records.length === 0) {
      this.uiService.renderStats('-', '-');
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false;
      return;
    }

    // Update Stats
    if (metric === 'count') {
      const totalCount = records.length;
      this.uiService.renderStats(totalCount, fileCount);
      const labelEl = this.rootEl.querySelector('#totalHours + .stat-label');
      if (labelEl) labelEl.textContent = 'Total Events';
    } else {
      this.uiService.renderStats(totalHours, fileCount);
      const labelEl = this.rootEl.querySelector('#totalHours + .stat-label');
      if (labelEl) labelEl.textContent = 'Total Hours (Filtered)';
    }

    const { newChartType } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    this.uiService.updateActiveAnalysisStat(
      newChartType ? newChartType.charAt(0).toUpperCase() + newChartType.slice(1) : 'None'
    );

    if (!newChartType) {
      this.uiService.hideMainContainers();
      return;
    }

    this.isChartRendered = true;

    // Render Chart
    switch (chartSpecificFilters.chart) {
      case 'pie':
        const pieData = this.dataManager.preparePieChartData(
          records,
          chartSpecificFilters.breakdownBy,
          metric
        );
        Plotter.renderPieChartDisplay(
          this.rootEl,
          pieData,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric
        );
        break;
      case 'sunburst':
        const sunburstData = this.dataManager.prepareSunburstData(
          records,
          chartSpecificFilters.level,
          metric
        );
        Plotter.renderSunburstChartDisplay(
          this.rootEl,
          sunburstData,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric
        );
        break;
      case 'time-series':
        Plotter.renderTimeSeriesChart(this.rootEl, records, useReact, isNewChartType, metric);
        break;
      case 'activity':
        Plotter.renderActivityPatternChart(
          this.rootEl,
          records,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric
        );
        break;
      default:
        Plotter.renderChartMessage(this.rootEl, `Unknown chart type: ${newChartType}`);
        this.isChartRendered = false;
    }
  }
}
