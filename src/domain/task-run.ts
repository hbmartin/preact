export type TaskRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface TaskRunRecord {
  id: string;
  calendarEventId: string;
  scheduledStart: Date;
  status: TaskRunStatus;
  summary?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskRunInput {
  calendarEventId: string;
  scheduledStart: Date;
  status?: TaskRunStatus;
  summary?: string;
}

export interface UpdateTaskRunInput {
  id: string;
  status: TaskRunStatus;
  summary?: string;
  error?: string;
}
