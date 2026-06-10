"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";

const STORAGE_KEY = "balance-sheet-params-v3";
const STORAGE_TS_KEY = "balance-sheet-params-v3:at";

// ============================================================
// 参数 schema（22 项全部可调）
// ============================================================

interface Params {
  // A · 人员
  nFullFlowMD: number;
  nPureDxMD: number;
  nTitration: number;
  hFullFlow: number;   // 全流程 MD 周工时/人
  hPureDx: number;     // 纯诊断 MD 周工时/人
  hTitration: number;  // NP / Titration Team 周工时/人
  // B · 当前在册患者
  queueInitial: number;
  panelFullFlow: number;
  panelTitration: number;
  // C · 未来 4 周新增首诊预期
  bookings: [number, number, number, number];
  // D · 诊次时长（分钟）
  tauInit: number;
  tauDrug: number;
  tauFu: number;
  // E · 周期 & 比例
  fuRate: number;
  noShowRate: number;
  // F · 决策参数
  buffer: number;
  utilization: number;
  leadMD: number;
  leadTit: number;
  panelLimit: number;
  panelWarn: number;
}

const DEFAULTS: Params = {
  nFullFlowMD: 3,
  nPureDxMD: 5,
  nTitration: 5,
  hFullFlow: 25,
  hPureDx: 25,
  hTitration: 25,
  queueInitial: 24,
  panelFullFlow: 150,
  panelTitration: 2450,
  bookings: [28, 32, 35, 38],
  tauInit: 45,
  tauDrug: 30,
  tauFu: 15,
  fuRate: 0.5,
  noShowRate: 0.12,
  buffer: 0.2,
  utilization: 0.85,
  leadMD: 12,
  leadTit: 8,
  panelLimit: 200,
  panelWarn: 150,
};

// ============================================================
// 计算
// ============================================================

type Status = "ok" | "tight" | "short";

interface Balance {
  // Bucket A: 全流程 MD
  bucketA: {
    totalHours: number;
    existingHours: number;
    freeHours: number;
    newCap: number;
  };
  // Bucket B: 纯诊断 MD + Titration Team
  bucketB: {
    pureDxHours: number;
    dxCap: number;
    titHours: number;
    titExistingHours: number;
    titFreeHours: number;
    titCap: number;
    bottleneck: "diagnosis" | "titration" | "balanced";
    bucketTotal: number;
  };
  // 全院
  totalCap: number;
  // 与需求对比
  weeklyExpected: number;
  totalExpectedNext: number;
  coverage: number;
  status: Status;
  // 缺口
  gapPerWeek: number;
  // 建议招聘
  hireMD: number;
  hireTit: number;
  // Panel
  fullFlowPerMD: number;
  atLimit: boolean;
  atWarn: boolean;
  // Windows
  W_MD: number;
  W_Tit: number;
}

