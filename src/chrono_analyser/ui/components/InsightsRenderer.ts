// src/chrono_analyser/modules/InsightsRenderer.ts

import { Insight, InsightPayloadItem } from '../../data/InsightsEngine';
import { FilterPayload } from '../UIService';

/**
 * Renders insights into a designated container, handling all DOM creation and interaction.
 */
export class InsightsRenderer {
  private readonly iconMap: { [key: string]: string } = {
    neutral: 'info',
    positive: 'trending-up',
    warning: 'alert-triangle'
  };

  constructor(
    private containerEl: HTMLElement,
    private insights: Insight[],
    private onActionClick: (payload: FilterPayload) => void
  ) {}

  public render(): void {
    this.containerEl.innerHTML = '';
    if (this.insights.length === 0) {
      this.containerEl.innerHTML = `<div class="insights-placeholder">No specific insights found for the current period.</div>`;
      return;
    }

    const groupedInsights = this.groupInsightsByCategory();

    for (const category in groupedInsights) {
      const groupContainer = this.containerEl.createDiv({ cls: 'insight-group' });
      groupContainer.createEl('h3', { cls: 'insight-group-title', text: category });
      groupedInsights[category].forEach(insight => {
        this.renderInsightCard(groupContainer, insight);
      });
    }
  }

  private groupInsightsByCategory(): { [key: string]: Insight[] } {
    return this.insights.reduce(
      (groups, insight) => {
        const key = insight.category;
        if (!groups[key]) groups[key] = [];
        groups[key].push(insight);
        return groups;
      },
      {} as { [key: string]: Insight[] }
    );
  }

  private renderInsightCard(parentEl: HTMLElement, insight: Insight): void {
    const card = parentEl.createDiv({ cls: `insight-card sentiment-${insight.sentiment}` });
    const header = card.createDiv({ cls: 'insight-card-header' });
    const body = card.createDiv({ cls: 'insight-card-body is-folded' });

    const iconName = this.iconMap[insight.sentiment] || 'info';
    header.innerHTML += `<div class="insight-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${iconName}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>`;
    header.createDiv({ cls: 'insight-text' }).innerHTML = insight.displayText;

    const graphButton = this.createGraphButton(insight.action);
    if (graphButton) {
      header.appendChild(graphButton);
    }

    header.addEventListener('click', () => {
      body.classList.toggle('is-folded');
      card.classList.toggle('is-unfolded');
    });

    if (insight.payload && insight.payload.length > 0) {
      insight.payload.forEach((item: InsightPayloadItem) => {
        this.renderSubItem(body, item);
      });
    }
  }

  private renderSubItem(parentEl: HTMLElement, item: InsightPayloadItem): void {
    const subItem = parentEl.createDiv({ cls: 'insight-sub-item' });
    subItem.createEl('span', { cls: 'insight-sub-item-project', text: item.project });
    subItem.createEl('span', {
      cls: 'insight-sub-item-details',
      text: `(logged ${item.count} times in the month prior)`
    });

    const subItemGraphButton = this.createGraphButton(item.action);
    if (subItemGraphButton) {
      subItem.appendChild(subItemGraphButton);
    }
  }

  private createGraphButton(action: FilterPayload | null): HTMLButtonElement | null {
    if (!action) return null;
    const button = document.createElement('button');
    button.className = 'insight-action-button clickable-icon';
    button.setAttribute('aria-label', 'View in Chart');
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-bar-chart-horizontal"><path d="M3 3v18h18"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h4"/></svg>`;
    button.addEventListener('click', e => {
      e.stopPropagation();
      this.onActionClick(action);
    });
    return button;
  }
}
