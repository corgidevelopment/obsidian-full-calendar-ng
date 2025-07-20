import type { IEditableCalendar } from "./IEditableCalendar";
import type { IFileBasedCalendar } from "./IFileBasedCalendar";
import type { CalendarInfo, EventLocation } from "../types";
import type { EventPathLocation } from "../core/EventStore";
import type { ICalendar } from "./ICalendar";
import { getAllDailyNotes, getDailyNoteSettings } from "obsidian-daily-notes-interface";
import {
  addToHeading,
  createDailyNoteByDateTime,
  getAllInlineEventsFromFile,
  getDailyNoteByDateTime,
  getDateFromDailyNote,
  getDateOfDateTime,
  getListsUnderHeading,
  modifyListItem
} from "../logic/tmpUtils";
import type { ObsidianInterface } from "../ObsidianAdapter";
import { TFile } from "obsidian";
import { ID_SEPARATOR } from "../logic/consts";
import type { EditableEventResponse, EventResponse } from "../logic/EventResponse";
import { type AnyEvent, isNotAllDay } from "../logic/Event";
import type { ConcreteLocation } from "../logic/ConcreteLocation";

export default class DailyNoteCalendar implements IEditableCalendar, IFileBasedCalendar, ICalendar {
  color: string;
  heading: string;
  id: string = `${this.type}${ID_SEPARATOR}${this.identifier}`;
  obsidianInterface: ObsidianInterface;

  constructor({ obsidianInterface, color, heading }: { obsidianInterface: ObsidianInterface; color: string; heading: string }) {
    this.obsidianInterface = obsidianInterface;
    this.color = color;
    this.heading = heading;
  }

  containsPath = (path: string): boolean => {
    return path.startsWith(this.directory);
  };

  get directory(): string {
    const { folder } = getDailyNoteSettings();
    if (!folder) {
      throw new Error("Could not load daily note settings.");
    }
    return folder;
  }

  createEvent = async (event: AnyEvent): Promise<EventLocation> => {
    if (!isNotAllDay(event)) {
      throw new Error("recurring events cannot be created in daily note calendar!");
    }
    let file = getDailyNoteByDateTime(event.start, getAllDailyNotes());
    if (!file) {
      file = await createDailyNoteByDateTime(event.start);
    }
    const metadata = await this.obsidianInterface.waitForMetadata(file);
    const headingInfo = metadata.headings?.find((h) => h.heading == this.heading);
    if (!headingInfo) {
      throw new Error(`Could not find heading ${this.heading} in daily note ${file.path}.`);
    }
    let lineNumber = await this.obsidianInterface.rewrite(file, (contents) => {
      const { page, lineNumber } = addToHeading({
        page: contents,
        heading: headingInfo,
        item: event,
        headingText: this.heading
      });
      return [page, lineNumber] as [string, number];
    });
    return { file, lineNumber };
  };

  deleteEvent = (location: EventPathLocation): Promise<void> => {
    const { file, lineNumber } = this.getConcreteLocation(location);
    return this.obsidianInterface.rewrite(file, (contents) => {
      let lines = contents.split("\n");
      lines.splice(lineNumber, 1);
      return lines.join("\n");
    });
  };

  private getConcreteLocation = ({ path, lineNumber }: EventPathLocation): ConcreteLocation => {
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File not found at path: ${path}`);
    }
    if (!lineNumber) {
      throw new Error(`Daily note events must have a line number.`);
    }
    return { file, lineNumber };
  };

  getEventsInFile = async (file: TFile): Promise<EditableEventResponse[]> => {
    const date = getDateFromDailyNote(file);
    if (!date) {
      return Promise.resolve([]);
    }
    const cache = this.obsidianInterface.getMetadata(file);
    if (!cache) {
      return Promise.resolve([]);
    }
    const listItems = getListsUnderHeading({
      headingText: this.heading,
      metadata: cache
    });
    return this.obsidianInterface
      .process(file, (text) => getAllInlineEventsFromFile(text, listItems, { start: date }))
      .then((data) => data.map(({ event, lineNumber }) => ({ event, location: { file, lineNumber } })));
  };

  getEvents = async (): Promise<EventResponse[]> => {
    const notes = getAllDailyNotes();
    const files = Object.values(notes) as unknown as TFile[];
    return (await Promise.all(files.map(this.getEventsInFile))).flat();
  };

  modifyEvent = async (
    location: EventPathLocation,
    newEvent: AnyEvent,
    updateCacheWithLocation: (location: ConcreteLocation) => void
  ): Promise<void> => {
    if (isNotAllDay(newEvent)) {
    } else {
      throw new Error("Only non-recurring, non-all-day events can be modified in a daily note calendar!");
    }
    const eventLocation: ConcreteLocation = this.getConcreteLocation(location);
    const oldDate = getDateFromDailyNote(eventLocation.file);
    if (!oldDate) {
      throw new Error(`couldn't find date from file at path ${eventLocation.file.path}`);
    }
    const newEventDate = getDateOfDateTime(newEvent.start);
    const { file, lineNumber } = eventLocation;
    if (oldDate !== newEventDate) {
      let newNote = getDailyNoteByDateTime(newEventDate, getAllDailyNotes());
      if (!newNote) {
        newNote = await createDailyNoteByDateTime(newEventDate);
      }
      await this.obsidianInterface.read(newNote);
      const metadata = this.obsidianInterface.getMetadata(newNote);
      const headingInfo = metadata?.headings?.find((h) => h.heading === this.heading);
      await this.obsidianInterface.rewrite(file, async (oldFileContents) => {
        let lines = oldFileContents.split("\n");
        lines.splice(lineNumber, 1);
        await this.obsidianInterface.rewrite(newNote, (newFileContents) => {
          const { page, lineNumber } = addToHeading({
            page: newFileContents,
            heading: headingInfo,
            item: newEvent,
            headingText: this.heading
          });
          updateCacheWithLocation({ file: newNote, lineNumber });
          return page;
        });
        return lines.join("\n");
      });
    } else {
      updateCacheWithLocation(eventLocation);
      await this.obsidianInterface.rewrite(eventLocation.file, (contents) => {
        const lines = contents.split("\n");
        const newLine = modifyListItem(lines[eventLocation.lineNumber], newEvent);
        if (!newLine) {
          throw new Error("Did not successfully update line.");
        }
        lines[eventLocation.lineNumber] = newLine;
        return lines.join("\n");
      });
    }
  };

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
