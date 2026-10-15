import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Las variables ya definidas en el entorno tienen prioridad sobre .env.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
