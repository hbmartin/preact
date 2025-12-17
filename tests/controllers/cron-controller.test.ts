import { describe, expect, it, vi, type Mock } from "vitest";
import type { AppConfig } from "../../src/config/env";
import type { CalendarEvent } from "../../src/domain/calendar";
import type { TaskRunRecord } from "../../src/domain/task-run";
import { CronController } from "../../src/controllers/cron-controller";
import type { CalendarService } from "../../src/services/calendar-service";
import type { TaskRunService } from "../../src/services/task-run-service";
import type { TaskExecutor } from "../../src/services/task-executor";
import type { SummaryService } from "../../src/services/summary-service";

const config: AppConfig = {
  calendarId: "calendar",
  accessToken: "token",
  timezone: "UTC",
  pollLookbackMinutes: 15,
  pollLookaheadMinutes: 5,
  emailSender: "from@example.com",
  summaryRecipient: "user@example.com",
  summaryHourUtc: 18
};

describe("CronController", () => {
  it("processes due events and updates task runs", async () => {
    const now = new Date();
    const event: CalendarEvent = {
      id: "event-1",
      title: "Check status",
      start: new Date(now.getTime() - 60 * 1000),
      status: "confirmed"
    };

    const run: TaskRunRecord = {
      id: "run-1",
      calendarEventId: event.id,
      scheduledStart: event.start,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    const calendarService = {
      getActionableEvents: vi.fn().mockResolvedValue([event])
    } as unknown as CalendarService;

    const taskRunService = {
      createRunIfMissing: vi.fn().mockResolvedValue(run),
      updateStatus: vi.fn().mockResolvedValue(run)
    } as unknown as TaskRunService;

    const taskExecutor = {
      execute: vi.fn().mockResolvedValue(undefined)
    } as unknown as TaskExecutor;

    const summaryService = {
      maybeSendSummary: vi.fn().mockResolvedValue({ sent: false })
    } as unknown as SummaryService;

    const controller = new CronController(
      calendarService,
      taskRunService,
      taskExecutor,
      summaryService,
      config
    );

    const result = await controller.handleTick(now);

    expect(result.createdRuns).toBe(1);
    expect(result.dueEvents).toBe(1);
    expect(result.failedRuns).toBe(0);
    const updateStatusMock = taskRunService.updateStatus as unknown as Mock;
    expect(updateStatusMock.mock.calls[0][1]).toBe("running");
    const executorMock = taskExecutor.execute as unknown as Mock;
    expect(executorMock).toHaveBeenCalled();
  });

  it("marks failures when execution throws", async () => {
    const now = new Date();
    const event: CalendarEvent = {
      id: "event-2",
      title: "Send follow-up",
      start: new Date(now.getTime() - 120 * 1000),
      status: "confirmed"
    };

    const run: TaskRunRecord = {
      id: "run-2",
      calendarEventId: event.id,
      scheduledStart: event.start,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };

    const calendarService = {
      getActionableEvents: vi.fn().mockResolvedValue([event])
    } as unknown as CalendarService;

    const taskRunService = {
      createRunIfMissing: vi.fn().mockResolvedValue(run),
      updateStatus: vi.fn().mockResolvedValue(run)
    } as unknown as TaskRunService;

    const taskExecutor = {
      execute: vi.fn().mockRejectedValue(new Error("Boom"))
    } as unknown as TaskExecutor;

    const summaryService = {
      maybeSendSummary: vi.fn().mockResolvedValue({ sent: false })
    } as unknown as SummaryService;

    const controller = new CronController(
      calendarService,
      taskRunService,
      taskExecutor,
      summaryService,
      config
    );

    const result = await controller.handleTick(now);

    expect(result.failedRuns).toBe(1);
    expect(result.createdRuns).toBe(1);
    const updateStatusMock = taskRunService.updateStatus as unknown as Mock;
    expect(updateStatusMock.mock.calls[1][1]).toBe("failed");
  });
});