function computeBalance(p: Params): Balance {
  const u = p.utilization;
  const tauInit = p.tauInit / 60;
  const tauDrug = p.tauDrug / 60;
  const tauFu = p.tauFu / 60;
  const onboardA = tauInit + tauDrug;

  // === Bucket A ===
  const totalHoursA = p.nFullFlowMD * p.hFullFlow * u;
  const existingA = p.panelFullFlow * p.fuRate * tauFu;
  const freeA = totalHoursA - existingA;
  const newCapA = Math.max(0, freeA) / onboardA;

  // === Bucket B ===
  const pureDxHours = p.nPureDxMD * p.hPureDx * u;
  const dxCap = pureDxHours / tauInit;

  const titHours = p.nTitration * p.hTitration * u;
  const titExisting = p.panelTitration * p.fuRate * tauFu;
  const titFree = Math.max(0, titHours - titExisting);
  const titCap = titFree / tauDrug;

  const bucketBTotal = Math.min(dxCap, titCap);
  const bottleneck: "diagnosis" | "titration" | "balanced" =
    Math.abs(dxCap - titCap) < 0.5
      ? "balanced"
      : dxCap < titCap
      ? "diagnosis"
      : "titration";

  const totalCap = newCapA + bucketBTotal;

  // === 预期需求 ===
  const W_MD = Math.max(1, p.leadMD);
  const W_Tit = Math.max(1, p.leadTit);
  const avg = p.bookings.reduce((a, b) => a + b, 0) / p.bookings.length;
  let totalExpected = 0;
  for (let i = 0; i < W_MD; i++) {
    const b = i < p.bookings.length ? p.bookings[i] : avg;
    totalExpected += b * (1 - p.noShowRate);
  }
  const weeklyExpected = totalExpected / W_MD;

  // === 状态 ===
  const coverage = weeklyExpected > 0 ? totalCap / weeklyExpected : Infinity;
  const status: Status =
    coverage >= 1 + p.buffer ? "ok" : coverage >= 1 ? "tight" : "short";

  // === 缺口 + 建议招聘 ===
  const gapPerWeek = Math.max(0, weeklyExpected * (1 + p.buffer) - totalCap);
  const TYPICAL_NEW_HIRE_HOURS = 25;
  const newMDPerHire = (TYPICAL_NEW_HIRE_HOURS * u) / (tauInit + tauDrug); // 全流程 MD 每周能接的新患者
  const newTitPerHire = (TYPICAL_NEW_HIRE_HOURS * u) / tauDrug;
  let hireMD = 0;
  let hireTit = 0;
  if (gapPerWeek > 0) {
    if (bottleneck === "titration") {
      hireTit = Math.ceil(gapPerWeek / newTitPerHire);
    } else {
      hireMD = Math.ceil(gapPerWeek / newMDPerHire);
    }
  }

  // === Panel ===
  const fullFlowPerMD =
    p.nFullFlowMD > 0 ? p.panelFullFlow / p.nFullFlowMD : 0;
  const atLimit = fullFlowPerMD >= p.panelLimit;
  const atWarn = fullFlowPerMD >= p.panelWarn;

  return {
    bucketA: {
      totalHours: totalHoursA,
      existingHours: existingA,
      freeHours: freeA,
      newCap: newCapA,
    },
    bucketB: {
      pureDxHours,
      dxCap,
      titHours,
      titExistingHours: titExisting,
      titFreeHours: titFree,
      titCap,
      bottleneck,
      bucketTotal: bucketBTotal,
    },
    totalCap,
    weeklyExpected,
    totalExpectedNext: totalExpected,
    coverage,
    status,
    gapPerWeek,
    hireMD,
    hireTit,
    fullFlowPerMD,
    atLimit,
    atWarn,
    W_MD,
    W_Tit,
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

const fmt1 = (n: number) =>
  Number.isFinite(n) ? n.toFixed(1) : "—";
const fmt0 = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";

// ============================================================
// UI 子组件
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
  const [lastSaved, setLastSaved] = useState<Params>(DEFAULTS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged: Params = { ...DEFAULTS, ...parsed };
        if (!Array.isArray(merged.bookings) || merged.bookings.length !== 4) {
          merged.bookings = DEFAULTS.bookings;
        }
        setParams(merged);
        setLastSaved(merged);
      }
      const atRaw = localStorage.getItem(STORAGE_TS_KEY);
      if (atRaw) setSavedAt(Number(atRaw));
    } catch {
      // ignore
    }
  }, []);

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
  function save() {
    try {
      const now = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
      localStorage.setItem(STORAGE_TS_KEY, String(now));
      setLastSaved(params);
      setSavedAt(now);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      console.error(e);
      alert("保存失败：" + e);
    }
  }
  function resetToDefaults() {
    setParams(DEFAULTS);
  }

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(params) !== JSON.stringify(lastSaved),
    [params, lastSaved],
  );
  const dirtyFromDefaults = useMemo(
    () => JSON.stringify(params) !== JSON.stringify(DEFAULTS),
    [params],
  );

  const savedAtText = savedAt
    ? new Date(savedAt).toLocaleString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        month: "numeric",
        day: "numeric",
      })
    : null;

  return (
    <PageShell active="monitoring">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* ===== 左：参数 ===== */}
        <aside className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">参数（22 项可调）</h2>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {hasUnsavedChanges
                  ? "● 有未保存修改"
                  : savedAtText
                  ? `已保存 · ${savedAtText}`
                  : "未保存（当前为默认值）"}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={resetToDefaults}
                disabled={!dirtyFromDefaults}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                重置默认值
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!hasUnsavedChanges}
                className={
                  "rounded-md px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 " +
                  (justSaved
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500")
                }
              >
                {justSaved ? "✓ 已保存" : "保存"}
              </button>
            </div>
          </div>

          <Section title="A · 在岗人员">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="全流程 MD" value={params.nFullFlowMD} onChange={(v) => update("nFullFlowMD", v)} unit="人" min={0} />
              <NumberInput label="纯诊断 MD" value={params.nPureDxMD} onChange={(v) => update("nPureDxMD", v)} unit="人" min={0} />
              <NumberInput label="NP" value={params.nTitration} onChange={(v) => update("nTitration", v)} unit="人" min={0} />
              <NumberInput label="全流程 MD 工时/人" value={params.hFullFlow} onChange={(v) => update("hFullFlow", v)} unit="h" step={0.5} min={0} />
              <NumberInput label="纯诊断 MD 工时/人" value={params.hPureDx} onChange={(v) => update("hPureDx", v)} unit="h" step={0.5} min={0} />
              <NumberInput label="NP 工时/人" value={params.hTitration} onChange={(v) => update("hTitration", v)} unit="h" step={0.5} min={0} />
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              每人每周实际看病小时数（已含非临床扣减）。利用率会在下方再叠加一次折扣。
            </p>
          </Section>

          <Section title="B · 当前在册患者">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="等待首诊" value={params.queueInitial} onChange={(v) => update("queueInitial", v)} unit="人" min={0} />
              <NumberInput label="全流程 panel" value={params.panelFullFlow} onChange={(v) => update("panelFullFlow", v)} unit="人" min={0} />
              <NumberInput label="Titration panel" value={params.panelTitration} onChange={(v) => update("panelTitration", v)} unit="人" min={0} />
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              全流程 = 由全流程 MD 一条龙跟的；Titration = 由 Titration Team 接管维持的
            </p>
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
              超过 4 周的部分用这 4 周平均外推到 {b.W_MD} 周
            </p>
          </Section>

          <Section title="D · 诊次时长">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="初诊" value={params.tauInit} onChange={(v) => update("tauInit", v)} unit="min" min={0} />
              <NumberInput label="复诊（drug init）" value={params.tauDrug} onChange={(v) => update("tauDrug", v)} unit="min" min={0} />
              <NumberInput label="维持（fu）" value={params.tauFu} onChange={(v) => update("tauFu", v)} unit="min" min={0} />
            </div>
          </Section>

          <Section title="E · 周期 & 比例">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="fu 频率" value={params.fuRate} onChange={(v) => update("fuRate", v)} unit="次/周/人" step={0.05} min={0} />
              <PercentInput label="No-show 率" value={params.noShowRate} onChange={(v) => update("noShowRate", v)} />
            </div>
          </Section>

          <Section title="F · 冗余 / Lead / Panel 限制">
            <div className="grid grid-cols-3 gap-3">
              <PercentInput label="冗余" value={params.buffer} onChange={(v) => update("buffer", v)} />
              <PercentInput label="利用率" value={params.utilization} onChange={(v) => update("utilization", v)} />
              <NumberInput label="MD Lead" value={params.leadMD} onChange={(v) => update("leadMD", v)} unit="w" min={1} />
              <NumberInput label="Tit Lead" value={params.leadTit} onChange={(v) => update("leadTit", v)} unit="w" min={1} />
              <NumberInput label="Panel 上限" value={params.panelLimit} onChange={(v) => update("panelLimit", v)} unit="人" min={1} />
              <NumberInput label="Panel 预警" value={params.panelWarn} onChange={(v) => update("panelWarn", v)} unit="人" min={1} />
            </div>
          </Section>
        </aside>

        {/* ===== 右：平衡表 ===== */}
        <main className="space-y-4 lg:col-span-3">
          {/* 总览 */}
          <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">本周可接新患者数</h2>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-3xl font-semibold tabular-nums text-gray-900">
                    {fmt0(b.totalCap)}
                  </span>
                  <span className="text-sm text-gray-500">人/周</span>
                  <StatusPill status={b.status} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">预期周新预约</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                  {fmt0(b.weeklyExpected)}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  Coverage <span className="font-semibold tabular-nums text-gray-900">{fmt1(b.coverage * 100)}%</span>
                </div>
              </div>
            </div>

            {(b.hireMD > 0 || b.hireTit > 0) && (
              <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700">
                建议立即招：
                {b.hireMD > 0 && <strong className="mx-1">{b.hireMD} 名 MD</strong>}
                {b.hireMD > 0 && b.hireTit > 0 && "+"}
                {b.hireTit > 0 && <strong className="mx-1">{b.hireTit} 名 Titration Team</strong>}
              </div>
            )}
          </div>

          {/* Bucket A */}
          <BucketTable
            title="Bucket A · 全流程 MD"
            buffer={params.buffer}
            rows={[
              ["人员", `${params.nFullFlowMD} 人`],
              ["总有效工时", `${fmt1(b.bucketA.totalHours)} h/周`],
              [`维持现有 panel（${params.panelFullFlow} × ${params.fuRate} × ${params.tauFu / 60} h）`, `${fmt1(b.bucketA.existingHours)} h/周`],
              ["剩余可分配", `${fmt1(b.bucketA.freeHours)} h/周`],
              [`每个新患者消耗（${params.tauInit / 60} + ${params.tauDrug / 60} h）`, `${fmt1((params.tauInit + params.tauDrug) / 60)} h`],
            ]}
            output={["NewCap_full", `${fmt0(b.bucketA.newCap)} 人/周`]}
          />

          {/* Bucket B */}
          <BucketTable
            title="Bucket B · 纯诊断 MD + Titration Team"
            buffer={params.buffer}
            rows={[
              ["纯诊断 MD 工时", `${fmt1(b.bucketB.pureDxHours)} h/周`],
              [`可做诊断数 (÷ ${params.tauInit / 60} h)`, `DxCap = ${fmt0(b.bucketB.dxCap)} 人/周`],
              ["Titration Team 工时", `${fmt1(b.bucketB.titHours)} h/周`],
              [`维持现有 panel（${params.panelTitration} × ${params.fuRate} × ${params.tauFu / 60} h）`, `${fmt1(b.bucketB.titExistingHours)} h/周`],
              ["Titration 剩余可分配", `${fmt1(b.bucketB.titFreeHours)} h/周`],
              [`可做 drug init 数 (÷ ${params.tauDrug / 60} h)`, `TitCap = ${fmt0(b.bucketB.titCap)} 人/周`],
            ]}
            output={[
              `Bucket B 上限 = min(DxCap, TitCap) | ${bottleneckLabel(b.bucketB.bottleneck)}`,
              `${fmt0(b.bucketB.bucketTotal)} 人/周`,
            ]}
          />

          {/* 合计 */}
          <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">全院新患者周容量</h3>
            <div className="mt-3 rounded-md bg-gray-50 px-3 py-3 font-mono text-[13px] text-gray-800">
              {fmt0(b.bucketA.newCap)} (Bucket A) + {fmt0(b.bucketB.bucketTotal)} (Bucket B) ={" "}
              <strong className="text-gray-900">{fmt0(b.totalCap)}</strong> 人/周
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-[#f0eeea] pt-3 text-[12px]">
              <Row label="预期周新预约">{fmt0(b.weeklyExpected)} 人</Row>
              <Row label="Coverage">{fmt1(b.coverage * 100)}%</Row>
              <Row label={`安全线（含 ${Math.round(params.buffer * 100)}% 冗余）`}>
                {fmt0(b.weeklyExpected * (1 + params.buffer))} 人
              </Row>
              <Row label="缺口">
                {b.gapPerWeek > 0 ? (
                  <span className="text-red-700">−{fmt0(b.gapPerWeek)} 人/周</span>
                ) : (
                  <span className="text-emerald-700">+{fmt0(b.totalCap - b.weeklyExpected * (1 + params.buffer))} 人/周</span>
                )}
              </Row>
            </div>
          </div>

          {/* Panel 状态 */}
          <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">Panel 占用</h3>
            <div className="mt-2 space-y-2 text-[12px]">
              <Row label="全流程 MD 平均 panel/人">
                {fmt0(b.fullFlowPerMD)} 人
              </Row>
              <Row label="状态">
                {b.atLimit ? (
                  <span className="text-red-700">🔴 超上限 ({params.panelLimit})——应关 new patient toggle</span>
                ) : b.atWarn ? (
                  <span className="text-amber-700">🟡 接近上限（{params.panelWarn}+）</span>
                ) : (
                  <span className="text-emerald-700">🟢 充裕</span>
                )}
              </Row>
            </div>
          </div>

          <p className="px-1 text-[11px] text-gray-400">
            所有数字在左侧改任一参数会实时重算。"保存"后下次打开还在（仅本浏览器）。
            <br />
            想看公式见下方"公式说明"，更详细的业务规则去 <a className="underline" href="/rules">规则说明</a> 页。
          </p>

          <FormulaSection />
        </main>
      </div>
    </PageShell>
  );
}

