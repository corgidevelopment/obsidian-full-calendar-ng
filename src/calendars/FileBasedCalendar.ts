import { TFile } from "obsidian";
import { EditableEventResponse } from "./EditableCalendar";

export interface FileBasedCalendar {
  directory: string;
  getEventsInFile(file: TFile): Promise<EditableEventResponse[]>;
  containsPath(path: string): boolean;
}
