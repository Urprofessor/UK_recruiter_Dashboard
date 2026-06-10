import { PageShell } from "@/components/PageShell";
import { GapChartCard } from "@/components/GapChartCard";
import { PatientDonut } from "@/components/PatientDonut";
import { StaffBars } from "@/components/StaffBars";
import { UtilizationChart } from "@/components/UtilizationChart";
import { loadAllData } from "@/lib/dataSource";
import { computeDecision, computeHistoricalSeries } from "@/lib/model";
import type { Status } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<Status, {
  bg: string;
  dot: string;
  text: string;
  label: string;
}> = {
  ok: {
    bg: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    label: "充裕",
  },
  tight: {
    bg: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-700",
    label: "紧张",
  },
  short: {
    bg: "bg-red-50 border-red-200",
    dot: "bg-red-500",
    text: "text-red-700",
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
    <div className={"rounded-xl border border-[#f0eeea] bg-white p-5 " + className}>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium tabular-nums text-gray-900">{children}</span>
    </div>
  );
}

export default async function Page() {
  const data = await loadAllData();
  const decision = computeDecision(data);
  const series = computeHistoricalSeries(
    data.history,
    data.staff,
    data.demand.noShowRate,
    data.constants,
  );
  const { staff, patients, constants: c } = data;

  const nFullFlow = staff.md.filter((m) => m.subtype === "full_flow").length;
  const nPureDx = staff.md.filter((m) => m.subtype === "pure_dx").length;
  const nTit = staff.titrationTeam.length;

  const s = STATUS_STYLE[decision.status];
  const weeklyExpected = decision.expectedBookingsNext / c.lookaheadWeeks.md;

  return (
    <PageShell active="hiring">
      {/* ===== Hero：一句话答案 ===== */}
      <section className={`rounded-xl border p-6 ${s.bg}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              本周可接新患者数
            </p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-semibold text-gray-900 tabular-nums">
                {Math.round(decision.capacity.total)}
              </span>
              <span className="text-sm text-gray-500">人</span>
              <span className="ml-2 flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
                <span className={`text-base font-semibold ${s.text}`}>
                  {s.label}
                </span>
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-700">
              {decision.recommendation}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">
              预期周新预约
            </div>
            <div className="text-2xl font-semibold tabular-nums text-gray-900">
              {Math.round(weeklyExpected)}
            </div>
            <div className="text-[11px] text-gray-500">
              未来 {c.lookaheadWeeks.md} 周平均
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              Coverage: <span className="font-semibold tabular-nums text-gray-900">{decision.coverage.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {(decision.hireSuggestion.md > 0 || decision.hireSuggestion.titration > 0) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-current/10 pt-4 text-[12px]">
            {decision.hireSuggestion.md > 0 && (
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">
                建议招 <strong>{decision.hireSuggestion.md}</strong> 名 MD
                <span className="ml-1 text-gray-500">（lead {c.leadTimeWeeks.md}w）</span>
              </span>
            )}
            {decision.hireSuggestion.titration > 0 && (
              <span className="rounded-full bg-white px-3 py-1 ring-1 ring-gray-200">
                建议招 <strong>{decision.hireSuggestion.titration}</strong> 名 Titration Team
                <span className="ml-1 text-gray-500">（lead {c.leadTimeWeeks.titration}w）</span>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ===== Row 2: 左 = 趋势图，右 = 侧栏概况 ===== */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <GapChartCard
            title="每周可接新患者数 vs 实际新预约"
            hint={`${data.history.weekly[0]?.weekStart} → ${data.history.weekly.at(-1)?.weekStart}　蓝 = 容量（基于历史 panel），红 = 实际新预约`}
            weekly={series.weekly}
          />

          <UtilizationChart weekly={data.history.weekly} />

          {/* Bucket 分解 */}
          <Card title="本周容量来源分解" hint="按 PDF 4 步逻辑：全流程桶 + 纯诊断/Titration 桶">
            <div className="grid gap-4 md:grid-cols-2">
              <BucketBox
                title="全流程 MD 桶"
                rows={[
                  ["人员", `${decision.capacity.bucketA.nFullFlow} 人`],
                  ["总有效工时", `${decision.capacity.bucketA.totalHours.toFixed(1)} h/周`],
                  ["维持现有 panel 已耗", `${decision.capacity.bucketA.existingPanelHours.toFixed(1)} h/周`],
                  ["剩余可分配", `${decision.capacity.bucketA.freeHours.toFixed(1)} h/周`],
                ]}
                outputLabel="可接新患者"
                outputValue={`${Math.round(decision.capacity.bucketA.newCapacity)} 人/周`}
              />
              <BucketBox
                title="纯诊断 MD + Titration Team 桶"
                rows={[
                  ["纯诊断 MD", `${decision.capacity.bucketB.nPureDx} 人 / ${decision.capacity.bucketB.pureDxHours.toFixed(1)} h`],
                  ["└ 可做诊断数", `${Math.round(decision.capacity.bucketB.pureDxCapacity)} 人/周`],
                  ["Titration Team", `${decision.capacity.bucketB.nTitration} 人 / ${decision.capacity.bucketB.titrationHours.toFixed(1)} h`],
                  ["├ 维持已耗", `${decision.capacity.bucketB.titrationExistingHours.toFixed(1)} h/周`],
                  ["└ 可做 drug init 数", `${Math.round(decision.capacity.bucketB.titrationCapacity)} 人/周`],
                ]}
                outputLabel={`桶上限（min, ${bottleneckLabel(decision.capacity.bucketB.bottleneck)}）`}
                outputValue={`${Math.round(decision.capacity.bucketB.bucketTotal)} 人/周`}
              />
            </div>
            <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-700">
              全院新患者容量 ={" "}
              <span className="font-medium tabular-nums">{Math.round(decision.capacity.bucketA.newCapacity)}</span>
              {" + "}
              <span className="font-medium tabular-nums">{Math.round(decision.capacity.bucketB.bucketTotal)}</span>
              {" = "}
              <strong className="text-gray-900 tabular-nums">{Math.round(decision.capacity.total)} 人/周</strong>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="在册患者结构" hint={`截至 ${patients.asOfDate}`}>
            <PatientDonut
              queueInitial={patients.queueInitial}
              panelFullFlow={patients.panelFullFlow}
              panelTitration={patients.panelTitration}
            />
          </Card>

          <Card title="在岗人员构成" hint={`共 ${staff.md.length + staff.titrationTeam.length} 人`}>
            <StaffBars fullFlow={nFullFlow} pureDx={nPureDx} titration={nTit} />
          </Card>

          <Card title="Panel 占用" hint={`单 MD 上限 ${c.panelLimitPerMD} 人（${c.panelLimitWarnAt}+ 预警）`}>
            <div className="space-y-2">
              <Row label="全流程 MD 平均 panel/人">
                {decision.panelStatus.fullFlowPerMD.toFixed(0)} 人
              </Row>
              <Row label="是否触发预警">
                {decision.panelStatus.fullFlowAtLimit
                  ? "🔴 已超上限"
                  : decision.panelStatus.fullFlowAtWarn
                  ? "🟡 接近上限"
                  : "🟢 充裕"}
              </Row>
              {decision.panelStatus.fullFlowAtLimit && (
                <p className="mt-2 text-[11px] text-red-600">
                  超过 {c.panelLimitPerMD} 人/MD，应关闭 new patient toggle
                </p>
              )}
            </div>
          </Card>
        </div>
      </section>

      {/* Row 3: 模型常数 */}
      <section className="mt-4">
        <Card title="关键参数（当前生效）" hint="改参数请去「平衡表」页">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] md:grid-cols-5">
            <ConstantRow
              label="诊次时长（初/复/维）"
              value={`${c.appointmentMinutes.initial}/${c.appointmentMinutes.drug}/${c.appointmentMinutes.fu} min`}
            />
            <ConstantRow label="fu 频率" value={`${c.fuRate} 次/周/人`} />
            <ConstantRow label="冗余" value={`${Math.round(c.buffer * 100)}%`} />
            <ConstantRow label="利用率" value={`${Math.round(c.effectiveUtilization * 100)}%`} />
            <ConstantRow label="Lead (MD/Tit)" value={`${c.leadTimeWeeks.md}w / ${c.leadTimeWeeks.titration}w`} />
          </dl>
        </Card>
      </section>

      <footer className="mt-8 text-center text-[11px] text-gray-400">
        生成时间：{decision.asOfDate} · 数据来源：mock JSON · 调参请进
        <a className="ml-1 underline" href="/balance-sheet">平衡表</a>
      </footer>
    </PageShell>
  );
}

function BucketBox({
  title,
  rows,
  outputLabel,
  outputValue,
}: {
  title: string;
  rows: [string, string][];
  outputLabel: string;
  outputValue: string;
}) {
  return (
    <div className="rounded-lg border border-[#f0eeea] p-4">
      <h4 className="text-[12px] font-medium text-gray-800">{title}</h4>
      <dl className="mt-2 space-y-1 text-[11.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="font-medium tabular-nums text-gray-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-[#f0eeea] pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-500">{outputLabel}</span>
          <span className="font-semibold tabular-nums text-gray-900">{outputValue}</span>
        </div>
      </div>
    </div>
  );
}

function ConstantRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function bottleneckLabel(b: "diagnosis" | "titration" | "balanced"): string {
  if (b === "diagnosis") return "诊断为瓶颈";
  if (b === "titration") return "Titration 为瓶颈";
  return "两端平衡";
}
