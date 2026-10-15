import { addDays, type Period } from './dates';
import { minutesToHours } from './period';

/*
 * Motor de nómina inspirado en Odoo (estructura → reglas ordenadas por `sequence`), con
 * tipos fijos en lugar de código Python y sin categorías: una regla suma a otras por su código.
 * Ver docs/requisitos.md §4.3.
 */

/** Horas trabajadas que entrega el motor de asistencia. */
export const WORKED_HOUR_CODES = [
  'WORK',
  'NIGHT',
  'OT_DAY',
  'OT_NIGHT',
] as const;
export type WorkedHourCode = (typeof WORKED_HOUR_CODES)[number];

export const RULE_CONDITIONS = ['always', 'nonzero_quantity'] as const;
export const QUANTITY_SOURCES = [
  'one',
  'worked_hours',
  'input',
  'period_days',
  'mondays',
] as const;
export const AMOUNT_TYPES = [
  'fixed',
  'monthly_wage',
  'weekly_wage',
  'daily_wage',
  'hourly_wage',
  'percentage_of',
] as const;

export type RuleCondition = (typeof RULE_CONDITIONS)[number];
export type QuantitySource = (typeof QUANTITY_SOURCES)[number];
export type AmountType = (typeof AMOUNT_TYPES)[number];

/** Convenciones de la nómina venezolana: mes de 30 días, jornada de 8 h, año de 52 semanas. */
export const DAYS_PER_MONTH = 30;
export const HOURS_PER_DAY = 8;
export const WEEKS_PER_YEAR = 52;

export interface SalaryRule {
  code: string;
  name: string;
  sequence: number;
  appearsOnPayslip: boolean;
  condition: RuleCondition;
  quantitySource: QuantitySource;
  /** Código de horas (worked_hours) o de entrada (input). */
  quantityCode: string | null;
  amountType: AmountType;
  amountFix: number | null;
  /** Códigos de reglas anteriores que suma `percentage_of`. */
  baseCodes: string[] | null;
  /** Parámetro cuyo valor vigente topa el monto. */
  amountCapParam: string | null;
  /** Porcentaje con signo: 150 para horas extra, −4 para una retención. */
  rate: number;
}

export interface PayslipInput {
  /** Salario mensual del contrato. */
  wage: number;
  rules: SalaryRule[];
  workedMinutes: Record<WorkedHourCode, number>;
  /** Entradas manuales por código (horas, días o montos). */
  inputs: Record<string, number>;
  /** Valor vigente de cada parámetro al final del período. */
  parameters: Record<string, number>;
  period: Period;
}

export interface PayslipLine {
  code: string;
  name: string;
  sequence: number;
  quantity: number;
  amount: number;
  rate: number;
  total: number;
  appearsOnPayslip: boolean;
}

export interface PayslipResult {
  lines: PayslipLine[];
  /** Suma de las líneas visibles positivas (asignaciones). */
  earnings: number;
  /** Suma de las líneas visibles negativas (deducciones), con signo. */
  deductions: number;
  /** El total de la regla NET si existe; si no, asignaciones + deducciones. */
  net: number;
}

/** Redondeo comercial a céntimos, simétrico para montos negativos. */
export function roundMoney(value: number): number {
  const cents = Math.round(Math.abs(value) * 100 + 1e-9) / 100;
  return value < 0 ? -cents : cents;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Lunes dentro del período (base de las retenciones semanales del IVSS y el RPE). */
export function countMondays({ from, to }: Period): number {
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === 1) count++;
  }
  return count;
}

export function periodDays({ from, to }: Period): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
}

function wageAmount(type: AmountType, wage: number): number {
  switch (type) {
    case 'monthly_wage':
      return wage;
    case 'weekly_wage':
      return (wage * 12) / WEEKS_PER_YEAR;
    case 'daily_wage':
      return wage / DAYS_PER_MONTH;
    case 'hourly_wage':
      return wage / DAYS_PER_MONTH / HOURS_PER_DAY;
    default:
      throw new Error(`No es un monto de salario: ${type}`);
  }
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,29}$/;

/**
 * Errores de una estructura antes de guardarla. Vacío si es válida.
 * Las reglas solo pueden sumar reglas de secuencia menor: así el cálculo es de una sola pasada.
 */
