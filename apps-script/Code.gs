// ============================================================================
// CEG K-POP — BACKEND (Google Apps Script)
// ----------------------------------------------------------------------------
// Cole este arquivo inteiro em Extensões > Apps Script da sua Planilha Google.
// Ele cria sozinho as abas: Config, Produtos, Pedidos e Cobranças.
//
// Regras importantes (tudo é decidido AQUI, nunca no navegador):
//  - O estoque disponível é calculado a partir dos pedidos (nunca fica errado).
//  - Cada claim ACRESCENTA uma linha. Nada é apagado ou sobrescrito.
//  - Dois claims ao mesmo tempo não pegam o mesmo item (trava LockService).
//  - A compradora só vê os próprios pedidos (WhatsApp + código do pedido).
//  - O painel ADM exige a senha definida na aba Config.
//  - Nenhum dado de cartão é coletado. Pagamento é por Pix, fora do sistema.
// ============================================================================

var SHEETS = {
  config: 'Config',
  products: 'Produtos',
  orders: 'Pedidos',
  charges: 'Cobranças',
  clients: 'Clientes'
};

var HEADERS = {
  config: ['Chave', 'Valor', 'Descrição'],
  products: ['ID', 'Nome do Produto', 'Membro', 'Categoria', 'Preço (R$)', 'Estoque Total', 'Foto URL', 'Lote CEG', 'Ativo', 'Prazo Pagamento', 'Datas Pix Parcelado', 'Frete', 'Condição', 'Grupo'],
  orders: ['ID Pedido', 'Data', 'ID Produto', 'Produto', 'Membro', 'Lote', 'Nome', '@ (Insta/Twitter)', 'WhatsApp', 'Qtd', 'Preço Unit. (R$)', 'Total Item (R$)', 'Envio', 'Status', 'Observação', 'Pagamento', 'Obs. da compradora',
    'Repasse: nome', 'Repasse: WhatsApp', 'Repasse: @', 'Histórico'],
  charges: ['ID Cobrança', 'ID Pedido', 'WhatsApp', 'Descrição', 'Valor (R$)', 'Status', 'Criada em', 'Paga em', 'Vencimento'],
  clients: ['WhatsApp', 'Nome', '@ (Insta/Twitter)', 'Senha (protegida)', 'Sal', 'Criada em', 'Último acesso', 'Trocar senha']
};

// Colunas que precisam ser texto puro (evita o Sheets transformar telefone em número)
var TEXT_COLUMNS = {
  config: [2],
  products: [1, 10, 11],
  orders: [1, 3, 9],
  charges: [1, 2, 3, 9],
  clients: [1, 4, 5]
};

var DEFAULT_CONFIG = [
  ['storeName', 'Cantinho da Army CEG', 'Nome da loja exibido no site'],
  ['pixKey', 'sua-chave-pix@exemplo.com', 'Chave Pix mostrada para a compradora'],
  ['pixName', '', 'Nome do titular do Pix (opcional)'],
  ['adminWhatsapp', '5511999999999', 'WhatsApp que recebe os comprovantes (com 55 + DDD)'],
  ['noticeBanner', '💜 CEG aberta! Fez o claim, o item já é seu.', 'Aviso no topo do site'],
  ['claimsOpen', 'SIM', 'SIM = claims abertos | NÃO = só visualização'],
  ['maxPerClaim', '5', 'Quantidade máxima de unidades por claim'],
  ['requireLogin', 'SIM', 'SIM = a compradora precisa ter conta para fazer claim'],
  ['adminPassword', 'TROQUE-ESTA-SENHA', 'Senha do Painel ADM (nunca é enviada ao site)']
];

var DEFAULT_PASSWORD = 'TROQUE-ESTA-SENHA';
var PUBLIC_CONFIG_KEYS = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim', 'requireLogin'];

var ORDER_STATUSES = ['Reservado', 'Comprado', 'A caminho do Brasil', 'Chegou (na bag)', 'Enviado', 'Entregue', 'Cancelado'];
var CHARGE_STATUSES = ['Pendente', 'Pago', 'Cancelada'];
var SHIPPING_OPTIONS = ['Guardar na bag', 'Enviar assim que chegar'];
var SCHEMA_VERSION = '7';
var DEFAULT_GROUP = 'BTS'; // produtos antigos, sem grupo, eram todos de BTS
var SHIPPING_COST_OPTIONS = ['Frete incluso', 'Frete não incluso'];
var CONDITION_OPTIONS = ['Novo', 'Lacrado', 'Aberto'];

// ----------------------------------------------------------------------------
// ENTRADAS HTTP
// ----------------------------------------------------------------------------

function doGet(e) {
  var params = (e && e.parameter) || {};
  return respond_(handle_(params.action || 'catalog', params));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return respond_({ ok: false, error: 'Requisição inválida.' });
  }
  return respond_(handle_(body.action, body));
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var PUBLIC_ACTIONS = {
  catalog: actionCatalog_,
  claim: actionClaim_,
  myOrders: actionMyOrders_,
  register: actionRegister_,
  login: actionLogin_,
  me: actionMe_,
  updateProfile: actionUpdateProfile_,
  changePassword: actionChangePassword_,
  updateMyOrder: actionUpdateMyOrder_,
  cancelMyOrder: actionCancelMyOrder_,
  requestTransfer: actionRequestTransfer_,
  cancelTransferRequest: actionCancelTransferRequest_
};

var ADMIN_ACTIONS = {
  adminLogin: function () { return { ok: true }; },
  adminData: actionAdminData_,
  saveProduct: actionSaveProduct_,
  saveProductBatch: actionSaveProductBatch_,
  deleteProduct: actionDeleteProduct_,
  setOrderStatus: actionSetOrderStatus_,
  setOrderNote: actionSetOrderNote_,
  setChargeStatus: actionSetChargeStatus_,
  addCharge: actionAddCharge_,
  addBatchCharge: actionAddBatchCharge_,
  deleteCharge: actionDeleteCharge_,
  saveConfig: actionSaveConfig_,
  adminResetPassword: actionAdminResetPassword_,
  adminCreateSale: actionAdminCreateSale_,
  adminTransferOrder: actionAdminTransferOrder_,
  adminApproveTransfer: actionAdminApproveTransfer_,
  adminRejectTransfer: actionAdminRejectTransfer_
};

// Ações que alteram a planilha e precisam da trava
var WRITE_ACTIONS = {
  claim: true, saveProduct: true, saveProductBatch: true, deleteProduct: true, setOrderStatus: true, setOrderNote: true,
  setChargeStatus: true, addCharge: true, addBatchCharge: true, deleteCharge: true, saveConfig: true,
  register: true, login: true, updateProfile: true, changePassword: true, updateMyOrder: true, cancelMyOrder: true,
  adminResetPassword: true, adminCreateSale: true, adminTransferOrder: true, adminApproveTransfer: true,
  adminRejectTransfer: true, requestTransfer: true, cancelTransferRequest: true
};

