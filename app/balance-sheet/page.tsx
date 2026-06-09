"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";

// ============================================================
// 类型 & 默认值
// ============================================================

interface Params {
  // A. 在岗人员
  mdInitOnly: number;
  mdFullFlow: number;
  np: number;
  mdHours: number; // 周有效工时
  npHours: number;
  // B. 当前在册患者
  queueInitial: number;
  inFollowup: number;
  inMaintenance: number;
  // C. 未来 4 周新增首诊
  bookings: [number, number, number, number];
  // D. 诊次时长 (min)
  tauInit: number;
  tauDrug: number;
  tauFu: number;
  // E. 周期 & 比例
  iDrug: number; // 复诊间隔（周）
  iFu: number; // 维持间隔（周）
  rTit: number; // titration ratio (0..1)
  rNs: number; // no-show (0..1)
  sInit: number; // 全流程 MD 投在初诊的比例 (0..1)
  // F. 冗余 & lead time
  bufferMD: number;
  bufferNP: number;
  utilization: number;
  leadMD: number; // 周
  leadNP: number; // 周
}

const DEFAULTS: Params = {
  mdInitOnly: 5,
  mdFullFlow: 3,
  np: 5,
  mdHours: 25,
  npHours: 25,
  queueInitial: 24,
  inFollowup: 280,
  inMaintenance: 2600,
  bookings: [28, 32, 35, 38],
  tauInit: 45,
  tauDrug: 30,
  tauFu: 15,
  iDrug: 2,
  iFu: 2.5,
  rTit: 0.6,
  rNs: 0.12,
  sInit: 0.5,
  bufferMD: 0.2,
  bufferNP: 0.2,
  utilization: 0.85,
  leadMD: 12,
  leadNP: 8,
};

// ============================================================
// 计算
// ============================================================

type Status = "ok" | "tight" | "short";

interface Balance {
  // MD initial line
  coverageMD: number;
  statusMD: Status;
  gapMDMin: number;
  hiresMD: number;
  // Non-initial line
  coverageNI: number;
  statusNI: Status;
  gapNIMin: number;
  hiresNP: number;
  // Windows
  W_MD: number;
  W_NP: number;
  // Demand breakdown (totals over respective windows, in minutes)
  D_init_total: number;
  D_drug_total: number;
  D_fu_total: number;
  // Capacity breakdown (totals over respective windows, in minutes)
  C_mdInitOnly_init: number; // contributes to initial line over W_MD
  C_mdFullFlow_init: number; // contributes to initial line over W_MD
  C_mdFullFlow_ni: number; // contributes to non-initial line over W_NP
  C_np_ni: number; // contributes to non-initial line over W_NP
}

