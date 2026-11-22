import { Pool } from 'pg';

const globalPool = globalThis as typeof globalThis & { hourglassPool?: Pool };
export const pool = globalPool.hourglassPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== 'production') globalPool.hourglassPool = pool;