function handle_(action, params) {
  try {
    setup();
    var fn = PUBLIC_ACTIONS[action];
    var isAdmin = false;
    if (!fn && ADMIN_ACTIONS[action]) {
      fn = ADMIN_ACTIONS[action];
      isAdmin = true;
    }
    if (!fn) return { ok: false, error: 'Ação desconhecida.' };

    if (isAdmin) {
      var authError = checkAdmin_(params.password);
      if (authError) return { ok: false, error: authError, authError: true };
    }

    if (!WRITE_ACTIONS[action]) return fn(params);

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(20000);
    } catch (err) {
      return { ok: false, error: 'Muita gente comprando ao mesmo tempo! Tente de novo em alguns segundos.' };
    }
    try {
      return fn(params);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    if (err && err.userMessage) {
      var out = { ok: false, error: err.userMessage };
      if (err.loginRequired) out.loginRequired = true;
      if (err.sessionExpired) out.sessionExpired = true;
      if (err.needsCode) out.needsCode = true;
      return out;
    }
    return { ok: false, error: 'Erro no servidor: ' + (err && err.message ? err.message : err) };
  }
}

function userError_(msg) {
  var err = new Error(msg);
  err.userMessage = msg;
  return err;
}

// ----------------------------------------------------------------------------
// AUTENTICAÇÃO DO ADM (com bloqueio após muitas tentativas erradas)
// ----------------------------------------------------------------------------

function checkAdmin_(password) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('admin_fails') || 0);
  if (fails >= 10) return 'Muitas tentativas erradas. Aguarde 10 minutos.';

  var real = String(getConfigMap_().adminPassword || '');
  if (!real || real === DEFAULT_PASSWORD) {
    return 'Defina uma senha nova na aba "Config" da planilha (linha adminPassword) antes de usar o painel.';
  }
  if (String(password || '') !== real) {
    cache.put('admin_fails', String(fails + 1), 600);
    return 'Senha incorreta.';
  }
  return null;
}

// ----------------------------------------------------------------------------
// ESTRUTURA DA PLANILHA
// ----------------------------------------------------------------------------

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cache = CacheService.getScriptCache();
  var migrated = cache.get('schema') === SCHEMA_VERSION;
  Object.keys(SHEETS).forEach(function (key) {
    var sheet = ss.getSheetByName(SHEETS[key]);
    if (sheet) {
      if (!migrated) addMissingColumns_(sheet, key);
      return;
    }
    sheet = ss.insertSheet(SHEETS[key]);
    var headers = HEADERS[key];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#7c3aed').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    (TEXT_COLUMNS[key] || []).forEach(function (col) {
      sheet.getRange(1, col, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
    if (key === 'config') {
      sheet.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
    }
  });
  if (!migrated) markMigrated_();
}

// Planilhas criadas por versões anteriores ganham as colunas novas no cabeçalho
function addMissingColumns_(sheet, key) {
  var headers = HEADERS[key];
  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  for (var col = 1; col <= headers.length; col++) {
    if (String(current[col - 1] || '').trim() !== '') continue;
    sheet.getRange(1, col, 1, 1).setValues([[headers[col - 1]]])
      .setFontWeight('bold').setBackground('#7c3aed').setFontColor('#ffffff');
    if ((TEXT_COLUMNS[key] || []).indexOf(col) >= 0) {
      sheet.getRange(1, col, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
  }
}

function markMigrated_() {
  CacheService.getScriptCache().put('schema', SCHEMA_VERSION, 21600);
}

function sheet_(key) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS[key]);
}

// Lê a aba como lista de linhas (sem cabeçalho), guardando o número da linha
function readRows_(key) {
  var values = sheet_(key).getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === '') continue;
    rows.push({ rowNumber: i + 1, v: values[i] });
  }
  return rows;
}

function writeRow_(key, rowNumber, arr) {
  sheet_(key).getRange(rowNumber, 1, 1, arr.length).setValues([arr.map(safeCell_)]);
}

function appendRow_(key, arr) {
  sheet_(key).appendRow(arr.map(safeCell_));
}

// Evita que um texto digitado pela compradora vire fórmula na planilha
function safeCell_(value) {
  if (typeof value === 'string' && /^[=+\-]/.test(value)) return "'" + value;
  return value;
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function num_(v) {
  if (typeof v === 'number') return v;
  var s = str_(v).replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  var n = Number(s);
  return isFinite(n) ? n : 0;
}

function money_(n) {
  return Math.round(num_(n) * 100) / 100;
}

function dateCell_(v) {
  if (v instanceof Date) return v;
  var d = new Date(v);
  return v && !isNaN(d.getTime()) ? d : str_(v);
}

function date_(v) {
  if (v instanceof Date) return v.toISOString();
  return str_(v);
}

// Datas trafegam como 'aaaa-mm-dd'. Na planilha ficam como 'dd/mm/aaaa'.
function pad2_(n) { return ('0' + n).slice(-2); }

function dateKey_(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
  }
  var s = str_(v);
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return '';
}

function dateText_(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function dateList_(v) {
  var list = Array.isArray(v) ? v : str_(v).split(/[;,\n]+/);
  var seen = {};
  return list.map(dateKey_).filter(function (k) {
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort();
}

function yes_(v) {
  var s = str_(v).toUpperCase();
  return s === '' || s === 'SIM' || s === 'S' || s === 'TRUE' || s === 'VERDADEIRO' || s === 'YES';
}

// Telefone: guarda só DDD + número (sem o 55)
function phone_(v) {
  var d = str_(v).replace(/\D/g, '');
  if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2);
  return d;
}

function newId_(prefix, existing) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var attempt = 0; attempt < 50; attempt++) {
    var id = prefix;
    for (var i = 0; i < 6; i++) id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    if (!existing[id]) return id;
  }
  throw new Error('Não foi possível gerar um código único.');
}

// ----------------------------------------------------------------------------
// CONVERSÃO LINHA <-> OBJETO
// ----------------------------------------------------------------------------

function getConfigMap_() {
  var map = {};
  readRows_('config').forEach(function (r) { map[str_(r.v[0])] = str_(r.v[1]); });
  return map;
}

function publicConfig_() {
  var map = getConfigMap_();
  var out = {};
  PUBLIC_CONFIG_KEYS.forEach(function (k) { out[k] = map[k] || ''; });
  out.claimsOpen = yes_(out.claimsOpen);
  out.requireLogin = yes_(out.requireLogin);
  out.maxPerClaim = Math.max(1, Math.floor(num_(out.maxPerClaim) || 5));
  out.orderStatuses = ORDER_STATUSES;
  out.shippingCostOptions = SHIPPING_COST_OPTIONS;
  out.conditionOptions = CONDITION_OPTIONS;
  out.shippingOptions = SHIPPING_OPTIONS;
  return out;
}

