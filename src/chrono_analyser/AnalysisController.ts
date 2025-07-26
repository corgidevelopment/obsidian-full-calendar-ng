/**
 * @file The main orchestrator for the Chrono Analyser.
 * This class connects the DataService and UIService, managing the flow of data
 * from the main plugin's EventCache and triggering UI updates in response.
 */

import { App, Notice } from 'obsidian';
import FullCalendarPlugin from '../main';
import * as Plotter from './ui/plotter';
import * as Aggregator from './data/aggregator';
import { DataManager } from './data/DataManager';
import { UIService } from './ui/UIService';
import { DataService } from './data/DataService';
import { PieData, TimeRecord } from './data/types';
import { InsightsEngine } from './data/InsightsEngine';
import { InsightConfigModal, InsightsConfig } from './ui/ui'; // Import necessary types

interface IChartStrategy {
  analysisName: string;
  render(
    controller: AnalysisController,
    useReact: boolean,
    filteredRecords: TimeRecord[],
    isNewChartType: boolean
  ): void;
}

export class AnalysisController {
  public uiService: UIService;
  public dataService: DataService;
  public dataManager: DataManager;
  public insightsEngine: InsightsEngine;
  public rootEl: HTMLElement;

  private activeChartType: string | null = null;
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
      new Notice('Please configure your Insight Groups first using the ⚙️ icon.', 5000);
      return;
    }

    new Notice(
      `Using insights rules last updated on ${new Date(config.lastUpdated).toLocaleString()}.`
    );
    this.uiService.setInsightsLoading(true);

    const allRecords = this.dataManager.getAllRecords();
    try {
      const insights = await this.insightsEngine.generateInsights(allRecords, config);
      this.uiService.renderInsights(insights);
    } catch (error) {
      console.error('Error generating insights:', error);
      new Notice('Failed to generate insights. Check the developer console for errors.');
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
        new Notice('Insights configuration saved!');
      }
    ).open();
  }

  public async initialize(): Promise<void> {
    await this.uiService.initialize();

    if (!this.plugin.cache.initialized) {
      new Notice('Chrono Analyser: Initializing event cache...', 2000);
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

    const { filters, newChartType } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    const isNewChartType = this.activeChartType !== newChartType;
    let useReact = !isNewChartType && this.isChartRendered;

    if (!isNewChartType) {
      switch (newChartType) {
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

    // filters.pattern = chartSpecificFilters.pattern; // DELETE THIS LINE

    // REFACTOR: Tell DataManager to expand events for time-based charts
    const expandRecurring = ['time-series', 'activity'].includes(newChartType || '');
    const { records, totalHours, fileCount } = this.dataManager.getAnalyzedData(
      filters,
      null, // breakdown is handled by the chart strategy if needed
      { expandRecurring }
    );

    this.renderUI(records, totalHours, fileCount, useReact, isNewChartType);

    this.activeChartType = newChartType;
    this.activePieBreakdown = newChartType === 'pie' ? chartSpecificFilters.breakdownBy : null;
    this.activeSunburstLevel = newChartType === 'sunburst' ? chartSpecificFilters.level : null;
    this.activeTimeSeriesGranularity =
      newChartType === 'time-series' ? chartSpecificFilters.granularity : null;
    this.activeTimeSeriesType = newChartType === 'time-series' ? chartSpecificFilters.type : null;
    this.activeActivityPattern =
      newChartType === 'activity' ? chartSpecificFilters.patternType : null;
  }

  private renderUI(
    filteredRecords: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean,
    isNewChartType: boolean
  ) {
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

    if (filteredRecords.length === 0) {
      this.uiService.renderStats('-', '-');
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false;
      return;
    }

    this.uiService.renderStats(totalHours, fileCount);

    const { newChartType } = this.uiService.getFilterState();
    const chartStrategies = this.createChartStrategies();
    const strategy = chartStrategies.get(newChartType!);

    if (strategy) {
      this.uiService.updateActiveAnalysisStat(strategy.analysisName);
      strategy.render(this, useReact, filteredRecords, isNewChartType);
      this.isChartRendered = true;
    } else {
      Plotter.renderChartMessage(this.rootEl, `Unknown chart type: ${newChartType}`);
      this.isChartRendered = false;
    }
  }

  private createChartStrategies(): Map<string, IChartStrategy> {
    const strategies = new Map<string, IChartStrategy>();

    strategies.set('pie', {
      analysisName: 'Category Breakdown',
      render: (
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) => {
        const pieFilters = controller.uiService.getChartSpecificFilter('pie');
        const breakdownBy = pieFilters.breakdownBy as keyof TimeRecord;

        const aggregation = new Map<string, number>();
        const recordsByCategory = new Map<string, TimeRecord[]>();

        for (const record of filteredRecords) {
          const key = String(record[breakdownBy] || `(No ${breakdownBy})`);
          // No more regex checks needed here
          const duration = record._effectiveDurationInPeriod || 0;
          aggregation.set(key, (aggregation.get(key) || 0) + duration);

          if (!recordsByCategory.has(key)) recordsByCategory.set(key, []);
          recordsByCategory.get(key)!.push(record);
        }

        const pieData: PieData = { hours: aggregation, recordsByCategory, error: false };
        Plotter.renderPieChartDisplay(
          controller.rootEl,
          pieData,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    strategies.set('sunburst', {
      analysisName: 'Hierarchical Breakdown',
      render: (
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) => {
        const sunburstFilters = controller.uiService.getChartSpecificFilter('sunburst');
        const sunburstData = Aggregator.aggregateForSunburst(
          filteredRecords,
          sunburstFilters.level
        );
        Plotter.renderSunburstChartDisplay(
          controller.rootEl,
          sunburstData,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    strategies.set('time-series', {
      analysisName: 'Time-Series Trend',
      render: (
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) => {
        // No extra data fetching needed, plotter will use the pre-expanded records
        Plotter.renderTimeSeriesChart(controller.rootEl, filteredRecords, useReact, isNewChartType);
      }
    });

    strategies.set('activity', {
      analysisName: 'Activity Patterns',
      render: (
        controller: AnalysisController,
        useReact: boolean,
        filteredRecords: TimeRecord[],
        isNewChartType: boolean
      ) => {
        // No extra data fetching needed, plotter will use the pre-expanded records
        Plotter.renderActivityPatternChart(
          controller.rootEl,
          filteredRecords,
          controller.uiService.showDetailPopup,
          useReact,
          isNewChartType
        );
      }
    });

    return strategies;
  }
}
