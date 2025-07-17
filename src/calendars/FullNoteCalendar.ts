import { TFile, TFolder } from "obsidian";
import type { EventPathLocation } from "../core/EventStore";
import type { ObsidianInterface } from "../ObsidianAdapter";
import { type EventLocation, type OFCEvent, validateEvent } from "../types";
import { type EditableEventResponse } from "./EditableCalendar";
import type { IEditableCalendar } from "./IEditableCalendar";
import type { FileBasedCalendar } from "./FileBasedCalendar";
import type { ICalendar } from "./ICalendar";
import { filenameForEvent, modifyFrontmatterString, newFrontmatter } from "../logic/tmpUtils";
import { ID_SEPARATOR } from "./Calendar";

export default class FullNoteCalendar implements IEditableCalendar, FileBasedCalendar, ICalendar {
  color: string;
  obsidianInterface: ObsidianInterface;
  directory: string;
  id: string = `${this.type}${ID_SEPARATOR}${this.identifier}`;

  constructor({ obsidianInterface, color, directory }: { obsidianInterface: ObsidianInterface; color: string; directory: string }) {
    this.obsidianInterface = obsidianInterface;
    this.color = color;
    this.directory = directory;
  }

  get type(): "local" {
    return "local";
  }

  get identifier(): string {
    return this.directory;
  }

  get name(): string {
    return this.directory;
  }

  async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const metadata = this.obsidianInterface.getMetadata(file);
    let event = validateEvent(metadata?.frontmatter);
    if (!event) {
      return [];
    }
    if (!event.title) {
      event.title = file.basename;
    }
    return [[event, { file, lineNumber: undefined }]];
  }

  async getEvents(): Promise<EditableEventResponse[]> {
    const eventFolder = this.obsidianInterface.getAbstractFileByPath(this.directory);
    if (!eventFolder) {
      throw new Error(`Cannot get folder ${this.directory}`);
    }
    if (!(eventFolder instanceof TFolder)) {
      throw new Error(`${eventFolder} is not a directory.`);
    }
    const events: EditableEventResponse[] = [];
    for (const file of eventFolder.children) {
      if (file instanceof TFile) {
        const results = await this.getEventsInFile(file);
        events.push(...results);
      }
    }
    return events;
  }

  async createEvent(event: OFCEvent): Promise<EventLocation> {
    const path = `${this.directory}/${filenameForEvent(event)}`;
    if (this.obsidianInterface.getAbstractFileByPath(path)) {
      throw new Error(`Event at ${path} already exists.`);
    }
    const file = await this.obsidianInterface.create(path, newFrontmatter(event));
    return { file, lineNumber: undefined };
  }

  getNewLocation(location: EventPathLocation, event: OFCEvent): EventLocation {
    const { path, lineNumber } = location;
    if (lineNumber !== undefined) {
      throw new Error("Note calendar cannot handle inline events.");
    }
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} either doesn't exist or is a folder.`);
    }

    const updatedPath = `${file.parent.path}/${filenameForEvent(event)}`;
    return { file: { path: updatedPath }, lineNumber: undefined };
  }

  async modifyEvent(location: EventPathLocation, event: OFCEvent, updateCacheWithLocation: (loc: EventLocation) => void): Promise<void> {
    const { path } = location;
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} either doesn't exist or is a folder.`);
    }
    const newLocation = this.getNewLocation(location, event);

    updateCacheWithLocation(newLocation);

    if (file.path !== newLocation.file.path) {
      await this.obsidianInterface.rename(file, newLocation.file.path);
    }
    await this.obsidianInterface.rewrite(file, (page) => modifyFrontmatterString(page, event));

    return;
  }

  async move(
    fromLocation: EventPathLocation,
    toCalendar: IEditableCalendar & ICalendar,
    updateCacheWithLocation: (loc: EventLocation) => void
  ): Promise<void> {
    const { path, lineNumber } = fromLocation;
    if (lineNumber !== undefined) {
      throw new Error("Note calendar cannot handle inline events.");
    }
    if (!(toCalendar instanceof FullNoteCalendar)) {
      throw new Error(`Event cannot be moved to a note calendar from a calendar of type ${toCalendar.type}.`);
    }
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    const destDir = toCalendar.directory;
    const newPath = `${destDir}/${file.name}`;
    updateCacheWithLocation({
      file: { path: newPath },
      lineNumber: undefined
    });
    await this.obsidianInterface.rename(file, newPath);
  }

  deleteEvent({ path, lineNumber }: EventPathLocation): Promise<void> {
    if (lineNumber !== undefined) {
      throw new Error("Note calendar cannot handle inline events.");
    }
    const file = this.obsidianInterface.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.obsidianInterface.delete(file);
  }
}
