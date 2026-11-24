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
  config.find((r) => r[0] === 'requireLogin')[1] = 'NÃO'; // testes antigos fazem claim sem conta
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
  assert.deepEqual(Object.keys(gas.state.sheets).sort(), ['Clientes', 'Cobranças', 'Config', 'Endereços', 'Envios', 'Pedidos', 'Produtos', 'Solicitações']);
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

test('prazo à vista: a cobrança do claim nasce com o vencimento do produto', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { dueDate: '2026-12-15', totalStock: 5 });
  const res = api.call('claim', { ...buyer, productId: p.id, quantity: 2 });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.order.payment, 'Pix à vista');
  assert.equal(res.charges.length, 1);
  assert.equal(res.charges[0].dueDate, '2026-12-15');
  assert.equal(res.charges[0].amount, 190);
  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: res.order.orderId });
  assert.equal(mine.orders[0].charges[0].dueDate, '2026-12-15');
  assert.equal(mine.orders[0].payment, 'Pix à vista');
});

test('Pix parcelado: uma cobrança por data, somando o total exato', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, {
    price: 100, totalStock: 5, dueDate: '2026-12-15',
    installmentDates: ['2027-02-15', '2026-12-15', '2027-01-15', '2027-01-15']
  });
  const saved = api.call('catalog').products[0];
  assert.deepEqual(saved.installmentDates, ['2026-12-15', '2027-01-15', '2027-02-15']);
  assert.equal(gas.state.sheets['Produtos'][1][10], '15/12/2026; 15/01/2027; 15/02/2027');

  const res = api.call('claim', { ...buyer, productId: p.id, quantity: 1, paymentPlan: 'parcelado' });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.order.payment, 'Pix parcelado 3x');
  assert.deepEqual(res.charges.map((c) => c.amount), [33.33, 33.33, 33.34]);
  assert.deepEqual(res.charges.map((c) => c.dueDate), ['2026-12-15', '2027-01-15', '2027-02-15']);

  // sem parcelas cadastradas, "parcelado" vira à vista
  const p2 = addProduct(admin, { name: 'Outro', totalStock: 2 });
  const res2 = api.call('claim', { ...buyer, productId: p2.id, quantity: 1, paymentPlan: 'parcelado' });
  assert.equal(res2.charges.length, 1);
  assert.equal(res2.order.payment, 'Pix à vista');
});

test('Pix parcelado exige pelo menos 2 datas', () => {
  const { admin } = freshBackend();
  const res = admin('saveProduct', { product: { isNew: true, name: 'X', price: 10, totalStock: 1, installmentDates: ['2026-12-15'] } });
  assert.equal(res.ok, false);
});

test('cobrança avulsa e em lote aceitam vencimento', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const { order } = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(admin('addCharge', { orderId: order.orderId, description: 'Frete nacional', amount: 20, dueDate: '2027-01-10' }).charge.dueDate, '2027-01-10');
  admin('addBatchCharge', { batch: 'CEG #1', description: 'Frete internacional', amountPerUnit: 10, dueDate: '2027-01-20' });
  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: order.orderId });
  assert.deepEqual(mine.orders[0].charges.map((c) => c.dueDate).sort(), ['', '2027-01-10', '2027-01-20']);
});

test('planilha antiga ganha as colunas novas sem perder dados', () => {
  const gas = createFakeGas();
  const api = loadBackend(CODE, gas);
  // simula a planilha criada pela versão anterior (sem as colunas novas)
  gas.state.sheets['Config'] = [['Chave', 'Valor', 'Descrição'], ['adminPassword', PASSWORD, ''], ['claimsOpen', 'SIM', ''], ['requireLogin', 'NÃO', '']];
  gas.state.sheets['Produtos'] = [['ID', 'Nome do Produto', 'Membro', 'Categoria', 'Preço (R$)', 'Estoque Total', 'Foto URL', 'Lote CEG', 'Ativo'],
    ['CEG-01', 'Antigo', 'V', 'Photocards', 50, 3, '', 'CEG #1', 'SIM']];
  gas.state.sheets['Pedidos'] = [['ID Pedido', 'Data', 'ID Produto', 'Produto', 'Membro', 'Lote', 'Nome', '@ (Insta/Twitter)', 'WhatsApp', 'Qtd', 'Preço Unit. (R$)', 'Total Item (R$)', 'Envio', 'Status', 'Observação']];
  gas.state.sheets['Cobranças'] = [['ID Cobrança', 'ID Pedido', 'WhatsApp', 'Descrição', 'Valor (R$)', 'Status', 'Criada em', 'Paga em']];
  const cat = api.call('catalog');
  assert.equal(cat.products[0].name, 'Antigo');
  assert.equal(gas.state.sheets['Produtos'][0][10], 'Datas Pix Parcelado');
  assert.equal(gas.state.sheets['Pedidos'][0][15], 'Pagamento');
  assert.equal(gas.state.sheets['Cobranças'][0][8], 'Vencimento');
  assert.equal(api.call('claim', { ...buyer, productId: 'CEG-01', quantity: 1 }).ok, true);
});

test('observação da compradora no claim fica salva e separada da observação da ADM', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const res = api.call('claim', { ...buyer, productId: p.id, quantity: 1, buyerNote: '  Pode guardar\n junto com o outro pedido ' });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.order.buyerNote, 'Pode guardar junto com o outro pedido');
  assert.equal(gas.state.sheets['Pedidos'][0][16], 'Obs. da compradora');
  assert.equal(gas.state.sheets['Pedidos'][1][16], 'Pode guardar junto com o outro pedido');

  admin('setOrderNote', { orderId: res.order.orderId, note: 'Rastreio BR123' });
  admin('setOrderStatus', { orderId: res.order.orderId, status: 'Comprado' });
  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: res.order.orderId });
  assert.equal(mine.orders[0].buyerNote, 'Pode guardar junto com o outro pedido');
  assert.equal(mine.orders[0].note, 'Rastreio BR123');
  const long = api.call('claim', { ...buyer, productId: p.id, quantity: 1, buyerNote: 'x'.repeat(500) });
  assert.equal(long.order.buyerNote.length, 300);
});

// ---------------------------------------------------------------- contas
const account = { name: 'Mariana Silva', contact: '@mari', whatsapp: '(11) 98888-7777', password: 'segredo1' };

function requireLogin(gas) {
  gas.state.sheets['Config'].find((r) => r[0] === 'requireLogin')[1] = 'SIM';
}

test('conta: criar, entrar e comprar com um toque (sem digitar dados)', () => {
  const { api, admin, gas } = freshBackend();
  requireLogin(gas);
  const p = addProduct(admin, { totalStock: 2 });

  const guest = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(guest.ok, false);
  assert.equal(guest.loginRequired, true);

  const reg = api.call('register', account);
  assert.equal(reg.ok, true, reg.error);
  assert.equal(reg.profile.whatsapp, '11988887777');
  const row = gas.state.sheets['Clientes'][1];
  assert.equal(row.includes('segredo1'), false, 'senha não pode ficar visível na planilha');

  const claim = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  assert.equal(claim.ok, true, claim.error);
  assert.equal(claim.order.buyerName, 'Mariana Silva');
  assert.equal(claim.order.whatsapp, '11988887777');

  const mine = api.call('myOrders', { token: reg.token });
  assert.equal(mine.orders.length, 1);

  assert.equal(api.call('login', { whatsapp: '11988887777', password: 'errada' }).ok, false);
  const login = api.call('login', { whatsapp: '+55 11 98888-7777', password: 'segredo1' });
  assert.equal(login.ok, true, login.error);
  assert.equal(api.call('me', { token: login.token }).profile.name, 'Mariana Silva');
});

