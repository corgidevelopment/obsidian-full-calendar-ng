import type { Alarm } from "../shared/alarm";
import type { Recurrence } from "../shared/recurrence";
import type { VTodo, VTodoDue, VTodoDuration } from "./vtodo";
import type { TODO_STATUS } from "./values";

type VtodoParams = {
  uid: string;
  dtstamp: string;
  dtstart: string;
};

export function dueVtodo(p: (VtodoParams & { due: string }) | VTodoDue): VTodoDue {
  return { ...p };
}

export function durationVtodo(p: (VtodoParams & { duration: string }) | VTodoDuration): VTodoDuration {
  return { ...p };
}

export function withAlarm<T extends VTodo>(todo: T, alarm: Alarm): T {
  return { ...todo, alarm };
}

export function withRecurrence<T extends VTodo>(todo: T, recurrence: Recurrence): T {
  return { ...todo, recurrence: recurrence };
}

export function withStatus<T extends VTodo>(todo: T, status: TODO_STATUS): T {
  return { ...todo, status };
}
