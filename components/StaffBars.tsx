"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  mdFullFlow: number;
  mdInitialOnly: number;
  np: number;
}

export function StaffBars({ mdFullFlow, mdInitialOnly, np }: Props) {
  const data = [
    { type: "MD-全流程", count: mdFullFlow, color: "#3b82f6" },
    { type: "MD-仅初诊", count: mdInitialOnly, color: "#8b5cf6" },
    { type: "NP", count: np, color: "#10b981" },
  ];

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0eeea" vertical={false} />
          <XAxis
            dataKey="type"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            width={24}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
            }}
            formatter={(value: number) => `${value} 人`}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.type} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