function computeBalance(p: Params): Balance {
  const u = p.utilization;
  const E_MD = p.mdHours * 60 * u; // 单位 min/周/人
  const E_NP = p.npHours * 60 * u;

  // 容量（每周分钟）
  const C_init_pw =
    p.mdInitOnly * E_MD + p.mdFullFlow * E_MD * p.sInit;
  const C_ni_pw =
    p.mdFullFlow * E_MD * (1 - p.sInit) + p.np * E_NP;

  // 非初诊每周需求（分钟）—— v0 稳态假设
  const D_drug_pw = (p.inFollowup / p.iDrug) * p.tauDrug;
  const D_fu_pw = (p.inMaintenance / p.iFu) * p.tauFu;
  const D_ni_pw = D_drug_pw + D_fu_pw;

  // 前瞻窗口
  const W_MD = Math.max(1, p.leadMD);
  const W_NP = Math.max(1, p.leadNP);

  // 初诊累计需求：已知前 4 周用 bookings；超出 4 周用平均外推
  const avgBooking =
    p.bookings.reduce((a, b) => a + b, 0) / p.bookings.length;
  let D_init_total = 0;
  for (let w = 0; w < W_MD; w++) {
    const b = w < p.bookings.length ? p.bookings[w] : avgBooking;
    D_init_total += b * (1 - p.rNs) * p.tauInit;
  }

  // 累计
  const C_init_total = C_init_pw * W_MD;
  const C_ni_total = C_ni_pw * W_NP;
  const D_ni_total = D_ni_pw * W_NP;
  const D_drug_total = D_drug_pw * W_NP;
  const D_fu_total = D_fu_pw * W_NP;

  // Coverage
  const coverageMD = D_init_total > 0 ? C_init_total / D_init_total : Infinity;
  const coverageNI = D_ni_total > 0 ? C_ni_total / D_ni_total : Infinity;

  // 状态
  const cls = (c: number, b: number): Status =>
    c >= 1 + b ? "ok" : c >= 1 ? "tight" : "short";
  const statusMD = cls(coverageMD, p.bufferMD);
  const statusNI = cls(coverageNI, p.bufferNP);

  // 缺口（正数 = 不够）
  const gapMDMin = D_init_total * (1 + p.bufferMD) - C_init_total;
  const gapNIMin = D_ni_total * (1 + p.bufferNP) - C_ni_total;

  // 建议招聘人数（基于"典型新员工"= 25 h/周 × u）
  const E_new = 25 * 60 * u;
  const hiresMD = gapMDMin > 0 ? Math.ceil(gapMDMin / (E_new * W_MD)) : 0;
  const hiresNP = gapNIMin > 0 ? Math.ceil(gapNIMin / (E_new * W_NP)) : 0;

  // 容量分项
  const C_mdInitOnly_init = p.mdInitOnly * E_MD * W_MD;
  const C_mdFullFlow_init = p.mdFullFlow * E_MD * p.sInit * W_MD;
  const C_mdFullFlow_ni = p.mdFullFlow * E_MD * (1 - p.sInit) * W_NP;
  const C_np_ni = p.np * E_NP * W_NP;

  return {
    coverageMD,
    statusMD,
    gapMDMin,
    hiresMD,
    coverageNI,
    statusNI,
    gapNIMin,
    hiresNP,
    W_MD,
    W_NP,
    D_init_total,
    D_drug_total,
    D_fu_total,
    C_mdInitOnly_init,
    C_mdFullFlow_init,
    C_mdFullFlow_ni,
    C_np_ni,
  };
}

// ============================================================
// 工具
// ============================================================

const STATUS_META: Record<Status, { dot: string; text: string; label: string }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700", label: "充裕" },
  tight: { dot: "bg-amber-500", text: "text-amber-700", label: "紧张" },
  short: { dot: "bg-red-500", text: "text-red-700", label: "不够" },
};

const fmtNum = (n: number, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) : "—";

const fmtHours = (min: number) => (min / 60).toFixed(1);
const fmtSessions = (min: number, dur: number) => Math.round(min / dur);

// ============================================================
// 小组件
// ============================================================

function NumberInput({
  label,
  value,
  onChange,
  unit,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          step={step ?? 1}
          min={min}
          max={max}
          className="w-20 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm tabular-nums outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
        />
        {unit && <span className="text-[11px] text-gray-400">{unit}</span>}
      </div>
    </label>
  );
}

function PercentInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <NumberInput
      label={label}
      value={Math.round(value * 1000) / 10}
      onChange={(v) => onChange(v / 100)}
      unit="%"
      step={1}
      min={0}
      max={100}
    />
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-[#f0eeea] bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[12px] font-medium text-gray-800 hover:bg-gray-50">
        <span>{title}</span>
        <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-[#f0eeea] p-4">{children}</div>
    </details>
  );
}

