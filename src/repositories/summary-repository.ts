import { RepositoryError } from "../errors";

export type SqlExecutor = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

type SummaryRow = {
  date_key: string;
  sent_at: number;
  message_id: string | null;
};

export interface SummaryRepository {
  markSent(dateKey: string, messageId?: string, sentAt?: Date): Promise<void>;
  getForDate(dateKey: string): Promise<SummaryRow | undefined>;
}

export class SqlSummaryRepository implements SummaryRepository {
  constructor(private readonly sql: SqlExecutor) {
    this.initialize();
  }

  private initialize() {
    try {
      this.sql`
        CREATE TABLE IF NOT EXISTS daily_summaries (
          date_key TEXT PRIMARY KEY NOT NULL,
          sent_at INTEGER NOT NULL,
          message_id TEXT
        )
      `;
    } catch (error) {
      throw new RepositoryError(
        `Failed to initialize summary repository: ${String(error)}`
      );
    }
  }

  async markSent(
    dateKey: string,
    messageId?: string,
    sentAt: Date = new Date()
  ): Promise<void> {
    const sentSeconds = Math.floor(sentAt.getTime() / 1000);
    this.sql`
      INSERT OR REPLACE INTO daily_summaries (date_key, sent_at, message_id)
      VALUES (${dateKey}, ${sentSeconds}, ${messageId ?? null})
    `;
  }

  async getForDate(dateKey: string): Promise<SummaryRow | undefined> {
    const rows = this.sql<SummaryRow>`
      SELECT * FROM daily_summaries WHERE date_key = ${dateKey} LIMIT 1
    `;
    return rows[0];
  }
}
