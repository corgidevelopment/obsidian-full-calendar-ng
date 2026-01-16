// src/chrono_analyser/modules/InsightsRenderer.ts

import { setIcon } from 'obsidian';
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
    this.containerEl.replaceChildren();
    if (this.insights.length === 0) {
      const placeholder = this.containerEl.createDiv({ cls: 'insights-placeholder' });
      placeholder.appendText('No specific insights found for the current period.');
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
    const iconDiv = header.createDiv({ cls: 'insight-icon' });
    setIcon(iconDiv, iconName);

    // --- MODIFIED: Safe rendering of text fragments ---
    const textContainer = header.createDiv({ cls: 'insight-text' });
    insight.displayTextFragments.forEach(fragment => {
      if (fragment.bold) {
        textContainer.createEl('strong', { text: fragment.text });
      } else {
        textContainer.appendText(fragment.text);
      }
    });
    // --- END MODIFICATION ---

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
    const subItemHeader = subItem.createDiv({ cls: 'insight-sub-item-header' });

    // This container ensures the icon and project name are grouped together
    const leftGroup = subItemHeader.createDiv({ cls: 'insight-sub-item-left-group' });

    if (item.subItems && item.subItems.length > 0) {
      const expander = leftGroup.createDiv({ cls: 'insight-sub-item-expander' });
      setIcon(expander, 'chevron-right');
      subItem.classList.add('is-expandable');
    }

    leftGroup.createEl('span', { cls: 'insight-sub-item-project', text: item.project });

    // Details text is now a separate flex item, creating the second column
    // --- MODIFIED: Safe rendering of details fragments ---
    if (item.detailsFragments) {
      const detailsSpan = subItemHeader.createEl('span', { cls: 'insight-sub-item-details' });
      item.detailsFragments.forEach(fragment => {
        const targetEl = fragment.bold ? detailsSpan.createEl('strong') : detailsSpan;
        targetEl.appendText(fragment.text);
      });
    }
    // --- END MODIFICATION ---

    // Button is the last flex item, pushed to the right
    const subItemGraphButton = this.createGraphButton(item.action);
    if (subItemGraphButton) {
      subItemHeader.appendChild(subItemGraphButton);
    }

    if (item.subItems && item.subItems.length > 0) {
      const nestedContainer = subItem.createDiv({ cls: 'insight-nested-container' });
      item.subItems.forEach(nestedItem => {
        this.renderNestedItem(nestedContainer, nestedItem);
      });
      subItemHeader.addEventListener('click', () => {
        subItem.classList.toggle('is-expanded');
      });
    }
  }

  private renderNestedItem(parentEl: HTMLElement, item: InsightPayloadItem): void {
    const nestedItemEl = parentEl.createDiv({ cls: 'insight-nested-item' });

    // Project column
    nestedItemEl.createEl('span', { cls: 'insight-nested-item-project', text: item.project });

    // Details column
    // --- MODIFIED: Safe rendering of details fragments ---
    if (item.detailsFragments) {
      const detailsEl = nestedItemEl.createEl('span', { cls: 'insight-nested-item-details' });
      item.detailsFragments.forEach(fragment => {
        const targetEl = fragment.bold ? detailsEl.createEl('strong') : detailsEl;
        targetEl.appendText(fragment.text);
      });
    }
    // --- END MODIFICATION ---

    // Action button column
    const graphButton = this.createGraphButton(item.action);
    if (graphButton) {
      nestedItemEl.appendChild(graphButton);
    }
  }

  private createGraphButton(action: FilterPayload | null): HTMLButtonElement | null {
    if (!action) return null;
    const button = document.createElement('button');
    button.className = 'insight-action-button clickable-icon';

    button.setAttribute('aria-label', 'View in chart');
    setIcon(button, 'bar-chart-horizontal');
    button.addEventListener('click', e => {
      e.stopPropagation();
      this.onActionClick(action);
    });
    return button;
  }
}
