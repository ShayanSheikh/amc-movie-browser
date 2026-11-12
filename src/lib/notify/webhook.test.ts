import { describe, expect, it } from "vitest";
import { buildWebhookBody, detectFlavor } from "./webhook";
import { toAmcDate } from "../amc/httpClient";
import { normalizeShowtime } from "../amc/types";

describe("webhook", () => {
  it("detects flavor from URL", () => {
    expect(detectFlavor("https://discord.com/api/webhooks/1/abc")).toBe("discord");
    expect(detectFlavor("https://hooks.slack.com/services/T/B/x")).toBe("slack");
    expect(detectFlavor("https://example.com/hook")).toBe("generic");
  });

  it("builds a Discord embed", () => {
    const body = buildWebhookBody("discord", "new_showtimes", { title: "Hi", lines: ["a", "b"], url: "https://x" }) as {
      embeds: { title: string; description: string; url: string }[];
    };
    expect(body.embeds[0].title).toContain("Hi");
    expect(body.embeds[0].description).toBe("a\nb");
    expect(body.embeds[0].url).toBe("https://x");
  });

  it("builds Slack blocks", () => {
    const body = buildWebhookBody("slack", "deadline_missed", { title: "Hi", lines: ["a"] }) as { text: string; blocks: unknown[] };
    expect(body.text).toContain("Hi");
    expect(body.blocks).toHaveLength(2);
  });
});

describe("amc helpers", () => {
  it("formats AMC path dates as MM-DD-YY", () => {
    expect(toAmcDate("2026-11-05")).toBe("11-05-26");
  });

  it("extracts premium format from attributes", () => {
    const s = normalizeShowtime({
      id: 1,
      movieId: 2,
      theatreId: 3,
      showDateTimeLocal: "2026-11-12T19:30:00",
      attributes: [{ code: "REALD3D" }, { code: "IMAXWITHLASER" }],
    });
    expect(s.format).toBe("IMAX");
  });
});