test('conta: quem já comprou precisa do código de um pedido para criar a conta', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const old = api.call('claim', { ...buyer, productId: p.id, quantity: 1 }).order;
  const other = api.call('claim', { ...buyer, whatsapp: '21977776666', productId: p.id, quantity: 1 }).order;

  const noCode = api.call('register', account);
  assert.equal(noCode.ok, false);
  assert.equal(noCode.needsCode, true);
  assert.equal(api.call('register', { ...account, code: other.orderId }).ok, false);
  const ok = api.call('register', { ...account, code: old.orderId.replace('PED-', '').toLowerCase() });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(api.call('myOrders', { token: ok.token }).orders.length, 1, 'histórico antigo aparece na conta');
  assert.equal(api.call('register', { ...account, code: old.orderId }).ok, false, 'não cria conta duplicada');
});

test('conta: token falso, adulterado ou de senha antiga não funciona', () => {
  const { api } = freshBackend();
  const reg = api.call('register', account);
  const [wa, exp, sig] = reg.token.split('.');
  assert.equal(api.call('me', { token: `21977776666.${exp}.${sig}` }).ok, false);
  assert.equal(api.call('me', { token: `${wa}.${(Date.now() + 9e12).toString(36)}.${sig}` }).ok, false);
  assert.equal(api.call('me', { token: 'qualquer.coisa.aqui' }).sessionExpired, true);

  const changed = api.call('changePassword', { token: reg.token, currentPassword: 'segredo1', newPassword: 'nova-senha' });
  assert.equal(changed.ok, true, changed.error);
  assert.equal(api.call('me', { token: reg.token }).ok, false, 'trocar a senha encerra as sessões antigas');
  assert.equal(api.call('me', { token: changed.token }).ok, true);
  assert.equal(api.call('changePassword', { token: changed.token, currentPassword: 'x', newPassword: 'outra123' }).ok, false);
});

test('conta: ADM gera senha temporária e ela é obrigada a trocar', () => {
  const { api, admin } = freshBackend();
  api.call('register', account);
  const reset = admin('adminResetPassword', { whatsapp: '11988887777' });
  assert.equal(reset.ok, true, reset.error);
  assert.equal(api.call('login', { whatsapp: '11988887777', password: 'segredo1' }).ok, false);
  const login = api.call('login', { whatsapp: '11988887777', password: reset.tempPassword });
  assert.equal(login.profile.mustChange, true);
  const changed = api.call('changePassword', { token: login.token, newPassword: 'minha-nova' });
  assert.equal(changed.ok, true, changed.error);
  assert.equal(changed.profile.mustChange, false);
  const data = admin('adminData');
  assert.equal(data.clients.length, 1);
  assert.equal(JSON.stringify(data.clients).includes('hash'), false);
});

test('conta: muitas senhas erradas bloqueiam por 15 minutos', () => {
  const { api } = freshBackend();
  api.call('register', account);
  for (let i = 0; i < 8; i++) api.call('login', { whatsapp: '11988887777', password: 'errada' });
  const blocked = api.call('login', { whatsapp: '11988887777', password: 'segredo1' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /tentativas/);
});

test('conta: compradora ajusta observação e desfaz claim feito sem querer', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 1 });
  const reg = api.call('register', account);
  const other = api.call('register', { ...account, whatsapp: '21977776666' });
  const { order } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });

  assert.equal(api.call('updateMyOrder', { token: other.token, orderId: order.orderId, buyerNote: 'x' }).ok, false, 'não mexe no pedido de outra');
  const upd = api.call('updateMyOrder', { token: reg.token, orderId: order.orderId, buyerNote: 'Guardar junto' });
  assert.equal(upd.order.buyerNote, 'Guardar junto');

  assert.equal(api.call('cancelMyOrder', { token: reg.token, orderId: order.orderId }).ok, true);
  assert.equal(api.call('catalog').products[0].available, 1, 'item volta para o estoque');
  assert.equal(api.call('myOrders', { token: reg.token }).totals.owed, 0);
});

test('conta: não dá para desfazer depois de pago', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 1 });
  const reg = api.call('register', account);
  const { order, charge } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  admin('setChargeStatus', { chargeId: charge.chargeId, status: 'Pago' });
  assert.equal(api.call('cancelMyOrder', { token: reg.token, orderId: order.orderId }).ok, false);
});

test('anunciar por membro: um item por integrante, com estoque e foto próprios', () => {
  const { api, admin } = freshBackend();
  addProduct(admin); // CEG-01 já existe
  const res = admin('saveProductBatch', {
    product: { name: 'Photocard Golden POB', category: 'Photocards', price: 30, batch: 'CEG #50', image: 'https://x/geral.jpg', dueDate: '2026-12-15' },
    variants: [
      { member: 'Jimin', image: 'https://x/jimin.jpg' },
      { member: 'V', totalStock: 2 },
      { member: 'Jungkook' }
    ]
  });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.products.map((p) => p.id), ['CEG-02', 'CEG-03', 'CEG-04']);
  const cat = api.call('catalog').products.filter((p) => p.batch === 'CEG #50');
  assert.deepEqual(cat.map((p) => [p.name, p.member, p.totalStock, p.image, p.dueDate]), [
    ['Photocard Golden POB — Jimin', 'Jimin', 1, 'https://x/jimin.jpg', '2026-12-15'],
    ['Photocard Golden POB — V', 'V', 2, 'https://x/geral.jpg', '2026-12-15'],
    ['Photocard Golden POB — Jungkook', 'Jungkook', 1, 'https://x/geral.jpg', '2026-12-15']
  ]);
  // um claim no item de 1 unidade esgota só aquele membro
  assert.equal(api.call('claim', { ...buyer, productId: 'CEG-02', quantity: 1 }).ok, true);
  assert.equal(api.call('claim', { ...buyer, productId: 'CEG-02', quantity: 1 }).ok, false);
  assert.equal(api.call('claim', { ...buyer, productId: 'CEG-03', quantity: 1 }).ok, true);
});

test('anunciar por membro: dado inválido não cria nada pela metade', () => {
  const { api, admin } = freshBackend();
  const bad = admin('saveProductBatch', {
    product: { name: 'Set', price: 30 },
    variants: [{ member: 'RM' }, { member: 'Jin', totalStock: 0 }]
  });
  assert.equal(bad.ok, false);
  assert.equal(admin('saveProductBatch', { product: { name: 'Set', price: 30 }, variants: [{ member: 'RM' }, { member: 'RM' }] }).ok, false);
  assert.equal(admin('saveProductBatch', { product: { name: '', price: 30 }, variants: [{ member: 'RM' }] }).ok, false);
  assert.equal(api.call('catalog').products.length, 0);
});

