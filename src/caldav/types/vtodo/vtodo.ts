import type { Recurrence } from "../shared/recurrence";
import type { Alarm } from "../shared/alarm";
import type { TODO_STATUS } from "./values";

type VtodoBase = {
  readonly uid: string;
  readonly dtstamp: string;
  readonly created?: string;
  readonly lastModified?: string;
  readonly description?: string;
  readonly summary?: string;
  readonly categories?: string;
  readonly dtstart?: string;
  readonly completed?: string;
  readonly priority?: number;
  readonly alarm?: Alarm;
  readonly recurrence?: Recurrence;
  readonly status?: TODO_STATUS;
};

export type VTodoDue = VtodoBase & {
  readonly due: string;
};

export type VTodoDuration = VtodoBase & {
  readonly duration: string;
};

export type VTodo = VTodoDuration | VTodoDue;