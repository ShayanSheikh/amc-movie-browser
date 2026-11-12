import type { DeadlineStatus } from "@/db/schema";

const STYLES: Record<DeadlineStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  met: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  missed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const LABELS: Record<DeadlineStatus, string> = {
  pending: "Waiting",
  met: "Programmed",
  missed: "Likely not programmed",
};

export function StatusPill({ status }: { status: DeadlineStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>;
}