test('produto informa frete (incluso ou não) e condição (novo, lacrado, aberto)', () => {
  const { api, admin, gas } = freshBackend();
  addProduct(admin, { name: 'Álbum', shippingCost: 'Frete incluso', condition: 'Lacrado' });
  addProduct(admin, { name: 'Sem info' });
  const [a, b] = api.call('catalog').products;
  assert.equal(a.shippingCost, 'Frete incluso');
  assert.equal(a.condition, 'Lacrado');
  assert.equal(b.shippingCost, '');
  assert.equal(b.condition, '');
  assert.deepEqual(gas.state.sheets['Produtos'][0].slice(11, 13), ['Frete', 'Condição']);
  assert.deepEqual(gas.state.sheets['Produtos'][1].slice(11, 13), ['Frete incluso', 'Lacrado']);

  // digitado na planilha sem acento/maiúscula também vale
  gas.state.sheets['Produtos'][2][11] = 'frete nao incluso';
  gas.state.sheets['Produtos'][2][12] = 'ABERTO';
  const fixed = api.call('catalog').products[1];
  assert.equal(fixed.shippingCost, 'Frete não incluso');
  assert.equal(fixed.condition, 'Aberto');

  assert.equal(admin('saveProduct', { product: { isNew: true, name: 'X', price: 1, totalStock: 1, condition: 'Usado' } }).ok, false);
  const batch = admin('saveProductBatch', {
    product: { name: 'PC', price: 10, shippingCost: 'Frete não incluso', condition: 'Novo' },
    variants: [{ member: 'RM' }, { member: 'Jin' }]
  });
  assert.deepEqual(batch.products.map((p) => [p.shippingCost, p.condition]), [['Frete não incluso', 'Novo'], ['Frete não incluso', 'Novo']]);
});

test('produto tem grupo de k-pop; sem grupo vale BTS', () => {
  const { api, admin, gas } = freshBackend();
  addProduct(admin, { name: 'PC Felix', group: 'Stray Kids', member: 'Felix' });
  addProduct(admin, { name: 'Antigo' });
  const batch = admin('saveProductBatch', {
    product: { name: 'PC Born Pink', price: 20, group: '  BLACKPINK ' },
    variants: [{ member: 'Jisoo' }, { member: 'Lisa' }]
  });
  assert.equal(batch.ok, true, batch.error);
  gas.state.sheets['Produtos'][2][13] = ''; // linha antiga, sem grupo na planilha
  const byName = Object.fromEntries(api.call('catalog').products.map((p) => [p.name, p]));
  assert.equal(byName['PC Felix'].group, 'Stray Kids');
  assert.equal(byName['PC Felix'].member, 'Felix');
  assert.equal(byName['Antigo'].group, 'BTS');
  assert.equal(byName['PC Born Pink — Lisa'].group, 'BLACKPINK');
  assert.equal(gas.state.sheets['Produtos'][0][13], 'Grupo');
});

// ---------------------------------------------------------------- registrar venda e repasse
test('registrar venda: produto avulso com foto, Pix parcelado e parcelas já pagas', () => {
  const { api, admin } = freshBackend();
  const res = admin('adminCreateSale', {
    buyer: { name: 'Lara', contact: '@lara', whatsapp: '62981613350' },
    product: { name: 'DVD Arirang', image: 'https://x/dvd.jpg', group: 'BTS', member: 'OT7', category: 'Merch/DVD' },
    unitPrice: 300, quantity: 1, date: '2026-09-10',
    payment: { mode: 'parcelado', installmentDates: ['2026-10-10', '2026-11-10', '2026-12-10'], paidInstallments: 2 }
  });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual(res.charges.map((c) => [c.amount, c.status, c.dueDate]), [
    [100, 'Pago', '2026-10-10'], [100, 'Pago', '2026-11-10'], [100, 'Pendente', '2026-12-10']
  ]);
  assert.equal(res.order.payment, 'Pix parcelado 3x');
  assert.equal(api.call('catalog').products.length, 0, 'produto avulso fica oculto do catálogo');
  const mine = api.call('myOrders', { whatsapp: '62981613350', code: res.order.orderId });
  assert.equal(mine.totals.paid, 200);
  assert.equal(mine.totals.owed, 100);
  assert.equal(mine.orders[0].image, 'https://x/dvd.jpg');
  assert.match(mine.orders[0].createdAt, /^2026-09-10/);
});

test('registrar venda: produto do catálogo, à vista pago, respeitando o estoque', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 1 });
  const sale = admin('adminCreateSale', { buyer: { name: 'Thaty', whatsapp: '53991811761' }, productId: p.id, useStock: true, payment: { mode: 'avista', paid: true } });
  assert.equal(sale.ok, true, sale.error);
  assert.equal(sale.charges[0].status, 'Pago');
  assert.equal(sale.order.unitPrice, 95);
  assert.equal(api.call('catalog').products[0].available, 0);
  assert.equal(admin('adminCreateSale', { buyer: { name: 'Outra', whatsapp: '11911112222' }, productId: p.id, useStock: true }).ok, false);
});

test('repasse pela cliente: só item pago, ADM aprova, pedido muda de dona', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 2 });
  const reg = api.call('register', { name: 'Ana', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const { order, charge } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });

  const unpaid = api.call('requestTransfer', { token: reg.token, orderId: order.orderId, name: 'Bia', whatsapp: '21977776666' });
  assert.equal(unpaid.ok, false);
  assert.match(unpaid.error, /pagos/);

  admin('setChargeStatus', { chargeId: charge.chargeId, status: 'Pago' });
  assert.equal(api.call('requestTransfer', { token: reg.token, orderId: order.orderId, name: 'Eu', whatsapp: '41999990000' }).ok, false);
  const req = api.call('requestTransfer', { token: reg.token, orderId: order.orderId, name: 'Bia', whatsapp: '(21) 97777-6666' });
  assert.equal(req.ok, true, req.error);
  assert.equal(req.order.transferWhatsapp, '21977776666');
  assert.equal(api.call('requestTransfer', { token: reg.token, orderId: order.orderId, name: 'Bia', whatsapp: '21977776666' }).ok, false, 'um pedido de repasse por vez');

  // até a aprovação, continua com a Ana
  assert.equal(api.call('myOrders', { token: reg.token }).orders.length, 1);
  const ok = admin('adminApproveTransfer', { orderId: order.orderId });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(api.call('myOrders', { token: reg.token }).orders.length, 0);
  const bia = api.call('myOrders', { whatsapp: '21977776666', code: order.orderId });
  assert.equal(bia.orders[0].buyerName, 'Bia');
  assert.equal(bia.totals.paid, 95);
  assert.match(bia.orders[0].history, /repasse aprovado: de Ana para Bia/);
  assert.equal(/41999990000/.test(bia.orders[0].history), false, 'histórico não expõe telefone');
});