function StatusPill({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${m.dot}`} />
      <span className={`text-xs font-medium ${m.text}`}>{m.label}</span>
    </span>
  );
}

// ============================================================
// 主页面
// ============================================================

export default function BalanceSheetPage() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const b = useMemo(() => computeBalance(params), [params]);

  function update<K extends keyof Params>(key: K, value: Params[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function updateBooking(i: number, v: number) {
    setParams((p) => {
      const next = [...p.bookings] as Params["bookings"];
      next[i] = v;
      return { ...p, bookings: next };
    });
  }

  const dirty = JSON.stringify(params) !== JSON.stringify(DEFAULTS);

  return (
    <PageShell active="monitoring">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ===== 左：参数（25 个，分 6 块）===== */}
        <aside className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-gray-900">参数（可调）</h2>
            <button
              type="button"
              onClick={() => setParams(DEFAULTS)}
              disabled={!dirty}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              重置默认值
            </button>
          </div>

          <Section title="A · 在岗人员">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="仅初诊 MD" value={params.mdInitOnly} onChange={(v) => update("mdInitOnly", v)} unit="人" min={0} />
              <NumberInput label="全流程 MD" value={params.mdFullFlow} onChange={(v) => update("mdFullFlow", v)} unit="人" min={0} />
              <NumberInput label="NP" value={params.np} onChange={(v) => update("np", v)} unit="人" min={0} />
              <NumberInput label="MD 周工时" value={params.mdHours} onChange={(v) => update("mdHours", v)} unit="h" step={0.5} min={0} />
              <NumberInput label="NP 周工时" value={params.npHours} onChange={(v) => update("npHours", v)} unit="h" step={0.5} min={0} />
            </div>
          </Section>

          <Section title="B · 当前在册患者">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="等待首诊" value={params.queueInitial} onChange={(v) => update("queueInitial", v)} unit="人" min={0} />
              <NumberInput label="复诊中" value={params.inFollowup} onChange={(v) => update("inFollowup", v)} unit="人" min={0} />
              <NumberInput label="维持中" value={params.inMaintenance} onChange={(v) => update("inMaintenance", v)} unit="人" min={0} />
            </div>
          </Section>

          <Section title="C · 未来 4 周新增首诊预期">
            <div className="grid grid-cols-4 gap-3">
              {params.bookings.map((v, i) => (
                <NumberInput
                  key={i}
                  label={`第 ${i + 1} 周`}
                  value={v}
                  onChange={(nv) => updateBooking(i, nv)}
                  unit="人"
                  min={0}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              超过 4 周的部分用这 4 周平均外推到 {b.W_MD} 周（MD lookahead 窗口）。
            </p>
          </Section>

          <Section title="D · 诊次时长">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="初诊" value={params.tauInit} onChange={(v) => update("tauInit", v)} unit="min" min={0} />
              <NumberInput label="复诊" value={params.tauDrug} onChange={(v) => update("tauDrug", v)} unit="min" min={0} />
              <NumberInput label="维持" value={params.tauFu} onChange={(v) => update("tauFu", v)} unit="min" min={0} />
            </div>
          </Section>

          <Section title="E · 周期 & 比例">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="复诊间隔" value={params.iDrug} onChange={(v) => update("iDrug", v)} unit="周" step={0.5} min={0.1} />
              <NumberInput label="维持间隔" value={params.iFu} onChange={(v) => update("iFu", v)} unit="周" step={0.5} min={0.1} />
              <PercentInput label="Titration Ratio" value={params.rTit} onChange={(v) => update("rTit", v)} />
              <PercentInput label="No-show 率" value={params.rNs} onChange={(v) => update("rNs", v)} />
              <PercentInput label="全流程 MD 投初诊比例" value={params.sInit} onChange={(v) => update("sInit", v)} />
            </div>
          </Section>

          <Section title="F · 冗余 & Lead Time">
            <div className="grid grid-cols-3 gap-3">
              <PercentInput label="MD 冗余" value={params.bufferMD} onChange={(v) => update("bufferMD", v)} />
              <PercentInput label="NP 冗余" value={params.bufferNP} onChange={(v) => update("bufferNP", v)} />
              <PercentInput label="利用率" value={params.utilization} onChange={(v) => update("utilization", v)} />
              <NumberInput label="MD Lead Time" value={params.leadMD} onChange={(v) => update("leadMD", v)} unit="周" min={1} />
              <NumberInput label="NP Lead Time" value={params.leadNP} onChange={(v) => update("leadNP", v)} unit="周" min={1} />
            </div>
          </Section>
        </aside>

        {/* ===== 右：平衡表 ===== */}
        <main className="space-y-4 lg:col-span-3">
          {/* Coverage 表（与 Excel MVP 对齐） */}
          <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">Coverage 指标</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Coverage = 容量 / 需求；≥ 1+冗余 充裕 / ≥ 1 紧张 / &lt; 1 不够
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-[#f0eeea] text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2">Metric</th>
                  <th className="py-2 text-right">Value</th>
                  <th className="py-2 pl-4">Status</th>
                  <th className="py-2 pl-4">含义</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f5f3ef]">
                <tr>
                  <td className="py-2 text-gray-700">MD Coverage（{b.W_MD}w）</td>
                  <td className="py-2 text-right font-medium tabular-nums">{fmtNum(b.coverageMD, 2)}</td>
                  <td className="py-2 pl-4"><StatusPill status={b.statusMD} /></td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">MD 初诊容量 ÷ 初诊需求</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-700">Non-Init Coverage（{b.W_NP}w）</td>
                  <td className="py-2 text-right font-medium tabular-nums">{fmtNum(b.coverageNI, 2)}</td>
                  <td className="py-2 pl-4"><StatusPill status={b.statusNI} /></td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">复诊+维持容量 ÷ 复诊+维持需求</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-700">MD Gap Hours</td>
                  <td className={`py-2 text-right font-medium tabular-nums ${b.gapMDMin > 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {b.gapMDMin > 0 ? "−" : "+"}{fmtHours(Math.abs(b.gapMDMin))}
                  </td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">{b.gapMDMin > 0 ? "缺口" : "余量"}</td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">含 {Math.round(params.bufferMD * 100)}% 冗余</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-700">Non-Init Gap Hours</td>
                  <td className={`py-2 text-right font-medium tabular-nums ${b.gapNIMin > 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {b.gapNIMin > 0 ? "−" : "+"}{fmtHours(Math.abs(b.gapNIMin))}
                  </td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">{b.gapNIMin > 0 ? "缺口" : "余量"}</td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">含 {Math.round(params.bufferNP * 100)}% 冗余</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-700">建议招 MD</td>
                  <td className="py-2 text-right font-medium tabular-nums">{b.hiresMD} 人</td>
                  <td className="py-2 pl-4"></td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">按 25h/周 折算</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-700">建议招 NP</td>
                  <td className="py-2 text-right font-medium tabular-nums">{b.hiresNP} 人</td>
                  <td className="py-2 pl-4"></td>
                  <td className="py-2 pl-4 text-[11px] text-gray-500">首选；或招全流程 MD</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* MD 初诊线 balance sheet */}
          <BalanceTable
            title={`MD 初诊线 · 未来 ${b.W_MD} 周`}
            buffer={params.bufferMD}
            demandRows={[
              { label: "新患者首诊", min: b.D_init_total, dur: params.tauInit },
            ]}
            supplyRows={[
              { label: "仅初诊 MD", min: b.C_mdInitOnly_init, dur: params.tauInit },
              { label: `全流程 MD × ${Math.round(params.sInit * 100)}% 投初诊`, min: b.C_mdFullFlow_init, dur: params.tauInit },
            ]}
            status={b.statusMD}
            coverage={b.coverageMD}
            gapMin={b.gapMDMin}
          />

          {/* 非初诊线 balance sheet */}
          <BalanceTable
            title={`非初诊线（复诊 + 维持）· 未来 ${b.W_NP} 周`}
            buffer={params.bufferNP}
            demandRows={[
              { label: `复诊（${params.inFollowup} 人 ÷ ${params.iDrug} 周）`, min: b.D_drug_total, dur: params.tauDrug },
              { label: `维持（${params.inMaintenance} 人 ÷ ${params.iFu} 周）`, min: b.D_fu_total, dur: params.tauFu },
            ]}
            supplyRows={[
              { label: `全流程 MD × ${Math.round((1 - params.sInit) * 100)}% 投非初诊`, min: b.C_mdFullFlow_ni, dur: params.tauDrug },
              { label: "NP", min: b.C_np_ni, dur: params.tauDrug },
            ]}
            status={b.statusNI}
            coverage={b.coverageNI}
            gapMin={b.gapNIMin}
          />

          <p className="px-1 text-[11px] text-gray-400">
            所有数字在左侧改任一参数会实时重算。重置回默认值用左上角按钮。
            <br />
            诊次时长不同的项混在一起时，"诊次"列按各自时长换算；分钟列是真实分钟。
          </p>
        </main>
      </div>
    </PageShell>
  );
}

// ============================================================
// 平衡表小表
// ============================================================

interface BalanceTableProps {
  title: string;
  buffer: number;
  demandRows: { label: string; min: number; dur: number }[];
  supplyRows: { label: string; min: number; dur: number }[];
  status: Status;
  coverage: number;
  gapMin: number;
}

function BalanceTable({
  title,
  buffer,
  demandRows,
  supplyRows,
  status,
  coverage,
  gapMin,
}: BalanceTableProps) {
  const demandSum = demandRows.reduce((a, r) => a + r.min, 0);
  const supplySum = supplyRows.reduce((a, r) => a + r.min, 0);
  const demandWithBuffer = demandSum * (1 + buffer);

  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <StatusPill status={status} />
      </div>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-[#f0eeea] text-left text-[11px] uppercase tracking-wide text-gray-400">
            <th className="py-2 w-1/2">项目</th>
            <th className="py-2 text-right">诊次</th>
            <th className="py-2 text-right">分钟</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={3} className="pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">需求侧</td>
          </tr>
          {demandRows.map((r) => (
            <tr key={r.label} className="text-gray-700">
              <td className="py-1.5 pl-2">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtNum(fmtSessions(r.min, r.dur))}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.min)}</td>
            </tr>
          ))}
          <tr className="border-t border-[#f5f3ef] font-medium">
            <td className="py-1.5 pl-2">合计</td>
            <td className="py-1.5 text-right tabular-nums">—</td>
            <td className="py-1.5 text-right tabular-nums">{fmtNum(demandSum)}</td>
          </tr>
          <tr className="text-[11px] text-gray-500">
            <td className="py-1 pl-2">含 {Math.round(buffer * 100)}% 冗余的应配产能</td>
            <td className="py-1 text-right tabular-nums">—</td>
            <td className="py-1 text-right tabular-nums">{fmtNum(demandWithBuffer)}</td>
          </tr>

          <tr>
            <td colSpan={3} className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">供给侧</td>
          </tr>
          {supplyRows.map((r) => (
            <tr key={r.label} className="text-gray-700">
              <td className="py-1.5 pl-2">{r.label}</td>
              <td className="py-1.5 text-right tabular-nums">{fmtNum(fmtSessions(r.min, r.dur))}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-500">{fmtNum(r.min)}</td>
            </tr>
          ))}
          <tr className="border-t border-[#f5f3ef] font-medium">
            <td className="py-1.5 pl-2">合计</td>
            <td className="py-1.5 text-right tabular-nums">—</td>
            <td className="py-1.5 text-right tabular-nums">{fmtNum(supplySum)}</td>
          </tr>

          <tr>
            <td colSpan={3} className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">平衡</td>
          </tr>
          <tr>
            <td className="py-1.5 pl-2 text-gray-700">Coverage</td>
            <td colSpan={2} className="py-1.5 text-right tabular-nums font-medium">{fmtNum(coverage, 2)}</td>
          </tr>
          <tr>
            <td className="py-1.5 pl-2 text-gray-700">缺口 / 余量</td>
            <td colSpan={2} className={`py-1.5 text-right tabular-nums font-medium ${gapMin > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {gapMin > 0 ? "−" : "+"}{fmtNum(Math.abs(gapMin))} 分钟（{gapMin > 0 ? "−" : "+"}{fmtHours(Math.abs(gapMin))} 小时）
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
