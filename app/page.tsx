import { PageShell } from "@/components/PageShell";
import { GapChart } from "@/components/GapChart";
import { PatientDonut } from "@/components/PatientDonut";
import { StaffBars } from "@/components/StaffBars";
import { StatusList } from "@/components/StatusList";
import { loadAllData } from "@/lib/dataSource";
import { computeDecision } from "@/lib/model";
import type { RoleDecision, Status } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<Status, { dot: string; pill: string; label: string }> = {
  ok: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    label: "够用",
  },
  tight: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    label: "紧张",
  },
  short: {
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-1 ring-red-200",
    label: "不够",
  },
};

function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-[#f0eeea] bg-white p-5 " + className
      }
    >
      {title && (
        <div className="mb-3">
          <h3 className="text-[13px] font-medium text-gray-900">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function HeroCard({ decision }: { decision: RoleDecision }) {
  const s = STATUS_STYLE[decision.status];
  return (
    <div className="rounded-xl border border-[#f0eeea] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">
            {decision.label}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
            <span className="text-xl font-semibold text-gray-900">
              {s.label}
            </span>
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${s.pill}`}>
              lookahead {decision.lookaheadWeeks}w
            </span>
          </div>
        </div>
        <div className="text-right text-[11px] text-gray-400">
          lead time {decision.leadTimeWeeks}w
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-gray-700">
        {decision.recommendation}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#f0eeea] pt-3">
        <MiniMetric
          label="累计需求"
          value={decision.totals.demandSessions}
          unit="诊次"
        />
        <MiniMetric
          label="累计产能"
          value={decision.totals.capacitySessions}
          unit="诊次"
        />
        <MiniMetric
          label="安全产能"
          value={decision.totals.safeCapacitySessions}
          unit="诊次"
        />
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {value}
        </span>
        <span className="text-[10px] text-gray-500">{unit}</span>
      </div>
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
      {/* Row 1: 两张判断卡（顶部，最重要） */}
      <section className="grid gap-4 md:grid-cols-2">
        <HeroCard decision={decision.md} />
        <HeroCard decision={decision.followup} />
      </section>

      {/* Row 2: 三张概况卡（donut / bar / 状态列表） */}
      <section className="mt-4 grid gap-4 md:grid-cols-3">
        <Card title="在册患者结构" hint={`截至 ${patients.asOfDate}`}>
          <PatientDonut
            queueInitial={patients.queueInitial}
            inTitration={patients.inTitration}
            inMaintenance={patients.inMaintenance}
          />
        </Card>

        <Card title="在岗人员构成" hint={`共 ${staff.md.length + staff.np.length} 人`}>
          <StaffBars
            mdFullFlow={mdFullFlow}
            mdInitialOnly={mdInitialOnly}
            np={npCount}
          />
        </Card>

        <Card title="按周状态" hint="超出安全冗余即变色">
          <StatusList
            sections={[
              {
                title: `MD 初诊 · 未来 ${decision.md.lookaheadWeeks} 周`,
                weekly: decision.md.weekly,
                buffer: c.buffer.md,
              },
              {
                title: `复诊 / 维持 · 未来 ${decision.followup.lookaheadWeeks} 周`,
                weekly: decision.followup.weekly,
                buffer: c.buffer.np,
              },
            ]}
          />
        </Card>
      </section>

      {/* Row 3: 两张 GapChart（详细趋势） */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Card
          title="初诊：需求 vs 产能"
          hint="红 = 需求，蓝 = 产能，灰虚线 = 安全线（产能 ÷ (1 + 冗余)）"
        >
          <GapChart data={decision.md.weekly} />
        </Card>
        <Card
          title="复诊 / 维持：需求 vs 产能"
          hint="v0 假设病人池在前瞻窗口内不变"
        >
          <GapChart data={decision.followup.weekly} />
        </Card>
      </section>

      {/* Row 4: 模型常数（小，可折叠感） */}
      <section className="mt-4">
        <Card title="模型常数" hint="改这些数会影响所有判断">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] md:grid-cols-5">
            <ConstantRow
              label="诊次时长（初/滴/维）"
              value={`${c.appointmentMinutes.initial}/${c.appointmentMinutes.titration}/${c.appointmentMinutes.maintenance} min`}
            />
            <ConstantRow
              label="冗余 % (MD/NP)"
              value={`${Math.round(c.buffer.md * 100)}% / ${Math.round(c.buffer.np * 100)}%`}
            />
            <ConstantRow
              label="Lead time (MD/NP)"
              value={`${c.leadTimeWeeks.md}w / ${c.leadTimeWeeks.np}w`}
            />
            <ConstantRow
              label="有效利用率"
              value={`${Math.round(c.effectiveUtilization * 100)}%`}
            />
            <ConstantRow
              label="全流程 MD 时间分配"
              value={`${Math.round(c.fullFlowMdSplit.initialPct * 100)}% 初 / ${Math.round(c.fullFlowMdSplit.followUpPct * 100)}% 复`}
            />
          </dl>
        </Card>
      </section>

      <footer className="mt-8 text-center text-[11px] text-gray-400">
        生成时间：{decision.asOfDate} · 数据来源：mock JSON
      </footer>
    </PageShell>
  );
}

function ConstantRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}
