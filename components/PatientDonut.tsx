"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  queueInitial: number;
  inFollowup: number;
  inMaintenance: number;
}

const COLORS = {
  initial: "#f59e0b",     // amber
  followup: "#3b82f6",    // blue
  maintenance: "#10b981", // emerald
};

export function PatientDonut({ queueInitial, inFollowup, inMaintenance }: Props) {
  const total = queueInitial + inFollowup + inMaintenance;
  const data = [
    { name: "等待首诊", value: queueInitial, color: COLORS.initial },
    { name: "复诊中", value: inFollowup, color: COLORS.followup },
    { name: "维持中", value: inMaintenance, color: COLORS.maintenance },
  ];

  return (
    <div className="flex h-full items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={62}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid #e5e7eb",
              }}
              formatter={(value: number) => `${value} 人`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold text-gray-900">{total}</div>
          <div className="text-[10px] text-gray-500">在册总数</div>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-gray-600">{d.name}</span>
            </span>
            <span className="font-medium tabular-nums text-gray-900">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
