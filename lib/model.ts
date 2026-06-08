import type {
  AllData,
  Constants,
  DashboardDecision,
  MdStaff,
  NpStaff,
  RoleDecision,
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

export function followupCapacityMinPerWeek(
  md: MdStaff[],
  np: NpStaff[],
  c: Constants,
): number {
  const u = c.effectiveUtilization;
  const fullFlow = md.filter((m) => m.subtype === "full_flow");
  return (
    sumEffectiveMin(fullFlow, u) * c.fullFlowMdSplit.followUpPct +
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

export function followupDemandMinPerWeek(
  inTitration: number,
  inMaintenance: number,
  c: Constants,
): number {
  const titrationVisitsPerWeek = inTitration / c.titration.weeksBetweenVisits;
  const maintenanceVisitsPerWeek = inMaintenance / c.maintenance.weeksBetweenVisits;
  return (
    titrationVisitsPerWeek * c.appointmentMinutes.titration +
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
  // 新初诊 MD 的所有时间都用于初诊 → fraction = 1.0
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

  // ---- 复诊/维持检查（看未来 c.lookaheadWeeks.np 周） ----
  const fuWeeks = c.lookaheadWeeks.np;
  const fuCapPerWeek = followupCapacityMinPerWeek(staff.md, staff.np, c);
  const fuDemandMinPerWeek = followupDemandMinPerWeek(
    patients.inTitration,
    patients.inMaintenance,
    c,
  );
  // 平均复诊时长（用于把分钟换成"诊次"显示）
  const avgFollowupMin = avgFollowupMinutes(patients.inTitration, patients.inMaintenance, c);

  const fuWeekly: WeekPoint[] = [];
  // v0 假设未来 N 周复诊需求恒定（病人池变化忽略）
  for (let i = 0; i < fuWeeks; i++) {
    const weekStart = addWeeks(demand.asOfDate, i);
    const demandSessions = fuDemandMinPerWeek / avgFollowupMin;
    const capacitySessions = fuCapPerWeek / avgFollowupMin;
    const safeCapacitySessions = capacitySessions / (1 + c.buffer.np);
    fuWeekly.push({
      weekStart,
      demand: round1(demandSessions),
      capacity: round1(capacitySessions),
      safeCapacity: round1(safeCapacitySessions),
    });
  }
  const fuTotalDemandMin = fuDemandMinPerWeek * fuWeeks;
  const fuTotalCapacityMin = fuCapPerWeek * fuWeeks;
  const fuStatus = fuWeekly
    .map((w) => statusFromGap(w.capacity, w.demand, c.buffer.np))
    .reduce(worstStatus, "ok");
  const fuShortageMin = Math.max(
    0,
    fuTotalDemandMin * (1 + c.buffer.np) - fuTotalCapacityMin,
  );
  // NP 的所有时间都用于复诊 → fraction = 1.0
  const fuHire = additionalHiresNeeded(fuShortageMin, fuWeeks, c, 1.0);

  const fuDecision: RoleDecision = {
    role: "followup",
    label: "复诊 / 维持产能（未来 2 周）",
    lookaheadWeeks: fuWeeks,
    leadTimeWeeks: c.leadTimeWeeks.np,
    status: fuStatus,
    recommendation: recommendationText(fuStatus, fuHire, "NP（或全流程 MD）", c.leadTimeWeeks.np),
    hireSuggestion: fuHire,
    hireSuggestionWho: "NP（或全流程 MD）",
    weekly: fuWeekly,
    totals: {
      capacitySessions: round1(fuTotalCapacityMin / avgFollowupMin),
      demandSessions: round1(fuTotalDemandMin / avgFollowupMin),
      safeCapacitySessions: round1(
        (fuTotalCapacityMin / (1 + c.buffer.np)) / avgFollowupMin,
      ),
    },
  };

  return {
    asOfDate: demand.asOfDate,
    md: mdDecision,
    followup: fuDecision,
  };
}

// ===== Helpers =====

function avgFollowupMinutes(inTit: number, inMaint: number, c: Constants): number {
  const titV = inTit / c.titration.weeksBetweenVisits;
  const maintV = inMaint / c.maintenance.weeksBetweenVisits;
  const totalV = titV + maintV;
  if (totalV === 0) return c.appointmentMinutes.titration; // 防 0
  return (titV * c.appointmentMinutes.titration + maintV * c.appointmentMinutes.maintenance) / totalV;
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
