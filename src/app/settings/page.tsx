import { getDb, getSettings } from "@/db";
import { amcMode } from "@/lib/amc";
import { pollNowAction, saveSettings, setMockStep } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { TestWebhookButton } from "@/components/TestWebhookButton";
import type { PollSummary } from "@/lib/poll/runPoll";

export default function SettingsPage() {
  const cfg = getSettings(getDb());
  const mode = amcMode();
  const last = cfg.lastPollSummary ? (JSON.parse(cfg.lastPollSummary) as PollSummary) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <section className="card">
        <h1 className="mb-4 text-xl font-semibold">Settings</h1>
        <form action={saveSettings} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Discord or Slack webhook URL</span>
            <input
              name="webhookUrl"
              type="url"
              defaultValue={cfg.webhookUrl ?? ""}
              placeholder="https://discord.com/api/webhooks/…"
              className="input w-full"
            />
            <span className="block text-xs text-zinc-500">
              Discord: Server Settings → Integrations → Webhooks. Slack: create an Incoming Webhook app. Leave empty for in-app alerts only.
            </span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="space-y-1">
              <span className="block text-sm font-medium">Check every (minutes)</span>
              <input name="pollIntervalMinutes" type="number" min={5} defaultValue={cfg.pollIntervalMinutes} className="input w-32" />
            </label>
            <label className="space-y-1">
              <span className="block text-sm font-medium">Days ahead to check</span>
              <input name="daysAhead" type="number" min={1} max={60} defaultValue={cfg.daysAhead} className="input w-32" />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Each check makes one AMC request per favorite theatre per day ahead, so 3 theatres × 14 days = 42 requests.
          </p>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </form>
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <TestWebhookButton />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Polling</h2>
        <p className="text-sm text-zinc-500">
          {cfg.lastPollAt ? `Last check: ${new Date(cfg.lastPollAt).toLocaleString()}` : "Never checked."}
          {last && ` ${last.requests} requests, ${last.newShowtimes} new showtimes, ${last.alertsCreated} alerts.`}
        </p>
        {cfg.lastPollError && <pre className="overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{cfg.lastPollError}</pre>}
        <form action={pollNowAction}>
          <SubmitButton pendingText="Checking…">Check now</SubmitButton>
        </form>
      </section>

      {mode === "mock" && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Mock data controls</h2>
          <p className="text-sm text-zinc-500">
            No AMC API key is set, so the app is using fake data. Advance the release step to simulate AMC posting new
            showtimes, then click <em>Check now</em> to see alerts. At step 1 <strong>Glass Meridian</strong> goes on sale.{" "}
            <strong>Paper Comets</strong> only ever plays at AMC Harborview 8, so use it to test deadline alerts.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              Current step: <strong>{cfg.mockStep}</strong>
            </span>
            <form action={setMockStep}>
              <input type="hidden" name="step" value={cfg.mockStep + 1} />
              <SubmitButton variant="secondary">Advance →</SubmitButton>
            </form>
            <form action={setMockStep}>
              <input type="hidden" name="step" value={0} />
              <SubmitButton variant="ghost">Reset</SubmitButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