function toProduct_(r) {
  var v = r.v;
  return {
    rowNumber: r.rowNumber,
    id: str_(v[0]),
    name: str_(v[1]),
    member: str_(v[2]),
    category: str_(v[3]),
    price: money_(v[4]),
    totalStock: Math.max(0, Math.floor(num_(v[5]))),
    image: str_(v[6]),
    batch: str_(v[7]),
    active: yes_(v[8]),
    dueDate: dateKey_(v[9]),
    installmentDates: dateList_(v[10]),
    shippingCost: oneOf_(v[11], SHIPPING_COST_OPTIONS),
    condition: oneOf_(v[12], CONDITION_OPTIONS),
    group: str_(v[13]) || DEFAULT_GROUP
  };
}

// Aceita o valor só se for uma das opções (ignorando maiúsculas e acentos digitados na planilha)
function oneOf_(v, options) {
  var plain = function (t) { return str_(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
  var wanted = plain(v);
  for (var i = 0; i < options.length; i++) if (plain(options[i]) === wanted) return options[i];
  return '';
}

function productRow_(p) {
  return [p.id, p.name, p.member, p.category, p.price, p.totalStock, p.image, p.batch, p.active ? 'SIM' : 'NÃO',
    dateText_(p.dueDate), (p.installmentDates || []).map(dateText_).join('; '), p.shippingCost || '', p.condition || '', p.group || DEFAULT_GROUP];
}

function toOrder_(r) {
  var v = r.v;
  return {
    rowNumber: r.rowNumber,
    orderId: str_(v[0]),
    createdAt: date_(v[1]),
    productId: str_(v[2]),
    productName: str_(v[3]),
    member: str_(v[4]),
    batch: str_(v[5]),
    buyerName: str_(v[6]),
    contact: str_(v[7]),
    whatsapp: phone_(v[8]),
    quantity: Math.max(0, Math.floor(num_(v[9]))),
    unitPrice: money_(v[10]),
    itemTotal: money_(v[11]),
    shipping: str_(v[12]),
    status: str_(v[13]) || 'Reservado',
    note: str_(v[14]),
    payment: str_(v[15]),
    buyerNote: str_(v[16]),
    transferName: str_(v[17]),
    transferWhatsapp: phone_(v[18]),
    transferContact: str_(v[19]),
    history: str_(v[20])
  };
}

function orderRow_(o) {
  return [o.orderId, dateCell_(o.createdAt), o.productId, o.productName,
    o.member, o.batch, o.buyerName, o.contact, o.whatsapp, o.quantity, o.unitPrice, o.itemTotal, o.shipping, o.status, o.note,
    o.payment || '', o.buyerNote || '', o.transferName || '', o.transferWhatsapp || '', o.transferContact || '', o.history || ''];
}

function toCharge_(r) {
  var v = r.v;
  return {
    rowNumber: r.rowNumber,
    chargeId: str_(v[0]),
    orderId: str_(v[1]),
    whatsapp: phone_(v[2]),
    description: str_(v[3]),
    amount: money_(v[4]),
    status: str_(v[5]) || 'Pendente',
    createdAt: date_(v[6]),
    paidAt: date_(v[7]),
    dueDate: dateKey_(v[8])
  };
}

function chargeRow_(c) {
  return [c.chargeId, c.orderId, c.whatsapp, c.description, c.amount, c.status,
    dateCell_(c.createdAt), dateCell_(c.paidAt), dateText_(c.dueDate)];
}

function strip_(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) { if (k !== 'rowNumber') out[k] = obj[k]; });
  return out;
}

function allProducts_() { return readRows_('products').map(toProduct_); }
function allOrders_() { return readRows_('orders').map(toOrder_); }
function allCharges_() { return readRows_('charges').map(toCharge_); }

// Quantidade vendida (não cancelada) por produto
function soldMap_(orders) {
  var sold = {};
  orders.forEach(function (o) {
    if (o.status === 'Cancelado') return;
    sold[o.productId] = (sold[o.productId] || 0) + o.quantity;
  });
  return sold;
}

function withAvailability_(p, sold) {
  var out = strip_(p);
  out.sold = sold[p.id] || 0;
  out.available = Math.max(0, p.totalStock - out.sold);
  return out;
}

function totals_(charges) {
  var t = { owed: 0, paid: 0 };
  charges.forEach(function (c) {
    if (c.status === 'Pendente') t.owed += c.amount;
    else if (c.status === 'Pago') t.paid += c.amount;
  });
  t.owed = money_(t.owed);
  t.paid = money_(t.paid);
  return t;
}

// ----------------------------------------------------------------------------
// AÇÕES PÚBLICAS (COMPRADORAS)
// ----------------------------------------------------------------------------

function actionCatalog_() {
  var sold = soldMap_(allOrders_());
  var products = allProducts_()
    .filter(function (p) { return p.active && p.id; })
    .map(function (p) { return withAvailability_(p, sold); });
  return { ok: true, config: publicConfig_(), products: products };
}

