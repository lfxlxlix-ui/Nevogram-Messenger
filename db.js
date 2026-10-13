// Persistent JSON state backed by PostgreSQL (Neon) when DATABASE_URL is configured.
// Local JSON storage remains available for development without DATABASE_URL.
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
function defaultState() { return { users: [], invites: [], chats: [], messages: [] }; }
let state;
try { state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { state = defaultState(); }
let pool = null;
let saveTimer = null;
let saveQueue = Promise.resolve();
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
}
async function init() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS nevogram_state (id integer PRIMARY KEY CHECK (id = 1), state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  const result = await pool.query('SELECT state FROM nevogram_state WHERE id = 1');
  if (result.rows.length) {
    state = result.rows[0].state;
    if (!state || typeof state !== 'object') state = defaultState();
    for (const key of ['users', 'invites', 'chats', 'messages']) if (!Array.isArray(state[key])) state[key] = [];
  } else {
    await pool.query('INSERT INTO nevogram_state (id, state) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(state)]);
  }
}
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (pool) {
      const snapshot = JSON.stringify(state);
      saveQueue = saveQueue.then(() => pool.query('UPDATE nevogram_state SET state = $1::jsonb, updated_at = now() WHERE id = 1', [snapshot])).catch(err => console.error('PostgreSQL save failed:', err.message));
    } else {
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); } catch (err) { console.error('Local save failed:', err.message); }
    }
  }, 50);
}
module.exports = { state, save, init };
