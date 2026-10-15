import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  jsonb,
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
 * Esquema de la fase A (asistencia). Ver docs/requisitos.md §4.
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
