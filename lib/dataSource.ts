import staffJson from "@/data/staff.json";
import patientsJson from "@/data/patients.json";
import demandJson from "@/data/demand.json";
import constantsJson from "@/data/constants.json";
import type {
  AllData,
  Constants,
  DemandData,
  PatientsData,
  StaffData,
} from "./types";

// v0：直接读 JSON。
// v1：把下面这个函数换成"读 Google Sheets API"，其他不动。
export async function loadAllData(): Promise<AllData> {
  return {
    staff: staffJson as StaffData,
    patients: patientsJson as PatientsData,
    demand: demandJson as DemandData,
    constants: constantsJson as Constants,
  };
}
