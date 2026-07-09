import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

export const CLAUDE_BIN = process.env.DIYSHED_CLAUDE_BIN || 'claude';

export const RESEARCH_TIMEOUT_MS = Number(process.env.DIYSHED_RESEARCH_TIMEOUT_MS) || 300000;

export const RESEARCH_CONCURRENCY = Math.min(
  2,
  Math.max(1, Number(process.env.DIYSHED_RESEARCH_CONCURRENCY) || 1)
);
