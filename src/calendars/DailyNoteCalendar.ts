import { IEditableCalendar } from "./IEditableCalendar";
import { FileBasedCalendar } from "./FileBasedCalendar";
import { CalendarInfo, EventLocation, OFCEvent } from "../types";
import { EventPathLocation } from "../core/EventStore";
import { EditableCalendar, EditableEventResponse } from "./EditableCalendar";
import { ICalendar } from "./ICalendar";
import {
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile,
} from "obsidian-daily-notes-interface";
import { EventResponse, ID_SEPARATOR } from "./Calendar";
import moment from "moment/moment";
import {
  addToHeading,
  DATE_FORMAT,
  getAllInlineEventsFromFile,
  getListsUnderHeading,
} from "../logic/tmpUtils";
import { ObsidianInterface } from "../ObsidianAdapter";
import { TFile } from "obsidian";

export default class DailyNoteCalendar
  implements IEditableCalendar, FileBasedCalendar, ICalendar
{
  color: string;
  heading: string;
  id: string = `${this.type}${ID_SEPARATOR}${this.identifier}`;
  obsidianInterface: ObsidianInterface;

  constructor({
    obsidianInterface,
    color,
    heading,
  }: {
    obsidianInterface: ObsidianInterface;
    color: string;
    heading: string;
  }) {
    this.obsidianInterface = obsidianInterface;
    this.color = color;
    this.heading = heading;
  }

  get directory(): string {
    const { folder } = getDailyNoteSettings();
    if (!folder) {
      throw new Error("Could not load daily note settings.");
    }
    return folder;
  }

  containsPath(path: string): boolean {
    return path.startsWith(this.directory);
  }

  async createEvent(event: OFCEvent): Promise<EventLocation> {
    if (event.type !== "single" && event.type !== undefined) {
      console.debug("tried creating a recurring event in a daily note", event);
      throw new Error("Cannot create a recurring event in a daily note.");
    }
    const m = moment(event.date);
    let file = getDailyNote(m, getAllDailyNotes()) as unknown as TFile;
    if (!file) {
      file = (await createDailyNote(m)) as unknown as TFile;
    }
    const metadata = await this.obsidianInterface.waitForMetadata(file);

    const headingInfo = metadata.headings?.find(
      (h) => h.heading == this.heading
    );
    if (!headingInfo) {
      throw new Error(
        `Could not find heading ${this.heading} in daily note ${file.path}.`
      );
    }
    let lineNumber = await this.obsidianInterface.rewrite(file, (contents) => {
      const { page, lineNumber } = addToHeading({
        page: contents,
        heading: headingInfo,
        item: event,
        headingText: this.heading,
      });
      return [page, lineNumber] as [string, number];
    });
    return { file, lineNumber };
  }

  deleteEvent(location: EventPathLocation): Promise<void> {
    const { file, lineNumber } = this.getConcreteLocation(location);
    return this.obsidianInterface.rewrite(file, (contents) => {
      let lines = contents.split("\n");
      lines.splice(lineNumber, 1);
      return lines.join("\n");
    });
  }

  private getConcreteLocation({ path, lineNumber }: EventPathLocation): {
    file: TFile;
    lineNumber: number;
  } {
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File not found at path: ${path}`);
    }
    if (!lineNumber) {
      throw new Error(`Daily note events must have a line number.`);
    }
    return { file, lineNumber };
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    //@ts-expect-error: TFile version mismatch -> Have to bump obsidian version I guess
    const date = getDateFromFile(file, "day")?.format(DATE_FORMAT);
    if (!date) {
      return Promise.resolve([]);
    }
    const cache = this.obsidianInterface.getMetadata(file);
    if (!cache) {
      return Promise.resolve([]);
    }
    const listItems = getListsUnderHeading({
      headingText: this.heading,
      metadata: cache,
    });
    return this.obsidianInterface
      .process(file, (text) =>
        getAllInlineEventsFromFile(text, listItems, { date })
      )
      .then((data) =>
        data.map(({ event, lineNumber }) => [event, { file, lineNumber }])
      );
  }

  async getEvents(): Promise<EventResponse[]> {
    const notes = getAllDailyNotes();
    //@ts-expect-error: TFile version mismatch -> Have to bump obsidian version I guess
    const files = Object.values(notes) as TFile[];
    return (
      await Promise.all(files.map((f) => this.getEventsInFile(f)))
    ).flat();
  }

  modifyEvent(
    location: EventPathLocation,
    newEvent: OFCEvent,
    updateCacheWithLocation: any
  ): Promise<void> {
    return Promise.resolve(undefined);
  }

  get type(): CalendarInfo["type"] {
    return "dailynote";
  }

  get identifier(): string {
    return this.heading;
  }

  get name(): string {
    return `Daily note under "${this.heading}"`;
  }
}
