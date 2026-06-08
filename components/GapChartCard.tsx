"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekPoint } from "@/lib/types";

type Granularity = "week" | "month";

interface Props {
  title: string;
  hint?: string;
  weekly: WeekPoint[];
  /** 月视图聚合方式：sum = 月内总诊次；avg = 月内每周平均 */
  monthAggregation?: "sum" | "avg";
}

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function formatWeek(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function formatMonth(iso: string): string {
  const d = new Date(iso);
  return MONTH_LABELS[d.getMonth()];
}

function aggregateMonthly(weekly: WeekPoint[], mode: "sum" | "avg"): WeekPoint[] {
  const groups = new Map<string, { sumD: number; sumC: number; sumS: number; n: number }>();
  for (const p of weekly) {
    const key = p.weekStart.slice(0, 7); // "2026-01"
    const g = groups.get(key) ?? { sumD: 0, sumC: 0, sumS: 0, n: 0 };
    g.sumD += p.demand;
    g.sumC += p.capacity;
    g.sumS += p.safeCapacity;
    g.n += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries()).map(([key, g]) => {
    const factor = mode === "avg" ? 1 / g.n : 1;
    return {
      weekStart: `${key}-01`,
      demand: round1(g.sumD * factor),
      capacity: round1(g.sumC * factor),
      safeCapacity: round1(g.sumS * factor),
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function GapChartCard({
  title,
  hint,
  weekly,
  monthAggregation = "sum",
}: Props) {
  const [view, setView] = useState<Granularity>("week");
  const data = view === "week" ? weekly : aggregateMonthly(weekly, monthAggregation);
  const fmtX = view === "week" ? formatWeek : formatMonth;

  const chartData = data.map((p) => ({
    x: fmtX(p.weekStart),
    需求: p.demand,
    产能: p.capacity,
    安全线: p.safeCapacity,
  }));

  const unitHint =
    view === "week"
      ? "诊次 / 周"
      : monthAggregation === "sum"
      ? "诊次 / 月（合计）"
      : "诊次 / 周（月内平均）";

  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-gray-900">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] text-gray-400">{unitHint}</span>
          <div className="flex gap-0.5 rounded-md bg-gray-100 p-0.5 text-[11px]">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "rounded px-2 py-1 transition-colors " +
                  (view === v
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700")
                }
              >
                {v === "week" ? "周" : "月"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0eeea" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              interval={view === "week" ? "preserveStartEnd" : 0}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
              formatter={(value: number) => `${value} 诊次`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
            <Line
              type="monotone"
              dataKey="需求"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="产能"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="安全线"
              stroke="#9ca3af"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
