import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventUpdate
} from "../domain/calendar";
import type { CalendarRepository } from "../repositories/calendar-repository";

export class CalendarService {
  constructor(private readonly repository: CalendarRepository) {}

  async getEventsWithinWindow(
    start: Date,
    end: Date
  ): Promise<CalendarEvent[]> {
    return this.repository.listEventsBetween(start, end);
  }

  async getActionableEvents(
    start: Date,
    end: Date
  ): Promise<CalendarEvent[]> {
    const events = await this.getEventsWithinWindow(start, end);
    return events.filter((event) => event.status !== "cancelled");
  }

  async createEvent(input: CalendarEventInput): Promise<CalendarEvent> {
    return this.repository.createEvent(input);
  }

  async updateEvent(
    id: string,
    input: CalendarEventUpdate
  ): Promise<CalendarEvent> {
    return this.repository.updateEvent(id, input);
  }
}
