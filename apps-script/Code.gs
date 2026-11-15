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
  clients: 'Clientes',
  requests: 'Solicitações',
  addresses: 'Endereços',
  shipments: 'Envios'
};

var HEADERS = {
  config: ['Chave', 'Valor', 'Descrição'],
  products: ['ID', 'Nome do Produto', 'Membro', 'Categoria', 'Preço (R$)', 'Estoque Total', 'Foto URL', 'Lote CEG', 'Ativo', 'Prazo Pagamento', 'Datas Pix Parcelado', 'Frete', 'Condição', 'Grupo'],
  orders: ['ID Pedido', 'Data', 'ID Produto', 'Produto', 'Membro', 'Lote', 'Nome', '@ (Insta/Twitter)', 'WhatsApp', 'Qtd', 'Preço Unit. (R$)', 'Total Item (R$)', 'Envio', 'Status', 'Observação', 'Pagamento', 'Obs. da compradora',
    'Repasse: nome', 'Repasse: WhatsApp', 'Repasse: @', 'Histórico', 'Forma de pagamento', 'Foto'],
  charges: ['ID Cobrança', 'ID Pedido', 'WhatsApp', 'Descrição', 'Valor (R$)', 'Status', 'Criada em', 'Paga em', 'Vencimento', 'Último lembrete'],
  clients: ['WhatsApp', 'Nome', '@ (Insta/Twitter)', 'Senha (protegida)', 'Sal', 'Criada em', 'Último acesso', 'Trocar senha'],
  requests: ['ID', 'Data', 'Tipo', 'ID Pedido', 'Cobranças', 'WhatsApp', 'Nome', 'Mensagem', 'Nova data pedida', 'Status',
    'Resposta da loja', 'Respondida em', 'Data aprovada'],
  addresses: ['ID', 'WhatsApp', 'Apelido', 'Destinatário', 'CEP', 'Rua', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'Criado em'],
  shipments: ['ID', 'Data', 'WhatsApp', 'Nome', 'Pedidos', 'Endereço', 'CEP', 'Plataforma', 'Serviço', 'Frete (R$)', 'Prazo (dias)',
    'Status', 'Rastreio', 'ID Cobrança', 'Pacote']
};

// Colunas que precisam ser texto puro (evita o Sheets transformar telefone em número)
var TEXT_COLUMNS = {
  config: [2],
  products: [1, 10, 11],
  orders: [1, 3, 9],
  charges: [1, 2, 3, 9],
  clients: [1, 4, 5],
  requests: [1, 4, 5, 6, 9, 13],
  addresses: [1, 2, 5, 7],
  shipments: [1, 3, 5, 7, 13, 14]
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
  ['acceptCard', 'SIM', 'SIM = a compradora pode escolher cartão de crédito (a loja envia o link)'],
  ['reminderEmail', '', 'E-mail que recebe o resumo diário de cobranças'],
  ['reminderDaysBefore', '2', 'Quantos dias antes do vencimento entra o lembrete'],
  ['shippingFromCep', '', 'CEP de onde a loja envia (para calcular o frete)'],
  ['shippingContactEmail', '', 'E-mail técnico exigido pelas APIs de frete (Melhor Envio / SuperFrete)'],
  ['shippingSandbox', 'NÃO', 'SIM = usar o ambiente de testes das APIs de frete'],
  ['shippingDueDays', '3', 'Prazo (dias) para pagar o frete depois de pedir o envio'],
  ['packageDefaults', '', 'Peso (g) e medidas (cm) padrão por categoria — edite pelo painel'],
  ['adminPassword', 'TROQUE-ESTA-SENHA', 'Senha do Painel ADM (nunca é enviada ao site)']
];

var DEFAULT_PASSWORD = 'TROQUE-ESTA-SENHA';
var PUBLIC_CONFIG_KEYS = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim', 'requireLogin', 'acceptCard'];

var ORDER_STATUSES = ['Reservado', 'Comprado', 'A caminho do Brasil', 'Chegou (na bag)', 'Enviado', 'Entregue', 'Cancelado'];
var CHARGE_STATUSES = ['Pendente', 'Pago', 'Cancelada'];
var SHIPPING_OPTIONS = ['Guardar na bag', 'Enviar assim que chegar'];
var SCHEMA_VERSION = '11';
var PAYMENT_METHODS = ['Pix', 'Cartão de crédito'];
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
  cancelTransferRequest: actionCancelTransferRequest_,
  requestCorrection: actionRequestCorrection_,
  requestExtension: actionRequestExtension_,
  cancelMyRequest: actionCancelMyRequest_,
  myAddresses: actionMyAddresses_,
  saveAddress: actionSaveAddress_,
  deleteAddress: actionDeleteAddress_,
  quoteShipping: actionQuoteShipping_,
  requestShipping: actionRequestShipping_
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
  adminRejectTransfer: actionAdminRejectTransfer_,
  adminReminders: actionAdminReminders_,
  adminMarkReminded: actionAdminMarkReminded_,
  adminSendDigest: actionAdminSendDigest_,
  adminUpdateBuyer: actionAdminUpdateBuyer_,
  adminDeleteAccount: actionAdminDeleteAccount_,
  adminUpdateCharge: actionAdminUpdateCharge_,
  adminUpdateOrder: actionAdminUpdateOrder_,
  adminSplitOrder: actionAdminSplitOrder_,
  adminAnswerRequest: actionAdminAnswerRequest_,
  adminSaveShippingSettings: actionAdminSaveShippingSettings_,
  adminSetShippingPrice: actionAdminSetShippingPrice_,
  adminMarkShipped: actionAdminMarkShipped_,
  adminTestShippingQuote: actionAdminTestShippingQuote_
};

// Ações que alteram a planilha e precisam da trava
var WRITE_ACTIONS = {
  claim: true, saveProduct: true, saveProductBatch: true, deleteProduct: true, setOrderStatus: true, setOrderNote: true,
  setChargeStatus: true, addCharge: true, addBatchCharge: true, deleteCharge: true, saveConfig: true,
  register: true, login: true, updateProfile: true, changePassword: true, updateMyOrder: true, cancelMyOrder: true,
  adminResetPassword: true, adminCreateSale: true, adminTransferOrder: true, adminApproveTransfer: true,
  adminRejectTransfer: true, requestTransfer: true, cancelTransferRequest: true, adminMarkReminded: true,
  adminUpdateBuyer: true, adminDeleteAccount: true, adminUpdateCharge: true, adminUpdateOrder: true, adminSplitOrder: true,
  requestCorrection: true, requestExtension: true, cancelMyRequest: true, adminAnswerRequest: true,
  saveAddress: true, deleteAddress: true, requestShipping: true, adminSaveShippingSettings: true, adminSetShippingPrice: true,
  adminMarkShipped: true
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
      if (err.conflict) { out.conflict = true; out.conflictNames = err.conflictNames; }
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
  out.acceptCard = yes_(out.acceptCard);
  out.paymentMethods = PAYMENT_METHODS;
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
    history: str_(v[20]),
    paymentMethod: oneOf_(v[21], PAYMENT_METHODS) || 'Pix',
    image: str_(v[22])
  };
}

function orderRow_(o) {
  return [o.orderId, dateCell_(o.createdAt), o.productId, o.productName,
    o.member, o.batch, o.buyerName, o.contact, o.whatsapp, o.quantity, o.unitPrice, o.itemTotal, o.shipping, o.status, o.note,
    o.payment || '', o.buyerNote || '', o.transferName || '', o.transferWhatsapp || '', o.transferContact || '', o.history || '', o.paymentMethod || 'Pix', o.image || ''];
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
    dueDate: dateKey_(v[8]),
    lastReminder: dateKey_(v[9])
  };
}

