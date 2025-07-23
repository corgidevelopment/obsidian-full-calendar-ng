// src/chrono_analyser/modules/InsightsEngine.ts

import { TimeRecord } from '../data/types';
import { InsightsConfig } from '../ui/ui';
import { FilterPayload } from '../ui/UIService';

const BATCH_SIZE = 500;

// This defines the structure for one of our interactive sub-items
export interface InsightPayloadItem {
  project: string;
  count: number;
  action: FilterPayload | null;
}

export interface Insight {
  displayText: string;
  category: string;
  sentiment: 'neutral' | 'positive' | 'warning';
  payload?: InsightPayloadItem[];
  action: FilterPayload | null;
}

export class InsightsEngine {
  constructor() {}

  /**
   * The main entry point for generating insights.
   * Processes all records asynchronously in chunks to avoid blocking the UI.
   * @param allRecords - The complete list of TimeRecords from the DataManager.
   * @param config - The user's defined Insight Group configuration.
   * @returns A promise that resolves to an array of Insight objects.
   */
  public async generateInsights(
    allRecords: TimeRecord[],
    config: InsightsConfig
  ): Promise<Insight[]> {
    const taggedRecords = await this._tagRecordsInBatches(allRecords, config);
    const insights: Insight[] = [];

    // --- Run Calculators ---
    insights.push(...this._calculateGroupDistribution(taggedRecords));
    // 1. Call the correctly named function.
    // 2. Handle the `Insight | null` return type.
    const lapsedHabitInsight = this._consolidateLapsedHabits(taggedRecords);
    if (lapsedHabitInsight) {
      // 3. Push the single object, not spread an array.
      insights.push(lapsedHabitInsight);
    }
    return insights;
  }

  // Helper to convert our markdown-like bold to HTML
  private _formatText(text: string): string {
    return text.replace(/\*\*'(.+?)'\*\*/g, '<strong>$1</strong>');
  }

  /**
   * Processes records in non-blocking chunks, applying semantic tags based on user rules.
   */
  private async _tagRecordsInBatches(
    records: TimeRecord[],
    config: InsightsConfig
  ): Promise<TimeRecord[]> {
    let taggedRecords: TimeRecord[] = [];
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const processedBatch = batch.map(record => this._tagRecord(record, config));
      taggedRecords = taggedRecords.concat(processedBatch);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return taggedRecords;
  }

  /**
   * Applies rules from the config to a single record to determine its semantic tags.
   */
  private _tagRecord(record: TimeRecord, config: InsightsConfig): TimeRecord {
    const tags = new Set<string>();
    const subprojectLower = record.subproject.toLowerCase();
    for (const groupName in config.insightGroups) {
      const group = config.insightGroups[groupName];

      // Guard against malformed or null entries in the config.
      if (!group || !group.rules) {
        continue; // Skip this invalid group and move to the next one.
      }
      const rules = group.rules;
      if (rules.hierarchies.some(h => h.toLowerCase() === record.hierarchy.toLowerCase())) {
        tags.add(groupName);
        continue;
      }
      if (rules.projects.some(p => p.toLowerCase() === record.project.toLowerCase())) {
        tags.add(groupName);
        continue;
      }
      if (rules.subprojectKeywords.some(kw => subprojectLower.includes(kw.toLowerCase()))) {
        tags.add(groupName);
      }
    }
    (record as any)._semanticTags = Array.from(tags);
    return record;
  }

  // --- INSIGHT CALCULATORS ---

  /**
   * Calculates the total time spent in each Insight Group over the last 30 days.
   */
  private _calculateGroupDistribution(taggedRecords: TimeRecord[]): Insight[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const distribution = new Map<string, number>();
    for (const record of taggedRecords) {
      const recordDate = record.date || new Date();
      if (recordDate < thirtyDaysAgo) continue;
      const tags = (record as any)._semanticTags || [];
      for (const tag of tags) {
        distribution.set(tag, (distribution.get(tag) || 0) + record.duration);
      }
    }
    const insights: Insight[] = [];
    for (const [groupName, hours] of distribution.entries()) {
      if (hours > 0) {
        insights.push({
          displayText: this._formatText(
            `You spent **'${hours.toFixed(1)} hours'** on **'${groupName}'** activities.`
          ),
          category: 'Activity Overview',
          sentiment: 'neutral',
          action: {
            analysisTypeSelect: 'pie',
            hierarchyFilterInput: groupName,
            dateRangePicker: [thirtyDaysAgo, new Date()],
            levelSelect_pie: 'project'
          }
        });
      }
    }
    return insights;
  }

  /**
   * Finds projects that were done regularly but have been missed recently.
   */
  private _consolidateLapsedHabits(taggedRecords: TimeRecord[]): Insight | null {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtySevenDaysAgo = new Date();
    thirtySevenDaysAgo.setDate(thirtySevenDaysAgo.getDate() - 37);
    const recentProjects = new Set<string>();
    const baselineProjects = new Map<string, number>();
    for (const record of taggedRecords) {
      const recordDate = record.date;
      if (!recordDate) continue;
      if (recordDate >= sevenDaysAgo) {
        recentProjects.add(record.project);
      } else if (recordDate >= thirtySevenDaysAgo) {
        baselineProjects.set(record.project, (baselineProjects.get(record.project) || 0) + 1);
      }
    }
    const lapsedHabitsPayload: InsightPayloadItem[] = [];
    for (const [project, count] of baselineProjects.entries()) {
      if (count >= 2 && !recentProjects.has(project)) {
        lapsedHabitsPayload.push({
          project,
          count,
          // Create the new, flat payload instead of the old { chartType, filters } object
          action: {
            analysisTypeSelect: 'time-series',
            projectFilterInput: project,
            dateRangePicker: [thirtySevenDaysAgo, new Date()]
          }
        });
      }
    }
    if (lapsedHabitsPayload.length === 0) return null;
    lapsedHabitsPayload.sort((a, b) => b.count - a.count);
    return {
      displayText: this._formatText(
        `You have **'${lapsedHabitsPayload.length} activities'** that you haven't logged in over a week, but were previously consistent.`
      ),
      category: 'Habit Consistency',
      sentiment: 'warning',
      payload: lapsedHabitsPayload,
      action: null
    };
  }
}
