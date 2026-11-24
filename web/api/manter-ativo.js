// Acesso automático diário (agendado no vercel.json) para o Supabase grátis não pausar
// o projeto por falta de uso. Só lê a configuração pública: não mexe em nenhum dado.
// URL e chave abaixo são as públicas do site (as mesmas de web/.env.vercel).
const SUPABASE_URL = 'https://tbldnnfrfabgoymmzafp.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRibGRubmZyZmFiZ295bW16YWZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MjM3NjcsImV4cCI6MjExMTA5OTc2N30.UUkG3VezYhqExZhGJSPlmDi1DzxnjgfEjLZsKk5pDVQ';

export default async function handler(req, res) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/config_publica', {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}'
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, quando: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ ok: false, erro: String(err && err.message) });
  }
}
