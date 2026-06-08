"use client";

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

function formatWeek(iso: string): string {
  // 2026-06-08 → 06/08
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}`;
}

export function GapChart({ data }: { data: WeekPoint[] }) {
  const chartData = data.map((p) => ({
    week: formatWeek(p.weekStart),
    需求: p.demand,
    产能: p.capacity,
    "安全线（含冗余）": p.safeCapacity,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} width={36} />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
            }}
            formatter={(value: number) => `${value} 诊次`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="需求"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="产能"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="安全线（含冗余）"
            stroke="#9ca3af"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
