import type {
  AllData,
  Constants,
  DashboardDecision,
  HistoryData,
  MdStaff,
  NpStaff,
  RoleDecision,
  StaffData,
  Status,
  WeekPoint,
} from "./types";

// 单人每周"可用于看病的有效分钟数"
function effectiveMinPerWeek(
  weeklyHours: number,
  availability: number,
  utilization: number,
): number {
  return weeklyHours * 60 * availability * utilization;
}

function sumEffectiveMin(
  people: Array<MdStaff | NpStaff>,
  utilization: number,
): number {
  return people.reduce(
    (acc, p) => acc + effectiveMinPerWeek(p.weeklyHours, p.availability, utilization),
    0,
  );
}

// ===== 产能（每周分钟） =====

export function mdInitialCapacityMinPerWeek(staff: MdStaff[], c: Constants): number {
  const u = c.effectiveUtilization;
  const initOnly = staff.filter((m) => m.subtype === "initial_only");
  const fullFlow = staff.filter((m) => m.subtype === "full_flow");
  return (
    sumEffectiveMin(initOnly, u) +
    sumEffectiveMin(fullFlow, u) * c.fullFlowMdSplit.initialPct
  );
}

/**
 * 复诊 + 维持的合并产能 = 全流程 MD 的非初诊时间 + 所有 NP 时间。
 * 全流程 MD 才会承担复诊/维持，仅初诊 MD 不参与。
 */
export function nonInitialCapacityMinPerWeek(
  md: MdStaff[],
  np: NpStaff[],
  c: Constants,
): number {
  const u = c.effectiveUtilization;
  const fullFlow = md.filter((m) => m.subtype === "full_flow");
  return (
    sumEffectiveMin(fullFlow, u) * c.fullFlowMdSplit.nonInitialPct +
    sumEffectiveMin(np, u)
  );
}

// ===== 需求（每周分钟） =====

export function initialDemandMinForWeek(
  expectedBookings: number,
  noShowRate: number,
  c: Constants,
): number {
  const showRate = 1 - noShowRate;
  return expectedBookings * showRate * c.appointmentMinutes.initial;
}

/**
 * 复诊 + 维持的合并需求（分钟/周）。
 * - 复诊：每位病人按 followup.weeksBetweenVisits 看 1 次
 * - 维持：每位病人按 maintenance.weeksBetweenVisits 看 1 次
 */
export function nonInitialDemandMinPerWeek(
  inFollowup: number,
  inMaintenance: number,
  c: Constants,
): number {
  const followupVisitsPerWeek = inFollowup / c.followup.weeksBetweenVisits;
  const maintenanceVisitsPerWeek = inMaintenance / c.maintenance.weeksBetweenVisits;
  return (
    followupVisitsPerWeek * c.appointmentMinutes.followup +
    maintenanceVisitsPerWeek * c.appointmentMinutes.maintenance
  );
}

// ===== 状态判断 =====

function statusFromGap(capacity: number, demand: number, buffer: number): Status {
  if (capacity >= demand * (1 + buffer)) return "ok";
  if (capacity >= demand) return "tight";
  return "short";
}

// 按"典型新员工"折算还差几个人
function additionalHiresNeeded(
  shortageMinTotal: number,
  weeks: number,
  c: Constants,
  fractionUsedForThisDemand: number,
): number {
  if (shortageMinTotal <= 0) return 0;
  const perHirePerWeek =
    effectiveMinPerWeek(
      c.typicalNewHire.weeklyHours,
      c.typicalNewHire.availability,
      c.effectiveUtilization,
    ) * fractionUsedForThisDemand;
  const perHireTotal = perHirePerWeek * weeks;
  return Math.ceil(shortageMinTotal / perHireTotal);
}

// ===== 主计算 =====

