import { vi } from "vitest";

vi.mock("cloudflare:email", () => {
  class EmailMessage {
    from: string;
    to: string;
    raw: string;

    constructor(from: string, to: string, raw: string) {
      this.from = from;
      this.to = to;
      this.raw = raw;
    }
  }

  return { EmailMessage };
});
