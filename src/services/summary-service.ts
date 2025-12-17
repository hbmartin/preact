import type { AppConfig } from "../config/env";
import type { TaskRunRecord } from "../domain/task-run";
import { EmailService } from "./email-service";
import type { TaskRunService } from "./task-run-service";
import type { SummaryRepository } from "../repositories/summary-repository";

export interface SummaryResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

export class SummaryService {
  private readonly timezone: string;
  private readonly summaryHourUtc: number;
  private readonly recipient: string;

  constructor(
    private readonly taskRunService: TaskRunService,
    private readonly summaryRepository: SummaryRepository,
    private readonly emailService: EmailService,
    config: AppConfig
  ) {
    this.timezone = config.timezone;
    this.summaryHourUtc = config.summaryHourUtc;
    this.recipient = config.summaryRecipient;
  }

  async maybeSendSummary(now: Date): Promise<SummaryResult> {
    const { start, end, dateKey } = this.getDayWindow(now);
    const existing = await this.summaryRepository.getForDate(dateKey);
    if (existing) {
      return { sent: false, reason: "already-sent" };
    }

    const localHour = this.getLocalHour(now);
    if (localHour < this.summaryHourUtc) {
      return { sent: false, reason: "too-early" };
    }

    const runs = await this.taskRunService.listRunsBetween(start, end);
    const body = this.buildSummaryBody(dateKey, runs);
    const subject = `Daily agent summary (${dateKey})`;

    const result = await this.emailService.sendTextEmail({
      to: this.recipient,
      subject,
      body
    });

    await this.summaryRepository.markSent(dateKey, result.messageId, now);
    return { sent: true, messageId: result.messageId };
  }

  private buildSummaryBody(dateKey: string, runs: TaskRunRecord[]): string {
    const completed = runs.filter((run) => run.status === "completed");
    const failed = runs.filter((run) => run.status === "failed");
    const pending = runs.filter((run) =>
      ["pending", "running", "skipped"].includes(run.status)
    );

    const lines: string[] = [];
    lines.push(`Summary for ${dateKey}`);
    lines.push("");
    lines.push("Completed tasks:");
    if (completed.length === 0) {
      lines.push("- None completed yet.");
    } else {
      completed.forEach((run) =>
        lines.push(
          `- ${run.summary ?? run.calendarEventId} (scheduled ${run.scheduledStart.toISOString()})`
        )
      );
    }

    lines.push("");
    lines.push("Pending / running:");
    if (pending.length === 0) {
      lines.push("- No pending tasks.");
    } else {
      pending.forEach((run) =>
        lines.push(
          `- ${run.summary ?? run.calendarEventId} [${run.status}] at ${run.scheduledStart.toISOString()}`
        )
      );
    }

    lines.push("");
    lines.push("Failures:");
    if (failed.length === 0) {
      lines.push("- No failures recorded.");
    } else {
      failed.forEach((run) =>
        lines.push(
          `- ${run.summary ?? run.calendarEventId}: ${run.error ?? "Unknown error"}`
        )
      );
    }

    return lines.join("\n");
  }

  private getDayWindow(date: Date) {
    const start = this.getStartOfDay(date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    const dateKey = this.getDateKey(start);
    return { start, end, dateKey };
  }

  private getStartOfDay(date: Date): Date {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    const parts = formatter.formatToParts(date).reduce<Record<string, string>>(
      (acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      },
      {}
    );

    const year = Number(parts.year);
    const month = Number(parts.month) - 1;
    const day = Number(parts.day);

    return new Date(Date.UTC(year, month, day, 0, 0, 0));
  }

  private getLocalHour(date: Date): number {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timezone,
      hour: "2-digit",
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((part) => part.type === "hour");
    return hourPart ? Number(hourPart.value) : date.getUTCHours();
  }

  private getDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
