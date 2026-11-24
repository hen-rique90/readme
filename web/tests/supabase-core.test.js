// Núcleo do backend Supabase com um banco simulado em memória.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/supabase/core.js';

const CODE = readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');

function memoryDb() {
  const tables = {};
  const log = [];
  return {
    tables,
    log,
    async select(table, cols) {
      return (tables[table] || []).slice().sort((a, b) => a.pos - b.pos).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ''])));
    },
    async upsert(table, rows, key) {
      const t = (tables[table] ||= []);
      rows.forEach((r) => {
        const i = t.findIndex((x) => x[key] === r[key]);
        if (i >= 0) t[i] = { ...t[i], ...r };
        else t.push({ pos: 0, ...r });
      });
      log.push(['upsert', table, rows.length]);
    },
    async remove(table, key, ids) {
      tables[table] = (tables[table] || []).filter((r) => !ids.includes(r[key]));
      log.push(['remove', table, ids.length]);
    }
  };
}

test('supabase (núcleo): grava só o que mudou e nunca a senha interna', async () => {
  const db = memoryDb();
  const core = createCore({ code: CODE, db });
  const sale = await core.run('adminCreateSale', {
    buyer: { name: 'Angy', whatsapp: '65992466554' },
    product: { name: 'Album Arirang — Jin', member: 'Jin' }, batch: 'CEG EUA', unitPrice: 30,
    payment: { mode: 'avista', paid: false }, extras: [{ kind: 'frete', amount: 7.5, paid: true }]
  });
  assert.equal(sale.ok, true, sale.error);
  // banco novo: configuração padrão gravada, sem a senha
  assert.ok(db.tables.config.some((r) => r.chave === 'pixKey'));
  assert.ok(!db.tables.config.some((r) => r.chave === 'adminPassword'));
  assert.equal(db.tables.pedidos.length, 1);
  assert.equal(db.tables.pedidos[0].nome, 'Angy');
  assert.equal(db.tables.pedidos[0].pos, 1);
  assert.match(db.tables.pedidos[0].data, /^\d{4}-\d{2}-\d{2}T/); // data em ISO
  assert.equal(db.tables.cobrancas.length, 2);

  // abrir o painel não grava nada
  db.log.length = 0;
  const data = await core.run('adminData');
  assert.equal(data.ok, true);
  assert.equal(data.orders.length, 1);
  assert.deepEqual(db.log, []);

  // marcar uma cobrança como paga altera só aquela linha
  const pending = data.charges.find((c) => c.status === 'Pendente');
  await core.run('setChargeStatus', { chargeId: pending.chargeId, status: 'Pago' });
  assert.deepEqual(db.log, [['upsert', 'cobrancas', 1]]);
  assert.equal(db.tables.cobrancas.find((c) => c.id_cobranca === pending.chargeId).status, 'Pago');

  // apagar cobrança remove a linha
  const extra = await core.run('addCharge', { orderId: sale.order.orderId, description: 'Taxa alfândega', amount: 12 });
  assert.equal(extra.ok, true, extra.error);
  const before = db.tables.cobrancas.length;
  const del = await core.run('deleteCharge', { chargeId: extra.charge.chargeId });
  assert.equal(del.ok, true, del.error);
  const row = db.tables.cobrancas.find((c) => c.id_cobranca === extra.charge.chargeId);
  assert.ok(db.tables.cobrancas.length === before - 1 || row.status === 'Cancelada');

  // duas ações ao mesmo tempo: as duas entram (uma depois da outra)
  const sale2 = (m) => core.run('adminCreateSale', { buyer: { name: 'Angy', whatsapp: '65992466554' }, product: { name: 'Album — ' + m, member: m }, unitPrice: 10, payment: { mode: 'avista' } });
  await Promise.all([sale2('RM'), sale2('V')]);
  assert.equal(db.tables.pedidos.length, 3);
  assert.deepEqual(db.tables.pedidos.map((p) => p.pos).sort(), [1, 2, 3]);

  // consulta pelo telefone igual à do Apps Script
  const r = await core.run('consultaTelefone', { whatsapp: '(65) 99246-6554' });
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].valorFrete, 7.5);
});
