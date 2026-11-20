import { buildApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function main(): Promise<void> {
  await connectDb();
  console.log('MongoDB connected');

  const app = buildApp();
  app.listen(env.PORT, () => {
    console.log(`TIFFINO API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