function chargeRow_(c) {
  return [c.chargeId, c.orderId, c.whatsapp, c.description, c.amount, c.status,
    dateCell_(c.createdAt), dateCell_(c.paidAt), dateText_(c.dueDate), dateText_(c.lastReminder)];
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
  var paymentMethod = oneOf_(params.paymentMethod, PAYMENT_METHODS) || 'Pix';
  if (paymentMethod !== 'Pix' && !config.acceptCard) throw userError_('No momento aceitamos só Pix.');
  var wantsInstallments = paymentMethod === 'Pix' && str_(params.paymentPlan) === 'parcelado';

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
    payment: '',
    paymentMethod: paymentMethod
  };
  var plan = paymentPlan_(product, order.itemTotal, wantsInstallments);
  order.payment = paymentMethod === 'Pix' ? plan.label : 'Cartão de crédito';
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
  var requests = allRequests_().filter(function (r) { return orderIds[r.orderId]; });
  var shipments = allShipments_().filter(function (sh) { return sh.whatsapp === whatsapp; }).map(strip_);

  var orders = mine.map(function (o) {
    var out = strip_(o);
    out.image = o.image || (products[o.productId] ? products[o.productId].image : '');
    out.charges = charges.filter(function (c) { return c.orderId === o.orderId; }).map(strip_);
    out.requests = requests.filter(function (r) { return r.orderId === o.orderId; }).map(strip_);
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
    shipments: shipments,
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
  config.reminderEmail = str_(map.reminderEmail);
  config.reminderDaysBefore = reminderDays_(map);
  config.dailyEmailActive = dailyTriggerActive_();
  config.today = dateKey_(new Date());
  config.shipping = shippingSettings_();
  return {
    ok: true,
    config: config,
    products: allProducts_().map(function (p) { return withAvailability_(p, sold); }),
    orders: orders.map(strip_).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }),
    charges: allCharges_().map(strip_),
    requests: allRequests_().map(strip_),
    shipments: allShipments_().map(strip_),
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
    paidAt: paid ? (typeof paid === 'string' ? paid : new Date().toISOString()) : '',
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
  var editable = ['storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner', 'claimsOpen', 'maxPerClaim', 'requireLogin',
    'acceptCard', 'reminderEmail', 'reminderDaysBefore'];
  editable.forEach(function (key) {
    if (input[key] === undefined) return;
    var value = input[key];
    if (key === 'claimsOpen' || key === 'requireLogin' || key === 'acceptCard') value = value ? 'SIM' : 'NÃO';
    if (key === 'reminderDaysBefore') value = String(Math.max(0, Math.min(15, Math.floor(num_(value)) || 0)));
    if (key === 'reminderEmail') {
      value = str_(value).toLowerCase();
      if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw userError_('E-mail inválido.');
    }
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
  if (params.paymentMethod !== undefined) {
    var method = oneOf_(params.paymentMethod, PAYMENT_METHODS);
    if (!method) throw userError_('Forma de pagamento inválida.');
    if (method !== 'Pix' && !publicConfig_().acceptCard) throw userError_('No momento aceitamos só Pix.');
    if (method !== 'Pix' && orderCharges_(order).length > 1) throw userError_('Pedido no Pix parcelado não pode ir para o cartão. Fale com a ADM.');
    if (method !== order.paymentMethod) addHistory_(order, 'forma de pagamento: ' + method);
    order.paymentMethod = method;
    order.payment = method === 'Pix' ? 'Pix à vista' : 'Cartão de crédito';
  }
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

// ----------------------------------------------------------------------------
// COBRANÇAS DO DIA + RESUMO DIÁRIO POR E-MAIL
// ----------------------------------------------------------------------------
// Monta, por compradora, o que está vencido, vence hoje ou vence nos próximos
// N dias (Config: reminderDaysBefore). Cada grupo já vem com a mensagem pronta
// e o link do WhatsApp. O resumo vai por e-mail todo dia (gatilho diário).

var DAILY_HANDLER = 'enviarResumoDiario';

function reminderDays_(map) {
  var n = Math.floor(num_((map || getConfigMap_()).reminderDaysBefore));
  return isFinite(n) && n >= 0 ? Math.min(15, n) : 2;
}

function addDaysKey_(key, days) {
  var p = key.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + days, 12);
  return dateKey_(d);
}

function brl_(n) {
  var parts = money_(n).toFixed(2).split('.');
  return 'R$ ' + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1];
}

function waUrl_(whatsapp, text) {
  var d = phone_(whatsapp);
  if (!d) return '';
  return 'https://wa.me/55' + d + '?text=' + encodeURIComponent(text);
}

function reminderGroups_() {
  var map = getConfigMap_();
  var config = publicConfig_();
  var today = dateKey_(new Date());
  var limit = addDaysKey_(today, reminderDays_(map));
  var orders = {};
  allOrders_().forEach(function (o) { if (o.status !== 'Cancelado') orders[o.orderId] = o; });

  var groups = {};
  var cardWaiting = {};
  allCharges_().forEach(function (c) {
    var o = orders[c.orderId];
    if (!o || c.status !== 'Pendente') return;
    if (o.paymentMethod === 'Cartão de crédito') cardWaiting[o.orderId] = o;
    if (!c.dueDate || c.dueDate > limit) return;
    var kind = c.dueDate < today ? 'overdue' : c.dueDate === today ? 'today' : 'soon';
    var key = o.whatsapp || 'sem:' + o.buyerName;
    var g = groups[key] = groups[key] || {
      whatsapp: o.whatsapp, name: o.buyerName, contact: o.contact, items: [], total: 0,
      overdue: 0, today: 0, soon: 0, remindedToday: true, hasCard: false
    };
    g.items.push({
      chargeId: c.chargeId, orderId: o.orderId, productName: o.productName, quantity: o.quantity,
      description: c.description, amount: c.amount, dueDate: c.dueDate, kind: kind, paymentMethod: o.paymentMethod
    });
    g.total = money_(g.total + c.amount);
    g[kind]++;
    if (c.lastReminder !== today) g.remindedToday = false;
    if (o.paymentMethod === 'Cartão de crédito') g.hasCard = true;
  });

  var list = Object.keys(groups).map(function (k) {
    var g = groups[k];
    g.items.sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : 1; });
    g.kind = g.overdue ? 'overdue' : g.today ? 'today' : 'soon';
    g.message = reminderMessage_(g, config);
    g.link = waUrl_(g.whatsapp, g.message);
    return g;
  });
  var rank = { overdue: 0, today: 1, soon: 2 };
  list.sort(function (a, b) { return rank[a.kind] - rank[b.kind] || b.total - a.total; });

  var cards = Object.keys(cardWaiting).map(function (id) {
    var o = cardWaiting[id];
    var text = 'Oii ' + o.buyerName.split(' ')[0] + '! 💜 Aqui é da ' + config.storeName + '. Segue o link para pagar no cartão o pedido ' +
      o.orderId + ' (' + o.quantity + 'x ' + o.productName + ' — ' + brl_(o.itemTotal) + '): ';
    return { orderId: o.orderId, name: o.buyerName, whatsapp: o.whatsapp, productName: o.productName, quantity: o.quantity,
      total: o.itemTotal, createdAt: date_(o.createdAt), link: waUrl_(o.whatsapp, text) };
  });
  return { today: today, daysBefore: reminderDays_(map), groups: list, cards: cards };
}

function reminderMessage_(g, config) {
  var line = function (i) {
    return '• ' + i.orderId + ' — ' + i.quantity + 'x ' + i.productName + ': ' + i.description + ' (' + brl_(i.amount) + ')';
  };
  var section = function (kind, title, suffix) {
    var items = g.items.filter(function (i) { return i.kind === kind; });
    if (!items.length) return '';
    return title + '\n' + items.map(function (i) { return line(i) + suffix(i); }).join('\n') + '\n\n';
  };
  var text = 'Oii ' + g.name.split(' ')[0] + '! 💜 Passando para lembrar dos pagamentos da ' + config.storeName + ':\n\n' +
    section('overdue', '⚠️ *Vencido*', function (i) { return ' — venceu ' + dateText_(i.dueDate).slice(0, 5); }) +
    section('today', '📅 *Vence hoje*', function () { return ''; }) +
    section('soon', '⏰ *Vence em breve*', function (i) { return ' — até ' + dateText_(i.dueDate).slice(0, 5); }) +
    '*Total: ' + brl_(g.total) + '*\n';
  var pix = g.items.some(function (i) { return i.paymentMethod !== 'Cartão de crédito'; });
  if (pix && config.pixKey) text += 'Chave Pix: ' + config.pixKey + (config.pixName ? ' (' + config.pixName + ')' : '') + '\n';
  if (g.hasCard) text += 'Para o que é no cartão, se ainda não recebeu o link é só me avisar!\n';
  return text + '\nDepois de pagar, me manda o comprovante por aqui. 💜';
}

function actionAdminReminders_() {
  var r = reminderGroups_();
  r.ok = true;
  return r;
}

