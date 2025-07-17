import { TFile } from "obsidian";
import type { EditableEventResponse } from "./EditableCalendar";

export interface FileBasedCalendar {
  directory: string;
  getEventsInFile(file: TFile): Promise<EditableEventResponse[]>;
}
