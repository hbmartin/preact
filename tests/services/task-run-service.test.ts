import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../src/domain/calendar";
import type { TaskRunRecord } from "../../src/domain/task-run";
import type { TaskRunRepository } from "../../src/repositories/task-run-repository";
import { TaskRunService } from "../../src/services/task-run-service";

class InMemoryTaskRunRepository implements TaskRunRepository {
  private runs: TaskRunRecord[] = [];

  async create(input: {
    calendarEventId: string;
    scheduledStart: Date;
    status?: string;
    summary?: string;
  }): Promise<TaskRunRecord> {
    const now = new Date();
    const run: TaskRunRecord = {
      id: `run-${this.runs.length + 1}`,
      calendarEventId: input.calendarEventId,
      scheduledStart: input.scheduledStart,
      status: (input.status as TaskRunRecord["status"]) ?? "pending",
      summary: input.summary,
      createdAt: now,
      updatedAt: now
    };
    this.runs.push(run);
    return run;
  }

  async findByEventAndStart(
    calendarEventId: string,
    scheduledStart: Date
  ): Promise<TaskRunRecord | undefined> {
    return this.runs.find(
      (run) =>
        run.calendarEventId === calendarEventId &&
        run.scheduledStart.getTime() === scheduledStart.getTime()
    );
  }

  async updateStatus(): Promise<TaskRunRecord | undefined> {
    return undefined;
  }

  async listByDateRange(): Promise<TaskRunRecord[]> {
    return this.runs;
  }
}

describe("TaskRunService", () => {
  it("creates a run when missing and skips duplicates", async () => {
    const repository = new InMemoryTaskRunRepository();
    const service = new TaskRunService(repository);

    const event: CalendarEvent = {
      id: "event-1",
      title: "Review document",
      start: new Date("2025-01-01T10:00:00Z"),
      status: "confirmed"
    };

    const first = await service.createRunIfMissing(event);
    expect(first).toBeDefined();

    const second = await service.createRunIfMissing(event);
    expect(second).toBeUndefined();
  });
});
