"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyHistoryPoint } from "@/lib/types";

type Granularity = "week" | "month";

interface Props {
  title?: string;
  hint?: string;
  weekly: WeeklyHistoryPoint[];
}

const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

function formatWeek(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatMonth(iso: string): string {
  const d = new Date(iso);
  return MONTH_LABELS[d.getMonth()];
}

interface Row {
  weekStart: string;
  全流程: number;
  纯诊断: number;
  NP: number;
}

function aggregateMonthly(weekly: Row[]): Row[] {
  const groups = new Map<
    string,
    { full: number; pure: number; np: number; n: number }
  >();
  for (const p of weekly) {
    const key = p.weekStart.slice(0, 7);
    const g = groups.get(key) ?? { full: 0, pure: 0, np: 0, n: 0 };
    g.full += p["全流程"];
    g.pure += p["纯诊断"];
    g.np += p["NP"];
    g.n += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries()).map(([key, g]) => ({
    weekStart: `${key}-01`,
    全流程: Math.round((g.full / g.n) * 10) / 10,
    纯诊断: Math.round((g.pure / g.n) * 10) / 10,
    NP: Math.round((g.np / g.n) * 10) / 10,
  }));
}

export function UtilizationChart({
  title = "实际利用率 · 按角色",
  hint = "= 当周被订小时数 / 该角色总供给小时数。100% = 满载；超过 = 超卖",
  weekly,
}: Props) {
  const [view, setView] = useState<Granularity>("week");

  // 把原始数据映射成图表行（utilization 用百分比，方便人眼读）
  const rows: Row[] = weekly
    .filter(
      (p) =>
        p.utilFullFlow != null &&
        p.utilPureDx != null &&
        p.utilNP != null,
    )
    .map((p) => ({
      weekStart: p.weekStart,
      全流程: Math.round((p.utilFullFlow as number) * 1000) / 10,
      纯诊断: Math.round((p.utilPureDx as number) * 1000) / 10,
      NP: Math.round((p.utilNP as number) * 1000) / 10,
    }));

  const data = view === "week" ? rows : aggregateMonthly(rows);
  const fmtX = view === "week" ? formatWeek : formatMonth;

  const chartData = data.map((p) => ({
    x: fmtX(p.weekStart),
    全流程: p["全流程"],
    纯诊断: p["纯诊断"],
    NP: p["NP"],
  }));

  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-gray-900">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] text-gray-400">%</span>
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
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
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
              domain={[0, 120]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
              formatter={(value, name) => [`${value}%`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
            <ReferenceLine
              y={100}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: "满载 100%",
                position: "insideTopRight",
                fontSize: 10,
                fill: "#ef4444",
              }}
            />
            <ReferenceLine
              y={90}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: "预警 90%",
                position: "insideTopRight",
                fontSize: 10,
                fill: "#f59e0b",
              }}
            />
            <Line
              type="monotone"
              dataKey="全流程"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="纯诊断"
              stroke="#ec4899"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="NP"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