function actionAdminMarkReminded_(params) {
  var ids = {};
  (params.chargeIds || []).forEach(function (id) { ids[str_(id)] = true; });
  var today = dateKey_(new Date());
  var count = 0;
  allCharges_().forEach(function (c) {
    if (!ids[c.chargeId]) return;
    c.lastReminder = today;
    writeRow_('charges', c.rowNumber, chargeRow_(c));
    count++;
  });
  return { ok: true, count: count };
}

function dailyTriggerActive_() {
  try {
    return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === DAILY_HANDLER; });
  } catch (err) {
    return false; // ainda sem autorização para ver os gatilhos
  }
}

function digestHtml_(r, config) {
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var titles = { overdue: '⚠️ Vencidas', today: '📅 Vencem hoje', soon: '⏰ Vencem nos próximos ' + r.daysBefore + ' dia(s)' };
  var html = '<div style="font-family:Arial,sans-serif;color:#1e293b;max-width:640px">' +
    '<h2 style="color:#6b21a8">💜 ' + esc(config.storeName) + ' — cobranças de ' + esc(dateText_(r.today)) + '</h2>';
  ['overdue', 'today', 'soon'].forEach(function (kind) {
    var gs = r.groups.filter(function (g) { return g.kind === kind; });
    if (!gs.length) return;
    html += '<h3 style="margin:20px 0 8px">' + titles[kind] + ' (' + gs.length + ')</h3>';
    gs.forEach(function (g) {
      html += '<div style="border:1px solid #e9d5ff;border-radius:12px;padding:10px 12px;margin:8px 0">' +
        '<b>' + esc(g.name) + '</b> ' + esc(g.contact || '') + ' — <b>' + brl_(g.total) + '</b>' +
        (g.remindedToday ? ' <span style="color:#059669">(já cobrada hoje)</span>' : '') +
        '<ul style="margin:6px 0;padding-left:18px;font-size:13px">' +
        g.items.map(function (i) {
          return '<li>' + esc(i.orderId + ' — ' + i.quantity + 'x ' + i.productName + ': ' + i.description) + ' — ' + brl_(i.amount) +
            ' (venc. ' + dateText_(i.dueDate) + ')' + (i.paymentMethod === 'Cartão de crédito' ? ' 💳' : '') + '</li>';
        }).join('') + '</ul>' +
        (g.link ? '<a href="' + g.link + '" style="display:inline-block;background:#059669;color:#fff;padding:8px 14px;border-radius:10px;text-decoration:none;font-weight:bold">Enviar cobrança no WhatsApp</a>'
          : '<span style="color:#b45309">Sem WhatsApp cadastrado</span>') +
        '</div>';
    });
  });
  if (r.requests && r.requests.length) {
    html += '<h3 style="margin:20px 0 8px">📨 Solicitações das clientes esperando resposta (' + r.requests.length + ')</h3>';
    r.requests.forEach(function (q) {
      html += '<div style="border:1px solid #fde68a;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13px">' +
        '<b>' + esc(q.type) + '</b> — ' + esc(q.name) + ' — pedido ' + esc(q.orderId) +
        (q.requestedDate ? ' — pede prazo até <b>' + dateText_(q.requestedDate) + '</b>' : '') +
        (q.message ? '<br><i>"' + esc(q.message) + '"</i>' : '') + '</div>';
    });
    html += '<p style="font-size:12px;color:#64748b">Responda em ADM → Solicitações.</p>';
  }
  if (r.cards.length) {
    html += '<h3 style="margin:20px 0 8px">💳 Escolheram cartão — enviar link (' + r.cards.length + ')</h3>';
    r.cards.forEach(function (c) {
      html += '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13px">' +
        '<b>' + esc(c.name) + '</b> — ' + esc(c.orderId + ' • ' + c.quantity + 'x ' + c.productName) + ' — ' + brl_(c.total) +
        (c.link ? ' — <a href="' + c.link + '">mandar link</a>' : '') + '</div>';
    });
  }
  return html + '<p style="font-size:12px;color:#64748b;margin-top:24px">Também está no site: ADM → Cobranças do dia. ' +
    'Os botões abrem o WhatsApp com a mensagem pronta.</p></div>';
}

// Envia o resumo. Sem nada para cobrar, não manda e-mail (a não ser no teste).
function sendDigest_(force) {
  var map = getConfigMap_();
  var to = str_(map.reminderEmail);
  if (!to) throw userError_('Cadastre o e-mail do resumo em ADM → Configurações.');
  var config = publicConfig_();
  var r = reminderGroups_();
  r.requests = allRequests_().filter(function (q) { return q.status === 'Pendente'; });
  var empty = !r.groups.length && !r.cards.length && !r.requests.length;
  if (empty && !force) return { sent: false, groups: 0 };
  var count = function (k) { return r.groups.filter(function (g) { return g.kind === k; }).length; };
  var subject = config.storeName + ' — cobranças de ' + dateText_(r.today) + ': ' + count('overdue') + ' vencida(s), ' +
    count('today') + ' hoje, ' + count('soon') + ' em breve' + (r.cards.length ? ', ' + r.cards.length + ' cartão' : '') +
    (r.requests.length ? ', ' + r.requests.length + ' solicitação(ões)' : '');
  var html = empty ? '<p>Nenhuma cobrança vencida ou vencendo nos próximos dias. 🎉 (e-mail de teste)</p>' : digestHtml_(r, config);
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: config.storeName });
  return { sent: true, groups: r.groups.length, cards: r.cards.length, to: to };
}

// Chamado pelo gatilho diário
function enviarResumoDiario() {
  setup();
  sendDigest_(false);
}

// >>> Rode esta função UMA VEZ no editor do Apps Script para ligar o resumo diário (8h) <<<
function ativarResumoDiario() {
  setup();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DAILY_HANDLER) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(DAILY_HANDLER).timeBased().everyDays(1).atHour(8).create();
  try {
    sendDigest_(true);
  } catch (err) {
    Logger.log('Resumo ativado. Para receber, cadastre o e-mail em ADM → Configurações. (' + (err.userMessage || err.message) + ')');
    return;
  }
  Logger.log('Resumo diário ativado (todo dia por volta das 8h). Um e-mail de teste foi enviado agora.');
}

function actionAdminSendDigest_() {
  var r = sendDigest_(true);
  r.ok = true;
  return r;
}

// ----------------------------------------------------------------------------
// CORRIGIR / JUNTAR COMPRADORAS (todos os pedidos de um WhatsApp de uma vez)
// ----------------------------------------------------------------------------
// Grava em bloco (uma escrita por aba), para funcionar rápido mesmo com
// dezenas de pedidos.