function actionClaim_(params) {
  var config = publicConfig_();
  if (!config.claimsOpen) throw userError_('Os claims estão fechados no momento.');

  var client = params.token ? sessionClient_(params.token) : null;
  if (params.token && !client) throw sessionError_();
  if (!client && config.requireLogin) {
    var e = userError_('Entre na sua conta (ou crie uma) para fazer o claim.');
    e.loginRequired = true;
    throw e;
  }
  var buyerName = client ? client.name : str_(params.buyerName).slice(0, 80);
  var contact = client ? client.contact : str_(params.contact).slice(0, 60);
  var buyerNote = str_(params.buyerNote).replace(/\s+/g, ' ').slice(0, 300);
  var whatsapp = client ? client.whatsapp : phone_(params.whatsapp);
  var quantity = Math.floor(num_(params.quantity));
  var shipping = SHIPPING_OPTIONS.indexOf(str_(params.shipping)) >= 0 ? str_(params.shipping) : SHIPPING_OPTIONS[0];
  var wantsInstallments = str_(params.paymentPlan) === 'parcelado';

  if (buyerName.length < 2) throw userError_('Informe seu nome.');
  if (!contact) throw userError_('Informe seu @ do Instagram ou Twitter.');
  if (whatsapp.length < 10 || whatsapp.length > 11) throw userError_('WhatsApp inválido. Use DDD + número, ex: 11988887777.');
  if (quantity < 1) throw userError_('Quantidade inválida.');
  if (quantity > config.maxPerClaim) throw userError_('Máximo de ' + config.maxPerClaim + ' unidades por claim.');

  var product = null;
  allProducts_().forEach(function (p) { if (p.id === str_(params.productId) && p.active) product = p; });
  if (!product) throw userError_('Produto não encontrado.');

  var orders = allOrders_();
  var available = Math.max(0, product.totalStock - (soldMap_(orders)[product.id] || 0));
  if (available <= 0) throw userError_('Que pena! Esse item acabou de esgotar. 💔');
  if (quantity > available) throw userError_('Só restam ' + available + ' unidade(s) desse item.');

  var existingIds = {};
  orders.forEach(function (o) { existingIds[o.orderId] = true; });
  var now = new Date();
  var order = {
    orderId: newId_('PED-', existingIds),
    createdAt: now,
    productId: product.id,
    productName: product.name,
    member: product.member,
    batch: product.batch,
    buyerName: buyerName,
    contact: contact,
    whatsapp: whatsapp,
    quantity: quantity,
    unitPrice: product.price,
    itemTotal: money_(product.price * quantity),
    shipping: shipping,
    status: 'Reservado',
    note: '',
    buyerNote: buyerNote,
    payment: ''
  };
  var plan = paymentPlan_(product, order.itemTotal, wantsInstallments);
  order.payment = plan.label;
  appendRow_('orders', orderRow_(order));

  var ids = chargeIds_();
  var charges = plan.parts.map(function (part) {
    return newCharge_(order, part.description, part.amount, ids, part.dueDate);
  });

  order.createdAt = now.toISOString();
  return { ok: true, order: order, charge: charges[0], charges: charges, available: available - quantity };
}

// Divide o valor do item conforme a forma de pagamento escolhida
function paymentPlan_(product, total, wantsInstallments) {
  var dates = product.installmentDates || [];
  if (wantsInstallments && dates.length >= 2) {
    var n = dates.length;
    var each = Math.floor((total / n) * 100) / 100;
    var parts = [];
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var amount = i === n - 1 ? money_(total - acc) : each;
      acc = money_(acc + amount);
      parts.push({ description: 'Pix parcelado — parcela ' + (i + 1) + '/' + n, amount: amount, dueDate: dates[i] });
    }
    return { label: 'Pix parcelado ' + n + 'x', parts: parts };
  }
  return {
    label: 'Pix à vista',
    parts: [{ description: '1ª fase — valor do item', amount: total, dueDate: product.dueDate || '' }]
  };
}

// A compradora informa o WhatsApp + o código de QUALQUER pedido dela
function actionMyOrders_(params) {
  var whatsapp, mine;
  if (params.token) {
    var client = sessionClient_(params.token);
    if (!client) throw sessionError_();
    whatsapp = client.whatsapp;
    mine = allOrders_().filter(function (o) { return o.whatsapp === whatsapp; });
  } else {
    whatsapp = phone_(params.whatsapp);
    var code = normalizeCode_(params.code);
    if (whatsapp.length < 10 || !code) throw userError_('Informe seu WhatsApp e o código de um pedido seu.');
    mine = allOrders_().filter(function (o) { return o.whatsapp === whatsapp; });
    var matches = mine.some(function (o) { return o.orderId === code; });
    if (!matches) throw userError_('Não encontramos esse pedido para esse WhatsApp. Confira os dados.');
  }
  if (!mine.length) {
    return { ok: true, buyer: null, orders: [], totals: { owed: 0, paid: 0, items: 0 }, config: publicConfig_() };
  }

  var orderIds = {};
  mine.forEach(function (o) { orderIds[o.orderId] = true; });
  var charges = allCharges_().filter(function (c) { return orderIds[c.orderId]; });
  var products = {};
  allProducts_().forEach(function (p) { products[p.id] = p; });

  var orders = mine.map(function (o) {
    var out = strip_(o);
    out.image = products[o.productId] ? products[o.productId].image : '';
    out.charges = charges.filter(function (c) { return c.orderId === o.orderId; }).map(strip_);
    return out;
  }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });

  var latest = orders[0];
  var activeQty = 0;
  orders.forEach(function (o) { if (o.status !== 'Cancelado') activeQty += o.quantity; });
  var totals = totals_(charges);
  totals.items = activeQty;

  return {
    ok: true,
    buyer: { name: latest.buyerName, contact: latest.contact, whatsapp: whatsapp },
    orders: orders,
    totals: totals,
    config: publicConfig_()
  };
}

// ----------------------------------------------------------------------------
// AÇÕES DO ADM
// ----------------------------------------------------------------------------

function actionAdminData_() {
  var orders = allOrders_();
  var sold = soldMap_(orders);
  var map = getConfigMap_();
  var config = publicConfig_();
  config.claimsOpen = yes_(map.claimsOpen);
  return {
    ok: true,
    config: config,
    products: allProducts_().map(function (p) { return withAvailability_(p, sold); }),
    orders: orders.map(strip_).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }),
    charges: allCharges_().map(strip_),
    clients: readRows_('clients').map(toClient_).map(function (c) {
      return { whatsapp: c.whatsapp, name: c.name, contact: c.contact, createdAt: c.createdAt, lastLogin: c.lastLogin, mustChange: c.mustChange };
    })
  };
}

function actionSaveProduct_(params) {
  var input = params.product || {};
  var products = allProducts_();
  var id = str_(input.id).toUpperCase().replace(/\s+/g, '-');
  var existing = null;
  products.forEach(function (p) { if (p.id === id) existing = p; });

  var product = productFromInput_(input, id);

  if (input.isNew && existing) throw userError_('Já existe um produto com o código ' + id + '.');

  if (existing) {
    var sold = soldMap_(allOrders_())[id] || 0;
    if (product.totalStock < sold) {
      throw userError_('Já foram vendidas ' + sold + ' unidades. O estoque total não pode ser menor que isso.');
    }
    writeRow_('products', existing.rowNumber, productRow_(product));
  } else {
    if (!id) {
      product.id = nextIds_(products, 1)[0];
    }
    if (product.totalStock < 1) throw userError_('O estoque inicial precisa ser pelo menos 1.');
    appendRow_('products', productRow_(product));
  }
  return { ok: true, product: product };
}

