import type { CalendarEvent } from "../domain/calendar";
import type { TaskRunRecord } from "../domain/task-run";

export interface TaskExecutor {
  execute(event: CalendarEvent, run: TaskRunRecord): Promise<void>;
}

export class HandlerTaskExecutor implements TaskExecutor {
  constructor(
    private readonly handler: (
      event: CalendarEvent,
      run: TaskRunRecord
    ) => Promise<void>
  ) {}

  async execute(event: CalendarEvent, run: TaskRunRecord): Promise<void> {
    await this.handler(event, run);
  }
}
