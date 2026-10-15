import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { connectForScript } from './script-client';

/**
 * Aplica las migraciones pendientes de apps/api/drizzle.
 * Se usa en lugar de `drizzle-kit migrate` para conectar con `prepare: false` (pooler de Supabase).
 * Drizzle no tiene migraciones "down": para revertir se escribe una migración nueva.
 */
async function main() {
  const { client, db } = connectForScript();
  try {
    await migrate(db, {
      migrationsFolder: resolve(__dirname, '../../drizzle'),
    });
    console.log('Migraciones aplicadas.');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
