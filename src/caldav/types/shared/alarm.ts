import type { ACTION } from "../vevent/values";

export type Alarm = {
  action: ACTION;
  trigger: string;
  description: string;
};