function productFromInput_(input, id) {
  var product = {
    id: id,
    name: str_(input.name).slice(0, 150),
    member: str_(input.member) || 'OT7',
    category: str_(input.category) || 'Outros',
    price: money_(input.price),
    totalStock: Math.floor(num_(input.totalStock)),
    image: str_(input.image),
    batch: str_(input.batch) || 'CEG Atual',
    active: input.active === undefined ? true : !!input.active,
    dueDate: dateKey_(input.dueDate),
    installmentDates: dateList_(input.installmentDates || []),
    shippingCost: oneOf_(input.shippingCost, SHIPPING_COST_OPTIONS),
    condition: oneOf_(input.condition, CONDITION_OPTIONS),
    group: str_(input.group).replace(/\s+/g, ' ').slice(0, 40) || DEFAULT_GROUP
  };
  if (str_(input.shippingCost) && !product.shippingCost) throw userError_('Opção de frete inválida.');
  if (str_(input.condition) && !product.condition) throw userError_('Condição inválida.');
  if (product.installmentDates.length === 1) {
    throw userError_('O Pix parcelado precisa de pelo menos 2 datas. Para uma data só, use o prazo para pagamento.');
  }
  if (product.installmentDates.length > 12) throw userError_('Máximo de 12 parcelas.');
  if (!product.name) throw userError_('Informe o nome do produto.');
  if (product.price <= 0) throw userError_('Informe um preço maior que zero.');
  if (product.totalStock < 0) throw userError_('Estoque inválido.');
  return product;
}

// Próximos códigos livres no formato CEG-01, CEG-02...
function nextIds_(products, count) {
  var maxNum = 0;
  products.forEach(function (p) {
    var m = /^CEG-(\d+)$/.exec(p.id);
    if (m) maxNum = Math.max(maxNum, Number(m[1]));
  });
  var ids = [];
  for (var i = 1; i <= count; i++) ids.push('CEG-' + ('0' + (maxNum + i)).slice(-2));
  return ids;
}

// "Anunciar por membro": um item por integrante, criados todos juntos (ou nenhum)
function actionSaveProductBatch_(params) {
  var base = params.product || {};
  var variants = Array.isArray(params.variants) ? params.variants : [];
  if (variants.length < 1) throw userError_('Escolha pelo menos um membro.');
  if (variants.length > 20) throw userError_('Máximo de 20 itens por vez.');

  var products = allProducts_();
  var ids = nextIds_(products, variants.length);
  var seenMember = {};
  var created = variants.map(function (v, i) {
    var member = str_(v.member);
    if (!member) throw userError_('Membro inválido.');
    if (seenMember[member]) throw userError_('O membro ' + member + ' foi escolhido duas vezes.');
    seenMember[member] = true;
    var input = {};
    Object.keys(base).forEach(function (k) { input[k] = base[k]; });
    input.member = member;
    input.name = str_(base.name) + ' — ' + member;
    input.image = str_(v.image) || str_(base.image);
    input.totalStock = v.totalStock === undefined || v.totalStock === '' ? 1 : v.totalStock;
    var product = productFromInput_(input, ids[i]);
    if (!str_(base.name)) throw userError_('Informe o nome do produto.');
    if (product.totalStock < 1) throw userError_('O estoque de ' + member + ' precisa ser pelo menos 1.');
    return product;
  });
  created.forEach(function (p) { appendRow_('products', productRow_(p)); });
  return { ok: true, products: created };
}

function actionDeleteProduct_(params) {
  var id = str_(params.id);
  var product = null;
  allProducts_().forEach(function (p) { if (p.id === id) product = p; });
  if (!product) throw userError_('Produto não encontrado.');
  var hasOrders = allOrders_().some(function (o) { return o.productId === id; });
  if (hasOrders) {
    throw userError_('Esse produto já tem pedidos. Em vez de excluir, use "Ocultar" para tirá-lo do catálogo.');
  }
  sheet_('products').deleteRow(product.rowNumber);
  return { ok: true };
}

function findOrder_(orderId) {
  var found = null;
  allOrders_().forEach(function (o) { if (o.orderId === str_(orderId)) found = o; });
  if (!found) throw userError_('Pedido não encontrado.');
  return found;
}

function actionSetOrderStatus_(params) {
  var status = str_(params.status);
  if (ORDER_STATUSES.indexOf(status) < 0) throw userError_('Status inválido.');
  var order = findOrder_(params.orderId);
  var wasCancelled = order.status === 'Cancelado';
  var isCancelled = status === 'Cancelado';

  // Reativar um pedido cancelado: confere se ainda há estoque
  if (wasCancelled && !isCancelled) {
    var product = null;
    allProducts_().forEach(function (p) { if (p.id === order.productId) product = p; });
    var sold = soldMap_(allOrders_())[order.productId] || 0;
    var stock = product ? product.totalStock : 0;
    if (sold + order.quantity > stock) {
      throw userError_('Não há estoque para reativar esse pedido (o item foi para outra pessoa).');
    }
  }

  order.status = status;
  writeRow_('orders', order.rowNumber, orderRow_(order));

  // Cancelou: cobranças pendentes viram "Cancelada". Reativou: voltam a "Pendente".
  if (wasCancelled !== isCancelled) {
    allCharges_().forEach(function (c) {
      if (c.orderId !== order.orderId) return;
      if (isCancelled && c.status === 'Pendente') c.status = 'Cancelada';
      else if (!isCancelled && c.status === 'Cancelada') c.status = 'Pendente';
      else return;
      writeRow_('charges', c.rowNumber, chargeRow_(c));
    });
  }
  return { ok: true };
}

function actionSetOrderNote_(params) {
  var order = findOrder_(params.orderId);
  order.note = str_(params.note).slice(0, 300);
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true };
}

function findCharge_(chargeId) {
  var found = null;
  allCharges_().forEach(function (c) { if (c.chargeId === str_(chargeId)) found = c; });
  if (!found) throw userError_('Cobrança não encontrada.');
  return found;
}

function actionSetChargeStatus_(params) {
  var status = str_(params.status);
  if (CHARGE_STATUSES.indexOf(status) < 0) throw userError_('Status inválido.');
  var charge = findCharge_(params.chargeId);
  charge.status = status;
  charge.paidAt = status === 'Pago' ? new Date().toISOString() : '';
  writeRow_('charges', charge.rowNumber, chargeRow_(charge));
  return { ok: true };
}

function newCharge_(order, description, amount, existingIds, dueDate, paid) {
  var charge = {
    chargeId: newId_('COB-', existingIds),
    orderId: order.orderId,
    whatsapp: order.whatsapp,
    description: description,
    amount: money_(amount),
    status: paid ? 'Pago' : 'Pendente',
    createdAt: new Date().toISOString(),
    paidAt: paid ? new Date().toISOString() : '',
    dueDate: dateKey_(dueDate)
  };
  existingIds[charge.chargeId] = true;
  appendRow_('charges', chargeRow_(charge));
  return charge;
}

function chargeIds_() {
  var ids = {};
  allCharges_().forEach(function (c) { ids[c.chargeId] = true; });
  return ids;
}

