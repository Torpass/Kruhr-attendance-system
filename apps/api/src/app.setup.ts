import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';

/** Middleware y prefijos comunes a producción y a los tests e2e. */
export function setupApp(
  app: NestExpressApplication,
  config: ConfigService<Env, true>,
) {
  // Solo los últimos N saltos de X-Forwarded-For son confiables; el resto lo controla el cliente.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
