import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../config/env';
import { DB, PG_CLIENT } from './database.constants';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      // prepare: false → compatible con el Transaction pooler de Supabase (6543),
      // que no admite sentencias preparadas entre transacciones.
      useFactory: (config: ConfigService<Env, true>): Sql =>
        postgres(config.get('DATABASE_URL', { infer: true }), {
          max: 5,
          prepare: false,
        }),
    },
    {
      provide: DB,
      inject: [PG_CLIENT],
      useFactory: (client: Sql): Database =>
        drizzle(client, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown() {
    await this.client.end({ timeout: 5 });
  }
}
