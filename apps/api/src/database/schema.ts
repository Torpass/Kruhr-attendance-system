import { AMOUNT_TYPES, QUANTITY_SOURCES, RULE_CONDITIONS } from '@marcaje/core';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * Esquema de la fase A (asistencia) y de la fase B (nómina). Ver docs/requisitos.md §5.
 * Los nombres de columna se derivan en snake_case (`casing` en drizzle.config.ts y DatabaseModule).
 * La exclusión de turnos solapados vive en una migración SQL aparte (requiere btree_gist).
 */

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow();
const slugFormat = (column: AnyPgColumn) =>
  sql`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`;

export const staffRole = pgEnum('staff_role', [
  'superadmin',
  'admin',
  'analyst',
]);

/** Empresa padre: agrupa sub-empresas y comparte el catálogo de nómina. */
export const companyGroups = pgTable(
  'company_groups',
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    currencyCode: char({ length: 3 }).notNull().default('VES'),
    createdAt: createdAt(),
  },
  (t) => [check('company_groups_slug_format', slugFormat(t.slug))],
);

/** Sub-empresa: donde trabajan los colaboradores. El slug identifica a la empresa en el login del colaborador. */
export const companies = pgTable(
  'companies',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => companyGroups.id),
    name: text().notNull(),
    slug: text().notNull().unique(),
    rif: text(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    // Destino de las FKs compuestas que obligan a quedarse dentro del mismo grupo.
    unique('companies_id_group_id_key').on(t.id, t.groupId),
    index('companies_group_id_idx').on(t.groupId),
    check('companies_slug_format', slugFormat(t.slug)),
  ],
);

/** Usuarios de gestión (superadmin, admin, analista). Entran con correo y contraseña. */
export const users = pgTable(
  'users',
  {
    id: id(),
    role: staffRole().notNull(),
    groupId: uuid().references(() => companyGroups.id),
    name: text().notNull(),
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('users_id_group_id_key').on(t.id, t.groupId),
    index('users_group_id_idx').on(t.groupId),
    // Solo el superadmin vive fuera de un grupo.
    check(
      'users_superadmin_without_group',
      sql`(${t.role} = 'superadmin') = (${t.groupId} is null)`,
    ),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

/** Empresas asignadas a un admin o analista. Las FKs compuestas impiden asignar empresas de otro grupo. */
export const userCompanies = pgTable(
  'user_companies',
  {
    userId: uuid().notNull(),
    companyId: uuid().notNull(),
    groupId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    foreignKey({
      name: 'user_companies_user_fk',
      columns: [t.userId, t.groupId],
      foreignColumns: [users.id, users.groupId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'user_companies_company_fk',
      columns: [t.companyId, t.groupId],
      foreignColumns: [companies.id, companies.groupId],
    }).onDelete('cascade'),
    index('user_companies_company_id_idx').on(t.companyId),
  ],
);

/**
 * Colaboradores: marcan desde el celular. Entran con cédula + PIN.
 * Quien trabaja en varias empresas tiene un registro en cada una y elige dónde marcar al entrar.
 */
export const employees = pgTable(
  'employees',
  {
    id: id(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id),
    cedula: text().notNull(),
    name: text().notNull(),
    pinHash: text().notNull(),
    active: boolean().notNull().default(true),
    hiredOn: date(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('employees_company_id_cedula_key').on(t.companyId, t.cedula),
    unique('employees_id_company_id_key').on(t.id, t.companyId),
    check('employees_cedula_digits', sql`${t.cedula} ~ '^[0-9]{5,10}$'`),
  ],
);

/** Un turno es una entrada y su salida. Las horas se guardan en UTC y se interpretan en America/Caracas. */
export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    companyId: uuid().notNull(),
    employeeId: uuid().notNull(),
    clockIn: timestamp({ withTimezone: true }).notNull(),
    clockOut: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // El turno pertenece a la misma empresa que su colaborador.
    foreignKey({
      name: 'shifts_employee_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [employees.id, employees.companyId],
    }),
    unique('shifts_id_company_id_key').on(t.id, t.companyId),
    check(
      'shifts_clock_out_after_clock_in',
      sql`${t.clockOut} is null or ${t.clockOut} > ${t.clockIn}`,
    ),
    // Un solo turno abierto por colaborador, incluso con dos taps simultáneos.
    uniqueIndex('shifts_one_open_per_employee')
      .on(t.employeeId)
      .where(sql`${t.clockOut} is null`),
    index('shifts_company_id_clock_in_idx').on(t.companyId, t.clockIn),
    index('shifts_employee_id_clock_in_idx').on(t.employeeId, t.clockIn),
  ],
);

/** Historial de correcciones: el turno queda corregido y aquí se guarda el antes, el después, quién y por qué. */
export const shiftCorrections = pgTable(
  'shift_corrections',
  {
    id: id(),
    shiftId: uuid().notNull(),
    companyId: uuid().notNull(),
    correctedBy: uuid()
      .notNull()
      .references(() => users.id),
    reason: text().notNull(),
    // NULL cuando RRHH crea el turno a mano (olvido total).
    before: jsonb().$type<ShiftSnapshot>(),
    after: jsonb().$type<ShiftSnapshot>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'shift_corrections_shift_fk',
      columns: [t.shiftId, t.companyId],
      foreignColumns: [shifts.id, shifts.companyId],
    }),
    index('shift_corrections_shift_id_idx').on(t.shiftId),
    check(
      'shift_corrections_reason_required',
      sql`length(trim(${t.reason})) >= 5`,
    ),
  ],
);

