import {
  computePayslip,
  countMondays,
  roundMoney,
  validateRules,
  workedMinutesFromAttendance,
  type PayslipInput,
  type SalaryRule,
} from './payroll';
import { SAMPLE_BIWEEKLY_RULES, SAMPLE_PARAMETERS } from './payroll-sample';

const parameters = Object.fromEntries(
  SAMPLE_PARAMETERS.map((p) => [p.code, p.value]),
);
const firstHalf = { from: '2026-10-01', to: '2026-10-15' }; // lunes 5 y 12

/** Luis con los dos turnos del enunciado: 2 h extra diurna, 2,5 h extra nocturna, 3 h nocturna. */
const luis: PayslipInput = {
  wage: 3600,
  rules: SAMPLE_BIWEEKLY_RULES,
  workedMinutes: workedMinutesFromAttendance({
    worked: 1230,
    nightOrdinary: 180,
    overtimeDay: 120,
    overtimeNight: 150,
  }),
  inputs: {},
  parameters,
  period: firstHalf,
};

const totals = (input: PayslipInput) =>
  Object.fromEntries(computePayslip(input).lines.map((l) => [l.code, l.total]));

describe('computePayslip (estructura quincenal de referencia)', () => {
  it('calcula el recibo verificado a mano', () => {
    // Hora = 3600 / 30 / 8 = 15. Semana = 3600 × 12 / 52 = 830,77 → topada a 150 y 300.
    expect(totals(luis)).toEqual({
      BASIC: 1800, // 3600 × 50 %
      HED: 45, // 15 × 2 × 150 %
      HEN: 73.13, // 15 × 2,5 × 195 % = 73,125
      BN: 13.5, // 15 × 3 × 30 %
      GROSS: 1931.63,
      IVSS: -12, // 150 × 2 lunes × −4 %
      RPE: -3, // 300 × 2 lunes × −0,5 %
      FAOV: -19.32, // 1931,63 × −1 %
      NET: 1897.31,
    });
    expect(computePayslip(luis)).toMatchObject({
      earnings: 1931.63,
      deductions: -34.32,
      net: 1897.31,
    });
  });

  it('omite las reglas condicionadas sin cantidad, y las demás reglas las ven en 0', () => {
    const result = computePayslip({
      ...luis,
      workedMinutes: { WORK: 4800, NIGHT: 0, OT_DAY: 0, OT_NIGHT: 0 },
    });
    expect(result.lines.map((l) => l.code)).toEqual([
      'BASIC',
      'GROSS',
      'IVSS',
      'RPE',
      'FAOV',
      'NET',
    ]);
    expect(result.net).toBe(1800 - 12 - 3 - 18);
  });

  it('usa las entradas manuales: bonificación y descuento', () => {
    const t = totals({ ...luis, inputs: { BONO: 200, DESC: 50 } });
    expect(t.BONO).toBe(200);
    expect(t.DESC).toBe(-50);
    expect(t.GROSS).toBe(2131.63);
    expect(t.NET).toBe(roundMoney(2131.63 - 12 - 3 - 21.32 - 50));
  });

  it('el tope no aplica cuando el salario semanal es menor', () => {
    const t = totals({ ...luis, wage: 520 }); // semana = 120 < 150
    expect(t.IVSS).toBe(-9.6); // 120 × 2 × −4 %
  });

  it('falla si falta un parámetro de tope', () => {
    expect(() => computePayslip({ ...luis, parameters: {} })).toThrow(
      'Falta el parámetro TOPE_IVSS_SEMANAL',
    );
  });
});

describe('validateRules', () => {
  const base = SAMPLE_BIWEEKLY_RULES[0];
  const with_ = (changes: Partial<SalaryRule>) => [{ ...base, ...changes }];

  it('acepta la estructura de referencia', () => {
    expect(validateRules(SAMPLE_BIWEEKLY_RULES)).toEqual([]);
  });

  it.each([
    ['código en minúsculas', with_({ code: 'basic' }), 'mayúsculas'],
    [
      'horas desconocidas',
      with_({ quantitySource: 'worked_hours', quantityCode: 'X' }),
      'WORK',
    ],
    ['fijo sin monto', with_({ amountType: 'fixed' }), 'monto fijo'],
    [
      'porcentaje sin base',
      with_({ amountType: 'percentage_of' }),
      'qué reglas suma',
    ],
  ])('rechaza %s', (_caso, rules, message) => {
    expect(validateRules(rules).join()).toContain(message);
  });

  it('una regla solo puede sumar reglas de secuencia menor', () => {
    const errors = validateRules([
      {
        ...base,
        code: 'TOTAL',
        sequence: 5,
        amountType: 'percentage_of',
        baseCodes: ['BASIC'],
      },
      base,
    ]);
    expect(errors.join()).toContain('BASIC no es una regla anterior');
  });

  it('rechaza códigos y secuencias repetidos', () => {
    const errors = validateRules([base, { ...base, name: 'Otra' }]);
    expect(errors.join()).toMatch(/código repetido.*secuencia 10/);
  });
});

describe('utilidades', () => {
  it('cuenta los lunes del período', () => {
    expect(countMondays(firstHalf)).toBe(2);
    expect(countMondays({ from: '2026-10-05', to: '2026-10-05' })).toBe(1);
    expect(countMondays({ from: '2026-10-16', to: '2026-10-31' })).toBe(2); // 19 y 26
  });

  it('redondea a céntimos de forma simétrica', () => {
    expect(roundMoney(73.125)).toBe(73.13);
    expect(roundMoney(-19.3163)).toBe(-19.32);
    expect(roundMoney(-0.005)).toBe(-0.01);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});
