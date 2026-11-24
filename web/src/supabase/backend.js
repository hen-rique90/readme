// Backend no Supabase.
// - Consulta pelo telefone e dados públicos: funções SQL seguras (consulta_telefone, config_publica).
// - Painel ADM: a mesma lógica do Code.gs roda no navegador sobre uma cópia das tabelas,
//   e só as linhas que mudaram são gravadas de volta. As regras de acesso (RLS) garantem
//   que só e-mails da tabela "admins" leem ou alteram os dados.
import { createClient } from '@supabase/supabase-js';
import code from '../../../apps-script/Code.gs?raw';
import { createCore } from './core.js';

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

let client = null;
export const supabase = () => {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
};

class SbError extends Error {
  constructor(message, extra = {}) {
    super(message);
    Object.assign(this, extra);
  }
}

const friendly = (error) => {
  const msg = String(error?.message || error || '');
  if (/JWT|not authenticated|permission denied|row-level security/i.test(msg)) return 'Entre de novo no painel ADM.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
  return msg || 'Erro no servidor.';
};
const fail = (error, prefix = '') =>
  new SbError(prefix + friendly(error), { authError: /JWT|permission denied|row-level/i.test(String(error?.message || '')) });

// Acesso às tabelas pelo supabase-js
const db = {
  async select(table, cols) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase().from(table).select(cols.join(',')).order('pos').range(from, from + 999);
      if (error) throw fail(error);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  },
  async upsert(table, rows, key) {
    const { error } = await supabase().from(table).upsert(rows, { onConflict: key });
    if (error) throw fail(error, 'Não consegui salvar no Supabase: ');
  },
  async remove(table, key, ids) {
    const { error } = await supabase().from(table).delete().in(key, ids);
    if (error) throw fail(error, 'Não consegui salvar no Supabase: ');
  }
};

let core = null;
const getCore = () => (core ||= createCore({ code, db }));

async function runAdmin(action, params) {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new SbError('Entre no painel ADM.', { authError: true });
  return getCore().run(action, params);
}

// Foto: vai para a pasta pública "fotos" do Supabase Storage
async function uploadPhoto({ data, mimeType = 'image/jpeg', name = 'foto' }) {
  const b64 = String(data || '').replace(/^data:[^,]*,/, '');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const safe = String(name).normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'foto';
  const path = `${new Date().toISOString().slice(0, 7)}/${safe}-${Date.now().toString(36)}.jpg`;
  const { error } = await supabase().storage.from('fotos').upload(path, new Blob([bytes], { type: mimeType }), { contentType: mimeType });
  if (error) return { ok: false, error: 'Não consegui enviar a foto: ' + friendly(error) };
  return { ok: true, url: supabase().storage.from('fotos').getPublicUrl(path).data.publicUrl };
}

export async function callSupabase(action, params = {}) {
  try {
    switch (action) {
      case 'consultaTelefone': {
        const { data, error } = await supabase().rpc('consulta_telefone', { telefone: String(params.whatsapp || '') });
        if (error) return { ok: false, error: friendly(error) };
        return { ok: true, ...data };
      }
      case 'catalog': {
        const { data, error } = await supabase().rpc('config_publica');
        if (error) return { ok: false, error: friendly(error) };
        return { ok: true, products: [], config: data || {} };
      }
      case 'adminLogin': {
        const { error } = await supabase().auth.signInWithPassword({ email: params.email, password: params.password });
        if (error) return { ok: false, error: /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : friendly(error), authError: true };
        const check = await supabase().rpc('is_admin');
        if (check.error || !check.data) {
          await supabase().auth.signOut();
          return { ok: false, error: 'Esse e-mail não está liberado como ADM.', authError: true };
        }
        return { ok: true };
      }
      case 'adminLogout':
        await supabase().auth.signOut();
        return { ok: true };
      case 'adminUploadPhoto':
        return await uploadPhoto(params);
      case 'adminSendDigest':
      case 'adminTestShippingQuote':
        return { ok: false, error: 'Essa função não existe na versão Supabase.' };
      default:
        return await runAdmin(action, params);
    }
  } catch (err) {
    return { ok: false, error: err.message || 'Erro desconhecido.', authError: !!err.authError };
  }
}