test('repasse: ADM recusa, cliente cancela, e ADM repassa direto mesmo sem pagamento', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const reg = api.call('register', { name: 'Ana', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const a = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  admin('setChargeStatus', { chargeId: a.charge.chargeId, status: 'Pago' });
  api.call('requestTransfer', { token: reg.token, orderId: a.order.orderId, name: 'Bia', whatsapp: '21977776666' });
  assert.equal(admin('adminRejectTransfer', { orderId: a.order.orderId }).ok, true);
  assert.equal(api.call('myOrders', { token: reg.token }).orders[0].transferWhatsapp, '');
  api.call('requestTransfer', { token: reg.token, orderId: a.order.orderId, name: 'Bia', whatsapp: '21977776666' });
  assert.equal(api.call('cancelTransferRequest', { token: reg.token, orderId: a.order.orderId }).ok, true);

  // claim no nome errado, ainda sem pagar: a ADM repassa e o pendente vai junto
  const b = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  const moved = admin('adminTransferOrder', { orderId: b.order.orderId, name: 'Carla', contact: '@carla', whatsapp: '11955554444' });
  assert.equal(moved.ok, true, moved.error);
  const carla = api.call('myOrders', { whatsapp: '11955554444', code: b.order.orderId });
  assert.equal(carla.totals.owed, 95);
  assert.equal(api.call('myOrders', { token: reg.token }).orders.length, 1);
  // corrigir uma compradora "a identificar" (sem WhatsApp) pelo mesmo botão
  assert.equal(admin('adminTransferOrder', { orderId: b.order.orderId, name: 'Carla Souza', contact: '@carla', whatsapp: '11955554444' }).ok, true);
});

// ---------------------------------------------------------------- cobranças do dia, resumo e cartão
const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('cobranças do dia: vencidas, vencendo hoje e em até 2 dias, com mensagem pronta', () => {
  const { api, admin } = freshBackend();
  const mk = (name, due, wa) => {
    const p = addProduct(admin, { name, dueDate: due, totalStock: 5 });
    return api.call('claim', { ...buyer, whatsapp: wa, productId: p.id, quantity: 1 });
  };
  mk('Vencido', dayKey(-3), '11911110001');
  mk('Hoje', dayKey(0), '11911110002');
  mk('Em 2 dias', dayKey(2), '11911110003');
  mk('Em 5 dias', dayKey(5), '11911110004'); // fora da janela
  const paid = mk('Pago', dayKey(-1), '11911110005');
  admin('setChargeStatus', { chargeId: paid.charge.chargeId, status: 'Pago' });

  const r = admin('adminReminders');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.daysBefore, 2);
  assert.deepEqual(r.groups.map((g) => [g.items[0].productName, g.kind]), [['Vencido', 'overdue'], ['Hoje', 'today'], ['Em 2 dias', 'soon']]);
  const overdue = r.groups[0];
  assert.match(overdue.message, /Vencido/);
  assert.match(overdue.message, /Chave Pix/);
  assert.ok(overdue.link.startsWith('https://wa.me/5511911110001?text='));
  assert.equal(overdue.remindedToday, false);

  assert.equal(admin('adminMarkReminded', { chargeIds: overdue.items.map((i) => i.chargeId) }).count, 1);
  assert.equal(admin('adminReminders').groups[0].remindedToday, true);

  admin('saveConfig', { config: { reminderDaysBefore: 5 } });
  assert.equal(admin('adminReminders').groups.length, 4, 'janela maior inclui o de 5 dias');
});

test('resumo diário: e-mail com as cobranças; gatilho diário às 8h', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { dueDate: dayKey(-1) });
  api.call('claim', { ...buyer, productId: p.id, quantity: 1 });

  assert.equal(admin('adminSendDigest').ok, false, 'sem e-mail cadastrado');
  assert.equal(admin('saveConfig', { config: { reminderEmail: 'nao-e-email' } }).ok, false);
  admin('saveConfig', { config: { reminderEmail: 'Loja@Exemplo.com' } });
  const sent = admin('adminSendDigest');
  assert.equal(sent.ok, true, sent.error);
  assert.equal(gas.sentEmails.length, 1);
  assert.equal(gas.sentEmails[0].to, 'loja@exemplo.com');
  assert.match(gas.sentEmails[0].subject, /1 vencida/);
  assert.match(gas.sentEmails[0].htmlBody, /Enviar cobrança no WhatsApp/);
  assert.equal(JSON.stringify(api.call('catalog')).includes('loja@exemplo.com'), false, 'e-mail não vai para o site público');

  const { api: api2, gas: gas2 } = (() => { const b = freshBackend(); return b; })();
  gas2.state.sheets['Config'].find((r) => r[0] === 'reminderEmail')[1] = 'x@y.com';
  api2.run('ativarResumoDiario');
  api2.run('ativarResumoDiario'); // rodar de novo não duplica
  assert.equal(gas2.triggers.length, 1);
  assert.equal(gas2.triggers[0].hour, 8);
  assert.equal(gas2.sentEmails.length, 2, 'cada ativação manda um e-mail de teste');
});

test('forma de pagamento: Pix ou cartão no claim; cartão entra na lista de links', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 5, installmentDates: ['2026-12-10', '2027-01-10'] });
  const card = api.call('claim', { ...buyer, productId: p.id, quantity: 1, paymentMethod: 'Cartão de crédito', paymentPlan: 'parcelado' });
  assert.equal(card.ok, true, card.error);
  assert.equal(card.order.paymentMethod, 'Cartão de crédito');
  assert.equal(card.order.payment, 'Cartão de crédito');
  assert.equal(card.charges.length, 1, 'cartão não usa as parcelas do Pix');
  assert.deepEqual(admin('adminReminders').cards.map((c) => c.orderId), [card.order.orderId]);

  const pix = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  assert.equal(pix.order.paymentMethod, 'Pix');

  admin('saveConfig', { config: { acceptCard: false } });
  assert.equal(api.call('claim', { ...buyer, productId: p.id, quantity: 1, paymentMethod: 'Cartão de crédito' }).ok, false);
});

test('forma de pagamento: compradora troca logo após o claim (não se for Pix parcelado)', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 5, installmentDates: ['2026-12-10', '2027-01-10'] });
  const reg = api.call('register', { name: 'Ana', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const a = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  const upd = api.call('updateMyOrder', { token: reg.token, orderId: a.order.orderId, paymentMethod: 'Cartão de crédito' });
  assert.equal(upd.ok, true, upd.error);
  assert.equal(upd.order.paymentMethod, 'Cartão de crédito');
  assert.match(upd.order.history, /forma de pagamento: Cartão de crédito/);
  const b = api.call('claim', { token: reg.token, productId: p.id, quantity: 1, paymentPlan: 'parcelado' });
  assert.equal(api.call('updateMyOrder', { token: reg.token, orderId: b.order.orderId, paymentMethod: 'Cartão de crédito' }).ok, false);
});

// ---------------------------------------------------------------- corrigir / juntar compradoras
test('corrigir dados: troca nome e WhatsApp em todos os pedidos, cobranças e na conta', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { totalStock: 5 });
  const reg = api.call('register', { name: 'Thaty', contact: '@t', whatsapp: '53991811760', password: '123456' }); // número errado
  api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  const res = admin('adminUpdateBuyer', { whatsapp: '53991811760', name: 'Thaty Souza', contact: '@thaty', newWhatsapp: '(53) 99181-1761' });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.orders, 2);
  assert.match(res.account, /mesma senha/);
  const login = api.call('login', { whatsapp: '53991811761', password: '123456' });
  assert.equal(login.ok, true, 'entra com o número novo e a mesma senha');
  const mine = api.call('myOrders', { token: login.token });
  assert.equal(mine.orders.length, 2);
  assert.equal(mine.orders[0].buyerName, 'Thaty Souza');
  assert.match(mine.orders[0].history, /dados da compradora corrigidos/);
  assert.equal(/5399181176/.test(mine.orders[0].history), false);
  assert.ok(gas.state.sheets['Cobranças'].slice(1).every((r) => r[2] === '53991811761'));
  assert.equal(api.call('login', { whatsapp: '53991811760', password: '123456' }).ok, false);
});

