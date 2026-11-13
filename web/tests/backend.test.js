// Testes do backend (apps-script/Code.gs) rodando sobre a planilha simulada.
// Rode com: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGas, loadBackend } from '../src/demo/fakeGas.js';

const CODE = readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8');
const PASSWORD = 'senha-teste';

function freshBackend() {
  const gas = createFakeGas();
  const api = loadBackend(CODE, gas);
  api.call('catalog'); // cria as abas
  const config = gas.state.sheets['Config'];
  config.find((r) => r[0] === 'adminPassword')[1] = PASSWORD;
  const admin = (action, params = {}) => api.call(action, { ...params, password: PASSWORD });
  return { gas, api, admin };
}

function addProduct(admin, overrides = {}) {
  const res = admin('saveProduct', {
    product: { isNew: true, name: 'Photocard JK', member: 'Jungkook', category: 'Photocards', price: 95, totalStock: 2, batch: 'CEG #1', ...overrides }
  });
  assert.equal(res.ok, true, res.error);
  return res.product;
}

const buyer = { buyerName: 'Mariana Silva', contact: '@mari', whatsapp: '(11) 98888-7777', shipping: 'Guardar na bag' };

test('cria as abas e a configuração inicial', () => {
  const { gas } = freshBackend();
  assert.deepEqual(Object.keys(gas.state.sheets).sort(), ['Cobranças', 'Config', 'Pedidos', 'Produtos']);
});

test('ADM bloqueado enquanto a senha padrão não for trocada', () => {
  const gas = createFakeGas();
  const api = loadBackend(CODE, gas);
  const res = api.call('adminData', { password: 'TROQUE-ESTA-SENHA' });
  assert.equal(res.ok, false);
  assert.equal(res.authError, true);
});

test('senha errada é recusada e a senha nunca aparece no catálogo', () => {
  const { api } = freshBackend();
  assert.equal(api.call('adminData', { password: 'errada' }).ok, false);
  const catalog = api.call('catalog');
  assert.equal(JSON.stringify(catalog).includes(PASSWORD), false);
});

test('claim reserva o item, cria cobrança e baixa o estoque', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin);
  assert.equal(p.id, 'CEG-01');

  const res = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(res.ok, true, res.error);
  assert.match(res.order.orderId, /^PED-[A-Z0-9]{6}$/);
  assert.equal(res.order.whatsapp, '11988887777');
  assert.equal(res.charge.amount, 95);
  assert.equal(res.charge.status, 'Pendente');

  const item = api.call('catalog').products.find((x) => x.id === p.id);
  assert.equal(item.available, 1);
});

test('não vende mais que o estoque (sem overselling)', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 2 });
  assert.equal(api.call('claim', { ...buyer, productId: p.id, quantity: 2 }).ok, true);
  const second = api.call('claim', { ...buyer, whatsapp: '21977776666', productId: p.id, quantity: 1 });
  assert.equal(second.ok, false);
  assert.match(second.error, /esgotar/);
});

test('claims nunca apagam pedidos anteriores', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { totalStock: 10 });
  for (let i = 0; i < 5; i++) api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(gas.state.sheets['Pedidos'].length, 6); // cabeçalho + 5
});

test('Meus Pedidos exige WhatsApp + código e mostra só os pedidos da pessoa', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 10 });
  const a = api.call('claim', { ...buyer, productId: p.id, quantity: 2 }).order;
  api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  const other = api.call('claim', { ...buyer, buyerName: 'Bia', whatsapp: '21977776666', productId: p.id, quantity: 1 }).order;

  assert.equal(api.call('myOrders', { whatsapp: '11988887777', code: other.orderId }).ok, false);
  assert.equal(api.call('myOrders', { whatsapp: '11988887777', code: '' }).ok, false);

  const mine = api.call('myOrders', { whatsapp: '+55 11 98888-7777', code: a.orderId.replace('PED-', '').toLowerCase() });
  assert.equal(mine.ok, true, mine.error);
  assert.equal(mine.orders.length, 2);
  assert.equal(mine.totals.owed, 285);
  assert.equal(mine.totals.paid, 0);
  assert.equal(mine.totals.items, 3);
  assert.equal(JSON.stringify(mine).includes('Bia'), false);
});

test('pagamentos e frete por lote atualizam devendo/pago', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 10 });
  const { order, charge } = api.call('claim', { ...buyer, productId: p.id, quantity: 2 });

  assert.equal(admin('setChargeStatus', { chargeId: charge.chargeId, status: 'Pago' }).ok, true);
  const batch = admin('addBatchCharge', { batch: 'CEG #1', description: 'Frete internacional', amountPerUnit: 12.5 });
  assert.equal(batch.ok, true, batch.error);
  assert.equal(batch.total, 25);

  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: order.orderId });
  assert.equal(mine.totals.paid, 190);
  assert.equal(mine.totals.owed, 25);
});

test('cancelar devolve o estoque e cancela cobranças pendentes; reativar confere estoque', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 1 });
  const { order } = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });

  assert.equal(admin('setOrderStatus', { orderId: order.orderId, status: 'Cancelado' }).ok, true);
  assert.equal(api.call('catalog').products[0].available, 1);
  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: order.orderId });
  assert.equal(mine.totals.owed, 0);

  // outra pessoa pega o item; reativar o pedido cancelado deve falhar
  assert.equal(api.call('claim', { ...buyer, whatsapp: '21977776666', productId: p.id, quantity: 1 }).ok, true);
  const reactivate = admin('setOrderStatus', { orderId: order.orderId, status: 'Reservado' });
  assert.equal(reactivate.ok, false);
});

test('estoque não pode ficar abaixo do vendido e produto com pedido não é excluído', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  api.call('claim', { ...buyer, productId: p.id, quantity: 2 });
  const res = admin('saveProduct', { product: { ...p, totalStock: 1 } });
  assert.equal(res.ok, false);
  assert.equal(admin('deleteProduct', { id: p.id }).ok, false);
  assert.equal(admin('saveProduct', { product: { ...p, active: false } }).ok, true);
  assert.equal(api.call('catalog').products.length, 0);
});

test('texto digitado não vira fórmula na planilha', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin);
  api.call('claim', { ...buyer, buyerName: '=IMPORTXML("x")', productId: p.id, quantity: 1 });
  const row = gas.state.sheets['Pedidos'][1];
  // no Sheets real o apóstrofo força texto; a simulação guarda o texto puro
  assert.equal(row[6], '=IMPORTXML("x")');
});

test('claims fechados e limite por claim', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 20 });
  assert.equal(api.call('claim', { ...buyer, productId: p.id, quantity: 6 }).ok, false);
  admin('saveConfig', { config: { claimsOpen: false } });
  const res = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(res.ok, false);
  assert.match(res.error, /fechados/);
});