function actionAdminUpdateBuyer_(params) {
  var from = phone_(params.whatsapp);
  if (!from) throw userError_('Essa compradora não tem WhatsApp. Corrija pedido por pedido em ADM → Pedidos.');
  var to = phone_(params.newWhatsapp || params.whatsapp);
  if (to.length < 10 || to.length > 11) throw userError_('WhatsApp inválido. Use DDD + número, ex: 11988887777.');
  var name = str_(params.name).replace(/\s+/g, ' ').slice(0, 80);
  var contact = str_(params.contact).slice(0, 60);
  if (name.length < 2) throw userError_('Informe o nome.');

  var orderSheet = sheet_('orders');
  var orderValues = orderSheet.getDataRange().getValues();
  var mine = 0;
  var others = {};
  for (var i = 1; i < orderValues.length; i++) {
    var wa = phone_(orderValues[i][8]);
    if (wa === from) mine++;
    else if (to !== from && wa === to) others[str_(orderValues[i][6])] = true;
  }
  var fromClient = findClient_(from);
  var toClient = to !== from ? findClient_(to) : null;
  if (!mine && !fromClient) throw userError_('Nenhum pedido ou conta com esse WhatsApp.');
  if (toClient) others[toClient.name] = true;

  var otherNames = Object.keys(others);
  var merging = otherNames.length > 0;
  if (merging && !params.merge) {
    var e = userError_('Esse WhatsApp já é de ' + otherNames.join(', ') + '. Se for a mesma pessoa, confirme para juntar os cadastros.');
    e.conflict = true;
    e.conflictNames = otherNames;
    throw e;
  }

  var stamp = todayText_() + ' ' + (merging ? 'cadastro juntado pela loja' : 'dados da compradora corrigidos pela loja');
  var changed = 0;
  for (var r = 1; r < orderValues.length; r++) {
    var w = phone_(orderValues[r][8]);
    if (w !== from && !(merging && w === to)) continue;
    if (w === from) {
      var h = str_(orderValues[r][20]);
      orderValues[r][20] = (h ? h + ' | ' : '') + stamp;
    }
    orderValues[r][6] = safeCell_(name);
    orderValues[r][7] = safeCell_(contact || str_(orderValues[r][7]));
    orderValues[r][8] = to;
    changed++;
  }
  if (orderValues.length > 1) {
    orderSheet.getRange(2, 1, orderValues.length - 1, orderValues[0].length).setValues(orderValues.slice(1));
  }

  if (from !== to) {
    var chargeSheet = sheet_('charges');
    var chargeValues = chargeSheet.getDataRange().getValues();
    var touched = false;
    for (var c = 1; c < chargeValues.length; c++) {
      if (phone_(chargeValues[c][2]) === from) { chargeValues[c][2] = to; touched = true; }
    }
    if (touched) chargeSheet.getRange(2, 1, chargeValues.length - 1, chargeValues[0].length).setValues(chargeValues.slice(1));
  }

  // Conta: fica a do número certo. Se só existia a do número antigo, ela muda de número.
  var account = '';
  if (fromClient && toClient) {
    sheet_('clients').deleteRow(fromClient.rowNumber);
    toClient = findClient_(to);
    toClient.name = name;
    toClient.contact = contact || toClient.contact;
    writeRow_('clients', toClient.rowNumber, clientRow_(toClient));
    account = 'Ficou só a conta do WhatsApp ' + to + ' (a do número antigo foi removida).';
  } else if (fromClient) {
    fromClient.whatsapp = to;
    fromClient.name = name;
    fromClient.contact = contact || fromClient.contact;
    writeRow_('clients', fromClient.rowNumber, clientRow_(fromClient));
    if (to !== from) account = 'A conta dela agora entra com o WhatsApp ' + to + ' (mesma senha).';
  } else if (toClient) {
    toClient.name = name;
    toClient.contact = contact || toClient.contact;
    writeRow_('clients', toClient.rowNumber, clientRow_(toClient));
  }
  return { ok: true, orders: changed, merged: merging, whatsapp: to, name: name, account: account };
}

// Apaga só o login (os pedidos continuam)
function actionAdminDeleteAccount_(params) {
  var client = findClient_(phone_(params.whatsapp));
  if (!client) throw userError_('Não existe conta com esse WhatsApp.');
  sheet_('clients').deleteRow(client.rowNumber);
  return { ok: true };
}

// ----------------------------------------------------------------------------
// CORRIGIR VALORES JÁ LANÇADOS
// ----------------------------------------------------------------------------

// Cobrança: valor, descrição e vencimento
function actionAdminUpdateCharge_(params) {
  var charge = findCharge_(params.chargeId);
  var order = findOrder_(charge.orderId);
  var changes = [];
  if (params.amount !== undefined && params.amount !== '') {
    var amount = money_(params.amount);
    if (amount <= 0) throw userError_('Informe um valor maior que zero.');
    if (amount !== charge.amount) changes.push(charge.description + ': ' + brl_(charge.amount) + ' → ' + brl_(amount));
    charge.amount = amount;
  }
  if (params.description !== undefined) {
    var description = str_(params.description).slice(0, 120);
    if (!description) throw userError_('Informe a descrição.');
    if (description !== charge.description) changes.push('descrição: "' + charge.description + '" → "' + description + '"');
    charge.description = description;
  }
  if (params.dueDate !== undefined) {
    var due = dateKey_(params.dueDate);
    if (due !== charge.dueDate) changes.push('vencimento de ' + charge.description + ': ' + (dateText_(charge.dueDate) || 'sem') + ' → ' + (dateText_(due) || 'sem'));
    charge.dueDate = due;
  }
  if (!changes.length) throw userError_('Nada mudou.');
  writeRow_('charges', charge.rowNumber, chargeRow_(charge));
  addHistory_(order, 'cobrança corrigida — ' + changes.join('; '));
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true, charge: strip_(charge) };
}

// Item do pedido: produto, quantidade e valor unitário
function actionAdminUpdateOrder_(params) {
  var order = findOrder_(params.orderId);
  var changes = [];
  var name = params.productName !== undefined ? str_(params.productName).slice(0, 150) : order.productName;
  if (!name) throw userError_('Informe o nome do produto.');
  var quantity = params.quantity !== undefined && params.quantity !== '' ? Math.floor(num_(params.quantity)) : order.quantity;
  var unitPrice = params.unitPrice !== undefined && params.unitPrice !== '' ? money_(params.unitPrice) : order.unitPrice;
  if (quantity < 1) throw userError_('Quantidade inválida.');
  if (unitPrice <= 0) throw userError_('Informe um valor maior que zero.');

  if (quantity > order.quantity && order.status !== 'Cancelado') {
    var product = null;
    allProducts_().forEach(function (p) { if (p.id === order.productId) product = p; });
    if (product && product.active) {
      var available = Math.max(0, product.totalStock - (soldMap_(allOrders_())[product.id] || 0));
      if (quantity - order.quantity > available) throw userError_('Não há estoque para aumentar a quantidade (restam ' + available + ').');
    }
  }
  if (name !== order.productName) changes.push('produto: "' + order.productName + '" → "' + name + '"');
  if (quantity !== order.quantity) changes.push('quantidade: ' + order.quantity + ' → ' + quantity);
  if (unitPrice !== order.unitPrice) changes.push('valor unitário: ' + brl_(order.unitPrice) + ' → ' + brl_(unitPrice));
  if (params.image !== undefined && str_(params.image) !== order.image) {
    changes.push(str_(params.image) ? 'foto alterada' : 'foto removida');
    order.image = str_(params.image).slice(0, 500);
  }
  if (!changes.length) throw userError_('Nada mudou.');

  var oldTotal = order.itemTotal;
  order.productName = name;
  order.quantity = quantity;
  order.unitPrice = unitPrice;
  order.itemTotal = money_(unitPrice * quantity);

  // Ajusta a cobrança do item, se ela for única e ainda estiver pendente
  var adjusted = null;
  if (params.adjustCharge !== false && order.itemTotal !== oldTotal) {
    var itemCharges = orderCharges_(order).filter(function (c) {
      return c.status !== 'Cancelada' && /^(1ª fase|pix parcelado|parcela)/i.test(c.description);
    });
    if (itemCharges.length === 1 && itemCharges[0].status === 'Pendente') {
      adjusted = itemCharges[0];
      changes.push('cobrança do item: ' + brl_(adjusted.amount) + ' → ' + brl_(order.itemTotal));
      adjusted.amount = order.itemTotal;
      writeRow_('charges', adjusted.rowNumber, chargeRow_(adjusted));
    }
  }
  addHistory_(order, 'item corrigido — ' + changes.join('; '));
  writeRow_('orders', order.rowNumber, orderRow_(order));
  return { ok: true, order: strip_(order), adjustedCharge: adjusted ? strip_(adjusted) : null };
}