test('juntar compradoras: avisa conflito, junta pedidos e deixa uma conta só', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { totalStock: 9 });
  const a = api.call('register', { name: 'Caroline', contact: '@carol', whatsapp: '44998210932', password: '111111' });
  const b = api.call('register', { name: 'Carol', contact: '@carol', whatsapp: '44982109320', password: '222222' });
  api.call('claim', { token: a.token, productId: p.id, quantity: 1 });
  api.call('claim', { token: b.token, productId: p.id, quantity: 1 });
  api.call('claim', { token: b.token, productId: p.id, quantity: 1 });

  const conflict = admin('adminUpdateBuyer', { whatsapp: '44982109320', name: 'Caroline', newWhatsapp: '44998210932' });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.deepEqual(conflict.conflictNames, ['Caroline']);

  const merged = admin('adminUpdateBuyer', { whatsapp: '44982109320', name: 'Caroline Lima', newWhatsapp: '44998210932', merge: true });
  assert.equal(merged.ok, true, merged.error);
  assert.equal(merged.orders, 3, 'pedidos das duas ficam no mesmo nome');
  assert.equal(gas.state.sheets['Clientes'].length, 2, 'cabeçalho + uma conta');
  const mine = api.call('myOrders', { token: api.call('login', { whatsapp: '44998210932', password: '111111' }).token });
  assert.equal(mine.orders.length, 3);
  assert.ok(mine.orders.every((o) => o.buyerName === 'Caroline Lima'));
});

test('corrigir dados não junta "sem WhatsApp"; excluir conta mantém os pedidos', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  assert.equal(admin('adminUpdateBuyer', { whatsapp: '', name: 'X', newWhatsapp: '11911112222' }).ok, false);
  const reg = api.call('register', { name: 'Teste', contact: '@t', whatsapp: '99999999999', password: '123456' });
  api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  assert.equal(admin('adminDeleteAccount', { whatsapp: '99999999999' }).ok, true);
  assert.equal(api.call('login', { whatsapp: '99999999999', password: '123456' }).ok, false);
  assert.equal(admin('adminData').orders.length, 1, 'pedido continua');
});

// ---------------------------------------------------------------- corrigir valores
test('corrigir cobrança: valor, descrição e vencimento, com histórico', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const { order, charge } = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  const res = admin('adminUpdateCharge', { chargeId: charge.chargeId, amount: '90,00', description: 'Item com desconto', dueDate: '2026-12-20' });
  assert.equal(res.ok, true, res.error);
  assert.deepEqual([res.charge.amount, res.charge.description, res.charge.dueDate], [90, 'Item com desconto', '2026-12-20']);
  assert.equal(admin('adminUpdateCharge', { chargeId: charge.chargeId, amount: 90 }).ok, false, 'nada mudou');
  assert.equal(admin('adminUpdateCharge', { chargeId: charge.chargeId, amount: 0 }).ok, false);
  const mine = api.call('myOrders', { whatsapp: buyer.whatsapp, code: order.orderId });
  assert.equal(mine.totals.owed, 90);
  assert.match(mine.orders[0].history, /R\$ 95,00 → R\$ 90,00/);
});

test('corrigir item: quantidade e valor recalculam o total e ajustam a cobrança pendente', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const { order } = api.call('claim', { ...buyer, productId: p.id, quantity: 1 });
  const res = admin('adminUpdateOrder', { orderId: order.orderId, quantity: 2, unitPrice: 80 });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.order.itemTotal, 160);
  assert.equal(res.adjustedCharge.amount, 160);
  assert.equal(api.call('catalog').products[0].available, 1);
  assert.equal(admin('adminUpdateOrder', { orderId: order.orderId, quantity: 5 }).ok, false, 'sem estoque');

  // cobrança já paga não é mexida; e dá para não ajustar
  const sale = admin('adminCreateSale', { buyer: { name: 'Lara', whatsapp: '62981613350' }, product: { name: 'DVD' }, unitPrice: 100, payment: { mode: 'avista', paid: true } });
  const r2 = admin('adminUpdateOrder', { orderId: sale.order.orderId, unitPrice: 120 });
  assert.equal(r2.order.itemTotal, 120);
  assert.equal(r2.adjustedCharge, null);
  const r3 = admin('adminUpdateOrder', { orderId: order.orderId, unitPrice: 70, adjustCharge: false });
  assert.equal(r3.adjustedCharge, null);
});

// ---------------------------------------------------------------- foto do item e separar por membro
test('foto no item do pedido aparece em Meus Pedidos', () => {
  const { api, admin } = freshBackend();
  const sale = admin('adminCreateSale', { buyer: { name: 'Lara', whatsapp: '62981613350' }, product: { name: 'PC antigo' }, unitPrice: 15 });
  assert.equal(admin('adminUpdateOrder', { orderId: sale.order.orderId, image: 'https://x/pc.jpg' }).ok, true);
  const mine = api.call('myOrders', { whatsapp: '62981613350', code: sale.order.orderId });
  assert.equal(mine.orders[0].image, 'https://x/pc.jpg');
  assert.match(mine.orders[0].history, /foto alterada/);
});

test('separar pedido "Jin e Jimin": divide valor e cobranças, mantendo o que foi pago', () => {
  const { api, admin, gas } = freshBackend();
  const sale = admin('adminCreateSale', {
    buyer: { name: 'Thaty', whatsapp: '53991811761' }, product: { name: 'Jin e Jimin', group: 'BTS', member: 'OT7' }, unitPrice: 30,
    payment: { mode: 'parcelado', installmentDates: ['2026-10-10', '2026-11-10'], paidInstallments: 1 }
  });
  const id = sale.order.orderId;
  assert.equal(admin('adminSplitOrder', { orderId: id, parts: [{ productName: 'Jin', amount: 10 }, { productName: 'Jimin', amount: 10 }] }).ok, false, 'soma diferente');
  const res = admin('adminSplitOrder', {
    orderId: id,
    parts: [
      { productName: 'Photocard — Jin', member: 'Jin', amount: 15, image: 'https://x/jin.jpg' },
      { productName: 'Photocard — Jimin', member: 'Jimin', amount: 15 }
    ]
  });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.orders[0].orderId, id, 'a 1ª parte mantém o código');
  const mine = api.call('myOrders', { whatsapp: '53991811761', code: id });
  assert.equal(mine.orders.length, 2);
  const byMember = Object.fromEntries(mine.orders.map((o) => [o.member, o]));
  assert.equal(byMember.Jin.itemTotal, 15);
  assert.equal(byMember.Jin.image, 'https://x/jin.jpg');
  assert.deepEqual(byMember.Jimin.charges.map((c) => [c.amount, c.status, c.dueDate]), [[7.5, 'Pago', '2026-10-10'], [7.5, 'Pendente', '2026-11-10']]);
  assert.equal(mine.totals.paid, 15);
  assert.equal(mine.totals.owed, 15);
  assert.match(byMember.Jimin.history, /separado do pedido/);
  const total = gas.state.sheets['Cobranças'].slice(1).reduce((a, r) => a + Number(r[4]), 0);
  assert.equal(total, 30, 'nada some nem sobra nas cobranças');
});

