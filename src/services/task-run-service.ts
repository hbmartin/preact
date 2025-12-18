import type { CalendarEvent } from "../domain/calendar";
import type {
  TaskRunRecord,
  TaskRunStatus
} from "../domain/task-run";
import type { TaskRunRepository } from "../repositories/task-run-repository";

export class TaskRunService {
  constructor(private readonly repository: TaskRunRepository) {}

  async createRunIfMissing(
    event: CalendarEvent
  ): Promise<TaskRunRecord | undefined> {
    const existing = await this.repository.findByEventAndStart(
      event.id,
      event.start
    );
    if (existing) return undefined;

    return this.repository.create({
      calendarEventId: event.id,
      scheduledStart: event.start,
      summary: event.description?.trim(),
      status: "pending"
    });
  }

  async updateStatus(
    id: string,
    status: TaskRunStatus,
    options?: { summary?: string; error?: string }
  ): Promise<TaskRunRecord | undefined> {
    return this.repository.updateStatus({
      id,
      status,
      summary: options?.summary,
      error: options?.error
    });
  }

  async listRunsBetween(
    start: Date,
    end: Date
  ): Promise<TaskRunRecord[]> {
    return this.repository.listByDateRange(start, end);
  }
}
