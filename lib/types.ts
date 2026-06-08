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

export interface PatientsData {
  asOfDate: string;
  queueInitial: number;
  inTitration: number;
  inMaintenance: number;
}

export interface WeekBooking {
  weekStart: string;
  expected: number;
}

export interface DemandData {
  asOfDate: string;
  noShowRate: number;
  conversionToTitration: number;
  newInitialBookings: WeekBooking[];
}

export interface Constants {
  appointmentMinutes: {
    initial: number;
    titration: number;
    maintenance: number;
  };
  buffer: { md: number; np: number };
  leadTimeWeeks: { md: number; np: number };
  lookaheadWeeks: { md: number; np: number };
  titration: { weeksBetweenVisits: number; weeksUntilStable: number };
  maintenance: { weeksBetweenVisits: number };
  fullFlowMdSplit: { initialPct: number; followUpPct: number };
  effectiveUtilization: number;
  typicalNewHire: { weeklyHours: number; availability: number };
}

export interface WeeklyHistoryPoint {
  weekStart: string;
  initialBookings: number;
  inTitration: number;
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
  role: "md_initial" | "followup";
  label: string;          // 中文显示名
  lookaheadWeeks: number;
  leadTimeWeeks: number;
  status: Status;
  recommendation: string; // 中文建议
  hireSuggestion: number; // 建议新增人数（按 typicalNewHire 折算）
  hireSuggestionWho: string; // 建议招哪种角色（中文）
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
  followup: RoleDecision;
}
