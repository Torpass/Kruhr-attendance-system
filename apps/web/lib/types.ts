/** Respuestas de la API (espejo de apps/api). Las fechas llegan como ISO en UTC. */

import type { DayStatus } from "@marcaje/core";

export type Company = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  group: { id: string; name: string };
};

export type Employee = {
  id: string;
  companyId: string;
  cedula: string;
  name: string;
  active: boolean;
  hiredOn: string | null;
  createdAt: string;
};

export type ShiftMinutes = {
  date: string;
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
};

export type Shift = {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  /** Día local (Caracas) al que pertenece el turno. */
  date: string;
  /** null mientras el turno sigue abierto. */
  minutes: ShiftMinutes | null;
  employee?: { id: string; name: string; cedula: string };
  corrections?: number;
};

export type TodayEntry = {
  shiftId: string;
  employee: { id: string; name: string; cedula: string };
  clockIn: string;
  clockOut: string | null;
};

export type CompanyToday = {
  date: string;
  counts: { active: number; inside: number; notClockedIn: number; missingClockOut: number };
  inside: TodayEntry[];
  missingClockOut: TodayEntry[];
  notClockedIn: { id: string; name: string; cedula: string }[];
  finished: TodayEntry[];
};

export type MyToday = {
  date: string;
  openShift: Shift | null;
  openShiftIsStale: boolean;
  shifts: Shift[];
};

export type Totals = {
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
};

export type PeriodRow = {
  employee: { id: string; cedula: string; name: string; active: boolean };
  minutes: Totals;
  hours: Totals;
  openShifts: number;
  weeks: {
    weekStart: string;
    weekEnd: string;
    overtimeMinutes: number;
    overtimeHours: number;
    alert: boolean;
  }[];
  overtimeAlert: boolean;
};

export type PeriodSummary = {
  period: { from: string; to: string };
  rows: PeriodRow[];
  alerts: number;
  openShifts: number;
};

export type Correction = {
  id: string;
  reason: string;
  before: { clockIn: string; clockOut: string | null } | null;
  after: { clockIn: string; clockOut: string | null };
  createdAt: string;
  correctedBy: { id: string; name: string };
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "analyst";
  active: boolean;
  companyIds: string[];
};

export type AdminGroup = {
  id: string;
  name: string;
  slug: string;
  companies: { id: string; name: string; slug: string; rif: string | null; active: boolean }[];
};

export type RunState = "computed" | "validated" | "paid" | "cancelled";

export type SalaryRule = {
  code: string;
  name: string;
  sequence: number;
  appearsOnPayslip: boolean;
  condition: "always" | "nonzero_quantity";
  quantitySource: "one" | "worked_hours" | "input" | "period_days" | "mondays";
  quantityCode: string | null;
  amountType: "fixed" | "monthly_wage" | "weekly_wage" | "daily_wage" | "hourly_wage" | "percentage_of";
  amountFix: number | null;
  baseCodes: string[] | null;
  amountCapParam: string | null;
  rate: number;
};

export type Structure = {
  id: string;
  code: string;
  name: string;
  schedulePay: "weekly" | "semi_monthly" | "monthly";
  active: boolean;
  rules?: SalaryRule[];
};

export type PayrollParameter = {
  id: string;
  code: string;
  name: string;
  values: { dateFrom: string; value: number }[];
};

export type InputType = { id: string; code: string; name: string };

export type Contract = {
  id: string;
  employeeId: string;
  wage: number;
  dateStart: string;
  dateEnd: string | null;
  structure: { id: string; name: string };
  /** `null`: sus turnos se calculan con la regla general (la del enunciado). */
  schedule: { id: string; name: string } | null;
};

/** Jornada de un día en hora local `HH:MM`; si `end` ≤ `start`, termina al día siguiente. */
export type ScheduleDay = { start: string; end: string };

/** Horario del grupo con su política de cálculo (`WorkPolicy` en core). */
export type WorkSchedule = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  overtimeMode: "duration" | "schedule";
  ordinaryMinutes: number;
  /** Lunes (0) a domingo (6); `null` es día libre. */
  days: (ScheduleDay | null)[] | null;
  breakMinutes: number;
  breakAfterMinutes: number;
  nightStart: string;
  nightEnd: string;
  weeklyOvertimeAlertMinutes: number;
};

export type PayrollRun = {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  state: RunState;
  computedAt: string;
  structure: { id: string; name: string };
  payslips?: number | PayslipSummary[];
  net?: number | null;
};

export type PayslipSummary = {
  id: string;
  wage: number;
  earnings: number;
  deductions: number;
  net: number;
  employee: { id: string; name: string; cedula: string };
};

export type PayslipLine = {
  code: string;
  name: string;
  sequence: number;
  quantity: number;
  amount: number;
  rate: number;
  total: number;
  appearsOnPayslip: boolean;
};

export type PayslipDetail = PayslipSummary & {
  runId: string;
  run: { name: string; dateFrom: string; dateTo: string; state: RunState };
  lines: PayslipLine[];
  workedMinutes: Record<string, number>;
  inputs: Record<string, number>;
};

/** Un día de un colaborador frente a su horario (`compareAttendance` en core). */
export type AttendanceDay = {
  date: string;
  status: DayStatus;
  scheduled: { start: string; end: string } | null;
  plannedMinutes: number;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  leftEarlyMinutes: number;
  arrivedEarlyMinutes: number;
  stayedLateMinutes: number;
  differenceMinutes: number;
  employee: { id: string; name: string; cedula: string; active: boolean };
  shiftIds: string[];
  /** Algún turno del día fue corregido por RRHH. */
  corrected: boolean;
};

export type AttendanceReport = {
  period: { from: string; to: string };
  counts: Record<DayStatus, number>;
  days: AttendanceDay[];
};
