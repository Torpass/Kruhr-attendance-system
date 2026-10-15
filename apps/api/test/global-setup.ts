import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { TEST_DATABASE_URL } from './test-database';

/** Crea la base de tests si no existe y le aplica las migraciones. */
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(name)) {
    throw new Error(`La base de tests debe llamarse *test*: ${name}`);
  }

  const admin = postgres({
    ...parse(url),
    database: 'postgres',
    max: 1,
    onnotice: () => {},
  });
  try {
    const [exists] =
      await admin`select 1 from pg_database where datname = ${name}`;
    if (!exists) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, '../drizzle'),
    });
  } finally {
    await client.end();
  }
}

function parse(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
