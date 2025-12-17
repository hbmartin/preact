import { describe, expect, it, vi } from "vitest";
import type { TaskRunRecord } from "../../src/domain/task-run";
import type { SummaryRepository } from "../../src/repositories/summary-repository";
import { SummaryService } from "../../src/services/summary-service";
import type { TaskRunService } from "../../src/services/task-run-service";
import type { EmailService, EmailSendResult } from "../../src/services/email-service";
import type { AppConfig } from "../../src/config/env";

class InMemorySummaryRepository implements SummaryRepository {
  private store = new Map<string, { date_key: string; sent_at: number; message_id: string | null }>();

  async markSent(dateKey: string, messageId?: string, sentAt: Date = new Date()): Promise<void> {
    this.store.set(dateKey, {
      date_key: dateKey,
      sent_at: Math.floor(sentAt.getTime() / 1000),
      message_id: messageId ?? null
    });
  }

  async getForDate(dateKey: string) {
    return this.store.get(dateKey);
  }
}

class StubEmailService implements EmailService {
  sent: { to: string; subject: string; body: string }[] = [];

  async sendTextEmail(content: {
    to: string;
    subject: string;
    body: string;
  }): Promise<EmailSendResult> {
    this.sent.push(content);
    return { messageId: `msg-${this.sent.length}` };
  }
}

describe("SummaryService", () => {
  const baseConfig: AppConfig = {
    calendarId: "calendar",
    accessToken: "token",
    timezone: "UTC",
    pollLookbackMinutes: 15,
    pollLookaheadMinutes: 5,
    emailSender: "from@example.com",
    summaryRecipient: "user@example.com",
    summaryHourUtc: 20
  };

  it("skips sending when before summary window", async () => {
    const taskRunService = {
      listRunsBetween: vi.fn().mockResolvedValue([])
    } as unknown as TaskRunService;
    const summaryRepository = new InMemorySummaryRepository();
    const emailService = new StubEmailService();
    const service = new SummaryService(
      taskRunService,
      summaryRepository,
      emailService as unknown as EmailService,
      baseConfig
    );

    const result = await service.maybeSendSummary(new Date("2025-01-01T10:00:00Z"));

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("too-early");
    expect(emailService.sent.length).toBe(0);
  });

  it("sends summary after configured hour", async () => {
    const runs: TaskRunRecord[] = [
      {
        id: "run-1",
        calendarEventId: "event-1",
        scheduledStart: new Date("2025-01-01T08:00:00Z"),
        status: "completed",
        createdAt: new Date(),
        updatedAt: new Date(),
        summary: "Review completed"
      }
    ];

    const taskRunService = {
      listRunsBetween: vi.fn().mockResolvedValue(runs)
    } as unknown as TaskRunService;
    const summaryRepository = new InMemorySummaryRepository();
    const emailService = new StubEmailService();
    const service = new SummaryService(
      taskRunService,
      summaryRepository,
      emailService as unknown as EmailService,
      { ...baseConfig, summaryHourUtc: 0 }
    );

    const result = await service.maybeSendSummary(new Date("2025-01-01T12:00:00Z"));

    expect(result.sent).toBe(true);
    expect(emailService.sent.length).toBe(1);
    expect(emailService.sent[0].subject).toContain("Daily agent summary");
    const record = await summaryRepository.getForDate("2025-01-01");
    expect(record).toBeDefined();
  });
});