function actionAddCharge_(params) {
  var order = findOrder_(params.orderId);
  if (order.status === 'Cancelado') throw userError_('Esse pedido está cancelado.');
  var description = str_(params.description).slice(0, 120);
  var amount = money_(params.amount);
  if (!description) throw userError_('Descreva a cobrança (ex: Frete internacional).');
  if (amount <= 0) throw userError_('Informe um valor maior que zero.');
  return { ok: true, charge: newCharge_(order, description, amount, chargeIds_(), params.dueDate) };
}

// Lança a mesma cobrança (por unidade) para todos os pedidos ativos de um lote
function actionAddBatchCharge_(params) {
  var batch = str_(params.batch);
  var description = str_(params.description).slice(0, 120);
  var perUnit = money_(params.amountPerUnit);
  if (!batch) throw userError_('Escolha o lote.');
  if (!description) throw userError_('Descreva a cobrança (ex: Frete internacional).');
  if (perUnit <= 0) throw userError_('Informe um valor por unidade maior que zero.');

  var ids = chargeIds_();
  var count = 0;
  var total = 0;
  allOrders_().forEach(function (o) {
    if (o.batch !== batch || o.status === 'Cancelado') return;
    var c = newCharge_(o, description, perUnit * o.quantity, ids, params.dueDate);
    count++;
    total += c.amount;
  });
  if (count === 0) throw userError_('Nenhum pedido ativo nesse lote.');
  return { ok: true, count: count, total: money_(total) };
}

function actionDeleteCharge_(params) {
  var charge = findCharge_(params.chargeId);
  if (charge.status === 'Pago') throw userError_('Essa cobrança já foi paga. Mude o status antes de excluir.');
  sheet_('charges').deleteRow(charge.rowNumber);
  return { ok: true };
}

function actionSaveConfig_(params) {
  var input = params.config || {};
  var rows = readRows_('config');
  var editable = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim', 'requireLogin'];
  editable.forEach(function (key) {
    if (input[key] === undefined) return;
    var value = input[key];
    if (key === 'claimsOpen' || key === 'requireLogin') value = value ? 'SIM' : 'NÃO';
    if (key === 'maxPerClaim') value = String(Math.max(1, Math.floor(num_(value)) || 1));
    if (key === 'adminWhatsapp') value = str_(value).replace(/\D/g, '');
    value = str_(value).slice(0, 300);
    var row = null;
    rows.forEach(function (r) { if (str_(r.v[0]) === key) row = r; });
    if (row) writeRow_('config', row.rowNumber, [key, value, str_(row.v[2])]);
    else appendRow_('config', [key, value, '']);
  });
  return { ok: true, config: publicConfig_() };
}

// ----------------------------------------------------------------------------
// CONTAS DAS COMPRADORAS (WhatsApp + senha)
// ----------------------------------------------------------------------------
// A senha nunca é guardada: só um "resumo" (hash) com sal, repetido várias vezes.
// A sessão é um token assinado (HMAC) que vale 180 dias e deixa de valer se a
// senha for trocada.

var SESSION_DAYS = 180;
var UNDO_MINUTES = 15;

function normalizeCode_(v) {
  var code = str_(v).toUpperCase().replace(/\s/g, '');
  if (code && code.indexOf('PED-') !== 0) code = 'PED-' + code;
  return code;
}

function b64_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function hashPassword_(password, salt) {
  var h = salt + '|' + password;
  for (var i = 0; i < 300; i++) {
    h = b64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function randomToken_(n) {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < n; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return out;
}

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SESSION_SECRET', secret);
  }
  return secret;
}

function sign_(payload, client) {
  return b64_(Utilities.computeHmacSha256Signature(payload + '.' + client.hash, secret_(), Utilities.Charset.UTF_8));
}

function makeToken_(client) {
  var payload = client.whatsapp + '.' + (Date.now() + SESSION_DAYS * 86400000).toString(36);
  return payload + '.' + sign_(payload, client);
}

function toClient_(r) {
  var v = r.v;
  return {
    rowNumber: r.rowNumber,
    whatsapp: phone_(v[0]),
    name: str_(v[1]),
    contact: str_(v[2]),
    hash: str_(v[3]),
    salt: str_(v[4]),
    createdAt: date_(v[5]),
    lastLogin: date_(v[6]),
    mustChange: str_(v[7]).toUpperCase() === 'SIM'
  };
}

function clientRow_(c) {
  return [c.whatsapp, c.name, c.contact, c.hash, c.salt, dateCell_(c.createdAt), dateCell_(c.lastLogin), c.mustChange ? 'SIM' : ''];
}

function findClient_(whatsapp) {
  var found = null;
  readRows_('clients').forEach(function (r) {
    if (!found && phone_(r.v[0]) === whatsapp) found = toClient_(r);
  });
  return found;
}

function sessionClient_(token) {
  var parts = str_(token).split('.');
  if (parts.length !== 3) return null;
  var expires = parseInt(parts[1], 36);
  if (!expires || expires < Date.now()) return null;
  var client = findClient_(parts[0]);
  if (!client || !client.hash) return null;
  return sign_(parts[0] + '.' + parts[1], client) === parts[2] ? client : null;
}

function sessionError_() {
  var e = userError_('Sua sessão expirou. Entre de novo na sua conta.');
  e.sessionExpired = true;
  return e;
}

function profile_(c) {
  return { name: c.name, contact: c.contact, whatsapp: c.whatsapp, mustChange: !!c.mustChange };
}

function checkPassword_(password) {
  var p = String(password || '');
  if (p.length < 6) throw userError_('A senha precisa ter pelo menos 6 caracteres.');
  if (p.length > 100) throw userError_('Senha longa demais.');
  return p;
}

function setPassword_(client, password, mustChange) {
  client.salt = randomToken_(16);
  client.hash = hashPassword_(password, client.salt);
  client.mustChange = !!mustChange;
}

function actionRegister_(params) {
  var name = str_(params.name).slice(0, 80);
  var contact = str_(params.contact).slice(0, 60);
  var whatsapp = phone_(params.whatsapp);
  var password = checkPassword_(params.password);
  if (name.length < 2) throw userError_('Informe seu nome.');
  if (!contact) throw userError_('Informe seu @ do Instagram ou Twitter.');
  if (whatsapp.length < 10 || whatsapp.length > 11) throw userError_('WhatsApp inválido. Use DDD + número, ex: 11988887777.');
  if (findClient_(whatsapp)) throw userError_('Já existe uma conta com esse WhatsApp. Use "Entrar".');

  // Quem já comprou precisa provar que o número é dela com o código de um pedido
  var mine = allOrders_().filter(function (o) { return o.whatsapp === whatsapp; });
  if (mine.length) {
    var code = normalizeCode_(params.code);
    if (!code) {
      var e = userError_('Você já comprou com a gente! 💜 Para proteger seus pedidos, informe o código de um pedido seu.');
      e.needsCode = true;
      throw e;
    }
    if (!mine.some(function (o) { return o.orderId === code; })) {
      var e2 = userError_('Esse código não é de um pedido desse WhatsApp. Confira ou fale com a ADM.');
      e2.needsCode = true;
      throw e2;
    }
  }

  var now = new Date().toISOString();
  var client = { whatsapp: whatsapp, name: name, contact: contact, createdAt: now, lastLogin: now };
  setPassword_(client, password, false);
  appendRow_('clients', clientRow_(client));
  return { ok: true, token: makeToken_(client), profile: profile_(client) };
}

