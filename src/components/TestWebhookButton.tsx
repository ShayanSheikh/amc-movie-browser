"use client";

import { useState, useTransition } from "react";
import { sendTestWebhook } from "@/app/actions";

export function TestWebhookButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await sendTestWebhook()))}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {pending ? "Sending…" : "Send test"}
      </button>
      {result && (
        <span className={`text-sm ${result.ok ? "text-green-600" : "text-red-600"}`}>{result.message}</span>
      )}
    </div>
  );
}
