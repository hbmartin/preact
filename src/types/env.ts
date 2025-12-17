import type { SendEmail } from "@cloudflare/workers-types";

export interface BindingsEnv extends Env {
  SEND_EMAIL?: SendEmail;
  GOOGLE_ACCESS_TOKEN?: string;
  AGENT_CALENDAR_ID?: string;
  CALENDAR_TIMEZONE?: string;
  EMAIL_SENDER?: string;
  SUMMARY_RECIPIENT?: string;
  SUMMARY_HOUR_UTC?: string | number;
  POLL_LOOKBACK_MINUTES?: string | number;
  POLL_LOOKAHEAD_MINUTES?: string | number;
}
