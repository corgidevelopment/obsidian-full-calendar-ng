import type { HeadingCache } from "obsidian";
import type { AnyEvent } from "./Event";

export type AddToHeadingProps = {
  page: string;
  heading: HeadingCache | undefined;
  item: AnyEvent;
  headingText: string;
};
