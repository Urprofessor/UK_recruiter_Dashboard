import type { Status, WeekPoint } from "@/lib/types";

const STATUS_META: Record<Status, { dot: string; pill: string; label: string }> = {
  ok: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    label: "够用",
  },
  tight: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    label: "紧张",
  },
  short: {
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-1 ring-red-200",
    label: "不够",
  },
};

function weekShort(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function classify(w: WeekPoint, buffer: number): Status {
  if (w.capacity >= w.demand * (1 + buffer)) return "ok";
  if (w.capacity >= w.demand) return "tight";
  return "short";
}

interface Section {
  title: string;
  weekly: WeekPoint[];
  buffer: number;
}

export function StatusList({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-4">
      {sections.map((sec) => (
        <div key={sec.title}>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            {sec.title}
          </div>
          <ul className="space-y-1.5">
            {sec.weekly.map((w) => {
              const s = classify(w, sec.buffer);
              const meta = STATUS_META[s];
              return (
                <li
                  key={w.weekStart}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`}
                    />
                    <span className="text-gray-600">{weekShort(w.weekStart)}</span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${meta.pill}`}
                  >
                    {meta.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
