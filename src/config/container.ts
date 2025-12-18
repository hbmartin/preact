import type { AppConfig } from "./env";
import { getAppConfig } from "./env";
import { CronController } from "../controllers/cron-controller";
import { CalendarService } from "../services/calendar-service";
import { EmailService } from "../services/email-service";
import { TaskRunService } from "../services/task-run-service";
import { SummaryService } from "../services/summary-service";
import type { TaskExecutor } from "../services/task-executor";
import { GoogleCalendarRepository } from "../repositories/calendar-repository";
import { SqlTaskRunRepository, type SqlExecutor } from "../repositories/task-run-repository";
import { SqlSummaryRepository } from "../repositories/summary-repository";
import type { BindingsEnv } from "../types/env";

export interface RuntimeContainer {
  config: AppConfig;
  calendarService: CalendarService;
  taskRunService: TaskRunService;
  cronController: CronController;
}

export interface ContainerDeps {
  env: BindingsEnv;
  sql: SqlExecutor;
  taskExecutor: TaskExecutor;
}

/**
 * Creates a runtime container with all services wired up.
 * This is used by both the Chat agent and the scheduled handler.
 */
export function createRuntimeContainer(deps: ContainerDeps): RuntimeContainer {
  const { env, sql, taskExecutor } = deps;

  const config = getAppConfig(env);

  const calendarRepository = new GoogleCalendarRepository({
    calendarId: config.calendarId,
    accessToken: config.accessToken,
    timezone: config.timezone
  });
  const taskRunRepository = new SqlTaskRunRepository(sql);
  const summaryRepository = new SqlSummaryRepository(sql);

  const calendarService = new CalendarService(calendarRepository);
  const taskRunService = new TaskRunService(taskRunRepository);
  const emailService = new EmailService(env.SEND_EMAIL, config.emailSender);
  const summaryService = new SummaryService(
    taskRunService,
    summaryRepository,
    emailService,
    config
  );

  const cronController = new CronController(
    calendarService,
    taskRunService,
    taskExecutor,
    summaryService,
    config
  );

  return {
    config,
    calendarService,
    taskRunService,
    cronController
  };
}
