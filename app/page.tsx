import { PageShell } from "@/components/PageShell";
import { GapChart } from "@/components/GapChart";
import { loadAllData } from "@/lib/dataSource";
import { computeDecision } from "@/lib/model";
import type { RoleDecision, Status } from "@/lib/types";

export const dynamic = "force-dynamic";

const statusStyle: Record<Status, { dot: string; text: string; label: string; bg: string }> = {
  ok: {
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    label: "够用",
    bg: "bg-emerald-50 border-emerald-200",
  },
  tight: {
    dot: "bg-amber-500",
    text: "text-amber-700",
    label: "紧张",
    bg: "bg-amber-50 border-amber-200",
  },
  short: {
    dot: "bg-red-500",
    text: "text-red-700",
    label: "不够",
    bg: "bg-red-50 border-red-200",
  },
};

function HeroCard({ decision }: { decision: RoleDecision }) {
  const s = statusStyle[decision.status];
  return (
    <div className={`rounded-xl border bg-white p-6 ${s.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {decision.label}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.dot}`} />
            <span className={`text-2xl font-semibold ${s.text}`}>{s.label}</span>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>lead time: {decision.leadTimeWeeks} 周</div>
          <div className="mt-0.5">lookahead: {decision.lookaheadWeeks} 周</div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-gray-700">
        {decision.recommendation}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
        <Metric
          label={`累计需求（${decision.lookaheadWeeks}w）`}
          value={`${decision.totals.demandSessions} 诊次`}
        />
        <Metric
          label={`累计产能（${decision.lookaheadWeeks}w）`}
          value={`${decision.totals.capacitySessions} 诊次`}
        />
        <Metric
          label="含冗余的安全产能"
          value={`${decision.totals.safeCapacitySessions} 诊次`}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/60 px-3 py-2">
      <div className="text-gray-500">{label}</div>
      <div className="mt-1 font-medium text-gray-900">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      <div className="mt-3 text-sm text-gray-700">{children}</div>
    </div>
  );
}

export default async function Page() {
  const data = await loadAllData();
  const decision = computeDecision(data);
  const { staff, patients, constants: c } = data;

  const mdInitialOnly = staff.md.filter((m) => m.subtype === "initial_only").length;
  const mdFullFlow = staff.md.filter((m) => m.subtype === "full_flow").length;
  const npCount = staff.np.length;

  return (
    <PageShell active="hiring">
      {/* 顶部：两个判断卡 */}
      <section className="grid gap-4 md:grid-cols-2">
        <HeroCard decision={decision.md} />
        <HeroCard decision={decision.followup} />
      </section>

      {/* 中部：两张图 */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-900">
            初诊：每周需求 vs 产能
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            红线 = 需求；蓝线 = 产能；灰虚线 = 安全线（产能 ÷ (1 + 冗余)）。
            蓝线掉到灰线以下即吃掉冗余。
          </p>
          <div className="mt-4">
            <GapChart data={decision.md.weekly} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-900">
            复诊 / 维持：每周需求 vs 产能
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            v0 假设病人池在前瞻窗口内不变（滴定 / 维持人数恒定）。
          </p>
          <div className="mt-4">
            <GapChart data={decision.followup.weekly} />
          </div>
        </div>
      </section>

      {/* 底部：三个明细面板 */}
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Panel title="在岗人员">
          <dl className="space-y-1.5">
            <Row label="MD - 全流程">
              {mdFullFlow} 人
            </Row>
            <Row label="MD - 仅初诊">
              {mdInitialOnly} 人
            </Row>
            <Row label="NP">{npCount} 人</Row>
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            数据日期：{staff.asOfDate}
          </p>
        </Panel>

        <Panel title="当前在册患者">
          <dl className="space-y-1.5">
            <Row label="等待首诊">{patients.queueInitial} 人</Row>
            <Row label="滴定中">{patients.inTitration} 人</Row>
            <Row label="维持中">{patients.inMaintenance} 人</Row>
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            数据日期：{patients.asOfDate}
          </p>
        </Panel>

        <Panel title="模型常数">
          <dl className="space-y-1.5">
            <Row label="诊次时长（初/滴/维）">
              {c.appointmentMinutes.initial}/{c.appointmentMinutes.titration}/
              {c.appointmentMinutes.maintenance} min
            </Row>
            <Row label="冗余 % (MD / NP)">
              {Math.round(c.buffer.md * 100)}% / {Math.round(c.buffer.np * 100)}%
            </Row>
            <Row label="Lead time (MD / NP)">
              {c.leadTimeWeeks.md}w / {c.leadTimeWeeks.np}w
            </Row>
            <Row label="有效利用率">
              {Math.round(c.effectiveUtilization * 100)}%
            </Row>
            <Row label="全流程 MD 时间分配（初/复）">
              {Math.round(c.fullFlowMdSplit.initialPct * 100)}% /{" "}
              {Math.round(c.fullFlowMdSplit.followUpPct * 100)}%
            </Row>
          </dl>
        </Panel>
      </section>

      <footer className="mt-10 text-center text-xs text-gray-400">
        生成时间：{decision.asOfDate} · 数据来源：mock JSON
      </footer>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{children}</dd>
    </div>
  );
}
