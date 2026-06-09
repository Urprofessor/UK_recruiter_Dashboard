import type {
  AllData,
  Constants,
  DashboardDecision,
  HistoryData,
  MdStaff,
  NewPatientCapacity,
  PatientsData,
  StaffData,
  Status,
  TitrationStaff,
  WeekPoint,
} from "./types";

// ============================================================
// 基础：把 staff list 折算成"周可用小时"
// ============================================================

function effectiveHoursMD(mds: MdStaff[], subtype: MdStaff["subtype"], u: number): number {
  return mds
    .filter((m) => m.subtype === subtype)
    .reduce((acc, m) => acc + m.weeklyHours * u, 0);
}

function effectiveHoursTitration(team: TitrationStaff[], u: number): number {
  return team.reduce((acc, t) => acc + t.weeklyHours * u, 0);
}

// ============================================================
// 核心：本周可接新患者数（按 PDF 4 步逻辑）
// ============================================================

export function computeNewPatientCapacity(
  staff: StaffData,
  patients: PatientsData,
  c: Constants,
): NewPatientCapacity {
  const u = c.effectiveUtilization;
  const tauInit = c.appointmentMinutes.initial / 60;   // 0.75
  const tauDrug = c.appointmentMinutes.drug / 60;      // 0.5
  const tauFu = c.appointmentMinutes.fu / 60;          // 0.25
  const onboardingTime = tauInit + tauDrug;            // 1.25 hr/new patient (全流程桶)

  // ===== Bucket A: 全流程 MD =====
  const hoursA = effectiveHoursMD(staff.md, "full_flow", u);
  const existingA = patients.panelFullFlow * c.fuRate * tauFu;
  const freeA = hoursA - existingA;
  const newCapA = Math.max(0, freeA) / onboardingTime;
  const nFullFlow = staff.md.filter((m) => m.subtype === "full_flow").length;

  // ===== Bucket B: 纯诊断 MD + Titration Team =====
  const hoursPureDx = effectiveHoursMD(staff.md, "pure_dx", u);
  const dxCap = hoursPureDx / tauInit;
  const nPureDx = staff.md.filter((m) => m.subtype === "pure_dx").length;

  const hoursTit = effectiveHoursTitration(staff.titrationTeam, u);
  const existingTit = patients.panelTitration * c.fuRate * tauFu;
  const freeTit = Math.max(0, hoursTit - existingTit);
  const titCap = freeTit / tauDrug;
  const nTitration = staff.titrationTeam.length;

  const bucketBTotal = Math.min(dxCap, titCap);
  const bottleneck: "diagnosis" | "titration" | "balanced" =
    Math.abs(dxCap - titCap) < 0.5
      ? "balanced"
      : dxCap < titCap
      ? "diagnosis"
      : "titration";

  return {
    total: newCapA + bucketBTotal,
    bucketA: {
      nFullFlow,
      totalHours: hoursA,
      existingPanelHours: existingA,
      freeHours: freeA,
      newCapacity: newCapA,
    },
    bucketB: {
      nPureDx,
      pureDxHours: hoursPureDx,
      pureDxCapacity: dxCap,
      nTitration,
      titrationHours: hoursTit,
      titrationExistingHours: existingTit,
      titrationFreeHours: freeTit,
      titrationCapacity: titCap,
      bottleneck,
      bucketTotal: bucketBTotal,
    },
  };
}

// ============================================================
// 状态判断 + 招聘建议
// ============================================================

function statusFromCoverage(coverage: number, buffer: number): Status {
  if (coverage >= 1 + buffer) return "ok";
  if (coverage >= 1) return "tight";
  return "short";
}

function avgBooking(arr: { expected: number }[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b.expected, 0) / arr.length;
}

