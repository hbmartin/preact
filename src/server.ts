import { routeAgentRequest, type AgentContext } from "agents";
import { getSchedulePrompt, type Schedule } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { CronController } from "./controllers/cron-controller";
import { getAppConfig, type AppConfig } from "./config/env";
import type { CalendarEvent } from "./domain/calendar";
import { CalendarService } from "./services/calendar-service";
import { EmailService } from "./services/email-service";
import { HandlerTaskExecutor, type TaskExecutor } from "./services/task-executor";
import { TaskRunService } from "./services/task-run-service";
import { SummaryService } from "./services/summary-service";
import { cleanupMessages, processToolCalls } from "./utils";
import { tools, executions } from "./tools";
import type { BindingsEnv } from "./types/env";
import { GoogleCalendarRepository } from "./repositories/calendar-repository";
import { SqlTaskRunRepository } from "./repositories/task-run-repository";
import { SqlSummaryRepository } from "./repositories/summary-repository";

// import { env } from "cloudflare:workers";

const model = openai("gpt-4o-2024-11-20");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
type ChatState = {
  pollerScheduled: boolean;
};

type RuntimeContext = {
  config: AppConfig;
  cronController: CronController;
  taskExecutor: TaskExecutor;
  calendarService: CalendarService;
  taskRunService: TaskRunService;
};

export class Chat extends AIChatAgent<BindingsEnv, ChatState> {
  initialState: ChatState = { pollerScheduled: false };

  private readonly runtimeEnv: BindingsEnv;
  private runtime?: RuntimeContext;

  constructor(ctx: AgentContext, env: BindingsEnv) {
    super(ctx, env);
    this.runtimeEnv = env;
  }

  /**
   * Lazily construct runtime dependencies for the agent.
   */
  private getRuntime(): RuntimeContext {
    if (this.runtime) return this.runtime;

    const config = getAppConfig(this.runtimeEnv);
    const calendarRepository = new GoogleCalendarRepository({
      calendarId: config.calendarId,
      accessToken: config.accessToken,
      timezone: config.timezone
    });
    const taskRunRepository = new SqlTaskRunRepository(this.sql.bind(this));
    const summaryRepository = new SqlSummaryRepository(this.sql.bind(this));

    const calendarService = new CalendarService(calendarRepository);
    const taskRunService = new TaskRunService(taskRunRepository);
    const emailService = new EmailService(
      this.runtimeEnv.SEND_EMAIL,
      config.emailSender
    );
    const summaryService = new SummaryService(
      taskRunService,
      summaryRepository,
      emailService,
      config
    );

    const taskExecutor = new HandlerTaskExecutor(async (event, run) => {
      await this.executeCalendarTask(event, run.summary);
    });

    const cronController = new CronController(
      calendarService,
      taskRunService,
      taskExecutor,
      summaryService,
      config
    );

    this.runtime = {
      config,
      cronController,
      taskExecutor,
      calendarService,
      taskRunService
    };
    return this.runtime;
  }

  private resolveStartTime(when: Schedule["when"]): Date {
    if (when.type === "scheduled" && when.date) return when.date;
    if (when.type === "delayed" && when.delayInSeconds !== undefined) {
      return new Date(Date.now() + when.delayInSeconds * 1000);
    }
    if (when.type === "cron" && when.date) {
      return when.date;
    }
    return new Date();
  }

  private addDefaultEnd(start: Date): Date {
    return new Date(start.getTime() + 30 * 60 * 1000);
  }

  async createCalendarEventFromSchedule(input: Schedule) {
    const runtime = this.getRuntime();
    if (input.when.type === "no-schedule") {
      throw new Error(
        "Schedule details are required to create a calendar event"
      );
    }

    const start = this.resolveStartTime(input.when);

    const description =
      input.when.type === "cron" && input.when.cron
        ? `${input.description}\\nCron pattern: ${input.when.cron}`
        : input.description;

    const event = await runtime.calendarService.createEvent({
      title: input.description,
      description,
      start,
      end: this.addDefaultEnd(start),
      timezone: runtime.config.timezone
    });

    await runtime.taskRunService.createRunIfMissing(event);
    return event;
  }

  private async ensureCronSchedule() {
    if (this.state?.pollerScheduled) return;
    const existingCron = this.getSchedules({ type: "cron" }).find(
      (schedule) => schedule.callback === "pollAgentCalendar"
    );

    if (!existingCron) {
      await this.schedule("*/15 * * * *", "pollAgentCalendar");
    }

    this.setState({ pollerScheduled: true });
  }

  /**
   * Cron callback invoked by the agent scheduler.
   */
  async pollAgentCalendar() {
    const runtime = this.getRuntime();
    await this.ensureCronSchedule();
    await runtime.cronController.handleTick(new Date());
  }

  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    await this.ensureCronSchedule();

    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks... 

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeCalendarTask(
    description: CalendarEvent | string,
    summary?: string
  ) {
    const text =
      typeof description === "string"
        ? description
        : description.description ?? description.title;

    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${text}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);

    if (summary) {
      await this.saveMessages([
        ...this.messages,
        {
          id: generateId(),
          role: "assistant",
          parts: [
            {
              type: "text",
              text: `Task context: ${summary}`
            }
          ],
          metadata: {
            createdAt: new Date()
          }
        }
      ]);
    }
  }

  async executeTask(description: string) {
    await this.executeCalendarTask(description);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: BindingsEnv, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<BindingsEnv>;
