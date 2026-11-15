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
  charges: 'Cobranças'
};

var HEADERS = {
  config: ['Chave', 'Valor', 'Descrição'],
  products: ['ID', 'Nome do Produto', 'Membro', 'Categoria', 'Preço (R$)', 'Estoque Total', 'Foto URL', 'Lote CEG', 'Ativo', 'Prazo Pagamento', 'Datas Pix Parcelado'],
  orders: ['ID Pedido', 'Data', 'ID Produto', 'Produto', 'Membro', 'Lote', 'Nome', '@ (Insta/Twitter)', 'WhatsApp', 'Qtd', 'Preço Unit. (R$)', 'Total Item (R$)', 'Envio', 'Status', 'Observação', 'Pagamento', 'Obs. da compradora'],
  charges: ['ID Cobrança', 'ID Pedido', 'WhatsApp', 'Descrição', 'Valor (R$)', 'Status', 'Criada em', 'Paga em', 'Vencimento']
};

// Colunas que precisam ser texto puro (evita o Sheets transformar telefone em número)
var TEXT_COLUMNS = {
  config: [2],
  products: [1, 10, 11],
  orders: [1, 3, 9],
  charges: [1, 2, 3, 9]
};

var DEFAULT_CONFIG = [
  ['storeName', 'Cantinho da Army CEG', 'Nome da loja exibido no site'],
  ['pixKey', 'sua-chave-pix@exemplo.com', 'Chave Pix mostrada para a compradora'],
  ['pixName', '', 'Nome do titular do Pix (opcional)'],
  ['adminWhatsapp', '5511999999999', 'WhatsApp que recebe os comprovantes (com 55 + DDD)'],
  ['noticeBanner', '💜 CEG aberta! Fez o claim, o item já é seu.', 'Aviso no topo do site'],
  ['claimsOpen', 'SIM', 'SIM = claims abertos | NÃO = só visualização'],
  ['maxPerClaim', '5', 'Quantidade máxima de unidades por claim'],
  ['adminPassword', 'TROQUE-ESTA-SENHA', 'Senha do Painel ADM (nunca é enviada ao site)']
];

var DEFAULT_PASSWORD = 'TROQUE-ESTA-SENHA';
var PUBLIC_CONFIG_KEYS = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim'];

var ORDER_STATUSES = ['Reservado', 'Comprado', 'A caminho do Brasil', 'Chegou (na bag)', 'Enviado', 'Entregue', 'Cancelado'];
var CHARGE_STATUSES = ['Pendente', 'Pago', 'Cancelada'];
var SHIPPING_OPTIONS = ['Guardar na bag', 'Enviar assim que chegar'];
var SCHEMA_VERSION = '3';

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
  myOrders: actionMyOrders_
};

var ADMIN_ACTIONS = {
  adminLogin: function () { return { ok: true }; },
  adminData: actionAdminData_,
  saveProduct: actionSaveProduct_,
  deleteProduct: actionDeleteProduct_,
  setOrderStatus: actionSetOrderStatus_,
  setOrderNote: actionSetOrderNote_,
  setChargeStatus: actionSetChargeStatus_,
  addCharge: actionAddCharge_,
  addBatchCharge: actionAddBatchCharge_,
  deleteCharge: actionDeleteCharge_,
  saveConfig: actionSaveConfig_
};

// Ações que alteram a planilha e precisam da trava
var WRITE_ACTIONS = {
  claim: true, saveProduct: true, deleteProduct: true, setOrderStatus: true, setOrderNote: true,
  setChargeStatus: true, addCharge: true, addBatchCharge: true, deleteCharge: true, saveConfig: true
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
    if (err && err.userMessage) return { ok: false, error: err.userMessage };
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
  out.maxPerClaim = Math.max(1, Math.floor(num_(out.maxPerClaim) || 5));
  out.orderStatuses = ORDER_STATUSES;
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
    installmentDates: dateList_(v[10])
  };
}

