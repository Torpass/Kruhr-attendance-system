import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import type { Database } from './database.module';
import * as schema from './schema';

/**
 * Conexión para scripts de línea de comandos (migrar, seed), fuera de Nest.
 * Lee DATABASE_URL del entorno o de .env; el entorno tiene prioridad.
 */
export function connectForScript() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = z
    .url({ error: 'DATABASE_URL no está definida o no es una URL' })
    .parse(process.env.DATABASE_URL);

  // prepare: false → compatible con el Transaction pooler de Supabase.
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db: Database = drizzle(client, { schema, casing: 'snake_case' });
  return { client, db };
}
