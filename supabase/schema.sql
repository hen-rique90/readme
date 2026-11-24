-- Central de Compras CEGS — banco no Supabase
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

create table if not exists public.config (
  pos bigint not null default 0,
  chave text not null default '',
  valor text not null default '',
  descricao text not null default '',
  primary key (chave)
);
alter table public.config add column if not exists chave text not null default '';
alter table public.config add column if not exists valor text not null default '';
alter table public.config add column if not exists descricao text not null default '';
alter table public.config enable row level security;
drop policy if exists "adm" on public.config;
create policy "adm" on public.config for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.produtos (
  pos bigint not null default 0,
  id text not null default '',
  nome_do_produto text not null default '',
  membro text not null default '',
  categoria text not null default '',
  preco_r text not null default '',
  estoque_total text not null default '',
  foto_url text not null default '',
  lote_ceg text not null default '',
  ativo text not null default '',
  prazo_pagamento text not null default '',
  datas_pix_parcelado text not null default '',
  frete text not null default '',
  condicao text not null default '',
  grupo text not null default '',
  primary key (id)
);
alter table public.produtos add column if not exists id text not null default '';
alter table public.produtos add column if not exists nome_do_produto text not null default '';
alter table public.produtos add column if not exists membro text not null default '';
alter table public.produtos add column if not exists categoria text not null default '';
alter table public.produtos add column if not exists preco_r text not null default '';
alter table public.produtos add column if not exists estoque_total text not null default '';
alter table public.produtos add column if not exists foto_url text not null default '';
alter table public.produtos add column if not exists lote_ceg text not null default '';
alter table public.produtos add column if not exists ativo text not null default '';
alter table public.produtos add column if not exists prazo_pagamento text not null default '';
alter table public.produtos add column if not exists datas_pix_parcelado text not null default '';
alter table public.produtos add column if not exists frete text not null default '';
alter table public.produtos add column if not exists condicao text not null default '';
alter table public.produtos add column if not exists grupo text not null default '';
alter table public.produtos enable row level security;
drop policy if exists "adm" on public.produtos;
create policy "adm" on public.produtos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.pedidos (
  pos bigint not null default 0,
  id_pedido text not null default '',
  data text not null default '',
  id_produto text not null default '',
  produto text not null default '',
  membro text not null default '',
  lote text not null default '',
  nome text not null default '',
  insta_twitter text not null default '',
  whatsapp text not null default '',
  qtd text not null default '',
  preco_unit_r text not null default '',
  total_item_r text not null default '',
  envio text not null default '',
  status text not null default '',
  observacao text not null default '',
  pagamento text not null default '',
  obs_da_compradora text not null default '',
  repasse_nome text not null default '',
  repasse_whatsapp text not null default '',
  repasse text not null default '',
  historico text not null default '',
  forma_de_pagamento text not null default '',
  foto text not null default '',
  primary key (id_pedido)
);
alter table public.pedidos add column if not exists id_pedido text not null default '';
alter table public.pedidos add column if not exists data text not null default '';
alter table public.pedidos add column if not exists id_produto text not null default '';
alter table public.pedidos add column if not exists produto text not null default '';
alter table public.pedidos add column if not exists membro text not null default '';
alter table public.pedidos add column if not exists lote text not null default '';
alter table public.pedidos add column if not exists nome text not null default '';
alter table public.pedidos add column if not exists insta_twitter text not null default '';
alter table public.pedidos add column if not exists whatsapp text not null default '';
alter table public.pedidos add column if not exists qtd text not null default '';
alter table public.pedidos add column if not exists preco_unit_r text not null default '';
alter table public.pedidos add column if not exists total_item_r text not null default '';
alter table public.pedidos add column if not exists envio text not null default '';
alter table public.pedidos add column if not exists status text not null default '';
alter table public.pedidos add column if not exists observacao text not null default '';
alter table public.pedidos add column if not exists pagamento text not null default '';
alter table public.pedidos add column if not exists obs_da_compradora text not null default '';
alter table public.pedidos add column if not exists repasse_nome text not null default '';
alter table public.pedidos add column if not exists repasse_whatsapp text not null default '';
alter table public.pedidos add column if not exists repasse text not null default '';
alter table public.pedidos add column if not exists historico text not null default '';
alter table public.pedidos add column if not exists forma_de_pagamento text not null default '';
alter table public.pedidos add column if not exists foto text not null default '';
alter table public.pedidos enable row level security;
drop policy if exists "adm" on public.pedidos;
create policy "adm" on public.pedidos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.cobrancas (
  pos bigint not null default 0,
  id_cobranca text not null default '',
  id_pedido text not null default '',
  whatsapp text not null default '',
  descricao text not null default '',
  valor_r text not null default '',
  status text not null default '',
  criada_em text not null default '',
  paga_em text not null default '',
  vencimento text not null default '',
  ultimo_lembrete text not null default '',
  primary key (id_cobranca)
);
alter table public.cobrancas add column if not exists id_cobranca text not null default '';
alter table public.cobrancas add column if not exists id_pedido text not null default '';
alter table public.cobrancas add column if not exists whatsapp text not null default '';
alter table public.cobrancas add column if not exists descricao text not null default '';
alter table public.cobrancas add column if not exists valor_r text not null default '';
alter table public.cobrancas add column if not exists status text not null default '';
alter table public.cobrancas add column if not exists criada_em text not null default '';
alter table public.cobrancas add column if not exists paga_em text not null default '';
alter table public.cobrancas add column if not exists vencimento text not null default '';
alter table public.cobrancas add column if not exists ultimo_lembrete text not null default '';
alter table public.cobrancas enable row level security;
drop policy if exists "adm" on public.cobrancas;
create policy "adm" on public.cobrancas for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.clientes (
  pos bigint not null default 0,
  whatsapp text not null default '',
  nome text not null default '',
  insta_twitter text not null default '',
  senha_protegida text not null default '',
  sal text not null default '',
  criada_em text not null default '',
  ultimo_acesso text not null default '',
  trocar_senha text not null default '',
  primary key (whatsapp)
);
alter table public.clientes add column if not exists whatsapp text not null default '';
alter table public.clientes add column if not exists nome text not null default '';
alter table public.clientes add column if not exists insta_twitter text not null default '';
alter table public.clientes add column if not exists senha_protegida text not null default '';
alter table public.clientes add column if not exists sal text not null default '';
alter table public.clientes add column if not exists criada_em text not null default '';
alter table public.clientes add column if not exists ultimo_acesso text not null default '';
alter table public.clientes add column if not exists trocar_senha text not null default '';
alter table public.clientes enable row level security;
drop policy if exists "adm" on public.clientes;
create policy "adm" on public.clientes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.solicitacoes (
  pos bigint not null default 0,
  id text not null default '',
  data text not null default '',
  tipo text not null default '',
  id_pedido text not null default '',
  cobrancas text not null default '',
  whatsapp text not null default '',
  nome text not null default '',
  mensagem text not null default '',
  nova_data_pedida text not null default '',
  status text not null default '',
  resposta_da_loja text not null default '',
  respondida_em text not null default '',
  data_aprovada text not null default '',
  primary key (id)
);
alter table public.solicitacoes add column if not exists id text not null default '';
alter table public.solicitacoes add column if not exists data text not null default '';
alter table public.solicitacoes add column if not exists tipo text not null default '';
alter table public.solicitacoes add column if not exists id_pedido text not null default '';
alter table public.solicitacoes add column if not exists cobrancas text not null default '';
alter table public.solicitacoes add column if not exists whatsapp text not null default '';
alter table public.solicitacoes add column if not exists nome text not null default '';
alter table public.solicitacoes add column if not exists mensagem text not null default '';
alter table public.solicitacoes add column if not exists nova_data_pedida text not null default '';
alter table public.solicitacoes add column if not exists status text not null default '';
alter table public.solicitacoes add column if not exists resposta_da_loja text not null default '';
alter table public.solicitacoes add column if not exists respondida_em text not null default '';
alter table public.solicitacoes add column if not exists data_aprovada text not null default '';
alter table public.solicitacoes enable row level security;
drop policy if exists "adm" on public.solicitacoes;
create policy "adm" on public.solicitacoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.enderecos (
  pos bigint not null default 0,
  id text not null default '',
  whatsapp text not null default '',
  apelido text not null default '',
  destinatario text not null default '',
  cep text not null default '',
  rua text not null default '',
  numero text not null default '',
  complemento text not null default '',
  bairro text not null default '',
  cidade text not null default '',
  uf text not null default '',
  criado_em text not null default '',
  primary key (id)
);
alter table public.enderecos add column if not exists id text not null default '';
alter table public.enderecos add column if not exists whatsapp text not null default '';
alter table public.enderecos add column if not exists apelido text not null default '';
alter table public.enderecos add column if not exists destinatario text not null default '';
alter table public.enderecos add column if not exists cep text not null default '';
alter table public.enderecos add column if not exists rua text not null default '';
alter table public.enderecos add column if not exists numero text not null default '';
alter table public.enderecos add column if not exists complemento text not null default '';
alter table public.enderecos add column if not exists bairro text not null default '';
alter table public.enderecos add column if not exists cidade text not null default '';
alter table public.enderecos add column if not exists uf text not null default '';
alter table public.enderecos add column if not exists criado_em text not null default '';
alter table public.enderecos enable row level security;
drop policy if exists "adm" on public.enderecos;
create policy "adm" on public.enderecos for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.envios (
  pos bigint not null default 0,
  id text not null default '',
  data text not null default '',
  whatsapp text not null default '',
  nome text not null default '',
  pedidos text not null default '',
  endereco text not null default '',
  cep text not null default '',
  plataforma text not null default '',
  servico text not null default '',
  frete_r text not null default '',
  prazo_dias text not null default '',
  status text not null default '',
  rastreio text not null default '',
  id_cobranca text not null default '',
  pacote text not null default '',
  primary key (id)
);
alter table public.envios add column if not exists id text not null default '';
alter table public.envios add column if not exists data text not null default '';
alter table public.envios add column if not exists whatsapp text not null default '';
alter table public.envios add column if not exists nome text not null default '';
alter table public.envios add column if not exists pedidos text not null default '';
alter table public.envios add column if not exists endereco text not null default '';
alter table public.envios add column if not exists cep text not null default '';
alter table public.envios add column if not exists plataforma text not null default '';
alter table public.envios add column if not exists servico text not null default '';
alter table public.envios add column if not exists frete_r text not null default '';
alter table public.envios add column if not exists prazo_dias text not null default '';
alter table public.envios add column if not exists status text not null default '';
alter table public.envios add column if not exists rastreio text not null default '';
alter table public.envios add column if not exists id_cobranca text not null default '';
alter table public.envios add column if not exists pacote text not null default '';
alter table public.envios enable row level security;
drop policy if exists "adm" on public.envios;
create policy "adm" on public.envios for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Fotos enviadas pelo painel (pasta pública "fotos")
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
drop policy if exists "fotos adm envia" on storage.objects;
create policy "fotos adm envia" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and public.is_admin());
drop policy if exists "fotos adm apaga" on storage.objects;
create policy "fotos adm apaga" on storage.objects for delete to authenticated using (bucket_id = 'fotos' and public.is_admin());

