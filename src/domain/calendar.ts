export type CalendarEventStatus = "confirmed" | "tentative" | "cancelled";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  status: CalendarEventStatus;
  timezone?: string;
  recurrence?: string[];
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  timezone?: string;
  recurrence?: string[];
}

export interface CalendarEventUpdate {
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  timezone?: string;
  recurrence?: string[];
}
