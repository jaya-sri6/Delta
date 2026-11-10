import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from current working directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function cleanEnv(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface AppConfig {
  port: number;
  databasePath: string;
  openaiApiKey?: string;
  openaiModel: string;
  tavilyApiKey?: string;
  userTimezone: string;
  nodeEnv: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/delta.db'),
  openaiApiKey: cleanEnv(process.env.OPENAI_API_KEY),
  openaiModel: cleanEnv(process.env.OPENAI_MODEL) || 'gpt-4o',
  tavilyApiKey: cleanEnv(process.env.TAVILY_API_KEY),
  userTimezone: cleanEnv(process.env.USER_TIMEZONE) || 'Asia/Kolkata',
  nodeEnv: cleanEnv(process.env.NODE_ENV) || 'development',
};
