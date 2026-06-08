export type MdSubtype = "initial_only" | "full_flow";

export interface MdStaff {
  id: string;
  name: string;
  subtype: MdSubtype;
  weeklyHours: number;
  availability: number; // 0..1, 年化周可用率
}

export interface NpStaff {
  id: string;
  name: string;
  weeklyHours: number;
  availability: number;
  ipNp: boolean; // Independent Prescriber NP
}

export interface StaffData {
  asOfDate: string;
  md: MdStaff[];
  np: NpStaff[];
}

// 患者三阶段：等待首诊 → 复诊（吃药调整剂量） → 维持
export interface PatientsData {
  asOfDate: string;
  queueInitial: number;
  inFollowup: number;
  inMaintenance: number;
}

export interface WeekBooking {
  weekStart: string;
  expected: number;
}

export interface DemandData {
  asOfDate: string;
  noShowRate: number;
  conversionToFollowup: number;
  newInitialBookings: WeekBooking[];
}

export interface Constants {
  appointmentMinutes: {
    initial: number;
    followup: number;
    maintenance: number;
  };
  buffer: { md: number; np: number };
  leadTimeWeeks: { md: number; np: number };
  lookaheadWeeks: { md: number; np: number };
  followup: { weeksBetweenVisits: number; weeksUntilStable: number };
  maintenance: { weeksBetweenVisits: number };
  /**
   * 全流程 MD 把可用时间在"初诊"和"非初诊（复诊 + 维持）"两类上的分配比例。
   * 两个加起来应该 = 1。
   */
  fullFlowMdSplit: { initialPct: number; nonInitialPct: number };
  effectiveUtilization: number;
  typicalNewHire: { weeklyHours: number; availability: number };
}

export interface WeeklyHistoryPoint {
  weekStart: string;
  initialBookings: number;
  inFollowup: number;
  inMaintenance: number;
}

export interface HistoryData {
  weekly: WeeklyHistoryPoint[];
}

export interface AllData {
  staff: StaffData;
  patients: PatientsData;
  demand: DemandData;
  constants: Constants;
  history: HistoryData;
}

export type Status = "ok" | "tight" | "short";

export interface WeekPoint {
  weekStart: string;
  demand: number;   // 诊次
  capacity: number; // 诊次
  safeCapacity: number; // 诊次 = capacity / (1 + buffer)，用于显示"安全线"
}

export interface RoleDecision {
  /**
   * md_initial = MD 初诊瓶颈
   * non_initial = 复诊 + 维持合并的产能瓶颈
   */
  role: "md_initial" | "non_initial";
  label: string;          // 中文显示名
  lookaheadWeeks: number;
  leadTimeWeeks: number;
  status: Status;
  recommendation: string;
  hireSuggestion: number;
  hireSuggestionWho: string;
  weekly: WeekPoint[];
  totals: {
    capacitySessions: number;
    demandSessions: number;
    safeCapacitySessions: number;
  };
}

export interface DashboardDecision {
  asOfDate: string;
  md: RoleDecision;
  nonInitial: RoleDecision;
}