export interface ShiftSnapshot {
  clockIn: string;
  clockOut: string | null;
}

/* ───────────────────────── Fase B: nómina (docs/requisitos.md §5.2) ───────────────────────── */

const money = (precision = 14, scale = 2) =>
  numeric({ precision, scale, mode: 'number' });

export const schedulePay = pgEnum('schedule_pay', [
  'weekly',
  'semi_monthly',
  'monthly',
]);
export const ruleCondition = pgEnum('rule_condition', RULE_CONDITIONS);
export const quantitySource = pgEnum('quantity_source', QUANTITY_SOURCES);
export const amountType = pgEnum('amount_type', AMOUNT_TYPES);
export const payrollRunState = pgEnum('payroll_run_state', [
  'computed',
  'validated',
  'paid',
  'cancelled',
]);

const ruleCode = (column: AnyPgColumn) =>
  sql`${column} ~ '^[A-Z][A-Z0-9_]{0,29}$'`;

/** Parámetros de la nómina con valores por fecha (salario mínimo, topes). */
export const payrollParameters = pgTable(
  'payroll_parameters',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => companyGroups.id),
    code: text().notNull(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payroll_parameters_group_id_code_key').on(t.groupId, t.code),
    check('payroll_parameters_code_format', ruleCode(t.code)),
  ],
);

export const payrollParameterValues = pgTable(
  'payroll_parameter_values',
  {
    parameterId: uuid()
      .notNull()
      .references(() => payrollParameters.id, { onDelete: 'cascade' }),
    dateFrom: date().notNull(),
    value: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.parameterId, t.dateFrom] })],
);

/** Tipos de entrada manual de un recibo (bonificación, descuento…). */
export const inputTypes = pgTable(
  'input_types',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => companyGroups.id),
    code: text().notNull(),
    name: text().notNull(),
  },
  (t) => [
    unique('input_types_group_id_code_key').on(t.groupId, t.code),
    check('input_types_code_format', ruleCode(t.code)),
  ],
);

export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: id(),
    groupId: uuid()
      .notNull()
      .references(() => companyGroups.id),
    code: text().notNull(),
    name: text().notNull(),
    schedulePay: schedulePay().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique('salary_structures_group_id_code_key').on(t.groupId, t.code),
    unique('salary_structures_id_group_id_key').on(t.id, t.groupId),
    check('salary_structures_code_format', ruleCode(t.code)),
  ],
);

