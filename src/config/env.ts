import { z } from "zod/v3";
import { ConfigError } from "../errors";
import type { BindingsEnv } from "../types/env";

const envSchema = z.object({
  calendarId: z.string().min(1, "AGENT_CALENDAR_ID is required"),
  accessToken: z.string().min(1, "GOOGLE_ACCESS_TOKEN is required"),
  timezone: z.string().default("UTC"),
  pollLookbackMinutes: z.coerce
    .number()
    .int()
    .positive()
    .default(15),
  pollLookaheadMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .default(5),
  emailSender: z.string().email("EMAIL_SENDER must be a valid email"),
  summaryRecipient: z
    .string()
    .email("SUMMARY_RECIPIENT must be a valid email"),
  summaryHourUtc: z.coerce.number().int().min(0).max(23).default(23)
});

export type AppConfig = z.infer<typeof envSchema>;

export function getAppConfig(env: BindingsEnv): AppConfig {
  const parseResult = envSchema.safeParse({
    calendarId: env.AGENT_CALENDAR_ID,
    accessToken: env.GOOGLE_ACCESS_TOKEN,
    timezone: env.CALENDAR_TIMEZONE,
    pollLookbackMinutes: env.POLL_LOOKBACK_MINUTES,
    pollLookaheadMinutes: env.POLL_LOOKAHEAD_MINUTES,
    emailSender: env.EMAIL_SENDER,
    summaryRecipient: env.SUMMARY_RECIPIENT,
    summaryHourUtc: env.SUMMARY_HOUR_UTC
  });

  if (!parseResult.success) {
    const details = parseResult.error.issues
      .map((issue) => issue.message)
      .join("; ");
    throw new ConfigError(`Invalid environment configuration: ${details}`);
  }

  return parseResult.data;
}
