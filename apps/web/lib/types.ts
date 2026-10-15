/** Respuestas de la API (espejo de apps/api). Las fechas llegan como ISO en UTC. */

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
