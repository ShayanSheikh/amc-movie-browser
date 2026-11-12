import type { AlertKind, AlertPayload } from "../../db/schema";

export type WebhookFlavor = "discord" | "slack" | "generic";

export function detectFlavor(url: string): WebhookFlavor {
  if (/discord(app)?\.com\/api\/webhooks\//.test(url)) return "discord";
  if (/hooks\.slack\.com\//.test(url)) return "slack";
  return "generic";
}

const COLORS: Record<AlertKind, number> = {
  new_showtimes: 0x2ecc71,
  deadline_met: 0x3498db,
  deadline_missed: 0xe74c3c,
  test: 0x95a5a6,
};

const EMOJI: Record<AlertKind, string> = {
  new_showtimes: "🎟️",
  deadline_met: "✅",
  deadline_missed: "⚠️",
  test: "🔔",
};

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function buildWebhookBody(flavor: WebhookFlavor, kind: AlertKind, p: AlertPayload): unknown {
  const title = `${EMOJI[kind]} ${p.title}`;
  const body = p.lines.join("\n");
  switch (flavor) {
    case "discord":
      return {
        username: "AMC Showtimes",
        embeds: [
          {
            title: truncate(title, 256),
            description: truncate(body, 4000),
            color: COLORS[kind],
            ...(p.url ? { url: p.url } : {}),
          },
        ],
      };
    case "slack":
      return {
        text: title,
        blocks: [
          { type: "header", text: { type: "plain_text", text: truncate(title, 150) } },
          ...(body
            ? [{ type: "section", text: { type: "mrkdwn", text: truncate(body, 2900) } }]
            : []),
        ],
      };
    default:
      return { ...p, title, text: body, kind };
  }
}

export async function sendWebhook(
  url: string,
  kind: AlertKind,
  payload: AlertPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookBody(detectFlavor(url), kind, payload)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webhook returned ${res.status}: ${text.slice(0, 200)}`);
  }
}
