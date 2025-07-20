import { TFile } from "obsidian";
import type { EditableEventResponse } from "../logic/EventResponse";

export interface IFileBasedCalendar {
  directory: string;
  getEventsInFile(file: TFile): Promise<EditableEventResponse[]>;
}
