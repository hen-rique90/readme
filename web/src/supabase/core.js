// Núcleo do backend Supabase (sem dependência do Vite nem do supabase-js, para poder testar).
// db: { select(table, cols) → linhas [{pos, ...}], upsert(table, linhas, chave), remove(table, chave, ids) }
import { createFakeGas, loadBackend } from '../demo/fakeGas.js';
import { TABLES, cellText, columnsOf } from './schema.js';

export function createCore({ code, db }) {
  const LOCAL_ADMIN = 'local-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const b = loadBackend(code, createFakeGas());
  const { HEADERS, SHEETS, DEFAULT_CONFIG } = b;

  async function loadState() {
    const state = { sheets: {} };
    const snapshot = {};
    await Promise.all(
      Object.entries(TABLES).map(async ([key, table]) => {
        const cols = columnsOf(HEADERS[key]);
        const rows = await db.select(table, ['pos', ...cols]);
        const sheetRows = rows.map((r) => cols.map((c) => (r[c] ?? '') + ''));
        if (key === 'config') {
          // Banco novo começa com a configuração padrão; a senha do ADM é só interna
          if (!sheetRows.length) DEFAULT_CONFIG.forEach((r) => sheetRows.push(r.map(String)));
          const pass = sheetRows.find((r) => r[0] === 'adminPassword');
          if (pass) pass[1] = LOCAL_ADMIN;
          else sheetRows.push(['adminPassword', LOCAL_ADMIN, '']);
        }
        state.sheets[SHEETS[key]] = [HEADERS[key].slice(), ...sheetRows];
        const snap = { cols, maxPos: 0, rows: new Map() };
        rows.forEach((r) => {
          snap.maxPos = Math.max(snap.maxPos, Number(r.pos) || 0);
          snap.rows.set(String(r[cols[0]] ?? ''), cols.map((c) => (r[c] ?? '') + '').join('\u0001'));
        });
        snapshot[key] = snap;
      })
    );
    return { state, snapshot };
  }

  async function saveDiff(state, snapshot) {
    const changes = {};
    for (const [key, table] of Object.entries(TABLES)) {
      const snap = snapshot[key];
      const cols = snap.cols;
      const sheet = state.sheets[SHEETS[key]] || [HEADERS[key]];
      const seen = new Set();
      const fresh = [];
      const changed = [];
      let pos = snap.maxPos;
      sheet.slice(1).forEach((row) => {
        const values = cols.map((_, i) => cellText(row[i]));
        const id = values[0];
        if (!id || seen.has(id)) return;
        seen.add(id);
        if (key === 'config' && id === 'adminPassword') return; // nunca grava a senha interna
        const before = snap.rows.get(id);
        if (before === values.join('\u0001')) return;
        const rec = {};
        cols.forEach((c, i) => { rec[c] = values[i]; });
        if (before === undefined) {
          rec.pos = ++pos;
          fresh.push(rec);
        } else changed.push(rec);
      });
      const removed = [...snap.rows.keys()].filter((id) => !seen.has(id) && !(key === 'config' && id === 'adminPassword'));
      for (let i = 0; i < fresh.length; i += 500) await db.upsert(table, fresh.slice(i, i + 500), cols[0]);
      for (let i = 0; i < changed.length; i += 500) await db.upsert(table, changed.slice(i, i + 500), cols[0]);
      for (let i = 0; i < removed.length; i += 200) await db.remove(table, cols[0], removed.slice(i, i + 200));
      if (fresh.length || changed.length || removed.length) changes[table] = { novas: fresh.length, alteradas: changed.length, apagadas: removed.length };
    }
    return changes;
  }

  // Uma ação de ADM por vez
  let queue = Promise.resolve();
  function run(action, params = {}) {
    const job = async () => {
      const { state, snapshot } = await loadState();
      const gas = createFakeGas(state);
      const res = loadBackend(code, gas).call(action, { ...params, password: LOCAL_ADMIN });
      await saveDiff(gas.state, snapshot);
      return res;
    };
    const next = queue.then(job, job);
    queue = next.catch(() => {});
    return next;
  }

  return { run, loadState, saveDiff, HEADERS, SHEETS };
}
