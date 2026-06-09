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
  fullFlow: number;
  pureDx: number;
  titration: number;
}

export function StaffBars({ fullFlow, pureDx, titration }: Props) {
  // 与 PatientDonut 完全错开
  const data = [
    { type: "全流程 MD", count: fullFlow, color: "#6366f1" },     // indigo (与 panel 全流程同色)
    { type: "纯诊断 MD", count: pureDx, color: "#ec4899" },        // pink
    { type: "Titration", count: titration, color: "#10b981" },     // emerald (与 panel titration 同色)
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
            formatter={(value) => [`${value} 人`, ""]}
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