// ============================================================
// 子组件
// ============================================================

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="font-medium tabular-nums text-gray-900">{children}</span>
    </div>
  );
}

interface BucketTableProps {
  title: string;
  buffer: number;
  rows: [string, string][];
  output: [string, string];
}

function BucketTable({ title, rows, output }: BucketTableProps) {
  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-[#f5f3ef]">
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="py-1.5 text-[12px] text-gray-600">{label}</td>
              <td className="py-1.5 text-right text-[12px] font-medium tabular-nums text-gray-900">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300">
            <th className="py-2 text-left text-[11.5px] font-semibold text-gray-800">{output[0]}</th>
            <th className="py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{output[1]}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function bottleneckLabel(b: "diagnosis" | "titration" | "balanced"): string {
  if (b === "diagnosis") return "诊断为瓶颈";
  if (b === "titration") return "Titration 为瓶颈";
  return "两端平衡";
}

// ============================================================
// 公式说明
// ============================================================

function FormulaSection() {
  return (
    <details className="group rounded-xl border border-[#f0eeea] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5 hover:bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">公式说明（PDF MVP 4 步逻辑）</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">所有数字怎么来的——逐项对到原始参数</p>
        </div>
        <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 border-t border-[#f0eeea] p-5 text-[12px]">
        <FB title="① 单人每周可看病小时数（按角色分别配置）">
          <Code>{`H_full = h_full × u        （全流程 MD 工时/人 × 利用率）
H_pure = h_pure × u        （纯诊断 MD 工时/人 × 利用率）
H_NP   = h_NP   × u        （NP 工时/人 × 利用率）`}</Code>
        </FB>
        <FB title="② Bucket A · 全流程 MD">
          <Code>{`Step 1  现有 panel 维持小时数
        D_full_existing = Pnl_full × fu_rate × τ_fu

Step 2  剩余可分配小时数
        Free_full = (n_full × H_full) − D_full_existing

Step 3  可接新患者数（每个新患者 = 0.75 + 0.5 = 1.25 h）
        NewCap_full = max(0, Free_full) / 1.25`}</Code>
        </FB>
        <FB title="③ Bucket B · 纯诊断 MD + NP（Titration Team）">
          <Code>{`Step 1  NP 维持现有 panel
        D_tit_existing = Pnl_tit × fu_rate × τ_fu

Step 2  纯诊断 MD 可做诊断数
        DxCap = (n_pure × H_pure) / τ_init      （τ_init = 0.75 h）

Step 3  NP 可做 drug init 数
        Free_tit = max(0, (n_NP × H_NP) − D_tit_existing)
        TitCap   = Free_tit / τ_drug             （τ_drug = 0.5 h）

Step 4  桶上限（任一不够都做不成）
        NewCap_B = min(DxCap, TitCap)`}</Code>
        </FB>
        <FB title="④ 全院新患者周容量">
          <Code>{`NewCap_total = NewCap_full + NewCap_B`}</Code>
        </FB>
        <FB title="⑤ Coverage 与判断">
          <Code>{`Coverage = NewCap_total / 预期周新预约
≥ 1 + buffer  → ✅ 充裕
≥ 1           → ⚠️ 紧张
< 1           → 🔴 不够`}</Code>
        </FB>
        <FB title="⑥ 缺口 → 建议招人数">
          <Code>{`Gap = max(0, 预期周新预约 × (1 + buffer) − NewCap_total)

若 Titration 瓶颈：hires_Tit = ⌈Gap / (h_new × u / τ_drug)⌉
否则：           hires_MD  = ⌈Gap / (h_new × u / (τ_init + τ_drug))⌉`}</Code>
        </FB>
      </div>
    </details>
  );
}

function FB({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-[12px] font-medium text-gray-800">{title}</h4>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-gray-50 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-gray-800">
      {children}
    </pre>
  );
}
