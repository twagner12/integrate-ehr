import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

// Convenience wrapper: db.query(sql, params)
export const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};

export default pool;