// ---------------------------------------------------------------- solicitações: correção e prorrogação
test('prorrogação: cliente pede nova data, ADM aceita (com outra data) e o vencimento muda', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3, dueDate: dayKey(1) });
  const reg = api.call('register', { name: 'Ana Souza', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const { order } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });

  assert.equal(api.call('requestExtension', { token: reg.token, orderId: order.orderId, newDate: dayKey(0) }).ok, false, 'data tem que ser futura');
  const req = api.call('requestExtension', { token: reg.token, orderId: order.orderId, newDate: dayKey(20), message: 'Recebo dia 20' });
  assert.equal(req.ok, true, req.error);
  assert.equal(api.call('requestExtension', { token: reg.token, orderId: order.orderId, newDate: dayKey(25) }).ok, false, 'uma por vez');

  const data = admin('adminData');
  assert.equal(data.requests.length, 1);
  assert.equal(data.requests[0].status, 'Pendente');

  const ans = admin('adminAnswerRequest', { requestId: req.request.requestId, decision: 'accept', date: dayKey(15), reply: 'Combinado!' });
  assert.equal(ans.ok, true, ans.error);
  assert.ok(ans.notifyLink.startsWith('https://wa.me/5541999990000?text='));
  assert.match(decodeURIComponent(ans.notifyLink), /aceita/);

  const mine = api.call('myOrders', { token: reg.token });
  assert.equal(mine.orders[0].charges[0].dueDate, dayKey(15));
  assert.equal(mine.orders[0].requests[0].status, 'Aceita');
  assert.equal(mine.orders[0].requests[0].reply, 'Combinado!');
  assert.match(mine.orders[0].history, /prorrogação aceita/);
  assert.equal(admin('adminAnswerRequest', { requestId: req.request.requestId, decision: 'reject' }).ok, false, 'já respondida');
});

test('correção: cliente pede, ADM resolve ou recusa; outra pessoa não pede pelo pedido dela', () => {
  const { api, admin } = freshBackend();
  const p = addProduct(admin, { totalStock: 3 });
  const reg = api.call('register', { name: 'Ana', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const other = api.call('register', { name: 'Bia', contact: '@bia', whatsapp: '21977776666', password: '123456' });
  const { order } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });

  assert.equal(api.call('requestCorrection', { token: other.token, orderId: order.orderId, message: 'O valor está errado' }).ok, false);
  assert.equal(api.call('requestCorrection', { token: reg.token, orderId: order.orderId, message: 'oi' }).ok, false, 'mensagem curta');
  const r1 = api.call('requestCorrection', { token: reg.token, orderId: order.orderId, message: 'O valor está errado, era R$ 90' });
  assert.equal(r1.ok, true, r1.error);
  const ans = admin('adminAnswerRequest', { requestId: r1.request.requestId, decision: 'resolve', reply: 'Corrigido para R$ 90' });
  assert.equal(ans.ok, true, ans.error);
  assert.match(decodeURIComponent(ans.notifyLink), /Corrigido para R\$ 90/);

  const r2 = api.call('requestCorrection', { token: reg.token, orderId: order.orderId, message: 'Quero trocar o membro' });
  assert.equal(admin('adminAnswerRequest', { requestId: r2.request.requestId, decision: 'reject', reply: 'Não dá para trocar' }).ok, true);
  const r3 = api.call('requestCorrection', { token: reg.token, orderId: order.orderId, message: 'Outra coisa errada aqui' });
  assert.equal(api.call('cancelMyRequest', { token: reg.token, requestId: r3.request.requestId }).ok, true);
  const statuses = api.call('myOrders', { token: reg.token }).orders[0].requests.map((r) => r.status).sort();
  assert.deepEqual(statuses, ['Cancelada', 'Recusada', 'Resolvida']);
});

