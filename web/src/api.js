// Comunicação com o backend (Google Apps Script).
// Sem VITE_API_URL configurada, o site roda em MODO DEMONSTRAÇÃO: o mesmo
// Code.gs é executado no navegador sobre uma planilha simulada.

export const API_URL = (import.meta.env.VITE_API_URL || '').trim();
export const IS_DEMO = !API_URL;
export const DEMO_PASSWORD = 'army123';

export class ApiError extends Error {
  constructor(message, authError = false) {
    super(message);
    this.authError = authError;
  }
}

let demoBackendPromise = null;

async function getDemoBackend() {
  if (!demoBackendPromise) {
    demoBackendPromise = (async () => {
      const [{ createFakeGas, loadBackend, serializeState, parseState }, { default: code }, { seedDemo }] =
        await Promise.all([import('./demo/fakeGas.js'), import('../../apps-script/Code.gs?raw'), import('./demo/seed.js')]);
      const KEY = 'ceg_demo_planilha_v1';
      let state = null;
      try {
        const saved = localStorage.getItem(KEY);
        if (saved) state = parseState(saved);
      } catch {
        state = null;
      }
      const isNew = !state;
      const gas = createFakeGas(state || { sheets: {} }, () => {
        try {
          localStorage.setItem(KEY, serializeState(gas.state));
        } catch {
          /* modo demonstração sem armazenamento: segue só em memória */
        }
      });
      const backend = loadBackend(code, gas);
      if (isNew) seedDemo(backend, gas, DEMO_PASSWORD);
      backend.reset = () => {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      };
      return backend;
    })();
  }
  return demoBackendPromise;
}

export async function resetDemo() {
  const backend = await getDemoBackend();
  backend.reset();
  window.location.reload();
}

export async function api(action, params = {}) {
  let data;
  if (IS_DEMO) {
    const backend = await getDemoBackend();
    await new Promise((r) => setTimeout(r, 250)); // simula a rede
    data = backend.call(action, params);
  } else {
    let res;
    try {
      // text/plain evita o "preflight" de CORS, que o Apps Script não suporta
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...params })
      });
    } catch {
      throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
    }
    try {
      data = await res.json();
    } catch {
      throw new ApiError('O servidor respondeu de um jeito inesperado. Confira a URL do Apps Script.');
    }
  }
  if (!data || !data.ok) throw new ApiError((data && data.error) || 'Erro desconhecido.', !!(data && data.authError));
  return data;
}
