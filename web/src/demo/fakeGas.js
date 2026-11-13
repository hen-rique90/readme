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
    'SpreadsheetApp', 'LockService', 'CacheService', 'ContentService',
    `${code}\nreturn { doGet: doGet, doPost: doPost, setup: setup };`
  );
  const backend = factory(gas.SpreadsheetApp, gas.LockService, gas.CacheService, gas.ContentService);
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