test('resumo diário avisa solicitações pendentes', () => {
  const { api, admin, gas } = freshBackend();
  const p = addProduct(admin, { totalStock: 3, dueDate: dayKey(30) });
  const reg = api.call('register', { name: 'Ana', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  const { order } = api.call('claim', { token: reg.token, productId: p.id, quantity: 1 });
  api.call('requestExtension', { token: reg.token, orderId: order.orderId, newDate: dayKey(40) });
  admin('saveConfig', { config: { reminderEmail: 'loja@exemplo.com' } });
  gas.state.sheets['Config'].find((r) => r[0] === 'reminderEmail')[1] = 'loja@exemplo.com';
  api.run('enviarResumoDiario');
  assert.equal(gas.sentEmails.length, 1, 'manda e-mail mesmo sem cobrança vencendo, porque há solicitação');
  assert.match(gas.sentEmails[0].subject, /1 solicitação/);
  assert.match(gas.sentEmails[0].htmlBody, /pede prazo até/);
});

// ---------------------------------------------------------------- endereços, frete e envios
const ADDRESS = { label: 'Casa', recipient: 'Ana Souza', cep: '01310-100', street: 'Av. Paulista', number: '1000', complement: 'ap 5', district: 'Bela Vista', city: 'São Paulo', state: 'sp' };

function shippingSetup() {
  const b = freshBackend();
  const { api, admin, gas } = b;
  admin('adminSaveShippingSettings', { settings: { fromCep: '30130-000', contactEmail: 'loja@exemplo.com', melhorEnvioToken: 'tok-me', superFreteToken: 'tok-sf' } });
  gas.fetchHandler = (url, opt) => {
    if (url.includes('melhorenvio')) {
      return { code: 200, body: [
        { id: 1, name: 'PAC', price: '25.50', delivery_time: 7, company: { name: 'Correios', picture: 'https://x/correios.png' } },
        { id: 3, name: '.Package', price: '19.90', delivery_time: 5, company: { name: 'Jadlog', picture: 'https://x/jadlog.png' } },
        { id: 9, name: 'Indisponível', error: 'Fora da área' }
      ] };
    }
    return { code: 200, body: [{ id: 17, name: 'Mini Envios', price: 12.4, delivery_time: 9, company: { name: 'Correios', picture: 'https://x/c.png' } }] };
  };
  const pc = addProduct(admin, { name: 'PC Jimin', category: 'Photocards', price: 20, totalStock: 9 });
  const album = addProduct(admin, { name: 'Álbum', category: 'Álbuns', price: 100, totalStock: 9 });
  const reg = api.call('register', { name: 'Ana Souza', contact: '@ana', whatsapp: '41999990000', password: '123456' });
  return { ...b, pc, album, reg };
}

test('endereços: salvar (validação), listar, editar, apagar e limite de 5', () => {
  const { api, reg } = shippingSetup();
  assert.equal(api.call('saveAddress', { token: reg.token, address: { ...ADDRESS, cep: '123' } }).ok, false);
  const saved = api.call('saveAddress', { token: reg.token, address: ADDRESS });
  assert.equal(saved.ok, true, saved.error);
  assert.equal(saved.address.cep, '01310100');
  assert.equal(saved.address.state, 'SP');
  const edited = api.call('saveAddress', { token: reg.token, address: { ...ADDRESS, addressId: saved.address.addressId, number: '2000' } });
  assert.equal(edited.addresses.length, 1);
  assert.equal(edited.addresses[0].number, '2000');
  for (let i = 0; i < 4; i++) api.call('saveAddress', { token: reg.token, address: ADDRESS });
  assert.equal(api.call('saveAddress', { token: reg.token, address: ADDRESS }).ok, false, 'máximo 5');
  const after = api.call('deleteAddress', { token: reg.token, addressId: saved.address.addressId });
  assert.equal(after.addresses.length, 4);
});

test('frete: só photocard vai em envelope; com álbum vira caixa (photocard só soma peso)', () => {
  const { api, gas, pc, album, reg } = shippingSetup();
  const addr = api.call('saveAddress', { token: reg.token, address: ADDRESS }).address;
  const a = api.call('claim', { token: reg.token, productId: pc.id, quantity: 2 }).order;
  const q1 = api.call('quoteShipping', { token: reg.token, orderIds: [a.orderId], addressId: addr.addressId });
  assert.equal(q1.ok, true, q1.error);
  assert.equal(q1.package.kind, 'Envelope');
  assert.deepEqual([q1.package.height, q1.package.width, q1.package.length], [2, 12, 17]);
  const sent = JSON.parse(gas.fetches[0].options.payload);
  assert.deepEqual(sent.from, { postal_code: '30130000' });
  assert.deepEqual(sent.to, { postal_code: '01310100' });
  assert.equal(sent.package.kind, undefined, 'só medidas vão para a API');
  assert.equal(gas.fetches[0].options.headers.Authorization, 'Bearer tok-me');
  assert.deepEqual(q1.options.map((o) => [o.provider, o.service, o.price]), [
    ['SuperFrete', 'Mini Envios', 12.4], ['Melhor Envio', '.Package', 19.9], ['Melhor Envio', 'PAC', 25.5]
  ], 'as duas plataformas, do mais barato ao mais caro, sem as indisponíveis');

  const b = api.call('claim', { token: reg.token, productId: album.id, quantity: 1 }).order;
  const q2 = api.call('quoteShipping', { token: reg.token, orderIds: [a.orderId, b.orderId], addressId: addr.addressId });
  assert.equal(q2.package.kind, 'Caixa');
  assert.deepEqual([q2.package.height, q2.package.width, q2.package.length], [5, 25, 30], 'altura só do álbum');
  assert.equal(q2.package.weight, 0.84, '700 g + 2×20 g + 100 g de embalagem');
});

test('envio: escolher opção cria cobrança com o preço do servidor; ADM marca enviado com rastreio', () => {
  const { api, admin, pc, reg } = shippingSetup();
  const addr = api.call('saveAddress', { token: reg.token, address: ADDRESS }).address;
  const o = api.call('claim', { token: reg.token, productId: pc.id, quantity: 1 }).order;
  const q = api.call('quoteShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId });
  assert.equal(api.call('requestShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId, optionKey: 'Melhor Envio:999', price: 0.01 }).ok, false);
  const r = api.call('requestShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId, optionKey: q.options[0].key, price: 0.01 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.shipment.price, 12.4, 'o preço vem do servidor, não do navegador');
  assert.equal(r.shipment.status, 'Aguardando pagamento');
  assert.match(r.shipment.address, /Av\. Paulista, 1000/);
  assert.equal(api.call('requestShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId, optionKey: q.options[0].key }).ok, false, 'item já em envio');

  const mine = api.call('myOrders', { token: reg.token });
  assert.equal(mine.shipments.length, 1);
  assert.equal(mine.totals.owed, 20 + 12.4);
  assert.ok(mine.orders[0].charges.some((c) => /Frete nacional — Correios Mini Envios/.test(c.description)));

  const shipped = admin('adminMarkShipped', { shipmentId: r.shipment.shipmentId, tracking: 'BR123456789' });
  assert.equal(shipped.ok, true, shipped.error);
  assert.match(decodeURIComponent(shipped.notifyLink), /BR123456789/);
  const after = api.call('myOrders', { token: reg.token });
  assert.equal(after.orders[0].status, 'Enviado');
  assert.equal(after.orders[0].note, 'Rastreio: BR123456789');
  assert.equal(after.shipments[0].status, 'Enviado');
});

test('envio sem cotação automática: fica aguardando, ADM informa o valor; tokens nunca vão para o site', () => {
  const { api, admin, gas, pc, reg } = shippingSetup();
  gas.fetchHandler = () => ({ code: 401, body: { message: 'Unauthenticated.' } });
  const addr = api.call('saveAddress', { token: reg.token, address: ADDRESS }).address;
  const o = api.call('claim', { token: reg.token, productId: pc.id, quantity: 1 }).order;
  const q = api.call('quoteShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId });
  assert.equal(q.unavailable, true);
  const r = api.call('requestShipping', { token: reg.token, orderIds: [o.orderId], addressId: addr.addressId });
  assert.equal(r.shipment.status, 'Aguardando cotação');
  const priced = admin('adminSetShippingPrice', { shipmentId: r.shipment.shipmentId, price: '18,90', service: 'PAC' });
  assert.equal(priced.ok, true, priced.error);
  assert.equal(api.call('myOrders', { token: reg.token }).totals.owed, 20 + 18.9);

  const data = admin('adminData');
  assert.equal(data.config.shipping.melhorEnvio, true);
  assert.equal(JSON.stringify(data).includes('tok-me'), false, 'token não aparece nem para o painel');
  assert.equal(JSON.stringify(gas.state.sheets).includes('tok-me'), false, 'token não fica na planilha');
  assert.equal(JSON.stringify(api.call('catalog')).includes('tok-'), false);
});

test('frete: cotação de teste no painel e aviso de token vencido', () => {
  const { admin, gas } = shippingSetup();
  const ok = admin('adminTestShippingQuote', { cep: '01310-100', category: 'Álbuns' });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.package.kind, 'Caixa');
  assert.equal(ok.options.length, 3);
  assert.deepEqual(ok.errors, []);
  assert.equal(admin('adminData').config.shipping.status.melhorEnvio, null, 'sem falha registrada');

  gas.fetchHandler = (url) => (url.includes('melhorenvio')
    ? { code: 401, body: { message: 'Unauthenticated.' } }
    : { code: 200, body: [{ id: 17, name: 'Mini Envios', price: 10, delivery_time: 9, company: { name: 'Correios' } }] });
  const bad = admin('adminTestShippingQuote', { cep: '01310100' });
  assert.equal(bad.options.length, 1, 'SuperFrete continua funcionando');
  assert.match(bad.errors[0], /Melhor Envio: HTTP 401 — Unauthenticated\. \(token inválido ou vencido/);
  const status = admin('adminData').config.shipping.status;
  assert.match(status.melhorEnvio.error, /401/);
  assert.equal(status.superFrete, null);
  assert.equal(JSON.stringify(gas.fetches.at(-2).options.headers['User-Agent']), JSON.stringify('Cantinho da Army CEG (loja@exemplo.com)'));
  assert.equal(admin('adminTestShippingQuote', { cep: '123' }).ok, false);
});

test('fotos: ADM envia foto do celular para a pasta do Drive', () => {
  const { api: backend, gas } = freshBackend();
  const up = (params) => backend.call('adminUploadPhoto', { password: PASSWORD, mimeType: 'image/jpeg', name: 'Photocard Jimin', data: 'data:image/jpeg;base64,QUJD', ...params });
  assert.equal(backend.call('adminUploadPhoto', { password: 'errada', mimeType: 'image/jpeg', data: 'QUJD' }).ok, false);
  assert.match(up({ mimeType: 'application/pdf' }).error, /JPG, PNG ou WEBP/);
  assert.match(up({ data: '' }).error, /vazia/);
  const r = up();
  assert.equal(r.ok, true);
  assert.match(r.url, /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view/);
  const file = gas.files[r.fileId];
  assert.equal(file.data, 'QUJD'); // o prefixo data: é retirado
  assert.equal(file.sharing, 'ANYONE_WITH_LINK:VIEW');
  assert.match(file.name, /^Photocard Jimin \d+\.jpg$/);
  // a segunda foto vai para a mesma pasta
  const r2 = up();
  assert.equal(gas.files[r2.fileId].folder, file.folder);
});

test('mesmo WhatsApp: junta sozinho no mesmo nome (conta > mais pedidos > mais recente)', () => {
  const { api, admin, gas } = freshBackend();
  const id = addProduct(admin, { totalStock: 10 }).id;
  const claim = (name, contact, whatsapp) => api.call('claim', { productId: id, quantity: 1, buyerName: name, contact, whatsapp });
  // pedidos antigos com nomes diferentes no mesmo número (como na importação)
  const rows = gas.state.sheets['Pedidos'];
  claim('Mariana Silva', '@mari', '11988887777');
  claim('Mariana Silva', '@mari', '11988887777');
  claim('Mariana Silva', '@mari', '11988887777');
  claim('Bia', '@bia', '21977776666');
  rows[3][6] = 'Mari'; // nome errado digitado direto na planilha
  rows[1][7] = '@mari_antigo';

  // claim novo sem conta com nome diferente: usa o nome já conhecido
  const c = claim('Mah', '@mah', '(11) 98888-7777');
  assert.equal(c.order.buyerName, 'Mariana Silva');
  assert.equal(c.nameFromPhone, 'Mariana Silva');
  assert.equal(claim('Beatriz', '@bia', '21977776666').order.buyerName, 'Bia'); // empate 1x0: fica o que já existia

  // abrir o painel junta o que já estava na planilha
  const data = admin('adminData');
  assert.ok(data.unifiedByPhone >= 1);
  const mari = data.orders.filter((o) => o.whatsapp === '11988887777');
  assert.equal(mari.length, 4);
  assert.ok(mari.every((o) => o.buyerName === 'Mariana Silva'));
  assert.ok(mari.some((o) => /nome unificado pelo WhatsApp: "Mari" → "Mariana Silva"/.test(o.history)));
  assert.equal(admin('adminData').unifiedByPhone, 0); // já está tudo junto

  // com conta, o nome da conta vence
  api.call('register', { name: 'Mariana S. Oliveira', contact: '@mari_oficial', whatsapp: '11988887777', password: '123456', code: c.order.orderId });
  const after = admin('adminData');
  assert.equal(after.unifiedByPhone, 4);
  assert.ok(after.orders.filter((o) => o.whatsapp === '11988887777').every((o) => o.buyerName === 'Mariana S. Oliveira' && o.contact === '@mari_oficial'));
  // telefones diferentes não são juntados
  assert.ok(after.orders.some((o) => o.buyerName === 'Bia'));
});

test('mesmo WhatsApp: nome corrigido pela ADM vale para todos os pedidos do número', () => {
  const { api, admin } = freshBackend();
  const id = addProduct(admin, { totalStock: 10 }).id;
  const a = api.call('claim', { productId: id, quantity: 1, buyerName: 'Kay_Army', contact: '@kay', whatsapp: '94984192730' });
  api.call('claim', { productId: id, quantity: 1, buyerName: 'Kay_Army', contact: '@kay', whatsapp: '94984192730' });
  assert.equal(admin('adminTransferOrder', { orderId: a.order.orderId, name: 'Kai Souza', contact: '@kay', whatsapp: '94984192730' }).ok, true);
  const data = admin('adminData');
  assert.equal(data.unifiedByPhone, 0); // não desfaz a correção
  assert.ok(data.orders.filter((o) => o.whatsapp === '94984192730').every((o) => o.buyerName === 'Kai Souza'));
  // venda registrada com outro nome no mesmo número entra no nome certo
  const sale = admin('adminCreateSale', { buyer: { name: 'Kai', whatsapp: '(94) 98419-2730' }, productId: id, unitPrice: 50, payment: { mode: 'avista', paid: false } });
  assert.equal(sale.ok, true, sale.error);
  assert.equal(admin('adminData').orders.find((o) => o.orderId === sale.order.orderId).buyerName, 'Kai Souza');
});

test('código do pedido: aceita traço do celular, espaço, minúscula e sem PED', () => {
  const { api, admin } = freshBackend();
  const id = addProduct(admin).id;
  const c = api.call('claim', { productId: id, quantity: 1, buyerName: 'Ana', contact: '@ana', whatsapp: '47997702807' });
  const rest = c.order.orderId.slice(4);
  ['PED–' + rest, 'PED—' + rest, 'ped ' + rest.toLowerCase(), rest, ' PED-' + rest + ' '].forEach((code) => {
    const r = api.call('myOrders', { whatsapp: '(47) 99770-2807', code });
    assert.equal(r.ok, true, code + ': ' + r.error);
  });
  assert.equal(api.call('myOrders', { whatsapp: '47997702807', code: 'PED-ZZZZZZ' }).ok, false);
});

test('consulta pelo telefone: CEG → SET → item com item, frete e alfândega', () => {
  const { api, admin } = freshBackend();
  const sale = (member, extras, paid = true) => admin('adminCreateSale', {
    buyer: { name: 'Angy', whatsapp: '(65) 9 9246-6554' },
    product: { name: 'Album Arirang - Target Korea vers. — ' + member, member, category: 'Álbuns' },
    batch: 'CEG EUA - Album Arirang', unitPrice: 30, status: 'Comprado', note: 'chega em dezembro',
    payment: { mode: 'avista', paid }, extras
  });
  assert.equal(sale('Jin', [{ kind: 'frete', amount: 7.5, paid: true }]).ok, true);
  const s2 = sale('Jimin', [{ kind: 'frete', amount: 7.5, paid: false, dueDate: '2026-12-10' }, { kind: 'alfandega', amount: 12, paid: false }], false);
  assert.equal(s2.charges.length, 3);
  admin('addCharge', { orderId: s2.order.orderId, description: 'Frete internacional', amount: 5 });
  // outra pessoa e pedido cancelado não aparecem
  admin('adminCreateSale', { buyer: { name: 'Outra', whatsapp: '11999990000' }, product: { name: 'X' }, unitPrice: 10, payment: { mode: 'avista' } });

  assert.match(api.call('consultaTelefone', { whatsapp: '6592' }).error, /DDD/);
  const r = api.call('consultaTelefone', { whatsapp: '+55 (65) 99246-6554' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.buyer.name, 'Angy');
  assert.equal(r.items.length, 2);
  const [jin, jimin] = r.items;
  assert.deepEqual(
    [jin.ceg, jin.set, jin.item, jin.valorItem, jin.pgtoItem, jin.valorFrete, jin.pgtoFrete, jin.taxaAlfandega, jin.pgtoAlfandega, jin.andamento, jin.observacoes],
    ['CEG EUA - Album Arirang', 'Album Arirang - Target Korea vers.', 'Jin', 30, 'Pago', 7.5, 'Pago', '', '', 'Comprado', 'chega em dezembro']
  );
  assert.equal(jimin.valorFrete, 12.5); // frete + frete internacional
  assert.equal(jimin.pgtoFrete, 'Pendente');
  assert.equal(jimin.taxaAlfandega, 12);
  assert.equal(jimin.pgtoItem, 'Pendente');
  assert.equal(jimin.vencimento, '2026-12-10');
  assert.deepEqual(r.totals, { owed: 54.5, paid: 37.5 });
  assert.equal(r.config.pixKey !== undefined, true);
  admin('setOrderStatus', { orderId: s2.order.orderId, status: 'Cancelado' });
  assert.equal(api.call('consultaTelefone', { whatsapp: '65992466554' }).items.length, 1);
  assert.equal(api.call('consultaTelefone', { whatsapp: '65900000000' }).buyer, null);
});
