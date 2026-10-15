import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // Proxies de confianza delante de la API (prod: Vercel rewrite + Render = 2).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url(),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(28_800),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Variables de entorno inválidas:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
