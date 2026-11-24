// Gera supabase/schema.sql a partir das abas do Code.gs (mesmas colunas da planilha).
// Uso: node scripts/gerar-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeGas, loadBackend } from '../src/demo/fakeGas.js';
import { TABLES, columnsOf } from '../src/supabase/schema.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = loadBackend(readFileSync(root + 'apps-script/Code.gs', 'utf8'), createFakeGas());

const out = [];
out.push(`-- Central de Compras CEGS — banco no Supabase
-- Gerado por web/scripts/gerar-sql.mjs. Pode rodar de novo: não apaga dados.
-- Cada tabela tem as mesmas colunas da aba da planilha (tudo em texto) + "pos" (ordem das linhas).

create table if not exists public.admins (email text primary key);
alter table public.admins enable row level security;

-- Só quem está na tabela admins (pelo e-mail do login) lê e altera os dados
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
grant execute on function public.is_admin() to authenticated;
`);

for (const [key, table] of Object.entries(TABLES)) {
  const cols = columnsOf(backend.HEADERS[key]);
  out.push(`create table if not exists public.${table} (
  pos bigint not null default 0,
${cols.map((c) => `  ${c} text not null default ''`).join(',\n')},
  primary key (${cols[0]})
);
${cols.map((c) => `alter table public.${table} add column if not exists ${c} text not null default '';`).join('\n')}
alter table public.${table} enable row level security;
drop policy if exists "adm" on public.${table};
create policy "adm" on public.${table} for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.${table} to authenticated;
revoke all on public.${table} from anon;
`);
}

out.push(`-- Fotos enviadas pelo painel (pasta pública "fotos")
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
drop policy if exists "fotos adm envia" on storage.objects;
create policy "fotos adm envia" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and public.is_admin());
drop policy if exists "fotos adm apaga" on storage.objects;
create policy "fotos adm apaga" on storage.objects for delete to authenticated using (bucket_id = 'fotos' and public.is_admin());
`);

out.push(readFileSync(root + 'supabase/consulta.sql', 'utf8'));
writeFileSync(root + 'supabase/schema.sql', out.join('\n'));
console.log('supabase/schema.sql gerado');