export function computeDecision(data: AllData): DashboardDecision {
  const { staff, patients, demand, constants: c } = data;

  // ---- MD 初诊检查（看未来 c.lookaheadWeeks.md 周） ----
  const mdWeeks = c.lookaheadWeeks.md;
  const mdCapPerWeek = mdInitialCapacityMinPerWeek(staff.md, c);
  const mdWeekly: WeekPoint[] = demand.newInitialBookings.slice(0, mdWeeks).map((w) => {
    const demandMin = initialDemandMinForWeek(w.expected, demand.noShowRate, c);
    const demandSessions = demandMin / c.appointmentMinutes.initial;
    const capacitySessions = mdCapPerWeek / c.appointmentMinutes.initial;
    const safeCapacitySessions = capacitySessions / (1 + c.buffer.md);
    return {
      weekStart: w.weekStart,
      demand: round1(demandSessions),
      capacity: round1(capacitySessions),
      safeCapacity: round1(safeCapacitySessions),
    };
  });
  const mdTotalDemandMin = mdWeekly.reduce(
    (acc, w) => acc + w.demand * c.appointmentMinutes.initial,
    0,
  );
  const mdTotalCapacityMin = mdCapPerWeek * mdWeeks;
  const mdStatus = mdWeekly
    .map((w) => statusFromGap(w.capacity, w.demand, c.buffer.md))
    .reduce(worstStatus, "ok");
  const mdShortageMin = Math.max(0, mdTotalDemandMin * (1 + c.buffer.md) - mdTotalCapacityMin);
  const mdHire = additionalHiresNeeded(mdShortageMin, mdWeeks, c, 1.0);

  const mdDecision: RoleDecision = {
    role: "md_initial",
    label: "初诊 MD 产能（未来 4 周）",
    lookaheadWeeks: mdWeeks,
    leadTimeWeeks: c.leadTimeWeeks.md,
    status: mdStatus,
    recommendation: recommendationText(mdStatus, mdHire, "MD（可只做初诊）", c.leadTimeWeeks.md),
    hireSuggestion: mdHire,
    hireSuggestionWho: "MD（可只做初诊）",
    weekly: mdWeekly,
    totals: {
      capacitySessions: round1(mdTotalCapacityMin / c.appointmentMinutes.initial),
      demandSessions: round1(mdTotalDemandMin / c.appointmentMinutes.initial),
      safeCapacitySessions: round1(
        (mdTotalCapacityMin / (1 + c.buffer.md)) / c.appointmentMinutes.initial,
      ),
    },
  };

  // ---- 复诊 + 维持合并检查（看未来 c.lookaheadWeeks.np 周） ----
  const niWeeks = c.lookaheadWeeks.np;
  const niCapPerWeek = nonInitialCapacityMinPerWeek(staff.md, staff.np, c);
  const niDemandMinPerWeek = nonInitialDemandMinPerWeek(
    patients.inFollowup,
    patients.inMaintenance,
    c,
  );
  // 平均"非初诊"诊次时长（用于把分钟换成"诊次"显示）
  const avgNonInitialMin = avgNonInitialMinutes(
    patients.inFollowup,
    patients.inMaintenance,
    c,
  );

  const niWeekly: WeekPoint[] = [];
  // v0 假设未来 N 周复诊/维持需求恒定（病人池变化忽略）
  for (let i = 0; i < niWeeks; i++) {
    const weekStart = addWeeks(demand.asOfDate, i);
    const demandSessions = niDemandMinPerWeek / avgNonInitialMin;
    const capacitySessions = niCapPerWeek / avgNonInitialMin;
    const safeCapacitySessions = capacitySessions / (1 + c.buffer.np);
    niWeekly.push({
      weekStart,
      demand: round1(demandSessions),
      capacity: round1(capacitySessions),
      safeCapacity: round1(safeCapacitySessions),
    });
  }
  const niTotalDemandMin = niDemandMinPerWeek * niWeeks;
  const niTotalCapacityMin = niCapPerWeek * niWeeks;
  const niStatus = niWeekly
    .map((w) => statusFromGap(w.capacity, w.demand, c.buffer.np))
    .reduce(worstStatus, "ok");
  const niShortageMin = Math.max(
    0,
    niTotalDemandMin * (1 + c.buffer.np) - niTotalCapacityMin,
  );
  const niHire = additionalHiresNeeded(niShortageMin, niWeeks, c, 1.0);

  const niDecision: RoleDecision = {
    role: "non_initial",
    label: "复诊 / 维持产能（未来 2 周）",
    lookaheadWeeks: niWeeks,
    leadTimeWeeks: c.leadTimeWeeks.np,
    status: niStatus,
    recommendation: recommendationText(
      niStatus,
      niHire,
      "NP（或全流程 MD）",
      c.leadTimeWeeks.np,
    ),
    hireSuggestion: niHire,
    hireSuggestionWho: "NP（或全流程 MD）",
    weekly: niWeekly,
    totals: {
      capacitySessions: round1(niTotalCapacityMin / avgNonInitialMin),
      demandSessions: round1(niTotalDemandMin / avgNonInitialMin),
      safeCapacitySessions: round1(
        (niTotalCapacityMin / (1 + c.buffer.np)) / avgNonInitialMin,
      ),
    },
  };

  return {
    asOfDate: demand.asOfDate,
    md: mdDecision,
    nonInitial: niDecision,
  };
}

