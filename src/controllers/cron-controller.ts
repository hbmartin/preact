import type { AppConfig } from "../config/env";
import type { CalendarService } from "../services/calendar-service";
import type { TaskExecutor } from "../services/task-executor";
import type { TaskRunService } from "../services/task-run-service";
import type {
  SummaryResult,
  SummaryService
} from "../services/summary-service";

export interface CronResult {
  checkedEvents: number;
  dueEvents: number;
  createdRuns: number;
  failedRuns: number;
  summary?: SummaryResult;
}

export class CronController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly taskRunService: TaskRunService,
    private readonly taskExecutor: TaskExecutor,
    private readonly summaryService: SummaryService,
    private readonly config: AppConfig
  ) {}

  async handleTick(now: Date): Promise<CronResult> {
    const windowStart = new Date(
      now.getTime() - this.config.pollLookbackMinutes * 60 * 1000
    );
    const windowEnd = new Date(
      now.getTime() + this.config.pollLookaheadMinutes * 60 * 1000
    );

    const events = await this.calendarService.getActionableEvents(
      windowStart,
      windowEnd
    );

    const dueEvents = events.filter(
      (event) => event.start.getTime() <= now.getTime()
    );

    const results = await Promise.all(
      dueEvents.map(async (event) => {
        let runCreated = false;
        try {
          const run = await this.taskRunService.createRunIfMissing(event);
          if (!run) return { created: false, failed: false };
          runCreated = true;

          await this.taskRunService.updateStatus(run.id, "running");

          let executionSucceeded = false;
          try {
            await this.taskExecutor.execute(event, run);
            executionSucceeded = true;
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Unknown execution failure";
            await this.taskRunService.updateStatus(run.id, "failed", {
              summary: run.summary ?? event.title,
              error: message
            });
            return { created: true, failed: true };
          }

          if (executionSucceeded) {
            await this.taskRunService.updateStatus(run.id, "completed", {
              summary: run.summary ?? event.title
            });
          }
          return { created: true, failed: false };
        } catch (error) {
          // Log and continue processing remaining events
          console.error(
            `Failed to process event ${event.id}:`,
            error instanceof Error ? error.message : error
          );
          return { created: runCreated, failed: false };
        }
      })
    );

    const createdRuns = results.filter((r) => r.created).length;
    const failedRuns = results.filter((r) => r.failed).length;

    let summary: SummaryResult | undefined;
    try {
      summary = await this.summaryService.maybeSendSummary(now);
    } catch (error) {
      summary = {
        sent: false,
        reason:
          error instanceof Error
            ? error.message
            : "Failed to send summary email"
      };
    }

    return {
      checkedEvents: events.length,
      dueEvents: dueEvents.length,
      createdRuns,
      failedRuns,
      summary
    };
  }
}
