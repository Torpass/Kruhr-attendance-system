Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'x'.repeat(32),
  DEMO_EMAIL: 'demo@marcaje.test',
  DEMO_PASSWORD: 'clave-segura',
});
