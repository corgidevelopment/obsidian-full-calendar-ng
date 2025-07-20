import { TFile } from "obsidian";

export type ConcreteLocation = {
  file: TFile;
  lineNumber: number;
};