-- ===========================================================================
-- Funções públicas do site (a única coisa que quem não é ADM consegue usar)
-- ===========================================================================

-- Telefone: só DDD + número (tira o 55)
create or replace function public.ceg_fone(v text) returns text
language sql immutable as $$
  select case when length(d) >= 12 and left(d, 2) = '55' then substr(d, 3) else d end
  from (select regexp_replace(coalesce(v, ''), '\D', '', 'g') as d) x
$$;

-- Valor em reais guardado como texto ("95", "R$ 1.234,50") → número
create or replace function public.ceg_num(v text) returns numeric
language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(v, ''), '[R$\s]', '', 'g');
begin
  if position(',' in s) > 0 then s := replace(replace(s, '.', ''), ',', '.'); end if;
  if s !~ '^-?[0-9]+(\.[0-9]+)?$' then return 0; end if;
  return round(s::numeric, 2);
end $$;

-- Data em texto → 'aaaa-mm-dd' (aceita ISO e dd/mm/aaaa)
create or replace function public.ceg_dia(v text) returns text
language sql immutable as $$
  select case
    when coalesce(v, '') ~ '^\d{4}-\d{2}-\d{2}' then left(v, 10)
    when coalesce(v, '') ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
      split_part(v, '/', 3) || '-' || lpad(split_part(v, '/', 2), 2, '0') || '-' || lpad(split_part(v, '/', 1), 2, '0')
    else '' end
