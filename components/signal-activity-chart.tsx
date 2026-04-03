"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SignalPoint = {
  label: string;
  signals: number;
};

export function SignalActivityChart({ data }: { data: SignalPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#a1a1aa", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #27272a",
              borderRadius: "12px",
              color: "#f4f4f5",
            }}
            formatter={(value) => [Number(value ?? 0).toLocaleString(), "Signals"]}
          />
          <Line
            type="monotone"
            dataKey="signals"
            stroke="#f7931a"
            strokeWidth={3}
            dot={{ fill: "#f7931a", strokeWidth: 0, r: 4 }}
            activeDot={{ r: 6, fill: "#fbbf24" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