// ----------------------------------------------------------------------------
// SEPARAR UM PEDIDO EM VÁRIOS (ex.: "Jin e Jimin — R$ 30" → Jin R$ 15 + Jimin R$ 15)
// ----------------------------------------------------------------------------
// O pedido original vira a 1ª parte (mantém o código); as outras viram pedidos
// novos. Cada cobrança é dividida na mesma proporção, mantendo status e prazo.
function actionAdminSplitOrder_(params) {
  var order = findOrder_(params.orderId);
  if (order.status === 'Cancelado') throw userError_('Esse pedido está cancelado.');
  var parts = (params.parts || []).map(function (p) {
    return {
      productName: str_(p.productName).slice(0, 150),
      member: str_(p.member).slice(0, 40) || order.member,
      amount: money_(p.amount),
      image: str_(p.image).slice(0, 500)
    };
  });
  if (parts.length < 2) throw userError_('Informe pelo menos 2 partes.');
  if (parts.length > 20) throw userError_('Máximo de 20 partes.');
  parts.forEach(function (p) {
    if (!p.productName) throw userError_('Dê um nome para cada parte.');
    if (p.amount <= 0) throw userError_('Cada parte precisa de um valor maior que zero.');
  });
  var sum = money_(parts.reduce(function (a, p) { return a + p.amount; }, 0));
  if (Math.abs(sum - order.itemTotal) > 0.01) {
    throw userError_('A soma das partes (' + brl_(sum) + ') precisa ser igual ao valor do pedido (' + brl_(order.itemTotal) + ').');
  }

  var charges = orderCharges_(order).filter(function (c) { return c.status !== 'Cancelada'; });
  var ids = {};
  allOrders_().forEach(function (o) { ids[o.orderId] = true; });
  var chargeIdsMap = chargeIds_();
  var originalName = order.productName;
  var created = [];

  // valor de cada cobrança dividido por parte (a última acerta os centavos)
  var shares = charges.map(function (c) {
    var acc = 0;
    return parts.map(function (p, i) {
      var v = i === parts.length - 1 ? money_(c.amount - acc) : money_(c.amount * p.amount / order.itemTotal);
      acc = money_(acc + v);
      return v;
    });
  });

  parts.forEach(function (p, i) {
    if (i === 0) {
      order.productName = p.productName;
      order.member = p.member;
      order.quantity = 1;
      order.unitPrice = p.amount;
      order.itemTotal = p.amount;
      if (p.image) order.image = p.image;
      addHistory_(order, 'separado de "' + originalName + '" (' + parts.length + ' partes)');
      writeRow_('orders', order.rowNumber, orderRow_(order));
      charges.forEach(function (c, k) {
        c.amount = shares[k][0];
        writeRow_('charges', c.rowNumber, chargeRow_(c));
      });
      created.push(strip_(order));
      return;
    }
    var copy = {};
    Object.keys(order).forEach(function (k) { if (k !== 'rowNumber') copy[k] = order[k]; });
    copy.orderId = newId_('PED-', ids);
    ids[copy.orderId] = true;
    copy.createdAt = dateCell_(order.createdAt);
    copy.productName = p.productName;
    copy.member = p.member;
    copy.quantity = 1;
    copy.unitPrice = p.amount;
    copy.itemTotal = p.amount;
    copy.image = p.image || '';
    copy.transferName = '';
    copy.transferWhatsapp = '';
    copy.transferContact = '';
    copy.history = '';
    addHistory_(copy, 'separado do pedido ' + order.orderId + ' ("' + originalName + '")');
    appendRow_('orders', orderRow_(copy));
    charges.forEach(function (c, k) {
      // pago continua pago, com a mesma data
      newCharge_(copy, c.description, shares[k][i], chargeIdsMap, c.dueDate, c.status === 'Pago' ? (c.paidAt || true) : false);
    });
    copy.createdAt = date_(copy.createdAt);
    created.push(copy);
  });
  return { ok: true, orders: created };
}


// ----------------------------------------------------------------------------
// SOLICITAÇÕES DAS CLIENTES: correção e prorrogação de pagamento
// ----------------------------------------------------------------------------
var REQUEST_TYPES = { correction: 'Correção', extension: 'Prorrogação' };

function toRequest_(r) {
  var v = r.v;
  return {
    rowNumber: r.rowNumber,
    requestId: str_(v[0]),
    createdAt: date_(v[1]),
    type: str_(v[2]),
    orderId: str_(v[3]),
    chargeIds: str_(v[4]) ? str_(v[4]).split(/\s*,\s*/) : [],
    whatsapp: phone_(v[5]),
    name: str_(v[6]),
    message: str_(v[7]),
    requestedDate: dateKey_(v[8]),
    status: str_(v[9]) || 'Pendente',
    reply: str_(v[10]),
    answeredAt: date_(v[11]),
    approvedDate: dateKey_(v[12])
  };
}

function requestRow_(q) {
  return [q.requestId, dateCell_(q.createdAt), q.type, q.orderId, (q.chargeIds || []).join(', '), q.whatsapp, q.name, q.message,
    dateText_(q.requestedDate), q.status, q.reply || '', dateCell_(q.answeredAt), dateText_(q.approvedDate)];
}

function allRequests_() {
  return readRows_('requests').map(toRequest_).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function newRequest_(order, type, message, chargeIds, requestedDate) {
  var ids = {};
  allRequests_().forEach(function (q) { ids[q.requestId] = true; });
  var q = {
    requestId: newId_('SOL-', ids),
    createdAt: new Date().toISOString(),
    type: type,
    orderId: order.orderId,
    chargeIds: chargeIds || [],
    whatsapp: order.whatsapp,
    name: order.buyerName,
    message: message,
    requestedDate: requestedDate || '',
    status: 'Pendente',
    reply: '',
    answeredAt: '',
    approvedDate: ''
  };
  appendRow_('requests', requestRow_(q));
  return q;
}

function pendingOf_(orderId, type) {
  return allRequests_().some(function (q) { return q.orderId === orderId && q.type === type && q.status === 'Pendente'; });
}

// A cliente (logada) conta o que está errado no pedido
function actionRequestCorrection_(params) {
  var order = myOrder_(params);
  var message = str_(params.message).replace(/\s+/g, ' ').slice(0, 500);
  if (message.length < 5) throw userError_('Conte o que está errado (pelo menos algumas palavras).');
  if (pendingOf_(order.orderId, REQUEST_TYPES.correction)) throw userError_('Já existe um pedido de correção esperando a loja para esse item.');
  var q = newRequest_(order, REQUEST_TYPES.correction, message, [], '');
  return { ok: true, request: strip_(q) };
}

// A cliente (logada) pede mais prazo para as cobranças pendentes do pedido
function actionRequestExtension_(params) {
  var order = myOrder_(params);
  if (order.status === 'Cancelado') throw userError_('Esse pedido está cancelado.');
  var pending = orderCharges_(order).filter(function (c) { return c.status === 'Pendente'; });
  var wanted = params.chargeIds && params.chargeIds.length ? params.chargeIds.map(str_) : pending.map(function (c) { return c.chargeId; });
  var chosen = pending.filter(function (c) { return wanted.indexOf(c.chargeId) >= 0; });
  if (!chosen.length) throw userError_('Esse pedido não tem pagamento pendente.');
  var date = dateKey_(params.newDate);
  var today = dateKey_(new Date());
  if (!date) throw userError_('Escolha até quando você pode pagar.');
  if (date <= today) throw userError_('A nova data precisa ser depois de hoje.');
  if (date > addDaysKey_(today, 180)) throw userError_('Escolha uma data nos próximos 6 meses.');
  if (pendingOf_(order.orderId, REQUEST_TYPES.extension)) throw userError_('Já existe um pedido de prorrogação esperando a loja para esse item.');
  var message = str_(params.message).replace(/\s+/g, ' ').slice(0, 500);
  var q = newRequest_(order, REQUEST_TYPES.extension, message, chosen.map(function (c) { return c.chargeId; }), date);
  return { ok: true, request: strip_(q) };
}

function actionCancelMyRequest_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var q = null;
  allRequests_().forEach(function (r) { if (r.requestId === str_(params.requestId)) q = r; });
  if (!q || q.whatsapp !== client.whatsapp) throw userError_('Solicitação não encontrada.');
  if (q.status !== 'Pendente') throw userError_('A loja já respondeu essa solicitação.');
  q.status = 'Cancelada';
  q.answeredAt = new Date().toISOString();
  writeRow_('requests', q.rowNumber, requestRow_(q));
  return { ok: true };
}

