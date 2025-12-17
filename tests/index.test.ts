import { describe, expect, it, vi } from "vitest";

vi.mock("agents", async () => {
  const actual = await vi.importActual<typeof import("agents")>("agents");
  return {
    ...actual,
    routeAgentRequest: vi.fn().mockResolvedValue(null)
  };
});

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

describe.skip("Chat worker", () => {
  it("responds with Not found", async () => {
    const { default: worker } = await import("../src/server");
    const { routeAgentRequest } = await import("agents");

    const response = await worker.fetch(
      new Request("http://example.com"),
      {} as any,
      {} as any
    );

    expect(await response.text()).toBe("Not found");
    expect(response.status).toBe(404);
    expect(routeAgentRequest).toHaveBeenCalled();
  });
});
