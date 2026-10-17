import { formatMoney } from "./money";
import type { SalaryRule } from "./types";

export const SCHEDULE_LABEL = { weekly: "Semanal", semi_monthly: "Quincenal", monthly: "Mensual" } as const;

export const AMOUNT_LABEL: Record<SalaryRule["amountType"], string> = {
  fixed: "Monto fijo",
  monthly_wage: "Salario mensual",
  weekly_wage: "Salario semanal",
  daily_wage: "Salario diario",
  hourly_wage: "Salario por hora",
  percentage_of: "Suma de otras reglas",
};

export const QUANTITY_LABEL: Record<SalaryRule["quantitySource"], string> = {
  one: "Una vez",
  worked_hours: "Horas trabajadas",
  input: "Concepto manual",
  period_days: "Días del período",
  mondays: "Lunes del período",
};

export const HOURS_LABEL: Record<string, string> = {
  WORK: "Horas ordinarias",
  NIGHT: "Horas nocturnas",
  OT_DAY: "Horas extra diurnas",
  OT_NIGHT: "Horas extra nocturnas",
};

export type RuleKind = "earning" | "deduction" | "total";

/** Deducción si resta; total si solo suma otras reglas en positivo (bruto, neto); devengo el resto. */
export function ruleKind(rule: SalaryRule): RuleKind {
  if (rule.rate < 0) return "deduction";
  return rule.amountType === "percentage_of" ? "total" : "earning";
}

export const KIND_LABEL: Record<RuleKind, string> = {
  earning: "Devengos",
  deduction: "Deducciones",
  total: "Totales",
};

const percent = (value: number) => `${formatMoney(Math.abs(value)).replace(/,00$/, "")} %`;

/**
 * La fórmula en palabras: "Salario por hora × Horas extra diurnas × 150 %".
 * `names` traduce códigos de parámetros y conceptos a su nombre.
 */
export function describeRule(rule: SalaryRule, names: Record<string, string> = {}) {
  const name = (code: string) => names[code] ?? code;
  const quantity =
    rule.quantitySource === "worked_hours"
      ? HOURS_LABEL[rule.quantityCode ?? ""] ?? rule.quantityCode
      : rule.quantitySource === "input"
        ? `concepto ${name(rule.quantityCode ?? "")}`
        : rule.quantitySource === "one"
          ? null
          : QUANTITY_LABEL[rule.quantitySource].toLowerCase();

  // Un monto fijo de 1 por un concepto manual es "lo que RRHH cargue".
  const parts =
    rule.amountType === "fixed" && rule.amountFix === 1 && rule.quantitySource === "input"
      ? [`Monto cargado en el ${quantity}`]
      : [
          rule.amountType === "fixed"
            ? `${formatMoney(rule.amountFix ?? 0)} Bs.`
            : rule.amountType === "percentage_of"
              ? (rule.baseCodes ?? []).join(" + ")
              : AMOUNT_LABEL[rule.amountType],
          quantity,
        ];
  if (Math.abs(rule.rate) !== 100) parts.push(percent(rule.rate));

  const notes = [
    rule.amountCapParam && `tope: ${name(rule.amountCapParam)}`,
    rule.condition === "nonzero_quantity" && "se omite si es 0",
    !rule.appearsOnPayslip && "no se muestra en el recibo",
  ].filter(Boolean);

  return { formula: parts.filter(Boolean).join(" × "), notes: notes as string[] };
}

export function emptyRule(sequence: number): SalaryRule {
  return {
    code: "",
    name: "",
    sequence,
    appearsOnPayslip: true,
    condition: "always",
    quantitySource: "one",
    quantityCode: null,
    amountType: "fixed",
    amountFix: 0,
    baseCodes: null,
    amountCapParam: null,
    rate: 100,
  };
}
