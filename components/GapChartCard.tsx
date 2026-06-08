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
  /** 未来 N 周预测（在周视图里用虚线延续）。月视图忽略。 */
  forecast?: WeekPoint[];
  /** 月视图聚合方式：sum = 月内总诊次；avg = 月内每周平均 */
  monthAggregation?: "sum" | "avg";
}

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

interface ChartRow {
  x: string;
  demandHist: number | null;
  demandForecast: number | null;
  capacity: number;
  safeCapacity: number;
}

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

function buildWeeklyRows(
  history: WeekPoint[],
  forecast: WeekPoint[],
): ChartRow[] {
  const rows: ChartRow[] = history.map((p) => ({
    x: formatWeek(p.weekStart),
    demandHist: p.demand,
    demandForecast: null,
    capacity: p.capacity,
    safeCapacity: p.safeCapacity,
  }));

  if (rows.length > 0 && forecast.length > 0) {
    // 让虚线从最后一周历史值"接上"
    rows[rows.length - 1].demandForecast = rows[rows.length - 1].demandHist;
  }
  const lastHistDate = history[history.length - 1]?.weekStart;
  for (const f of forecast) {
    if (f.weekStart === lastHistDate) continue; // 去重叠
    rows.push({
      x: formatWeek(f.weekStart),
      demandHist: null,
      demandForecast: f.demand,
      capacity: f.capacity,
      safeCapacity: f.safeCapacity,
    });
  }
  return rows;
}

function buildMonthlyRows(
  history: WeekPoint[],
  mode: "sum" | "avg",
): ChartRow[] {
  const groups = new Map<
    string,
    { sumD: number; sumC: number; sumS: number; n: number }
  >();
  for (const p of history) {
    const key = p.weekStart.slice(0, 7);
    const g = groups.get(key) ?? { sumD: 0, sumC: 0, sumS: 0, n: 0 };
    g.sumD += p.demand;
    g.sumC += p.capacity;
    g.sumS += p.safeCapacity;
    g.n += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries()).map(([key, g]) => {
    const f = mode === "avg" ? 1 / g.n : 1;
    return {
      x: formatMonth(`${key}-01`),
      demandHist: round1(g.sumD * f),
      demandForecast: null,
      capacity: round1(g.sumC * f),
      safeCapacity: round1(g.sumS * f),
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
  forecast = [],
  monthAggregation = "sum",
}: Props) {
  const [view, setView] = useState<Granularity>("week");
  const data =
    view === "week"
      ? buildWeeklyRows(weekly, forecast)
      : buildMonthlyRows(weekly, monthAggregation);

  const unitHint =
    view === "week"
      ? "诊次 / 周"
      : monthAggregation === "sum"
      ? "诊次 / 月（合计）"
      : "诊次 / 周（月内平均）";

  const hintParts: string[] = [];
  if (hint) hintParts.push(hint);
  if (view === "week" && forecast.length > 0) {
    hintParts.push(`虚线 = 未来 ${forecast.length} 周预测`);
  }

  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-gray-900">{title}</h3>
          {hintParts.length > 0 && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              {hintParts.join("　·　")}
            </p>
          )}
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
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0eeea" vertical={false} />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              interval={view === "week" ? "preserveStartEnd" : 0}
              minTickGap={20}
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
              formatter={(value, name) => [`${value} 诊次`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
            {/* 历史需求 */}
            <Line
              type="monotone"
              dataKey="demandHist"
              name="需求"
              stroke="#ef4444"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {/* 预测需求（仅 week 视图，虚线，不出现在 legend） */}
            <Line
              type="monotone"
              dataKey="demandForecast"
              name="需求（预测）"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              legendType={view === "week" && forecast.length > 0 ? "plainline" : "none"}
              hide={view !== "week" || forecast.length === 0}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="capacity"
              name="产能"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="safeCapacity"
              name="安全线"
              stroke="#9ca3af"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
