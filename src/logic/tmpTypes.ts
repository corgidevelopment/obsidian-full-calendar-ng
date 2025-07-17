import { HeadingCache } from "obsidian";
import { OFCEvent } from "../types";

export type AddToHeadingProps = {
  page: string;
  heading: HeadingCache | undefined;
  item: OFCEvent;
  headingText: string;
};

export type Line = {
  text: string;
  lineNumber: number;
};
