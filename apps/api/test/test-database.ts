/**
 * Base de datos de los tests de integración. Nunca es la de desarrollo ni la de producción:
 * por defecto es `marcaje_test` en el Postgres de docker compose (`pnpm db:up`).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/marcaje_test';
