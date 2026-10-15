import { TEST_DATABASE_URL } from './test-database';

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'x'.repeat(32),
});
