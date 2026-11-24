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
