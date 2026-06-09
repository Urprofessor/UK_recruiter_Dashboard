// ============================================================
// 人员
// ============================================================

export type MdSubtype = "full_flow" | "pure_dx";

export interface MdStaff {
  id: string;
  name: string;
  subtype: MdSubtype;
  weeklyHours: number; // effective hours per week
}

export interface TitrationStaff {
  id: string;
  name: string;
  weeklyHours: number;
  ipNp: boolean;
}

export interface StaffData {
  asOfDate: string;
  md: MdStaff[];
  titrationTeam: TitrationStaff[];
}

// ============================================================
// 患者：按 panel 拆分
// ============================================================

export interface PatientsData {
  asOfDate: string;
  /** 等首诊（pre-onboarding queue） */
  queueInitial: number;
  /** 由全流程 MD 一条龙跟到底的 panel 总数 */
  panelFullFlow: number;
  /** 由 Titration Team（NP）跟的 panel 总数（含 drug-init pipeline + 维持期） */
  panelTitration: number;
}

// ============================================================
// 需求侧
// ============================================================

export interface WeekBooking {
  weekStart: string;
  expected: number;
}

export interface DemandData {
  asOfDate: string;
  noShowRate: number;
  newInitialBookings: WeekBooking[];
}

// ============================================================
// 常数
// ============================================================

export interface Constants {
  /** 三类诊次时长（分钟） */
  appointmentMinutes: {
    initial: number; // 默认 45
    drug: number;    // 默认 30 (drug initiation, ONE-TIME)
    fu: number;      // 默认 15 (recurring follow-up / maintenance)
  };
  /** 每周每位维持期患者的平均 fu 次数 */
  fuRate: number;
  /** 单 MD panel 上限（人）—— 超过会建议关闭 new patient toggle */
  panelLimitPerMD: number;
  /** Panel 预警阈值（开始飞书报警的下限） */
  panelLimitWarnAt: number;
  /** 容量冗余 % */
  buffer: number;
  leadTimeWeeks: { md: number; titration: number };
  lookaheadWeeks: { md: number; titration: number };
  effectiveUtilization: number;
  typicalNewHire: { weeklyHours: number };
}

// ============================================================
// 历史
// ============================================================

export interface WeeklyHistoryPoint {
  weekStart: string;
  initialBookings: number;
  panelFullFlow: number;
  panelTitration: number;
}

export interface HistoryData {
  weekly: WeeklyHistoryPoint[];
}

// ============================================================
// 汇总
// ============================================================

export interface AllData {
  staff: StaffData;
  patients: PatientsData;
  demand: DemandData;
  constants: Constants;
  history: HistoryData;
}

export type Status = "ok" | "tight" | "short";

// ============================================================
// 计算结果
// ============================================================

/** "本周可接新患者数" 的详细分解 */
export interface NewPatientCapacity {
  total: number;
  bucketA: {
    nFullFlow: number;
    totalHours: number;
    existingPanelHours: number;
    freeHours: number;
    newCapacity: number;
  };
  bucketB: {
    nPureDx: number;
    pureDxHours: number;
    pureDxCapacity: number; // = hours / 0.75
    nTitration: number;
    titrationHours: number;
    titrationExistingHours: number;
    titrationFreeHours: number;
    titrationCapacity: number; // = freeHours / 0.5
    bottleneck: "diagnosis" | "titration" | "balanced";
    bucketTotal: number; // = min(pureDxCap, titrationCap)
  };
}

export interface WeekPoint {
  weekStart: string;
  newPatientCapacity: number;
  expectedBookings: number;
  safeCapacity: number; // = capacity / (1 + buffer)，作为安全线
}

export interface DashboardDecision {
  asOfDate: string;
  capacity: NewPatientCapacity;
  /** 未来 N 周（= MD lookahead）的预期新预约 */
  expectedBookingsNext: number;
  /** Status 在当前快照下：capacity ≥ demand × (1+buffer) → ok 等 */
  status: Status;
  coverage: number;
  recommendation: string;
  hireSuggestion: { md: number; titration: number };
  /** Panel 占用情况 */
  panelStatus: {
    fullFlowPerMD: number;
    fullFlowAtLimit: boolean;
    fullFlowAtWarn: boolean;
  };
}