function actionLogin_(params) {
  var whatsapp = phone_(params.whatsapp);
  var cache = CacheService.getScriptCache();
  var key = 'login_fail_' + whatsapp;
  var fails = Number(cache.get(key) || 0);
  if (fails >= 8) throw userError_('Muitas tentativas. Aguarde 15 minutos ou peça uma senha nova para a ADM.');

  var client = findClient_(whatsapp);
  if (!client || client.hash !== hashPassword_(String(params.password || ''), client.salt)) {
    cache.put(key, String(fails + 1), 900);
    throw userError_(client ? 'Senha incorreta.' : 'Não existe conta com esse WhatsApp. Toque em "Criar conta".');
  }
  cache.remove(key);
  client.lastLogin = new Date().toISOString();
  writeRow_('clients', client.rowNumber, clientRow_(client));
  return { ok: true, token: makeToken_(client), profile: profile_(client) };
}

function actionMe_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  return { ok: true, profile: profile_(client) };
}

function actionUpdateProfile_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var name = str_(params.name).slice(0, 80);
  var contact = str_(params.contact).slice(0, 60);
  if (name.length < 2) throw userError_('Informe seu nome.');
  if (!contact) throw userError_('Informe seu @ do Instagram ou Twitter.');
  client.name = name;
  client.contact = contact;
  writeRow_('clients', client.rowNumber, clientRow_(client));
  return { ok: true, profile: profile_(client) };
}

function actionChangePassword_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  if (!client.mustChange && client.hash !== hashPassword_(String(params.currentPassword || ''), client.salt)) {
    throw userError_('Senha atual incorreta.');
  }
  setPassword_(client, checkPassword_(params.newPassword), false);
  writeRow_('clients', client.rowNumber, clientRow_(client));
  return { ok: true, token: makeToken_(client), profile: profile_(client) };
}

function myOrder_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var order = findOrder_(params.orderId);
  if (order.whatsapp !== client.whatsapp) throw userError_('Esse pedido não é seu.');
  return order;
}

// A compradora ajusta observação/envio enquanto o pedido está "Reservado"
function actionUpdateMyOrder_(params) {
  var order = myOrder_(params);
  if (order.status !== 'Reservado') throw userError_('Esse pedido já está em andamento. Fale com a ADM.');
  if (params.buyerNote !== undefined) order.buyerNote = str_(params.buyerNote).replace(/\s+/g, ' ').slice(0, 300);
  if (params.shipping !== undefined && SHIPPING_OPTIONS.indexOf(str_(params.shipping)) >= 0) order.shipping = str_(params.shipping);
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true, order: strip_(order) };
}

// Desfazer um claim feito sem querer (até 15 min, sem nenhum pagamento confirmado)
function actionCancelMyOrder_(params) {
  var order = myOrder_(params);
  if (order.status !== 'Reservado') throw userError_('Esse pedido já está em andamento. Fale com a ADM.');
  var created = new Date(order.createdAt).getTime();
  if (!created || Date.now() - created > UNDO_MINUTES * 60000) {
    throw userError_('Só dá para desfazer nos primeiros ' + UNDO_MINUTES + ' minutos. Fale com a ADM.');
  }
  var charges = allCharges_().filter(function (c) { return c.orderId === order.orderId; });
  if (charges.some(function (c) { return c.status === 'Pago'; })) throw userError_('Esse pedido já tem pagamento. Fale com a ADM.');
  order.status = 'Cancelado';
  order.note = (order.note ? order.note + ' | ' : '') + 'Desfeito pela compradora';
  writeRow_('orders', order.rowNumber, orderRow_(order));
  charges.forEach(function (c) {
    if (c.status !== 'Pendente') return;
    c.status = 'Cancelada';
    writeRow_('charges', c.rowNumber, chargeRow_(c));
  });
  return { ok: true };
}

// ADM gera uma senha temporária (a compradora troca no próximo acesso)
function actionAdminResetPassword_(params) {
  var client = findClient_(phone_(params.whatsapp));
  if (!client) throw userError_('Essa compradora ainda não criou conta.');
  var temp = randomToken_(4).toLowerCase() + Math.floor(1000 + Math.random() * 9000);
  setPassword_(client, temp, true);
  writeRow_('clients', client.rowNumber, clientRow_(client));
  return { ok: true, tempPassword: temp, whatsapp: client.whatsapp, name: client.name };
}


// ----------------------------------------------------------------------------
// REPASSE DE PEDIDOS
// ----------------------------------------------------------------------------
// - A cliente (logada) pede o repasse de um item JÁ PAGO, indicando quem fica
//   com ele. Fica aguardando a aprovação da ADM.
// - A ADM pode repassar qualquer pedido direto (ex.: claim feito no nome errado),
//   o que também serve para corrigir nome/WhatsApp. O que falta pagar vai junto.

function todayText_() {
  var d = new Date();
  return pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' + d.getFullYear();
}

function addHistory_(order, text) {
  order.history = (order.history ? order.history + ' | ' : '') + todayText_() + ' ' + text;
}

function recipient_(params) {
  var whatsapp = phone_(params.whatsapp);
  var name = str_(params.name).slice(0, 80);
  var contact = str_(params.contact).slice(0, 60);
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 11)) throw userError_('WhatsApp inválido. Use DDD + número, ex: 11988887777.');
  var account = whatsapp ? findClient_(whatsapp) : null;
  if (account) {
    name = name || account.name;
    contact = contact || account.contact;
  }
  if (name.length < 2) throw userError_('Informe o nome de quem vai ficar com o item.');
  return { name: name, contact: contact, whatsapp: whatsapp };
}

function orderCharges_(order) {
  return allCharges_().filter(function (c) { return c.orderId === order.orderId; });
}

function isFullyPaid_(charges) {
  var active = charges.filter(function (c) { return c.status !== 'Cancelada'; });
  return active.length > 0 && active.every(function (c) { return c.status === 'Pago'; });
}

