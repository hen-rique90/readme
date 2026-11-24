// Comunicação com o backend (Google Apps Script).
// Sem VITE_API_URL configurada, o site roda em MODO DEMONSTRAÇÃO: o mesmo
// Code.gs é executado no navegador sobre uma planilha simulada.

export const API_URL = (import.meta.env.VITE_API_URL || '').trim();
// Supabase tem prioridade; sem nada configurado, o site roda em demonstração
export const IS_SUPABASE = !!(import.meta.env.VITE_SUPABASE_URL || '').trim();
export const IS_DEMO = !IS_SUPABASE && !API_URL;
export const DEMO_PASSWORD = 'army123';

export class ApiError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.authError = !!data.authError; // senha do ADM
    this.loginRequired = !!data.loginRequired; // precisa entrar na conta para o claim
    this.sessionExpired = !!data.sessionExpired; // token da compradora não vale mais
    this.needsCode = !!data.needsCode; // criar conta pede o código de um pedido
    this.conflict = !!data.conflict; // WhatsApp novo já é de outra compradora
    this.conflictNames = data.conflictNames || [];
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
      // Demonstração: as "APIs de frete" respondem com preços de exemplo
      gas.fetchHandler = (url, opt) => {
        const pkg = JSON.parse(opt.payload).package;
        const base = 8 + pkg.weight * 12;
        const me = [
          { id: 1, name: 'PAC', price: (base + 9).toFixed(2), delivery_time: 7, company: { name: 'Correios', picture: '' } },
          { id: 2, name: 'SEDEX', price: (base + 22).toFixed(2), delivery_time: 2, company: { name: 'Correios', picture: '' } },
          { id: 3, name: '.Package', price: (base + 6).toFixed(2), delivery_time: 5, company: { name: 'Jadlog', picture: '' } }
        ];
        const sf = [{ id: 17, name: 'Mini Envios', price: +(base + 1).toFixed(2), delivery_time: 9, company: { name: 'Correios', picture: '' } }];
        return { code: 200, body: url.includes('melhorenvio') ? me : pkg.height <= 4 ? sf : [] };
      };
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
  if (IS_SUPABASE) {
    const { callSupabase } = await import('./supabase/backend.js');
    data = await callSupabase(action, params);
  } else if (IS_DEMO) {
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
  if (!data || !data.ok) throw new ApiError((data && data.error) || 'Erro desconhecido.', data || {});
  return data;
}

// Supabase: já existe login de ADM salvo neste aparelho?
export async function hasAdminSession() {
  if (!IS_SUPABASE) return false;
  const { supabase } = await import('./supabase/backend.js');
  const { data } = await supabase().auth.getSession();
  return !!data.session;
}