// ===== Helpers =====

function avgNonInitialMinutes(inFu: number, inMaint: number, c: Constants): number {
  const fuV = inFu / c.followup.weeksBetweenVisits;
  const maintV = inMaint / c.maintenance.weeksBetweenVisits;
  const totalV = fuV + maintV;
  if (totalV === 0) return c.appointmentMinutes.followup; // 防 0
  return (
    (fuV * c.appointmentMinutes.followup +
      maintV * c.appointmentMinutes.maintenance) /
    totalV
  );
}

function worstStatus(a: Status, b: Status): Status {
  const order: Record<Status, number> = { ok: 0, tight: 1, short: 2 };
  return order[a] >= order[b] ? a : b;
}

function recommendationText(
  status: Status,
  hire: number,
  who: string,
  leadWeeks: number,
): string {
  if (status === "ok") return "够用，无需招聘。";
  if (status === "tight")
    return `紧张：当前产能能覆盖需求，但已吃掉冗余。建议本周内启动 ${who} 的招聘流程（lead time ${leadWeeks} 周）。`;
  return `不够：未来 ${leadWeeks} 周内将出现产能缺口，建议立即发 JD，预估需新增 ${hire} 名 ${who}。`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// ===== 历史时序：把每周快照映射成 demand/capacity 折线点 =====

export interface HistoricalSeries {
  mdInitial: WeekPoint[];
  nonInitial: WeekPoint[];
}

export function computeHistoricalSeries(
  history: HistoryData,
  staff: StaffData,
  noShowRate: number,
  c: Constants,
): HistoricalSeries {
  // 假设：staff 在历史窗口内不变（v0 简化）。
  const mdCapPerWeek = mdInitialCapacityMinPerWeek(staff.md, c);
  const niCapPerWeek = nonInitialCapacityMinPerWeek(staff.md, staff.np, c);

  const mdInitial: WeekPoint[] = history.weekly.map((w) => {
    const showRate = 1 - noShowRate;
    const demandSessions = w.initialBookings * showRate;
    const capacitySessions = mdCapPerWeek / c.appointmentMinutes.initial;
    const safeCapacitySessions = capacitySessions / (1 + c.buffer.md);
    return {
      weekStart: w.weekStart,
      demand: round1(demandSessions),
      capacity: round1(capacitySessions),
      safeCapacity: round1(safeCapacitySessions),
    };
  });

  const nonInitial: WeekPoint[] = history.weekly.map((w) => {
    const avgMin = avgNonInitialMinutes(w.inFollowup, w.inMaintenance, c);
    const demandMin =
      (w.inFollowup / c.followup.weeksBetweenVisits) * c.appointmentMinutes.followup +
      (w.inMaintenance / c.maintenance.weeksBetweenVisits) * c.appointmentMinutes.maintenance;
    const demandSessions = demandMin / avgMin;
    const capacitySessions = niCapPerWeek / avgMin;
    const safeCapacitySessions = capacitySessions / (1 + c.buffer.np);
    return {
      weekStart: w.weekStart,
      demand: round1(demandSessions),
      capacity: round1(capacitySessions),
      safeCapacity: round1(safeCapacitySessions),
    };
  });

  return { mdInitial, nonInitial };
}
