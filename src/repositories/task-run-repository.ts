import { RepositoryError } from "../errors";
import type {
  CreateTaskRunInput,
  TaskRunRecord,
  TaskRunStatus,
  UpdateTaskRunInput
} from "../domain/task-run";

export type SqlExecutor = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

export interface TaskRunRepository {
  create(input: CreateTaskRunInput): Promise<TaskRunRecord>;
  findByEventAndStart(
    calendarEventId: string,
    scheduledStart: Date
  ): Promise<TaskRunRecord | undefined>;
  updateStatus(input: UpdateTaskRunInput): Promise<TaskRunRecord | undefined>;
  listByDateRange(start: Date, end: Date): Promise<TaskRunRecord[]>;
}

type TaskRunRow = {
  id: string;
  calendar_event_id: string;
  scheduled_start: number;
  status: TaskRunStatus;
  summary: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};

export class SqlTaskRunRepository implements TaskRunRepository {
  constructor(private readonly sql: SqlExecutor) {
    this.initialize();
  }

  private initialize() {
    try {
      this.sql`
        CREATE TABLE IF NOT EXISTS task_runs (
          id TEXT PRIMARY KEY NOT NULL,
          calendar_event_id TEXT NOT NULL,
          scheduled_start INTEGER NOT NULL,
          status TEXT NOT NULL,
          summary TEXT,
          error TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `;

      this.sql`
        CREATE INDEX IF NOT EXISTS idx_task_runs_event_start
        ON task_runs(calendar_event_id, scheduled_start)
      `;

      this.sql`
        CREATE INDEX IF NOT EXISTS idx_task_runs_scheduled_start
        ON task_runs(scheduled_start)
      `;
    } catch (error) {
      throw new RepositoryError(
        `Failed to initialize task run repository: ${String(error)}`
      );
    }
  }

  async create(input: CreateTaskRunInput): Promise<TaskRunRecord> {
    const id = crypto.randomUUID();
    const scheduledSeconds = this.toEpochSeconds(input.scheduledStart);
    const status: TaskRunStatus = input.status ?? "pending";

    this.sql`
      INSERT INTO task_runs (
        id,
        calendar_event_id,
        scheduled_start,
        status,
        summary
      ) VALUES (
        ${id},
        ${input.calendarEventId},
        ${scheduledSeconds},
        ${status},
        ${input.summary ?? null}
      )
    `;

    const record = await this.findById(id);
    if (!record) {
      throw new RepositoryError("Failed to read back created task run");
    }
    return record;
  }

  async findByEventAndStart(
    calendarEventId: string,
    scheduledStart: Date
  ): Promise<TaskRunRecord | undefined> {
    const scheduledSeconds = this.toEpochSeconds(scheduledStart);
    const rows = this.sql<TaskRunRow>`
      SELECT * FROM task_runs
      WHERE calendar_event_id = ${calendarEventId}
        AND scheduled_start = ${scheduledSeconds}
      LIMIT 1
    `;

    const row = rows[0];
    return row ? this.mapRow(row) : undefined;
  }

  async updateStatus(
    input: UpdateTaskRunInput
  ): Promise<TaskRunRecord | undefined> {
    this.sql`
      UPDATE task_runs
      SET status = ${input.status},
          summary = ${input.summary ?? null},
          error = ${input.error ?? null},
          updated_at = unixepoch()
      WHERE id = ${input.id}
    `;

    return this.findById(input.id);
  }

  async listByDateRange(start: Date, end: Date): Promise<TaskRunRecord[]> {
    const startSeconds = this.toEpochSeconds(start);
    const endSeconds = this.toEpochSeconds(end);

    const rows = this.sql<TaskRunRow>`
      SELECT * FROM task_runs
      WHERE scheduled_start >= ${startSeconds}
        AND scheduled_start <= ${endSeconds}
      ORDER BY scheduled_start ASC
    `;

    return rows.map((row) => this.mapRow(row));
  }

  private async findById(id: string): Promise<TaskRunRecord | undefined> {
    const rows = this.sql<TaskRunRow>`
      SELECT * FROM task_runs WHERE id = ${id} LIMIT 1
    `;

    const row = rows[0];
    return row ? this.mapRow(row) : undefined;
  }

  private toEpochSeconds(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  private mapRow(row: TaskRunRow): TaskRunRecord {
    return {
      id: row.id,
      calendarEventId: row.calendar_event_id,
      scheduledStart: new Date(row.scheduled_start * 1000),
      status: row.status,
      summary: row.summary ?? undefined,
      error: row.error ?? undefined,
      createdAt: new Date(row.created_at * 1000),
      updatedAt: new Date(row.updated_at * 1000)
    };
  }
}
