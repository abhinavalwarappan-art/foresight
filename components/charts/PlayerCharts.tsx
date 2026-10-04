"use client";

import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeriesPoint {
  label: string;
  fp: number;
  xfp: number;
  played: boolean;
  primary: number;
  secondary: number;
}

const AXIS = { stroke: "#5f6a80", fontSize: 10, fontFamily: "var(--font-geist-mono)" };
const GRID = "rgba(148,163,184,0.08)";

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-ink-800/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-mono text-fg-dim">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-fg-muted">{p.name}</span>
          <span className="num ml-auto pl-4 text-fg">{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

/** Production vs opportunity: actual fantasy points (bars) against expected points from usage (line). */
export function ProductionChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fpBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f7cff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#4f7cff" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="fp" name="Fantasy pts (observed)" fill="url(#fpBar)" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line dataKey="xfp" name="Expected from usage (calc.)" stroke="#2fd3f0" strokeWidth={2} dot={{ r: 2.5, fill: "#2fd3f0" }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UsageChart({ data, primaryLabel, secondaryLabel }: { data: SeriesPoint[]; primaryLabel: string; secondaryLabel: string }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <ComposedChart data={data.filter((d) => d.played)} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="usageArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9b7bff" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#9b7bff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis yAxisId="l" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} axisLine={false} tickLine={false} width={30} />
          <Tooltip content={<Tip />} />
          <Area yAxisId="r" dataKey="secondary" name={secondaryLabel} stroke="#9b7bff" fill="url(#usageArea)" strokeWidth={1.5} type="monotone" />
          <Line yAxisId="l" dataKey="primary" name={primaryLabel} stroke="#e9edf5" strokeWidth={2} dot={{ r: 2.5 }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