function productRow_(p) {
  return [p.id, p.name, p.member, p.category, p.price, p.totalStock, p.image, p.batch, p.active ? 'SIM' : 'NÃO',
    dateText_(p.dueDate), (p.installmentDates || []).map(dateText_).join('; ')];
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
    buyerNote: str_(v[16])
  };
}

function orderRow_(o) {
  return [o.orderId, dateCell_(o.createdAt), o.productId, o.productName,
    o.member, o.batch, o.buyerName, o.contact, o.whatsapp, o.quantity, o.unitPrice, o.itemTotal, o.shipping, o.status, o.note,
    o.payment || '', o.buyerNote || ''];
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

  var buyerName = str_(params.buyerName).slice(0, 80);
  var contact = str_(params.contact).slice(0, 60);
  var buyerNote = str_(params.buyerNote).replace(/\s+/g, ' ').slice(0, 300);
  var whatsapp = phone_(params.whatsapp);
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
  var whatsapp = phone_(params.whatsapp);
  var code = str_(params.code).toUpperCase().replace(/\s/g, '');
  if (code && code.indexOf('PED-') !== 0) code = 'PED-' + code;
  if (whatsapp.length < 10 || !code) throw userError_('Informe seu WhatsApp e o código de um pedido seu.');

  var mine = allOrders_().filter(function (o) { return o.whatsapp === whatsapp; });
  var matches = mine.some(function (o) { return o.orderId === code; });
  if (!matches) throw userError_('Não encontramos esse pedido para esse WhatsApp. Confira os dados.');

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
    charges: allCharges_().map(strip_)
  };
}

function actionSaveProduct_(params) {
  var input = params.product || {};
  var products = allProducts_();
  var id = str_(input.id).toUpperCase().replace(/\s+/g, '-');
  var existing = null;
  products.forEach(function (p) { if (p.id === id) existing = p; });

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
    installmentDates: dateList_(input.installmentDates || [])
  };
  if (product.installmentDates.length === 1) {
    throw userError_('O Pix parcelado precisa de pelo menos 2 datas. Para uma data só, use o prazo para pagamento.');
  }
  if (product.installmentDates.length > 12) throw userError_('Máximo de 12 parcelas.');
  if (!product.name) throw userError_('Informe o nome do produto.');
  if (product.price <= 0) throw userError_('Informe um preço maior que zero.');
  if (product.totalStock < 0) throw userError_('Estoque inválido.');

  if (input.isNew && existing) throw userError_('Já existe um produto com o código ' + id + '.');

  if (existing) {
    var sold = soldMap_(allOrders_())[id] || 0;
    if (product.totalStock < sold) {
      throw userError_('Já foram vendidas ' + sold + ' unidades. O estoque total não pode ser menor que isso.');
    }
    writeRow_('products', existing.rowNumber, productRow_(product));
  } else {
    if (!id) {
      var maxNum = 0;
      products.forEach(function (p) {
        var m = /^CEG-(\d+)$/.exec(p.id);
        if (m) maxNum = Math.max(maxNum, Number(m[1]));
      });
      product.id = 'CEG-' + ('0' + (maxNum + 1)).slice(-2);
    }
    if (product.totalStock < 1) throw userError_('O estoque inicial precisa ser pelo menos 1.');
    appendRow_('products', productRow_(product));
  }
  return { ok: true, product: product };
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

function newCharge_(order, description, amount, existingIds, dueDate) {
  var charge = {
    chargeId: newId_('COB-', existingIds),
    orderId: order.orderId,
    whatsapp: order.whatsapp,
    description: description,
    amount: money_(amount),
    status: 'Pendente',
    createdAt: new Date().toISOString(),
    paidAt: '',
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
  var editable = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim'];
  editable.forEach(function (key) {
    if (input[key] === undefined) return;
    var value = input[key];
    if (key === 'claimsOpen') value = value ? 'SIM' : 'NÃO';
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