// Passa o pedido (e as cobranças) para outra pessoa
function transfer_(order, to, how) {
  var from = order.buyerName;
  order.buyerName = to.name;
  order.contact = to.contact;
  order.whatsapp = to.whatsapp;
  order.transferName = '';
  order.transferWhatsapp = '';
  order.transferContact = '';
  addHistory_(order, how + ': de ' + from + ' para ' + to.name);
  writeRow_('orders', order.rowNumber, orderRow_(order));
  orderCharges_(order).forEach(function (c) {
    c.whatsapp = to.whatsapp;
    writeRow_('charges', c.rowNumber, chargeRow_(c));
  });
  return strip_(order);
}

function actionRequestTransfer_(params) {
  var order = myOrder_(params);
  if (order.status === 'Cancelado') throw userError_('Esse pedido está cancelado.');
  if (order.transferWhatsapp || order.transferName) throw userError_('Já existe um pedido de repasse aguardando a loja.');
  if (!isFullyPaid_(orderCharges_(order))) throw userError_('Só dá para repassar itens que já estão totalmente pagos.');
  var to = recipient_(params);
  if (!to.whatsapp) throw userError_('Informe o WhatsApp de quem vai ficar com o item.');
  if (to.whatsapp === order.whatsapp) throw userError_('Informe o WhatsApp de outra pessoa.');
  order.transferName = to.name;
  order.transferWhatsapp = to.whatsapp;
  order.transferContact = to.contact;
  addHistory_(order, 'repasse pedido pela compradora para ' + to.name);
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true, order: strip_(order) };
}

function actionCancelTransferRequest_(params) {
  var order = myOrder_(params);
  if (!order.transferWhatsapp && !order.transferName) throw userError_('Não há pedido de repasse.');
  order.transferName = '';
  order.transferWhatsapp = '';
  order.transferContact = '';
  addHistory_(order, 'repasse cancelado pela compradora');
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true, order: strip_(order) };
}

function actionAdminApproveTransfer_(params) {
  var order = findOrder_(params.orderId);
  if (!order.transferWhatsapp && !order.transferName) throw userError_('Esse pedido não tem repasse pendente.');
  var to = recipient_({ name: order.transferName, whatsapp: order.transferWhatsapp, contact: order.transferContact });
  return { ok: true, order: transfer_(order, to, 'repasse aprovado') };
}

function actionAdminRejectTransfer_(params) {
  var order = findOrder_(params.orderId);
  if (!order.transferWhatsapp && !order.transferName) throw userError_('Esse pedido não tem repasse pendente.');
  order.transferName = '';
  order.transferWhatsapp = '';
  order.transferContact = '';
  addHistory_(order, 'repasse recusado pela loja');
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true };
}

// ADM repassa (ou corrige a compradora) direto, em qualquer situação de pagamento
function actionAdminTransferOrder_(params) {
  var order = findOrder_(params.orderId);
  var to = recipient_(params);
  if (to.whatsapp === order.whatsapp && to.name === order.buyerName && to.contact === order.contact) {
    throw userError_('Nada mudou.');
  }
  return { ok: true, order: transfer_(order, to, 'repassado pela loja') };
}

// ----------------------------------------------------------------------------
// REGISTRAR VENDA (feita fora do site / antes do sistema)
// ----------------------------------------------------------------------------
function actionAdminCreateSale_(params) {
  var buyer = recipient_(params.buyer || {});
  var quantity = Math.floor(num_(params.quantity)) || 1;
  if (quantity < 1) throw userError_('Quantidade inválida.');

  var products = allProducts_();
  var product = null;
  if (str_(params.productId)) {
    products.forEach(function (p) { if (p.id === str_(params.productId)) product = p; });
    if (!product) throw userError_('Produto não encontrado.');
    if (params.useStock) {
      var available = Math.max(0, product.totalStock - (soldMap_(allOrders_())[product.id] || 0));
      if (quantity > available) throw userError_('Só restam ' + available + ' unidade(s) desse item no estoque.');
    }
  } else {
    // Produto avulso: vira um item oculto (não aparece no catálogo)
    var input = params.product || {};
    var data = {};
    Object.keys(input).forEach(function (k) { data[k] = input[k]; });
    data.price = params.unitPrice;
    data.totalStock = quantity;
    data.active = false;
    product = productFromInput_(data, nextIds_(products, 1)[0]);
    appendRow_('products', productRow_(product));
  }

  var unitPrice = money_(params.unitPrice === undefined || params.unitPrice === '' ? product.price : params.unitPrice);
  if (unitPrice <= 0) throw userError_('Informe o valor.');
  var total = money_(unitPrice * quantity);
  var created = params.date ? dateCell_(dateKey_(params.date) + 'T12:00:00') : new Date();
  if (!(created instanceof Date) || isNaN(created.getTime())) created = new Date();

  var pay = params.payment || {};
  var parts;
  var label;
  if (pay.mode === 'parcelado') {
    var dates = dateList_(pay.installmentDates || []);
    if (dates.length < 2) throw userError_('No Pix parcelado, preencha pelo menos 2 datas.');
    var paidCount = Math.max(0, Math.min(dates.length, Math.floor(num_(pay.paidInstallments))));
    parts = paymentPlan_({ installmentDates: dates }, total, true).parts.map(function (part, i) {
      part.paid = i < paidCount;
      return part;
    });
    label = 'Pix parcelado ' + dates.length + 'x';
  } else {
    parts = [{ description: '1ª fase — valor do item', amount: total, dueDate: dateKey_(pay.dueDate), paid: !!pay.paid }];
    label = 'Pix à vista';
  }

  var ids = {};
  allOrders_().forEach(function (o) { ids[o.orderId] = true; });
  var order = {
    orderId: newId_('PED-', ids),
    createdAt: created,
    productId: product.id,
    productName: product.name,
    member: product.member,
    batch: str_(params.batch) || product.batch,
    buyerName: buyer.name,
    contact: buyer.contact,
    whatsapp: buyer.whatsapp,
    quantity: quantity,
    unitPrice: unitPrice,
    itemTotal: total,
    shipping: SHIPPING_OPTIONS.indexOf(str_(params.shipping)) >= 0 ? str_(params.shipping) : SHIPPING_OPTIONS[0],
    status: ORDER_STATUSES.indexOf(str_(params.status)) >= 0 ? str_(params.status) : 'Comprado',
    note: str_(params.note).slice(0, 300),
    buyerNote: '',
    payment: label
  };
  addHistory_(order, 'venda registrada pela loja');
  appendRow_('orders', orderRow_(order));

  var chargeIdsMap = chargeIds_();
  var charges = parts.map(function (part) {
    return newCharge_(order, part.description, part.amount, chargeIdsMap, part.dueDate, part.paid);
  });
  order.createdAt = created.toISOString();
  return { ok: true, order: order, charges: charges, product: product };
}