export function validateRules(rules: SalaryRule[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const sequences = new Set<number>();

  for (const rule of [...rules].sort((a, b) => a.sequence - b.sequence)) {
    const label = `Regla ${rule.code || '(sin código)'}`;
    if (!CODE_PATTERN.test(rule.code)) {
      errors.push(
        `${label}: el código va en mayúsculas, números y _ (ej. HED)`,
      );
    }
    if (seen.has(rule.code)) errors.push(`${label}: código repetido`);
    if (sequences.has(rule.sequence)) {
      errors.push(`${label}: la secuencia ${rule.sequence} está repetida`);
    }
    if (!rule.name.trim()) errors.push(`${label}: falta el nombre`);

    if (rule.quantitySource === 'worked_hours') {
      if (!WORKED_HOUR_CODES.includes(rule.quantityCode as WorkedHourCode)) {
        errors.push(`${label}: las horas son ${WORKED_HOUR_CODES.join(', ')}`);
      }
    } else if (rule.quantitySource === 'input') {
      if (!rule.quantityCode)
        errors.push(`${label}: indica el código de la entrada`);
    } else if (rule.quantityCode) {
      errors.push(
        `${label}: el código de cantidad solo aplica a horas o entradas`,
      );
    }

    if (rule.amountType === 'fixed' && rule.amountFix === null) {
      errors.push(`${label}: falta el monto fijo`);
    }
    if (rule.amountType !== 'fixed' && rule.amountFix !== null) {
      errors.push(`${label}: el monto fijo solo aplica al tipo "fijo"`);
    }
    if (rule.amountType === 'percentage_of') {
      if (!rule.baseCodes?.length)
        errors.push(`${label}: indica qué reglas suma`);
      for (const base of rule.baseCodes ?? []) {
        if (!seen.has(base)) {
          errors.push(`${label}: ${base} no es una regla anterior`);
        }
      }
    } else if (rule.baseCodes?.length) {
      errors.push(`${label}: las reglas base solo aplican a "porcentaje de"`);
    }
    if (!Number.isFinite(rule.rate)) errors.push(`${label}: tasa inválida`);

    seen.set(rule.code, rule.sequence);
    sequences.add(rule.sequence);
  }
  return errors;
}

/**
 * Calcula un recibo. Cada línea vale `monto × cantidad × tasa / 100`, redondeada a céntimos,
 * y queda disponible por su código para las reglas siguientes.
 * Las horas se toman con 2 decimales, igual que en el CSV del período.
 */
export function computePayslip(input: PayslipInput): PayslipResult {
  const errors = validateRules(input.rules);
  if (errors.length > 0) throw new Error(errors.join('; '));

  const totals = new Map<string, number>();
  const lines: PayslipLine[] = [];

  const quantityOf = (rule: SalaryRule): number => {
    switch (rule.quantitySource) {
      case 'one':
        return 1;
      case 'worked_hours':
        return minutesToHours(
          input.workedMinutes[rule.quantityCode as WorkedHourCode] ?? 0,
        );
      case 'input':
        return input.inputs[rule.quantityCode ?? ''] ?? 0;
      case 'period_days':
        return periodDays(input.period);
      case 'mondays':
        return countMondays(input.period);
    }
  };

  const amountOf = (rule: SalaryRule): number => {
    let amount =
      rule.amountType === 'fixed'
        ? (rule.amountFix ?? 0)
        : rule.amountType === 'percentage_of'
          ? (rule.baseCodes ?? []).reduce(
              (sum, code) => sum + (totals.get(code) ?? 0),
              0,
            )
          : wageAmount(rule.amountType, input.wage);
    if (rule.amountCapParam) {
      const cap = input.parameters[rule.amountCapParam];
      if (cap === undefined) {
        throw new Error(
          `Falta el parámetro ${rule.amountCapParam} para ${rule.code}`,
        );
      }
      amount = Math.min(amount, cap);
    }
    return amount;
  };

  for (const rule of [...input.rules].sort((a, b) => a.sequence - b.sequence)) {
    const quantity = quantityOf(rule);
    if (rule.condition === 'nonzero_quantity' && quantity === 0) {
      totals.set(rule.code, 0);
      continue;
    }
    const amount = amountOf(rule);
    const total = roundMoney((amount * quantity * rule.rate) / 100);
    totals.set(rule.code, total);
    lines.push({
      code: rule.code,
      name: rule.name,
      sequence: rule.sequence,
      quantity,
      amount: round4(amount),
      rate: rule.rate,
      total,
      appearsOnPayslip: rule.appearsOnPayslip,
    });
  }

  const visible = lines.filter((line) => line.appearsOnPayslip);
  const earnings = roundMoney(
    visible.filter((l) => l.total > 0).reduce((sum, l) => sum + l.total, 0),
  );
  const deductions = roundMoney(
    visible.filter((l) => l.total < 0).reduce((sum, l) => sum + l.total, 0),
  );
  const net = totals.has('NET')
    ? (totals.get('NET') ?? 0)
    : roundMoney(earnings + deductions);
  return { lines, earnings, deductions, net };
}

/** Horas de nómina a partir de los minutos del período (ordinarias = trabajadas − extra). */
export function workedMinutesFromAttendance(minutes: {
  worked: number;
  nightOrdinary: number;
  overtimeDay: number;
  overtimeNight: number;
}): Record<WorkedHourCode, number> {
  return {
    WORK: minutes.worked - minutes.overtimeDay - minutes.overtimeNight,
    NIGHT: minutes.nightOrdinary,
    OT_DAY: minutes.overtimeDay,
    OT_NIGHT: minutes.overtimeNight,
  };
}
