// Simulação mínima dos serviços do Google Apps Script.
// Permite rodar o MESMO apps-script/Code.gs no navegador (modo demonstração)
// e nos testes automatizados, sem precisar de uma planilha real.

const clone = (v) => (v instanceof Date ? new Date(v.getTime()) : v);

// Imita o Sheets: um texto começando com ' é guardado sem o apóstrofo
const storeValue = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : clone(v));

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = [];
      for (let c = 0; c < this.numCols; c++) {
        const v = this.sheet.rows[this.row - 1 + r]?.[this.col - 1 + c];
        line.push(v === undefined ? '' : clone(v));
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.rows.length <= idx) this.sheet.rows.push([]);
      line.forEach((v, c) => {
        this.sheet.rows[idx][this.col - 1 + c] = storeValue(v);
      });
    });
    this.sheet.onChange();
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name, rows, onChange) {
    this.name = name;
    this.rows = rows;
    this.onChange = onChange;
  }
  getDataRange() {
    const width = Math.max(1, ...this.rows.map((r) => r.length));
    return new FakeRange(this, 1, 1, Math.max(1, this.rows.length), width);
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new FakeRange(this, row, col, numRows, numCols);
  }
  appendRow(values) {
    this.rows.push(values.map(storeValue));
    this.onChange();
  }
  deleteRow(rowNumber) {
    this.rows.splice(rowNumber - 1, 1);
    this.onChange();
  }
  getLastRow() { return this.rows.length; }
  getMaxRows() { return 1000; }
  setFrozenRows() {}
}

// ---- SHA-256 / HMAC síncronos (o Apps Script tem; o navegador só tem versões assíncronas)
const utf8 = (str) => Array.from(new TextEncoder().encode(String(str)));

function sha256(bytes) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const msg = bytes.slice();
  const bitLen = bytes.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 7; i >= 0; i--) msg.push(Math.floor(bitLen / 2 ** (i * 8)) & 0xff);
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
  }
  const out = [];
  H.forEach((v) => out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff));
  return out;
}

function hmacSha256(message, key) {
  let k = utf8(key);
  if (k.length > 64) k = sha256(k);
  while (k.length < 64) k.push(0);
  const inner = sha256(k.map((b) => b ^ 0x36).concat(utf8(message)));
  return sha256(k.map((b) => b ^ 0x5c).concat(inner));
}

const toSigned = (bytes) => bytes.map((b) => (b > 127 ? b - 256 : b)); // Apps Script devolve bytes com sinal
const b64ws = (bytes) => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b & 0xff); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
};

export const fakeUtilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest: (_alg, value) => toSigned(sha256(utf8(value))),
  computeHmacSha256Signature: (value, key) => toSigned(hmacSha256(value, key)),
  base64EncodeWebSafe: (bytes) => b64ws(bytes),
  getUuid: () => crypto.randomUUID()
};

/**
 * Cria o ambiente simulado.
 * @param {object} state  { sheets: { [nome]: rows[][] } } — é alterado no lugar
 * @param {function} onChange  chamado após cada escrita (para salvar o estado)
 */
export function createFakeGas(state = { sheets: {} }, onChange = () => {}) {
  const sheets = {};
  const getSheet = (name) => {
    if (!state.sheets[name]) return null;
    if (!sheets[name]) sheets[name] = new FakeSheet(name, state.sheets[name], onChange);
    return sheets[name];
  };
  const spreadsheet = {
    getSheetByName: getSheet,
    insertSheet: (name) => {
      state.sheets[name] = [];
      onChange();
      return getSheet(name);
    }
  };
  const cacheStore = new Map();
  return {
    state,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => cacheStore.set(k, v),
        remove: (k) => cacheStore.delete(k)
      })
    },
    Utilities: fakeUtilities,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (state.props && k in state.props ? state.props[k] : null),
        setProperty: (k, v) => { state.props = { ...(state.props || {}), [k]: String(v) }; onChange(); }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({
        setMimeType() { return this; },
        getContent: () => text
      })
    }
  };
}

/** Carrega o código do Apps Script dentro do ambiente simulado. */
export function loadBackend(code, gas) {
  const factory = new Function(
    'SpreadsheetApp', 'LockService', 'CacheService', 'ContentService', 'Utilities', 'PropertiesService',
    `${code}\nreturn { doGet: doGet, doPost: doPost, setup: setup };`
  );
  const backend = factory(gas.SpreadsheetApp, gas.LockService, gas.CacheService, gas.ContentService, gas.Utilities, gas.PropertiesService);
  return {
    call(action, params = {}) {
      const out = backend.doPost({ postData: { contents: JSON.stringify({ action, ...params }) } });
      return JSON.parse(out.getContent());
    },
    get(params = {}) {
      return JSON.parse(backend.doGet({ parameter: params }).getContent());
    }
  };
}

// Serialização do estado (Datas viram { $d: iso }) para guardar no localStorage
export const serializeState = (state) =>
  JSON.stringify(state, function (key, value) {
    const raw = this[key];
    return raw instanceof Date ? { $d: raw.toISOString() } : value;
  });

export const parseState = (text) =>
  JSON.parse(text, (key, value) => (value && typeof value === 'object' && value.$d ? new Date(value.$d) : value));
