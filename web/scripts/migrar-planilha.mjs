// Converte as abas da planilha (valores como o Google Sheets mostra) em SQL para o Supabase.
// Uso: node scripts/migrar-planilha.mjs abas.json > migracao.sql
//   abas.json = { "Pedidos": [[cabeçalho...], [linha...]], "Cobranças": [...], ... }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeGas, loadBackend } from '../src/demo/fakeGas.js';
import { TABLES, columnsOf } from '../src/supabase/schema.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = loadBackend(readFileSync(root + 'apps-script/Code.gs', 'utf8'), createFakeGas());
const sheets = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// Colunas de data e hora (viram ISO). As de "dia" (vencimento etc.) ficam como estão: o sistema entende dd/mm/aaaa.
const TIMESTAMPS = ['Data', 'Criada em', 'Paga em', 'Último lembrete', 'Último acesso', 'Respondida em', 'Criado em'];

// "15/11/2026 11:53:00" (horário de Brasília) → ISO
function toIso(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(v).trim());
  if (!m) return v;
  const [, d, mo, y, h = '12', mi = '00', s = '00'] = m;
  const p = (n) => String(n).padStart(2, '0');
  return new Date(`${y}-${p(mo)}-${p(d)}T${p(h)}:${mi}:${p(s)}-03:00`).toISOString();
}

const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const out = ['begin;'];
const report = [];
for (const [key, table] of Object.entries(TABLES)) {
  const headers = backend.HEADERS[key];
  const values = sheets[backend.SHEETS[key]];
  if (!values || !values.length) continue;
  const cols = columnsOf(headers);
  const sheetHeader = values[0].map((h) => String(h).trim());
  // Cada coluna do banco pega a coluna da planilha com o mesmo cabeçalho (a ordem pode variar)
  const idx = headers.map((h, i) => {
    const j = sheetHeader.indexOf(h);
    return j >= 0 ? j : i;
  });
  const seen = new Set();
  let n = 0;
  values.slice(1).forEach((row) => {
    const rec = headers.map((h, i) => {
      const raw = row[idx[i]] ?? '';
      return TIMESTAMPS.includes(h) ? toIso(raw) : String(raw).trim();
    });
    const id = rec[0];
    if (!id || seen.has(id)) return;
    if (key === 'config' && id === 'adminPassword') return; // senha antiga não vai para o banco
    if (key === 'clients') headers.forEach((h, i) => { if (h === 'Senha (protegida)' || h === 'Sal') rec[i] = ''; });
    seen.add(id);
    n++;
    out.push(`insert into public.${table} (pos, ${cols.join(', ')}) values (${n}, ${rec.map(lit).join(', ')})
  on conflict (${cols[0]}) do update set ${['pos', ...cols.slice(1)].map((c) => `${c} = excluded.${c}`).join(', ')};`);
  });
  report.push(`${table}: ${n} linha(s)`);
}
out.push('commit;');
console.log(out.join('\n'));
console.error(report.join('\n'));
