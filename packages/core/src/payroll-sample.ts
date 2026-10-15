import type { SalaryRule } from './payroll';

/** Parámetros de referencia (VES, octubre 2026). Son supuestos, no asesoría legal. */
export const SAMPLE_PARAMETERS = [
  { code: 'SALARIO_MINIMO', name: 'Salario mínimo mensual', value: 130 },
  // 5 y 10 salarios mínimos llevados a semana: mensual × 12 / 52.
  {
    code: 'TOPE_IVSS_SEMANAL',
    name: 'Tope semanal IVSS (5 salarios mínimos)',
    value: 150,
  },
  {
    code: 'TOPE_RPE_SEMANAL',
    name: 'Tope semanal RPE (10 salarios mínimos)',
    value: 300,
  },
];

export const SAMPLE_INPUT_TYPES = [
  { code: 'BONO', name: 'Bonificación (monto)' },
  { code: 'DESC', name: 'Descuento (monto)' },
];

const rule = (
  partial: Pick<
    SalaryRule,
    'code' | 'name' | 'sequence' | 'amountType' | 'rate'
  > &
    Partial<SalaryRule>,
): SalaryRule => ({
  appearsOnPayslip: true,
  condition: 'always',
  quantitySource: 'one',
  quantityCode: null,
  amountFix: null,
  baseCodes: null,
  amountCapParam: null,
  ...partial,
});

/**
 * Estructura quincenal de referencia, tomada de la nómina venezolana de Binaural (ver
 * docs/requisitos.md §1). Las horas vienen del motor de asistencia.
 */
export const SAMPLE_BIWEEKLY_RULES: SalaryRule[] = [
  rule({
    code: 'BASIC',
    name: 'Salario (quincena)',
    sequence: 10,
    amountType: 'monthly_wage',
    rate: 50,
  }),
  rule({
    code: 'HED',
    name: 'Horas extra diurnas',
    sequence: 20,
    amountType: 'hourly_wage',
    rate: 150,
    quantitySource: 'worked_hours',
    quantityCode: 'OT_DAY',
    condition: 'nonzero_quantity',
  }),
  rule({
    code: 'HEN',
    name: 'Horas extra nocturnas',
    sequence: 30,
    amountType: 'hourly_wage',
    rate: 195,
    quantitySource: 'worked_hours',
    quantityCode: 'OT_NIGHT',
    condition: 'nonzero_quantity',
  }),
  rule({
    code: 'BN',
    name: 'Bono nocturno',
    sequence: 40,
    amountType: 'hourly_wage',
    rate: 30,
    quantitySource: 'worked_hours',
    quantityCode: 'NIGHT',
    condition: 'nonzero_quantity',
  }),
  rule({
    code: 'BONO',
    name: 'Bonificación',
    sequence: 45,
    amountType: 'fixed',
    amountFix: 1,
    rate: 100,
    quantitySource: 'input',
    quantityCode: 'BONO',
    condition: 'nonzero_quantity',
  }),
  rule({
    code: 'GROSS',
    name: 'Total asignaciones',
    sequence: 50,
    amountType: 'percentage_of',
    baseCodes: ['BASIC', 'HED', 'HEN', 'BN', 'BONO'],
    rate: 100,
    appearsOnPayslip: false,
  }),
  rule({
    code: 'IVSS',
    name: 'S.S.O. (IVSS) 4 %',
    sequence: 60,
    amountType: 'weekly_wage',
    amountCapParam: 'TOPE_IVSS_SEMANAL',
    quantitySource: 'mondays',
    rate: -4,
  }),
  rule({
    code: 'RPE',
    name: 'Paro forzoso (RPE) 0,5 %',
    sequence: 70,
    amountType: 'weekly_wage',
    amountCapParam: 'TOPE_RPE_SEMANAL',
    quantitySource: 'mondays',
    rate: -0.5,
  }),
  rule({
    code: 'FAOV',
    name: 'FAOV 1 %',
    sequence: 80,
    amountType: 'percentage_of',
    baseCodes: ['GROSS'],
    rate: -1,
  }),
  rule({
    code: 'DESC',
    name: 'Descuento',
    sequence: 85,
    amountType: 'fixed',
    amountFix: 1,
    rate: -100,
    quantitySource: 'input',
    quantityCode: 'DESC',
    condition: 'nonzero_quantity',
  }),
  rule({
    code: 'NET',
    name: 'Neto a pagar',
    sequence: 90,
    amountType: 'percentage_of',
    baseCodes: ['GROSS', 'IVSS', 'RPE', 'FAOV', 'DESC'],
    rate: 100,
    appearsOnPayslip: false,
  }),
];