export function computeDecision(data: AllData): DashboardDecision {
  const { staff, patients, demand, constants: c } = data;

  const capacity = computeNewPatientCapacity(staff, patients, c);

  // 未来 W_MD 周预期新预约（含 no-show 折扣）
  const W = c.lookaheadWeeks.md;
  const known = demand.newInitialBookings.slice(0, W);
  const avg = avgBooking(demand.newInitialBookings);
  let expectedBookings = 0;
  for (let i = 0; i < W; i++) {
    const expectedRaw = i < known.length ? known[i].expected : avg;
    expectedBookings += expectedRaw * (1 - demand.noShowRate);
  }
  // 平均每周预期
  const weeklyExpected = expectedBookings / W;

  // Coverage = 本周容量 / 平均每周预期
  const coverage = weeklyExpected > 0 ? capacity.total / weeklyExpected : Infinity;
  const status = statusFromCoverage(coverage, c.buffer);

  // 缺口 → 招聘建议
  const weeklyGap = Math.max(0, weeklyExpected * (1 + c.buffer) - capacity.total);
  // 假设新招的 MD 是"全流程"，每人每周能贡献多少新患者
  const newMDPerHire =
    (c.typicalNewHire.weeklyHours * c.effectiveUtilization) /
    (c.appointmentMinutes.initial / 60 + c.appointmentMinutes.drug / 60);
  // 假设新招的 Titration Team 主要做 drug init
  const newTitPerHire =
    (c.typicalNewHire.weeklyHours * c.effectiveUtilization) /
    (c.appointmentMinutes.drug / 60);

  let hireMD = 0;
  let hireTit = 0;
  if (weeklyGap > 0) {
    // 谁是瓶颈？看 bucketB 还是全流程，根据 bottleneck 决定优先招哪种
    if (capacity.bucketB.bottleneck === "titration") {
      hireTit = Math.ceil(weeklyGap / newTitPerHire);
    } else if (capacity.bucketB.bottleneck === "diagnosis") {
      hireMD = Math.ceil(weeklyGap / newMDPerHire);
    } else {
      // 平衡或全流程桶不够 → 招全流程 MD
      hireMD = Math.ceil(weeklyGap / newMDPerHire);
    }
  }

  // Panel 占用
  const fullFlowPerMD =
    capacity.bucketA.nFullFlow > 0
      ? patients.panelFullFlow / capacity.bucketA.nFullFlow
      : 0;
  const panelStatus = {
    fullFlowPerMD,
    fullFlowAtLimit: fullFlowPerMD >= c.panelLimitPerMD,
    fullFlowAtWarn: fullFlowPerMD >= c.panelLimitWarnAt,
  };

  // 建议文案
  let recommendation: string;
  if (status === "ok") {
    recommendation = `本周可接 ${Math.round(capacity.total)} 个新患者，超出预期需求（${Math.round(weeklyExpected)}）${Math.round((coverage - 1) * 100)}%。容量充裕。`;
  } else if (status === "tight") {
    recommendation = `本周可接 ${Math.round(capacity.total)} 个新患者，刚好覆盖预期（${Math.round(weeklyExpected)}）但已吃掉冗余。建议本周内启动招聘——${
      capacity.bucketB.bottleneck === "titration"
        ? `优先 Titration Team（瓶颈），lead time ${c.leadTimeWeeks.titration} 周`
        : `优先全流程 MD 或 Titration Team`
    }。`;
  } else {
    recommendation = `本周仅能接 ${Math.round(capacity.total)} 个新患者，但预期 ${Math.round(weeklyExpected)} 个。立即发 JD：${hireMD > 0 ? `建议招 ${hireMD} 名 MD` : ""}${hireMD > 0 && hireTit > 0 ? " + " : ""}${hireTit > 0 ? `${hireTit} 名 Titration Team` : ""}。`;
  }

  return {
    asOfDate: demand.asOfDate,
    capacity,
    expectedBookingsNext: expectedBookings,
    status,
    coverage,
    recommendation,
    hireSuggestion: { md: hireMD, titration: hireTit },
    panelStatus,
  };
}

// ============================================================
// 历史时序：每周历史可接新患者容量 vs 实际新预约
// ============================================================

export interface HistoricalSeries {
  weekly: WeekPoint[];
}

export function computeHistoricalSeries(
  history: HistoryData,
  staff: StaffData,
  noShowRate: number,
  c: Constants,
): HistoricalSeries {
  const weekly: WeekPoint[] = history.weekly.map((w) => {
    // 假设 staff 在历史窗口内不变
    const cap = computeNewPatientCapacity(
      staff,
      {
        asOfDate: w.weekStart,
        queueInitial: 0,
        panelFullFlow: w.panelFullFlow,
        panelTitration: w.panelTitration,
      },
      c,
    );
    const expected = w.initialBookings * (1 - noShowRate);
    const safe = cap.total / (1 + c.buffer);
    return {
      weekStart: w.weekStart,
      newPatientCapacity: round1(cap.total),
      expectedBookings: round1(expected),
      safeCapacity: round1(safe),
    };
  });
  return { weekly };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