// ADM responde: aceitar/recusar prorrogação (pode mudar a data) ou resolver/recusar correção
function actionAdminAnswerRequest_(params) {
  var q = null;
  allRequests_().forEach(function (r) { if (r.requestId === str_(params.requestId)) q = r; });
  if (!q) throw userError_('Solicitação não encontrada.');
  if (q.status !== 'Pendente') throw userError_('Essa solicitação já foi respondida.');
  var decision = str_(params.decision);
  var reply = str_(params.reply).replace(/\s+/g, ' ').slice(0, 500);
  var order = findOrder_(q.orderId);
  var config = publicConfig_();
  var first = q.name.split(' ')[0];
  var text;

  if (q.type === REQUEST_TYPES.extension && decision === 'accept') {
    var date = dateKey_(params.date || q.requestedDate);
    if (!date) throw userError_('Escolha a nova data.');
    var changed = 0;
    orderCharges_(order).forEach(function (c) {
      if (q.chargeIds.indexOf(c.chargeId) < 0 || c.status !== 'Pendente') return;
      c.dueDate = date;
      writeRow_('charges', c.rowNumber, chargeRow_(c));
      changed++;
    });
    q.status = 'Aceita';
    q.approvedDate = date;
    addHistory_(order, 'prorrogação aceita até ' + dateText_(date) + (changed ? '' : ' (sem cobranças pendentes)'));
    writeRow_('orders', order.rowNumber, orderRow_(order));
    text = 'Oii ' + first + '! 💜 Sua prorrogação do pedido ' + order.orderId + ' (' + order.productName + ') foi *aceita*: o novo prazo é *' +
      dateText_(date) + '*.' + (reply ? '\n' + reply : '') + '\nVocê vê tudo em "Meus Pedidos" no site.';
  } else if (q.type === REQUEST_TYPES.correction && decision === 'resolve') {
    q.status = 'Resolvida';
    addHistory_(order, 'correção resolvida pela loja');
    writeRow_('orders', order.rowNumber, orderRow_(order));
    text = 'Oii ' + first + '! 💜 Sobre a correção que você pediu no pedido ' + order.orderId + ' (' + order.productName + '): ' +
      (reply || 'já ajustamos!') + '\nConfere em "Meus Pedidos" no site.';
  } else if (decision === 'reject') {
    q.status = 'Recusada';
    text = 'Oii ' + first + '! 💜 Sobre o seu pedido de ' + q.type.toLowerCase() + ' no pedido ' + order.orderId + ' (' + order.productName +
      '): ' + (reply || 'não conseguimos atender dessa vez.') + (q.type === REQUEST_TYPES.extension ? '\nO prazo continua o mesmo.' : '');
  } else {
    throw userError_('Resposta inválida.');
  }
  q.reply = reply;
  q.answeredAt = new Date().toISOString();
  writeRow_('requests', q.rowNumber, requestRow_(q));
  return { ok: true, request: strip_(q), notifyLink: waUrl_(q.whatsapp, text), storeName: config.storeName };
}

// ----------------------------------------------------------------------------
// ENDEREÇOS, COTAÇÃO DE FRETE (Melhor Envio + SuperFrete) E ENVIOS
// ----------------------------------------------------------------------------
// Os tokens das plataformas ficam nas Propriedades do script (secretos):
// nunca vão para a planilha nem para o site.

// type: 'envelope' (photocard: vai em envelope; dentro de uma caixa só soma peso) ou 'caixa'
var DEFAULT_PACKAGES = {
  Photocards: { type: 'envelope', weight: 20, height: 1, width: 12, length: 17 },
  'Álbuns': { type: 'caixa', weight: 700, height: 5, width: 25, length: 30 },
  'Merch/DVD': { type: 'caixa', weight: 400, height: 6, width: 20, length: 25 },
  Vinil: { type: 'caixa', weight: 500, height: 3, width: 32, length: 32 },
  Outros: { type: 'caixa', weight: 300, height: 5, width: 20, length: 20 }
};
var ENVELOPE = { height: 2, width: 12, length: 17, maxHeight: 4 }; // medidas mínimas aceitas pelas transportadoras
var SHIP_FINAL_STATUSES = ['Cancelado', 'Enviado', 'Entregue'];
var SUPERFRETE_SERVICES = '1,2,17'; // PAC, SEDEX, Mini Envios

function packageDefaults_(map) {
  var out = {};
  Object.keys(DEFAULT_PACKAGES).forEach(function (k) { out[k] = DEFAULT_PACKAGES[k]; });
  try {
    var saved = JSON.parse(str_((map || getConfigMap_()).packageDefaults) || '{}');
    Object.keys(saved).forEach(function (k) {
      var p = saved[k] || {};
      var base = out[k] || DEFAULT_PACKAGES.Outros;
      out[k] = { type: p.type === 'envelope' ? 'envelope' : p.type === 'caixa' ? 'caixa' : base.type,
        weight: num_(p.weight) || base.weight, height: num_(p.height) || base.height,
        width: num_(p.width) || base.width, length: num_(p.length) || base.length };
    });
  } catch (err) { /* JSON inválido: usa o padrão */ }
  return out;
}

function shippingTokens_() {
  var props = PropertiesService.getScriptProperties();
  return { melhorEnvio: props.getProperty('MELHOR_ENVIO_TOKEN') || '', superFrete: props.getProperty('SUPERFRETE_TOKEN') || '' };
}

// Guarda a última falha de cada plataforma (para o painel mostrar quando um token vence)
function recordShippingStatus_(key, error) {
  var props = PropertiesService.getScriptProperties();
  var prop = 'SHIPPING_STATUS_' + key;
  var value = JSON.stringify({ error: error, at: new Date().toISOString() });
  if (error || props.getProperty(prop)) props.setProperty(prop, value);
}

function shippingStatus_(key) {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('SHIPPING_STATUS_' + key) || 'null');
  } catch (err) {
    return null;
  }
}

function shippingSettings_() {
  var map = getConfigMap_();
  var t = shippingTokens_();
  return {
    fromCep: str_(map.shippingFromCep).replace(/\D/g, ''),
    contactEmail: str_(map.shippingContactEmail),
    sandbox: str_(map.shippingSandbox).toUpperCase() === 'SIM',
    dueDays: Math.max(0, Math.floor(num_(map.shippingDueDays) || 3)),
    packageDefaults: packageDefaults_(map),
    melhorEnvio: !!t.melhorEnvio,
    superFrete: !!t.superFrete,
    status: { melhorEnvio: shippingStatus_('melhorEnvio'), superFrete: shippingStatus_('superFrete') }
  };
}

// ADM: cotação de teste para conferir tokens e CEP (sem cliente nem pedido)
function actionAdminTestShippingQuote_(params) {
  var cep = str_(params.cep).replace(/\D/g, '');
  if (cep.length !== 8) throw userError_('Informe um CEP de destino válido.');
  var cat = str_(params.category) || 'Photocards';
  var defaults = packageDefaults_();
  var d = defaults[cat] || defaults.Outros;
  var pkg = d.type === 'envelope'
    ? { kind: 'Envelope', weight: (d.weight + 10) / 1000, height: Math.max(ENVELOPE.height, d.height), width: ENVELOPE.width, length: ENVELOPE.length }
    : { kind: 'Caixa', weight: (d.weight + 100) / 1000, height: d.height, width: d.width, length: d.length };
  var q = quotesForPackage_(pkg, cep);
  return { ok: true, options: q.options, errors: q.errors, package: pkg };
}

// --- Endereços da compradora
function toAddress_(r) {
  var v = r.v;
  return { rowNumber: r.rowNumber, addressId: str_(v[0]), whatsapp: phone_(v[1]), label: str_(v[2]), recipient: str_(v[3]),
    cep: str_(v[4]).replace(/\D/g, ''), street: str_(v[5]), number: str_(v[6]), complement: str_(v[7]), district: str_(v[8]),
    city: str_(v[9]), state: str_(v[10]).toUpperCase(), createdAt: date_(v[11]) };
}
function addressRow_(a) {
  return [a.addressId, a.whatsapp, a.label, a.recipient, a.cep, a.street, a.number, a.complement, a.district, a.city, a.state, dateCell_(a.createdAt)];
}
function addressesOf_(whatsapp) {
  return readRows_('addresses').map(toAddress_).filter(function (a) { return a.whatsapp === whatsapp; });
}
function addressText_(a) {
  return a.recipient + ' — ' + a.street + ', ' + a.number + (a.complement ? ' (' + a.complement + ')' : '') + ' — ' + a.district + ', ' +
    a.city + '/' + a.state + ' — CEP ' + a.cep.slice(0, 5) + '-' + a.cep.slice(5);
}

function actionMyAddresses_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  return { ok: true, addresses: addressesOf_(client.whatsapp).map(strip_) };
}

