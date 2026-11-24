// Confere a função consulta_telefone (SQL do Supabase) contra a mesma consulta do Code.gs.
// Roda só quando há um Postgres local: CEG_PG="psql -h /caminho -p 5433 -U postgres" npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createFakeGas, loadBackend } from '../src/demo/fakeGas.js';
import { TABLES, columnsOf, cellText } from '../src/supabase/schema.js';

const PSQL = process.env.CEG_PG;
const ROOT = new URL('../../', import.meta.url).pathname;
const CODE = readFileSync(ROOT + 'apps-script/Code.gs', 'utf8');

const sql = (db, text) => execSync(`${PSQL} -d ${db} -v ON_ERROR_STOP=1 -qAt -c "set client_min_messages=warning" -f -`, { input: text, encoding: 'utf8' });
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const STUB = `
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('ceg.jwt', true), ''), '{}')::jsonb $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id serial, bucket_id text, name text);
alter table storage.objects enable row level security;
`;

test('supabase: consulta_telefone dá o mesmo resultado que o Code.gs', { skip: !PSQL && 'sem Postgres local (CEG_PG)' }, () => {
  const db = 'ceg_teste';
  execSync(`${PSQL} -q -c "set client_min_messages=warning" -c "drop database if exists ${db}" -c "create database ${db}"`);
  const schema = readFileSync(ROOT + 'supabase/schema.sql', 'utf8');
  sql(db, STUB + schema);
  sql(db, schema); // pode rodar de novo sem erro

  // Monta os dados com o próprio Code.gs
  const gas = createFakeGas();
  const api = loadBackend(CODE, gas);
  api.call('catalog');
  const cfg = gas.state.sheets.Config;
  cfg.find((r) => r[0] === 'adminPassword')[1] = 'x';
  cfg.find((r) => r[0] === 'pixKey')[1] = 'pix@loja.com';
  const admin = (a, p = {}) => api.call(a, { ...p, password: 'x' });
  const sale = (name, phone, member, extras, paid, extra = {}) => admin('adminCreateSale', {
    buyer: { name, whatsapp: phone },
    product: { name: "Album Arirang - Target Korea vers. — " + member, member, category: 'Álbuns', image: 'https://x/' + member + '.jpg' },
    batch: 'CEG EUA - Album Arirang', unitPrice: 30, status: 'Comprado', note: "chega em dezembro, d'água",
    payment: { mode: 'avista', paid }, extras, ...extra
  });
  sale('Angy', '(65) 9 9246-6554', 'Jin', [{ kind: 'frete', amount: 7.5, paid: true }], true);
  const s2 = sale('Angy', '65992466554', 'Jimin', [{ kind: 'frete', amount: 7.5, paid: false, dueDate: '2026-12-10' }, { kind: 'alfandega', amount: 12, paid: false }], false);
  admin('addCharge', { orderId: s2.order.orderId, description: 'Frete internacional', amount: 5 });
  sale('Angy', '65992466554', 'RM', [], false, { payment: { mode: 'parcelado', installmentDates: ['2026-12-01', '2027-01-01'], paidInstallments: 1 } });
  const s4 = sale('Angy', '65992466554', 'V', [], false);
  admin('setOrderStatus', { orderId: s4.order.orderId, status: 'Cancelado' });
  sale('Outra', '11999990000', 'Suga', [], true);

  // Copia as abas para as tabelas
  const inserts = [];
  for (const [key, table] of Object.entries(TABLES)) {
    const rows = gas.state.sheets[api.SHEETS[key]] || [];
    const cols = columnsOf(api.HEADERS[key]);
    rows.slice(1).forEach((r, i) => {
      inserts.push(`insert into public.${table} (pos, ${cols.join(', ')}) values (${i + 1}, ${cols.map((_, c) => lit(cellText(r[c]))).join(', ')});`);
    });
  }
  sql(db, inserts.join('\n'));

  for (const phone of ['+55 (65) 99246-6554', '11999990000', '65900000000']) {
    const expected = api.call('consultaTelefone', { whatsapp: phone });
    const got = JSON.parse(sql(db, `select public.consulta_telefone(${lit(phone)})`));
    delete expected.ok;
    expected.config = { ...expected.config };
    for (const k of Object.keys(expected.config)) expected.config[k] = String(expected.config[k] ?? '');
    assert.deepEqual(got, JSON.parse(JSON.stringify(expected)), phone);
  }
  assert.throws(() => sql(db, `select public.consulta_telefone('6592')`), /DDD/);

  // Segurança: sem ser ADM não lê as tabelas; a função pública funciona
  const asAnon = (q) => sql(db, `set role anon; ${q}`);
  sql(db, 'grant usage on schema public to anon, authenticated; grant select on all tables in schema public to anon, authenticated;');
  assert.equal(asAnon('select count(*) from public.pedidos').trim(), '0');
  assert.match(asAnon("select public.consulta_telefone('65992466554')"), /Angy/);
  const asUser = (email, q) => sql(db, `set ceg.jwt = '{"email":"${email}"}'; set role authenticated; ${q}`);
  assert.equal(asUser('estranha@x.com', 'select count(*) from public.pedidos').trim(), '0');
  sql(db, "insert into public.admins values ('ADM@loja.com')");
  assert.notEqual(asUser('adm@loja.com', 'select count(*) from public.pedidos').trim(), '0');
});
