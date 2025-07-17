import { App } from "obsidian";
import FullCalendarPlugin from "../main";
import { addCalendarButton } from "./settings";
import type { CalendarInfo } from "../types";

export function renderOnboarding(app: App, plugin: FullCalendarPlugin, el: HTMLElement) {
  el.style.height = "100%";
  const nocal = el.createDiv();
  nocal.style.height = "100%";
  nocal.style.display = "flex";
  nocal.style.alignItems = "center";
  nocal.style.justifyContent = "center";
  const notice = nocal.createDiv();
  notice.createEl("h1").textContent = "No calendar available";
  notice.createEl("p").textContent = "Thanks for downloading Full Calendar! Create a calendar below to begin.";

  const containerEl = notice.createDiv();
  containerEl.style.position = "fixed";
  addCalendarButton({
    app,
    plugin,
    containerEl,
    submitCallback: async (source: CalendarInfo) => {
      const { calendarSources } = plugin.settings;
      calendarSources.push(source);
      await plugin.saveSettings();
      await plugin.activateView();
    }
  });
}
