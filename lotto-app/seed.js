// seed.js — load seed_draws.json into the draws table. Idempotent.
// Run once after deploy:  npm run seed
// ---------------------------------------------------------------------------
import pg from 'pg';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draws (
      lottery TEXT NOT NULL DEFAULT 'government',
      date DATE NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (lottery, date)
    );`);
  for (const sql of [
    `ALTER TABLE draws ADD COLUMN IF NOT EXISTS lottery TEXT NOT NULL DEFAULT 'government'`,
    `ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_pkey`,
    `ALTER TABLE draws ADD PRIMARY KEY (lottery, date)`,
  ]) { try { await pool.query(sql); } catch { /* ok */ } }

  const file = path.join(__dirname, 'seed_draws.json');
  const draws = JSON.parse(fs.readFileSync(file, 'utf-8'));
  let n = 0;
  for (const d of draws) {
    await pool.query(
      `INSERT INTO draws(lottery, date, data) VALUES('government',$1,$2)
       ON CONFLICT (lottery, date) DO UPDATE SET data=$2`,
      [d.date, d]
    );
    n++;
  }
  console.log(`seed สำเร็จ: ${n} งวด`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