function actionSaveAddress_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var input = params.address || {};
  var a = {
    addressId: str_(input.addressId),
    whatsapp: client.whatsapp,
    label: str_(input.label).slice(0, 40) || 'Casa',
    recipient: str_(input.recipient).slice(0, 80) || client.name,
    cep: str_(input.cep).replace(/\D/g, ''),
    street: str_(input.street).slice(0, 120),
    number: str_(input.number).slice(0, 20),
    complement: str_(input.complement).slice(0, 80),
    district: str_(input.district).slice(0, 80),
    city: str_(input.city).slice(0, 80),
    state: str_(input.state).toUpperCase().slice(0, 2),
    createdAt: new Date().toISOString()
  };
  if (a.cep.length !== 8) throw userError_('CEP inválido (8 números).');
  if (!a.street || !a.number || !a.district || !a.city || a.state.length !== 2) {
    throw userError_('Preencha rua, número, bairro, cidade e UF.');
  }
  var mine = addressesOf_(client.whatsapp);
  if (a.addressId) {
    var existing = mine.filter(function (x) { return x.addressId === a.addressId; })[0];
    if (!existing) throw userError_('Endereço não encontrado.');
    a.createdAt = existing.createdAt;
    writeRow_('addresses', existing.rowNumber, addressRow_(a));
  } else {
    if (mine.length >= 5) throw userError_('Máximo de 5 endereços. Apague um para cadastrar outro.');
    var ids = {};
    readRows_('addresses').forEach(function (r) { ids[str_(r.v[0])] = true; });
    a.addressId = newId_('END-', ids);
    appendRow_('addresses', addressRow_(a));
  }
  return { ok: true, address: strip_(a), addresses: addressesOf_(client.whatsapp).map(strip_) };
}

function actionDeleteAddress_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var a = addressesOf_(client.whatsapp).filter(function (x) { return x.addressId === str_(params.addressId); })[0];
  if (!a) throw userError_('Endereço não encontrado.');
  sheet_('addresses').deleteRow(a.rowNumber);
  return { ok: true, addresses: addressesOf_(client.whatsapp).map(strip_) };
}

// --- Pacote
// Só itens de envelope (photocards) → ENVELOPE fino. Com algum item de caixa (álbum,
// DVD, vinil…) → CAIXA: empilha as alturas das caixas, usa a maior largura/comprimento
// e os photocards vão dentro, somando só o peso.
function buildPackage_(orders) {
  var defaults = packageDefaults_();
  var products = {};
  allProducts_().forEach(function (p) { products[p.id] = p; });
  var weight = 0, boxHeight = 0, envHeight = 0, width = 11, length = 16, hasBox = false;
  orders.forEach(function (o) {
    var cat = products[o.productId] ? products[o.productId].category : 'Outros';
    var d = defaults[cat] || defaults.Outros;
    weight += d.weight * o.quantity;
    if (d.type === 'envelope') {
      envHeight += d.height * o.quantity;
    } else {
      hasBox = true;
      boxHeight += d.height * o.quantity;
      width = Math.max(width, d.width);
      length = Math.max(length, d.length);
    }
  });
  var kg = Math.max(0.05, Math.round(weight + (hasBox ? 100 : 10)) / 1000); // + embalagem
  if (!hasBox) {
    var h = Math.max(ENVELOPE.height, Math.ceil(envHeight));
    if (h <= ENVELOPE.maxHeight) {
      return { kind: 'Envelope', weight: kg, height: h, width: ENVELOPE.width, length: ENVELOPE.length };
    }
    // muitos photocards: vira uma caixinha
    return { kind: 'Caixa', weight: kg, height: Math.min(100, h), width: 12, length: 17 };
  }
  return { kind: 'Caixa', weight: kg, height: Math.min(100, Math.max(2, Math.ceil(boxHeight))), width: width, length: length };
}

function dims_(pkg) {
  return { height: pkg.height, width: pkg.width, length: pkg.length, weight: pkg.weight };
}

function fetchJson_(url, token, payload, ua) {
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': ua },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  var data = null;
  try { data = JSON.parse(body); } catch (err) { /* resposta não-JSON */ }
  if (code >= 300) throw new Error('HTTP ' + code + (data && data.message ? ' — ' + data.message : ''));
  return data;
}

function melhorEnvioQuote_(token, from, to, pkg, settings, ua) {
  var host = settings.sandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  var data = fetchJson_(host + '/api/v2/me/shipment/calculate', token,
    { from: { postal_code: from }, to: { postal_code: to }, package: dims_(pkg) }, ua);
  return (Array.isArray(data) ? data : []).filter(function (s) { return !s.error && (s.custom_price || s.price); }).map(function (s) {
    return { provider: 'Melhor Envio', serviceId: String(s.id), service: str_(s.name), company: s.company ? str_(s.company.name) : '',
      logo: s.company ? str_(s.company.picture) : '', price: money_(s.custom_price || s.price),
      days: Math.floor(num_(s.custom_delivery_time || s.delivery_time)) };
  });
}

function superFreteQuote_(token, from, to, pkg, settings, ua) {
  var host = settings.sandbox ? 'https://sandbox.superfrete.com' : 'https://api.superfrete.com';
  var data = fetchJson_(host + '/api/v0/calculator', token, {
    from: { postal_code: from }, to: { postal_code: to }, services: SUPERFRETE_SERVICES,
    options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false }, package: dims_(pkg)
  }, ua);
  return (Array.isArray(data) ? data : []).filter(function (s) { return !s.has_error && !s.error && s.price; }).map(function (s) {
    return { provider: 'SuperFrete', serviceId: String(s.id), service: str_(s.name), company: s.company ? str_(s.company.name) : '',
      logo: s.company ? str_(s.company.picture) : '', price: money_(s.price), days: Math.floor(num_(s.delivery_time)) };
  });
}

// Cota nas plataformas configuradas. Falha de uma não impede a outra.
function quotes_(orders, address) {
  return quotesForPackage_(buildPackage_(orders), address.cep);
}

function quotesForPackage_(pkg, toCep) {
  var address = { cep: toCep };
  var settings = shippingSettings_();
  var tokens = shippingTokens_();
  var options = [];
  var errors = [];
  if (!settings.fromCep) errors.push('CEP de origem não configurado');
  if (!tokens.melhorEnvio && !tokens.superFrete) errors.push('Nenhuma plataforma de frete configurada');
  if (!errors.length) {
    var ua = publicConfig_().storeName + ' (' + (settings.contactEmail || 'sem-email') + ')';
    [['melhorEnvio', melhorEnvioQuote_], ['superFrete', superFreteQuote_]].forEach(function (pair) {
      if (!tokens[pair[0]]) return;
      var name = pair[0] === 'melhorEnvio' ? 'Melhor Envio' : 'SuperFrete';
      try {
        options = options.concat(pair[1](tokens[pair[0]], settings.fromCep, address.cep, pkg, settings, ua));
        recordShippingStatus_(pair[0], '');
      } catch (err) {
        var msg = String(err.message || err).slice(0, 200);
        if (/HTTP 401/.test(msg)) msg += ' (token inválido ou vencido — gere outro no painel da plataforma)';
        errors.push(name + ': ' + msg);
        recordShippingStatus_(pair[0], msg);
      }
    });
  }
  options.sort(function (a, b) { return a.price - b.price; });
  options.forEach(function (o) { o.key = o.provider + ':' + o.serviceId; });
  return { options: options, package: pkg, errors: errors };
}

function shippableOrders_(client, orderIds) {
  var active = {};
  allShipments_().forEach(function (s) {
    if (s.status !== 'Cancelado') s.orderIds.forEach(function (id) { active[id] = s.shipmentId; });
  });
  var wanted = (orderIds || []).map(str_);
  var orders = allOrders_().filter(function (o) { return wanted.indexOf(o.orderId) >= 0; });
  if (!orders.length) throw userError_('Escolha os itens para enviar.');
  orders.forEach(function (o) {
    if (o.whatsapp !== client.whatsapp) throw userError_('Esse pedido não é seu.');
    if (SHIP_FINAL_STATUSES.indexOf(o.status) >= 0) throw userError_('O item ' + o.productName + ' não pode mais ser enviado (' + o.status + ').');
    if (active[o.orderId]) throw userError_('O item ' + o.productName + ' já está num pedido de envio (' + active[o.orderId] + ').');
  });
  return orders;
}

function myAddress_(client, addressId) {
  var a = addressesOf_(client.whatsapp).filter(function (x) { return x.addressId === str_(addressId); })[0];
  if (!a) throw userError_('Escolha um endereço.');
  return a;
}

function actionQuoteShipping_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var orders = shippableOrders_(client, params.orderIds);
  var address = myAddress_(client, params.addressId);
  var q = quotes_(orders, address);
  return { ok: true, options: q.options, package: q.package, unavailable: !q.options.length,
    message: q.options.length ? '' : 'Não deu para calcular o frete agora. Você pode pedir o envio assim mesmo: a loja calcula e te avisa o valor.' };
}

