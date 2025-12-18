import { ExternalServiceError } from "../errors";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventStatus,
  CalendarEventUpdate
} from "../domain/calendar";

export interface CalendarRepository {
  listEventsBetween(start: Date, end: Date): Promise<CalendarEvent[]>;
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>;
  updateEvent(id: string, input: CalendarEventUpdate): Promise<CalendarEvent>;
}

export interface GoogleCalendarConfig {
  calendarId: string;
  accessToken: string;
  timezone?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  status?: CalendarEventStatus;
  recurrence?: string[];
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}

export class GoogleCalendarRepository implements CalendarRepository {
  constructor(private readonly config: GoogleCalendarConfig) {}

  async listEventsBetween(start: Date, end: Date): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime"
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.calendarId)}/events?${params.toString()}`;

    const data = await this.request<{ items?: GoogleEvent[] }>(url, {
      method: "GET"
    });

    return (data.items || []).map((event) => this.mapEvent(event));
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.calendarId)}/events`;

    const payload = this.buildPayload(input);

    const data = await this.request<GoogleEvent>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return this.mapEvent(data);
  }

  async updateEvent(id: string, input: CalendarEventUpdate): Promise<CalendarEvent> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.calendarId)}/events/${encodeURIComponent(id)}`;

    const payload = this.buildPayload(input);

    const data = await this.request<GoogleEvent>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return this.mapEvent(data);
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${this.config.accessToken}`
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new ExternalServiceError(
        `Google Calendar request failed (${response.status}): ${message}`,
        { status: response.status }
      );
    }

    return (await response.json()) as T;
  }

  private mapEvent(event: GoogleEvent): CalendarEvent {
    const startTime = event.start?.dateTime || event.start?.date;
    const endTime = event.end?.dateTime || event.end?.date;

    if (!startTime) {
      throw new ExternalServiceError(
        `Calendar event ${event.id} is missing a start time`
      );
    }

    return {
      id: event.id,
      title: event.summary || "Untitled task",
      description: event.description,
      status: event.status || "confirmed",
      recurrence: event.recurrence,
      timezone: event.start?.timeZone || this.config.timezone,
      start: new Date(startTime),
      end: endTime ? new Date(endTime) : undefined
    };
  }

  private buildPayload(input: CalendarEventInput | CalendarEventUpdate) {
    const payload: Record<string, unknown> = {};

    if (input.title) payload.summary = input.title;
    if (input.description) payload.description = input.description;
    if (input.recurrence) payload.recurrence = input.recurrence;

    if (input.start) {
      payload.start = this.serializeDate(input.start, input.timezone);
    }
    if (input.end) {
      payload.end = this.serializeDate(input.end, input.timezone);
    }

    return payload;
  }

  private serializeDate(date: Date, timezone?: string) {
    const isoString = date.toISOString();
    return timezone
      ? { dateTime: isoString, timeZone: timezone }
      : { dateTime: isoString };
  }
}
