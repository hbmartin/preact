import { EmailMessage } from "cloudflare:email";
import type { SendEmail } from "@cloudflare/workers-types";
import { ConfigError, ExternalServiceError } from "../errors";

export interface EmailContent {
  to: string;
  subject: string;
  body: string;
}

export interface EmailSendResult {
  messageId: string;
}

export class EmailService {
  constructor(
    private readonly binding: SendEmail | undefined,
    private readonly from: string
  ) {}

  async sendTextEmail(content: EmailContent): Promise<EmailSendResult> {
    if (!this.binding) {
      throw new ConfigError("SEND_EMAIL binding is not configured");
    }

    const raw = this.buildRawMessage(content);
    const email = new EmailMessage(this.from, content.to, raw);

    try {
      await this.binding.send(email);
      return { messageId: crypto.randomUUID() };
    } catch (error) {
      throw new ExternalServiceError("Failed to send email", { cause: error });
    }
  }

  private buildRawMessage({ subject, body, to }: EmailContent): string {
    const headers = [
      `From: ${this.from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8"
    ];

    return `${headers.join("\r\n")}\r\n\r\n${body}`;
  }
}