// --- Envios
function toShipment_(r) {
  var v = r.v;
  return { rowNumber: r.rowNumber, shipmentId: str_(v[0]), createdAt: date_(v[1]), whatsapp: phone_(v[2]), name: str_(v[3]),
    orderIds: str_(v[4]) ? str_(v[4]).split(/\s*,\s*/) : [], address: str_(v[5]), cep: str_(v[6]).replace(/\D/g, ''),
    provider: str_(v[7]), service: str_(v[8]), price: money_(v[9]), days: Math.floor(num_(v[10])), status: str_(v[11]) || 'Aguardando cotação',
    tracking: str_(v[12]), chargeId: str_(v[13]), package: str_(v[14]) };
}
function shipmentRow_(s) {
  return [s.shipmentId, dateCell_(s.createdAt), s.whatsapp, s.name, s.orderIds.join(', '), s.address, s.cep, s.provider, s.service,
    s.price || '', s.days || '', s.status, s.tracking || '', s.chargeId || '', s.package || ''];
}
function allShipments_() {
  var charges = {};
  allCharges_().forEach(function (c) { charges[c.chargeId] = c; });
  return readRows_('shipments').map(toShipment_).map(function (s) {
    var c = charges[s.chargeId];
    s.paid = !!c && c.status === 'Pago';
    s.chargeStatus = c ? c.status : '';
    return s;
  }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function shipmentCharge_(s, orders, price) {
  var settings = shippingSettings_();
  var first = orders[0];
  var due = addDaysKey_(dateKey_(new Date()), settings.dueDays);
  var label = 'Frete nacional — ' + (s.service || 'envio') + ' (' + orders.length + ' item' + (orders.length > 1 ? 's' : '') + ', ' + s.shipmentId + ')';
  return newCharge_(first, label.slice(0, 120), price, chargeIds_(), due);
}

function actionRequestShipping_(params) {
  var client = sessionClient_(params.token);
  if (!client) throw sessionError_();
  var orders = shippableOrders_(client, params.orderIds);
  var address = myAddress_(client, params.addressId);
  var chosen = null;
  var pkg = buildPackage_(orders);
  if (params.optionKey) {
    var q = quotes_(orders, address); // recalcula no servidor: o preço não vem do navegador
    chosen = q.options.filter(function (o) { return o.key === str_(params.optionKey); })[0];
    if (!chosen) throw userError_('Essa opção de frete não está mais disponível. Calcule de novo.');
    pkg = q.package;
  }
  var ids = {};
  readRows_('shipments').forEach(function (r) { ids[str_(r.v[0])] = true; });
  var s = {
    shipmentId: newId_('ENV-', ids), createdAt: new Date().toISOString(), whatsapp: client.whatsapp, name: client.name,
    orderIds: orders.map(function (o) { return o.orderId; }), address: addressText_(address), cep: address.cep,
    provider: chosen ? chosen.provider : '', service: chosen ? (chosen.company ? chosen.company + ' ' : '') + chosen.service : '',
    price: chosen ? chosen.price : 0, days: chosen ? chosen.days : 0, status: chosen ? 'Aguardando pagamento' : 'Aguardando cotação',
    tracking: '', chargeId: '', package: pkg.kind + ' — ' + pkg.weight + ' kg, ' + pkg.height + 'x' + pkg.width + 'x' + pkg.length + ' cm'
  };
  if (chosen) s.chargeId = shipmentCharge_(s, orders, chosen.price).chargeId;
  appendRow_('shipments', shipmentRow_(s));
  orders.forEach(function (o) {
    addHistory_(o, 'envio pedido (' + s.shipmentId + ')' + (chosen ? ': ' + s.service + ' ' + brl_(s.price) : ', aguardando cotação'));
    writeRow_('orders', o.rowNumber, orderRow_(o));
  });
  return { ok: true, shipment: strip_(s) };
}

// ADM: valor do frete quando não houve cotação automática (ou para corrigir)
function actionAdminSetShippingPrice_(params) {
  var s = allShipments_().filter(function (x) { return x.shipmentId === str_(params.shipmentId); })[0];
  if (!s) throw userError_('Envio não encontrado.');
  var price = money_(params.price);
  if (price <= 0) throw userError_('Informe o valor do frete.');
  if (str_(params.service)) s.service = str_(params.service).slice(0, 80);
  if (params.days !== undefined && params.days !== '') s.days = Math.floor(num_(params.days));
  var orders = allOrders_().filter(function (o) { return s.orderIds.indexOf(o.orderId) >= 0; });
  if (s.chargeId) {
    var c = findCharge_(s.chargeId);
    if (c.status === 'Pago') throw userError_('Esse frete já foi pago.');
    c.amount = price;
    writeRow_('charges', c.rowNumber, chargeRow_(c));
  } else {
    if (!orders.length) throw userError_('Os pedidos desse envio não existem mais.');
    s.chargeId = shipmentCharge_(s, orders, price).chargeId;
  }
  s.price = price;
  if (s.status === 'Aguardando cotação') s.status = 'Aguardando pagamento';
  writeRow_('shipments', s.rowNumber, shipmentRow_(s));
  var text = 'Oii ' + s.name.split(' ')[0] + '! 💜 O frete do seu envio ' + s.shipmentId + ' ficou em *' + brl_(price) + '*' +
    (s.service ? ' (' + s.service + ')' : '') + '. Já está em "Meus Pedidos" para pagar.';
  return { ok: true, shipment: strip_(s), notifyLink: waUrl_(s.whatsapp, text) };
}

function actionAdminMarkShipped_(params) {
  var s = allShipments_().filter(function (x) { return x.shipmentId === str_(params.shipmentId); })[0];
  if (!s) throw userError_('Envio não encontrado.');
  var tracking = str_(params.tracking).slice(0, 60);
  s.status = 'Enviado';
  s.tracking = tracking;
  writeRow_('shipments', s.rowNumber, shipmentRow_(s));
  allOrders_().forEach(function (o) {
    if (s.orderIds.indexOf(o.orderId) < 0) return;
    o.status = 'Enviado';
    if (tracking) o.note = 'Rastreio: ' + tracking;
    addHistory_(o, 'enviado (' + s.shipmentId + ')' + (tracking ? ' — rastreio ' + tracking : ''));
    writeRow_('orders', o.rowNumber, orderRow_(o));
  });
  var text = 'Oii ' + s.name.split(' ')[0] + '! 💜 Seu pacote foi enviado' + (s.service ? ' por ' + s.service : '') + '! 📦' +
    (tracking ? '\nCódigo de rastreio: *' + tracking + '*' : '') + '\nItens: ' + s.orderIds.length + ' • ' + s.shipmentId;
  return { ok: true, notifyLink: waUrl_(s.whatsapp, text) };
}

function actionAdminSaveShippingSettings_(params) {
  var input = params.settings || {};
  var rows = readRows_('config');
  var set = function (key, value) {
    var row = rows.filter(function (r) { return str_(r.v[0]) === key; })[0];
    if (row) writeRow_('config', row.rowNumber, [key, value, str_(row.v[2])]);
    else appendRow_('config', [key, value, '']);
  };
  if (input.fromCep !== undefined) {
    var cep = str_(input.fromCep).replace(/\D/g, '');
    if (cep && cep.length !== 8) throw userError_('CEP de origem inválido.');
    set('shippingFromCep', cep);
  }
  if (input.contactEmail !== undefined) set('shippingContactEmail', str_(input.contactEmail).slice(0, 120));
  if (input.sandbox !== undefined) set('shippingSandbox', input.sandbox ? 'SIM' : 'NÃO');
  if (input.dueDays !== undefined) set('shippingDueDays', String(Math.max(0, Math.min(30, Math.floor(num_(input.dueDays)) || 0))));
  if (input.packageDefaults) set('packageDefaults', JSON.stringify(input.packageDefaults).slice(0, 2000));
  var props = PropertiesService.getScriptProperties();
  if (str_(input.melhorEnvioToken)) props.setProperty('MELHOR_ENVIO_TOKEN', str_(input.melhorEnvioToken));
  if (str_(input.superFreteToken)) props.setProperty('SUPERFRETE_TOKEN', str_(input.superFreteToken));
  if (input.removeMelhorEnvio) props.deleteProperty('MELHOR_ENVIO_TOKEN');
  if (input.removeSuperFrete) props.deleteProperty('SUPERFRETE_TOKEN');
  return { ok: true, shipping: shippingSettings_() };
}