/** Reglas de una estructura, con tipos fijos (sin fórmulas libres ni categorías). */
export const salaryRules = pgTable(
  'salary_rules',
  {
    id: id(),
    structureId: uuid()
      .notNull()
      .references(() => salaryStructures.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    name: text().notNull(),
    sequence: integer().notNull(),
    appearsOnPayslip: boolean().notNull().default(true),
    condition: ruleCondition().notNull().default('always'),
    quantitySource: quantitySource().notNull().default('one'),
    quantityCode: text(),
    amountType: amountType().notNull(),
    amountFix: money(14, 4),
    baseCodes: text().array(),
    amountCapParam: text(),
    rate: money(9, 4).notNull().default(100),
  },
  (t) => [
    unique('salary_rules_structure_id_code_key').on(t.structureId, t.code),
    unique('salary_rules_structure_id_sequence_key').on(
      t.structureId,
      t.sequence,
    ),
    check('salary_rules_code_format', ruleCode(t.code)),
  ],
);

/** Contrato (hr.version en Odoo): salario mensual y estructura vigentes entre dos fechas. */
export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    companyId: uuid().notNull(),
    employeeId: uuid().notNull(),
    structureId: uuid()
      .notNull()
      .references(() => salaryStructures.id),
    wage: money().notNull(),
    dateStart: date().notNull(),
    dateEnd: date(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'contracts_employee_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [employees.id, employees.companyId],
    }),
    index('contracts_employee_id_idx').on(t.employeeId),
    check('contracts_wage_positive', sql`${t.wage} > 0`),
    check(
      'contracts_dates',
      sql`${t.dateEnd} is null or ${t.dateEnd} >= ${t.dateStart}`,
    ),
  ],
);

/** Lote de recibos de una empresa para un período y una estructura. */
export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: id(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id),
    structureId: uuid()
      .notNull()
      .references(() => salaryStructures.id),
    name: text().notNull(),
    dateFrom: date().notNull(),
    dateTo: date().notNull(),
    state: payrollRunState().notNull().default('computed'),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('payroll_runs_id_company_id_key').on(t.id, t.companyId),
    index('payroll_runs_company_id_date_from_idx').on(t.companyId, t.dateFrom),
    check('payroll_runs_dates', sql`${t.dateTo} >= ${t.dateFrom}`),
  ],
);

export const payslips = pgTable(
  'payslips',
  {
    id: id(),
    runId: uuid().notNull(),
    companyId: uuid().notNull(),
    employeeId: uuid().notNull(),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id),
    wage: money().notNull(),
    earnings: money().notNull(),
    deductions: money().notNull(),
    net: money().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'payslips_run_fk',
      columns: [t.runId, t.companyId],
      foreignColumns: [payrollRuns.id, payrollRuns.companyId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'payslips_employee_fk',
      columns: [t.employeeId, t.companyId],
      foreignColumns: [employees.id, employees.companyId],
    }),
    unique('payslips_run_id_employee_id_key').on(t.runId, t.employeeId),
    index('payslips_employee_id_idx').on(t.employeeId),
  ],
);

/** Copia de las horas y entradas con que se calculó el recibo. */
export const payslipWorkedHours = pgTable(
  'payslip_worked_hours',
  {
    payslipId: uuid()
      .notNull()
      .references(() => payslips.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    minutes: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.payslipId, t.code] })],
);

export const payslipInputs = pgTable(
  'payslip_inputs',
  {
    payslipId: uuid()
      .notNull()
      .references(() => payslips.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    amount: money().notNull(),
  },
  (t) => [primaryKey({ columns: [t.payslipId, t.code] })],
);

/** Líneas del recibo. Copian código y nombre de la regla: el recibo no cambia si la regla se edita. */
export const payslipLines = pgTable(
  'payslip_lines',
  {
    id: id(),
    payslipId: uuid()
      .notNull()
      .references(() => payslips.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    name: text().notNull(),
    sequence: integer().notNull(),
    quantity: money(12, 2).notNull(),
    amount: money(14, 4).notNull(),
    rate: money(9, 4).notNull(),
    total: money().notNull(),
    appearsOnPayslip: boolean().notNull(),
  },
  (t) => [index('payslip_lines_payslip_id_idx').on(t.payslipId)],
);
