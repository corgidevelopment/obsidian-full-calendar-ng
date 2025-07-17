// src/chrono_analyser/modules/aggregator.ts

/**
 * @file Responsible for complex, multi-level aggregations that do not fit the generic
 * single-pass model in the DataManager. Currently, this is only used for Sunburst charts.
 */

import { TimeRecord, SunburstData } from './types';

/**
 * Aggregates a list of TimeRecords into a hierarchical structure for a Sunburst chart.
 * @param filteredRecords - The array of records to aggregate.
 * @param level - The aggregation level: 'project' or 'subproject'.
 * @returns A SunburstData object ready for plotting.
 */
export function aggregateForSunburst(filteredRecords: TimeRecord[], level: string): SunburstData {
  const data: SunburstData = {
    ids: [],
    labels: [],
    parents: [],
    values: [],
    recordsByLabel: new Map()
  };

  let innerField: keyof TimeRecord;
  let outerField: keyof TimeRecord;

  if (level === 'project') {
    innerField = 'hierarchy';
    outerField = 'project';
  } else {
    innerField = 'project';
    outerField = 'subproject';
  }

  const uniqueEntries = new Map<
    string,
    { duration: number; records: TimeRecord[]; inner: string; outer: string }
  >();

  for (const record of filteredRecords) {
    const duration = record._effectiveDurationInPeriod;
    if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) continue;

    const innerVal = String(record[innerField] || `(No ${innerField})`).trim();
    const outerVal = String(record[outerField] || `(No ${outerField})`).trim();
    const leafId = `${innerVal} - ${outerVal}`;

    if (!uniqueEntries.has(leafId)) {
      uniqueEntries.set(leafId, { duration: 0, records: [], inner: innerVal, outer: outerVal });
    }
    const entry = uniqueEntries.get(leafId)!;
    entry.duration += duration;
    entry.records.push(record);
  }

  const parentTotals = new Map<string, number>();
  let grandTotal = 0;

  for (const { duration, inner } of uniqueEntries.values()) {
    parentTotals.set(inner, (parentTotals.get(inner) || 0) + duration);
  }
  for (const total of parentTotals.values()) {
    grandTotal += total;
  }

  const rootId = 'Total';
  data.ids.push(rootId);
  data.labels.push(rootId);
  data.parents.push('');
  data.values.push(grandTotal);
  data.recordsByLabel.set(rootId, filteredRecords);

  for (const [parent, total] of parentTotals.entries()) {
    data.ids.push(parent);
    data.labels.push(parent);
    data.parents.push(rootId);
    data.values.push(total);
    const parentRecords = filteredRecords.filter(
      r => String(r[innerField] || `(No ${innerField})`).trim() === parent
    );
    data.recordsByLabel.set(parent, parentRecords);
  }

  for (const [leafId, { duration, records, inner, outer }] of uniqueEntries.entries()) {
    data.ids.push(leafId);
    data.labels.push(outer);
    data.parents.push(inner);
    data.values.push(duration);
    data.recordsByLabel.set(leafId, records);
  }

  return data;
}
