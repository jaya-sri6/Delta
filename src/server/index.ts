import { buildApp } from './app.js';
import { config } from './config.js';
import { getDatabase } from './db/database.js';

async function startServer() {
  try {
    const db = getDatabase(config.databasePath);
    const app = await buildApp(db);

    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    console.log(`\n======================================================`);
    console.log(`  DELTA — An AI that knows what changed.`);
    console.log(`  Fastify API Server running on http://localhost:${config.port}`);
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Timezone: ${config.userTimezone}`);
    console.log(`  Database: ${config.databasePath}`);
    console.log(`------------------------------------------------------`);
    console.log(`  Startup Diagnostics:`);
    console.log(`  TAVILY_API_KEY: ${config.tavilyApiKey ? `CONFIGURED (length: ${config.tavilyApiKey.length})` : 'MISSING'}`);
    console.log(`  OPENAI_API_KEY: ${config.openaiApiKey ? `CONFIGURED (length: ${config.openaiApiKey.length})` : 'MISSING'}`);
    console.log(`  Search Diagnostic Endpoint: http://localhost:${config.port}/api/health/search`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Failed to start DELTA server:', err);
    process.exit(1);
  }
}

startServer();

