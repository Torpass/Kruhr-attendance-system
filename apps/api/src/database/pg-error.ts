/** Códigos de error de Postgres que la API traduce a respuestas HTTP. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_CHECK_VIOLATION = '23514';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

interface PgErrorFields {
  code?: string;
  constraint_name?: string;
}

/** Error de Postgres detrás de un error de Drizzle (que lo envuelve en `cause`). */
export function pgError(error: unknown): PgErrorFields | undefined {
  for (let current = error; current instanceof Error;) {
    const fields = current as Error & PgErrorFields;
    if (typeof fields.code === 'string') return fields;
    current = current.cause;
  }
  return undefined;
}
