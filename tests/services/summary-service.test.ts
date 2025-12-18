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

function createService(config: Partial<AppConfig> = {}) {
  const baseConfig: AppConfig = {
    calendarId: "calendar",
    accessToken: "token",
    timezone: "UTC",
    pollLookbackMinutes: 15,
    pollLookaheadMinutes: 5,
    emailSender: "from@example.com",
    summaryRecipient: "user@example.com",
    summaryHourUtc: 20,
    ...config
  };
  const taskRunService = {
    listRunsBetween: vi.fn().mockResolvedValue([])
  } as unknown as TaskRunService;
  const summaryRepository = new InMemorySummaryRepository();
  const emailService = new StubEmailService();
  return new SummaryService(taskRunService, summaryRepository, emailService, baseConfig);
}

describe("SummaryService.getStartOfDay", () => {
  // Helper to access private method for testing
  function getStartOfDay(service: SummaryService, date: Date): Date {
    return (service as unknown as { getStartOfDay(date: Date): Date }).getStartOfDay(date);
  }

  describe("UTC timezone", () => {
    it("returns UTC midnight for a UTC timezone", () => {
      const service = createService({ timezone: "UTC" });
      const input = new Date("2024-06-15T14:30:00Z");
      const result = getStartOfDay(service, input);

      expect(result.toISOString()).toBe("2024-06-15T00:00:00.000Z");
    });
  });

  describe("America/New_York timezone", () => {
    it("returns correct UTC instant for winter (EST, UTC-5)", () => {
      const service = createService({ timezone: "America/New_York" });
      // Jan 15, 2024 at 10:00 UTC is Jan 15 at 5:00 AM EST
      const input = new Date("2024-01-15T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight EST on Jan 15 = 05:00 UTC on Jan 15
      expect(result.toISOString()).toBe("2024-01-15T05:00:00.000Z");
    });

    it("returns correct UTC instant for summer (EDT, UTC-4)", () => {
      const service = createService({ timezone: "America/New_York" });
      // Jul 15, 2024 at 10:00 UTC is Jul 15 at 6:00 AM EDT
      const input = new Date("2024-07-15T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight EDT on Jul 15 = 04:00 UTC on Jul 15
      expect(result.toISOString()).toBe("2024-07-15T04:00:00.000Z");
    });

    it("handles DST spring forward transition (March 10, 2024)", () => {
      const service = createService({ timezone: "America/New_York" });
      // March 10, 2024 at 2:00 AM local time, clocks spring forward to 3:00 AM
      // At 10:00 UTC on March 10, it's 6:00 AM EDT (after the transition)
      const input = new Date("2024-03-10T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on March 10 in America/New_York is still EST (before transition)
      // So midnight EST = 05:00 UTC
      expect(result.toISOString()).toBe("2024-03-10T05:00:00.000Z");
    });

    it("handles DST fall back transition (November 3, 2024)", () => {
      const service = createService({ timezone: "America/New_York" });
      // November 3, 2024 at 2:00 AM local time, clocks fall back to 1:00 AM
      // At 10:00 UTC on Nov 3, it's 6:00 AM EDT (before transition) or 5:00 AM EST (after)
      const input = new Date("2024-11-03T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on November 3 in America/New_York is EDT (before transition)
      // So midnight EDT = 04:00 UTC
      expect(result.toISOString()).toBe("2024-11-03T04:00:00.000Z");
    });

    it("handles date near midnight that crosses into previous day in UTC", () => {
      const service = createService({ timezone: "America/New_York" });
      // 3:00 UTC on Jan 15 is 10:00 PM EST on Jan 14
      const input = new Date("2024-01-15T03:00:00Z");
      const result = getStartOfDay(service, input);

      // Should return midnight EST on Jan 14 = 05:00 UTC on Jan 14
      expect(result.toISOString()).toBe("2024-01-14T05:00:00.000Z");
    });
  });

  describe("Europe/London timezone", () => {
    it("returns correct UTC instant for winter (GMT, UTC+0)", () => {
      const service = createService({ timezone: "Europe/London" });
      const input = new Date("2024-01-15T14:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight GMT = 00:00 UTC
      expect(result.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    });

    it("returns correct UTC instant for summer (BST, UTC+1)", () => {
      const service = createService({ timezone: "Europe/London" });
      const input = new Date("2024-07-15T14:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight BST on Jul 15 = 23:00 UTC on Jul 14
      expect(result.toISOString()).toBe("2024-07-14T23:00:00.000Z");
    });

    it("handles DST spring forward transition (March 31, 2024)", () => {
      const service = createService({ timezone: "Europe/London" });
      // March 31, 2024 at 1:00 AM UTC, clocks spring forward to 2:00 AM BST
      const input = new Date("2024-03-31T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on March 31 is GMT (before transition at 1:00 UTC)
      // So midnight GMT = 00:00 UTC
      expect(result.toISOString()).toBe("2024-03-31T00:00:00.000Z");
    });

    it("handles DST fall back transition (October 27, 2024)", () => {
      const service = createService({ timezone: "Europe/London" });
      // October 27, 2024 at 2:00 AM BST, clocks fall back to 1:00 AM GMT
      const input = new Date("2024-10-27T10:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on October 27 is BST (before transition)
      // So midnight BST = 23:00 UTC on Oct 26
      expect(result.toISOString()).toBe("2024-10-26T23:00:00.000Z");
    });
  });

  describe("America/Chicago timezone", () => {
    it("returns correct UTC instant for winter (CST, UTC-6)", () => {
      const service = createService({ timezone: "America/Chicago" });
      const input = new Date("2024-01-15T14:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight CST on Jan 15 = 06:00 UTC on Jan 15
      expect(result.toISOString()).toBe("2024-01-15T06:00:00.000Z");
    });

    it("returns correct UTC instant for summer (CDT, UTC-5)", () => {
      const service = createService({ timezone: "America/Chicago" });
      const input = new Date("2024-07-15T14:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight CDT on Jul 15 = 05:00 UTC on Jul 15
      expect(result.toISOString()).toBe("2024-07-15T05:00:00.000Z");
    });

    it("handles DST spring forward transition (March 10, 2024)", () => {
      const service = createService({ timezone: "America/Chicago" });
      const input = new Date("2024-03-10T12:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on March 10 in Chicago is CST (before transition)
      // So midnight CST = 06:00 UTC
      expect(result.toISOString()).toBe("2024-03-10T06:00:00.000Z");
    });

    it("handles DST fall back transition (November 3, 2024)", () => {
      const service = createService({ timezone: "America/Chicago" });
      const input = new Date("2024-11-03T12:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight on November 3 in Chicago is CDT (before transition)
      // So midnight CDT = 05:00 UTC
      expect(result.toISOString()).toBe("2024-11-03T05:00:00.000Z");
    });
  });

  describe("positive UTC offset timezone (Asia/Tokyo)", () => {
    it("returns correct UTC instant for JST (UTC+9)", () => {
      const service = createService({ timezone: "Asia/Tokyo" });
      // 14:00 UTC on Jan 15 is 23:00 JST on Jan 15
      const input = new Date("2024-01-15T14:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight JST on Jan 15 = 15:00 UTC on Jan 14
      expect(result.toISOString()).toBe("2024-01-14T15:00:00.000Z");
    });

    it("handles date that is different day in JST vs UTC", () => {
      const service = createService({ timezone: "Asia/Tokyo" });
      // 20:00 UTC on Jan 14 is 05:00 JST on Jan 15
      const input = new Date("2024-01-14T20:00:00Z");
      const result = getStartOfDay(service, input);

      // Midnight JST on Jan 15 = 15:00 UTC on Jan 14
      expect(result.toISOString()).toBe("2024-01-14T15:00:00.000Z");
    });
  });
});

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