$$;

-- Em qual coluna a cobrança entra (pela descrição)
create or replace function public.ceg_tipo(descricao text) returns text
language sql immutable as $$
  select case
    when lower(coalesce(descricao, '')) ~ '(alf[aâ]ndeg|taxa|imposto|tribut)' then 'alfandega'
    when lower(coalesce(descricao, '')) ~ '(frete|envio|correios)' then 'frete'
    else 'item' end
$$;

-- "Álbum Arirang — Jin" → "Álbum Arirang" (o membro vai na coluna Item)
create or replace function public.ceg_set(nome text, membro text) returns text
language sql immutable as $$
  select case when coalesce(membro, '') = '' then coalesce(nome, '')
    else coalesce(nullif(regexp_replace(coalesce(nome, ''),
      '\s*[—–-]\s*' || regexp_replace(trim(membro), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\s*$', '', 'i'), ''), nome)
  end
$$;

create or replace function public.config_publica() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(chave, valor), '{}'::json)
  from public.config
  where chave in ('storeName', 'pixKey', 'pixName', 'adminWhatsapp', 'noticeBanner')
$$;

-- Consulta pelo telefone: nome, itens (CEG → SET → item) e totais
create or replace function public.consulta_telefone(telefone text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  fone text := public.ceg_fone(telefone);
  cfg json;
  resultado json;
begin
  if length(fone) < 10 or length(fone) > 11 then
    raise exception 'Digite o telefone com DDD, ex: (11) 98888-7777.';
  end if;

  select json_build_object(
    'pixKey', coalesce(max(valor) filter (where chave = 'pixKey'), ''),
    'pixName', coalesce(max(valor) filter (where chave = 'pixName'), ''),
    'adminWhatsapp', coalesce(max(valor) filter (where chave = 'adminWhatsapp'), ''),
    'storeName', coalesce(max(valor) filter (where chave = 'storeName'), ''))
  into cfg from config;

  with ped as (
    select p.id_pedido as id, p.data as criado, p.pos, regexp_replace(trim(p.nome), '\s+', ' ', 'g') as nome,
      coalesce(nullif(trim(p.lote), ''), 'Outros') as ceg, public.ceg_set(p.produto, p.membro) as set_nome,
      coalesce(nullif(trim(p.membro), ''), p.produto) as item, greatest(1, floor(public.ceg_num(p.qtd))) as qtd,
      coalesce(nullif(trim(p.foto), ''), pr.foto_url, '') as foto, public.ceg_num(p.total_item_r) as total,
      p.status as andamento, p.observacao as obs
    from pedidos p
    left join produtos pr on pr.id = p.id_produto
    where public.ceg_fone(p.whatsapp) = fone and p.status <> 'Cancelado'
  ),
  cob as (
    select c.id_pedido as pedido, public.ceg_tipo(c.descricao) as tipo, public.ceg_num(c.valor_r) as valor,
      c.status = 'Pago' as pago, public.ceg_dia(c.vencimento) as venc
    from cobrancas c
    where c.status <> 'Cancelada' and c.id_pedido in (select id from ped)
  ),
  por_tipo as (
    select pedido, tipo, sum(valor) as valor,
      case when bool_and(pago) then 'Pago' when bool_or(pago) then 'Parcial' else 'Pendente' end as situacao
    from cob group by pedido, tipo
  ),
  linhas as (
    select p.*,
      i.valor as v_item, i.situacao as s_item, f.valor as v_frete, f.situacao as s_frete, a.valor as v_alf, a.situacao as s_alf,
      (select min(venc) from cob c where c.pedido = p.id and not c.pago and c.venc <> '') as venc
    from ped p
    left join por_tipo i on i.pedido = p.id and i.tipo = 'item'
    left join por_tipo f on f.pedido = p.id and f.tipo = 'frete'
    left join por_tipo a on a.pedido = p.id and a.tipo = 'alfandega'
  ),
  conta as (
    select regexp_replace(trim(nome), '\s+', ' ', 'g') as nome from clientes
    where public.ceg_fone(whatsapp) = fone and trim(nome) <> '' limit 1
  ),
  mais_usado as (
    select nome from ped where nome <> '' group by nome order by count(*) desc, max(criado) desc limit 1
  )
  select case when not exists (select 1 from ped) then
    json_build_object('buyer', null, 'items', '[]'::json, 'totals', json_build_object('owed', 0, 'paid', 0), 'config', cfg)
  else json_build_object(
    'buyer', json_build_object('name', coalesce((select nome from conta), (select nome from mais_usado), ''), 'whatsapp', fone),
    'items', (select json_agg(json_build_object(
      'ceg', ceg, 'set', set_nome, 'item', item, 'quantity', qtd, 'image', foto,
      'valorItem', coalesce(v_item, total),
      'pgtoItem', coalesce(s_item, ''),
      'valorFrete', coalesce(to_json(v_frete), '""'::json),
      'pgtoFrete', coalesce(s_frete, ''),
      'taxaAlfandega', coalesce(to_json(v_alf), '""'::json),
      'pgtoAlfandega', coalesce(s_alf, ''),
      'andamento', andamento, 'observacoes', obs,
      'vencimento', coalesce(venc, '')
    ) order by criado, pos) from linhas),
    'totals', json_build_object(
      'owed', coalesce((select sum(valor) from cob where not pago), 0),
      'paid', coalesce((select sum(valor) from cob where pago), 0)),
    'config', cfg)
  end into resultado;
  return resultado;
end $$;

grant execute on function public.consulta_telefone(text) to anon, authenticated;
grant execute on function public.config_publica() to anon, authenticated;
