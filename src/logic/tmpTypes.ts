import type { HeadingCache } from "obsidian";
import type { OFCEvent } from "../types";

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

export type PrintableAtom = Array<number | string> | number | string | boolean;
