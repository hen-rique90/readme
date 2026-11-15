import { useMemo, useState } from 'react';
import { ExternalLink, Phone, Truck } from 'lucide-react';
import { CATEGORIES, formatBRL, formatDate, formatPhone } from '../utils';
import { Badge, CopyButton, Spinner } from './common';

const STATUS_COLOR = {
  'Aguardando cotação': 'bg-amber-100 text-amber-800 border-amber-200',
  'Aguardando pagamento': 'bg-sky-100 text-sky-800 border-sky-200',
  Enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Cancelado: 'bg-slate-100 text-slate-500 border-slate-200'
};

// ADM: pedidos de envio das clientes
export default function ShipmentsTab({ data, run }) {
  const [filter, setFilter] = useState('abertos');
  const [notify, setNotify] = useState({});
  const orders = useMemo(() => Object.fromEntries(data.orders.map((o) => [o.orderId, o])), [data.orders]);
  const all = data.shipments || [];
  // quem acabou de ser respondido continua na tela até avisar a cliente
  const list = all.filter((s) => notify[s.shipmentId] ||
    (filter === 'abertos' ? s.status !== 'Enviado' && s.status !== 'Cancelado' : filter === 'todos' || s.status === filter));
  const sh = data.config.shipping || {};

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><Truck className="w-5 h-5 text-purple-600" /> Envios</h3>
          <p className="text-xs text-slate-500">
            Pedidos de envio feitos pelas clientes em "Meus Pedidos". Gere a etiqueta na plataforma e marque como enviado com o rastreio.
          </p>
          {!sh.melhorEnvio && !sh.superFrete && (
            <p className="text-xs font-semibold text-amber-700 mt-1">⚠️ Cálculo automático desligado: configure os tokens em Configurações → Frete.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="https://melhorenvio.com.br/painel" target="_blank" rel="noreferrer" className="btn-soft"><ExternalLink className="w-3.5 h-3.5" /> Melhor Envio</a>
          <a href="https://web.superfrete.com" target="_blank" rel="noreferrer" className="btn-soft"><ExternalLink className="w-3.5 h-3.5" /> SuperFrete</a>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input w-auto py-2">
            <option value="abertos">Em aberto</option>
            <option value="Aguardando cotação">Aguardando cotação</option>
            <option value="Aguardando pagamento">Aguardando pagamento</option>
            <option value="Enviado">Enviados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>
      {list.length === 0 && <div className="card p-10 text-center text-sm text-slate-500">Nenhum envio aqui. 📦</div>}
      {list.map((s) => (
        <ShipmentCard key={s.shipmentId} s={s} orders={orders} run={run} notifyLink={notify[s.shipmentId]}
          onNotify={(link) => setNotify((n) => ({ ...n, [s.shipmentId]: link }))} />
      ))}
    </div>
  );
}

function ShipmentCard({ s, orders, run, notifyLink, onNotify }) {
  const [price, setPrice] = useState(s.price || '');
  const [service, setService] = useState(s.service || '');
  const [tracking, setTracking] = useState(s.tracking || '');
  const [busy, setBusy] = useState('');
  const items = s.orderIds.map((id) => orders[id]).filter(Boolean);

  const act = async (kind, action, params, msg) => {
    setBusy(kind);
    const res = await run(action, { shipmentId: s.shipmentId, ...params }, msg);
    setBusy('');
    if (res?.notifyLink) onNotify(res.notifyLink);
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-mono text-purple-800">{s.shipmentId}</strong>
            <Badge className={STATUS_COLOR[s.status] || STATUS_COLOR['Aguardando cotação']}>{s.status}</Badge>
            {s.chargeId && (
              <Badge className={s.paid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                frete {s.paid ? 'pago ✓' : 'não pago'}
              </Badge>
            )}
            <span className="text-[11px] text-slate-400">{formatDate(s.createdAt)}</span>
          </div>
          <p className="text-sm"><strong>{s.name}</strong> • {formatPhone(s.whatsapp)}</p>
        </div>
        <div className="text-right text-sm">
          <strong className="text-purple-900">{s.price ? formatBRL(s.price) : 'frete a calcular'}</strong>
          <span className="block text-xs text-slate-500">{s.service}{s.days ? ` • ~${s.days} dias` : ''}</span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 bg-slate-50 rounded-xl p-3 text-sm">
        <span>📍 {s.address}</span>
        <CopyButton text={s.address} label="Copiar" />
      </div>
      <div className="text-xs text-slate-600">
        <strong>{items.length} item(ns):</strong> {items.map((o) => `${o.quantity}x ${o.productName}`).join(' • ')}
        <span className="block text-slate-400">Pacote: {s.package}</span>
      </div>

      {s.status === 'Aguardando cotação' || (s.status === 'Aguardando pagamento' && !s.paid) ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act('price', 'adminSetShippingPrice', { price, service }, 'Valor do frete salvo');
          }}
        >
          <div>
            <label className="label">Serviço</label>
            <input value={service} onChange={(e) => setService(e.target.value)} placeholder="Ex: Correios PAC" className="input py-1.5" />
          </div>
          <div>
            <label className="label">Frete (R$)</label>
            <input required type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input py-1.5 w-28" />
          </div>
          <button className="btn-soft" disabled={!!busy}>{busy === 'price' && <Spinner className="w-3.5 h-3.5" />} {s.status === 'Aguardando cotação' ? 'Informar frete' : 'Corrigir frete'}</button>
        </form>
      ) : null}

      {s.status !== 'Enviado' && s.status !== 'Aguardando cotação' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!s.paid && !window.confirm('O frete ainda não está marcado como pago. Marcar como enviado mesmo assim?')) return;
            act('ship', 'adminMarkShipped', { tracking }, 'Marcado como enviado');
          }}
        >
          <div className="flex-1 min-w-[12rem]">
            <label className="label">Código de rastreio</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ex: AB123456789BR" className="input py-1.5" />
          </div>
          <button className="btn-primary" disabled={!!busy}>{busy === 'ship' && <Spinner className="w-4 h-4" />} Marcar como enviado</button>
        </form>
      )}
      {s.status === 'Enviado' && s.tracking && <p className="text-sm font-bold text-emerald-700">📦 Rastreio: {s.tracking}</p>}

      {notifyLink && (
        <a href={notifyLink} target="_blank" rel="noreferrer"
          className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2">
          <Phone className="w-4 h-4" /> Avisar a cliente no WhatsApp
        </a>
      )}
    </div>
  );
}

// Configurações → Frete: CEP de origem, tokens das plataformas e pacotes por categoria
export function ShippingSettings({ data, run, call }) {
  const sh = data.config.shipping || {};
  const [form, setForm] = useState({
    fromCep: sh.fromCep || '', contactEmail: sh.contactEmail || '', dueDays: sh.dueDays ?? 3, sandbox: !!sh.sandbox,
    melhorEnvioToken: '', superFreteToken: '', packageDefaults: sh.packageDefaults || {}
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setPkg = (cat, k, v) => setForm({ ...form, packageDefaults: { ...form.packageDefaults, [cat]: { ...form.packageDefaults[cat], [k]: v } } });
  const cats = [...new Set([...CATEGORIES, ...Object.keys(form.packageDefaults)])];

  const save = async (extra = {}) => {
    setBusy(true);
    const res = await run('adminSaveShippingSettings', { settings: { ...form, ...extra } }, 'Configurações de frete salvas');
    setBusy(false);
    if (res) setForm((f) => ({ ...f, melhorEnvioToken: '', superFreteToken: '' }));
  };

  return (
    <form className="card p-5 max-w-2xl space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><Truck className="w-5 h-5 text-purple-600" /> Frete (Melhor Envio + SuperFrete)</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">CEP de onde vocês enviam *</label>
          <input value={form.fromCep} onChange={set('fromCep')} inputMode="numeric" placeholder="00000-000" className="input" />
        </div>
        <div>
          <label className="label">E-mail técnico (exigido pelas APIs)</label>
          <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className="input" />
        </div>
        <div>
          <label className="label">Prazo p/ pagar o frete (dias)</label>
          <input type="number" min="0" max="30" value={form.dueDays} onChange={set('dueDays')} className="input" />
        </div>
      </div>

      {[
        ['melhorEnvio', 'melhorEnvioToken', 'removeMelhorEnvio', 'Melhor Envio', 'https://melhorenvio.com.br/painel/gerenciar/tokens'],
        ['superFrete', 'superFreteToken', 'removeSuperFrete', 'SuperFrete', 'https://web.superfrete.com/#/integrations']
      ].map(([key, field, removeKey, name, url]) => (
        <div key={key} className="rounded-xl border border-purple-100 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">{name}</strong>
            {sh[key] ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ token configurado</Badge> : <Badge className="bg-slate-50 text-slate-500 border-slate-200">não configurado</Badge>}
          </div>
          <input type="password" autoComplete="off" value={form[field]} onChange={set(field)} placeholder={sh[key] ? 'Colar um token novo para trocar' : 'Cole aqui o token'} className="input" />
          {sh.status?.[key]?.error && (
            <p className="text-[11px] font-semibold text-rose-700">
              ⚠️ Última falha em {formatDate(sh.status[key].at)}: {sh.status[key].error}
            </p>
          )}
          {sh[key] && sh.status?.[key] && !sh.status[key].error && (
            <p className="text-[11px] font-semibold text-emerald-700">✓ Funcionando (última cotação em {formatDate(sh.status[key].at)})</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <a href={url} target="_blank" rel="noreferrer" className="text-purple-700 underline">Onde pegar o token do {name}</a>
            {sh[key] && <button type="button" className="text-rose-600 font-bold" onClick={() => window.confirm(`Remover o token do ${name}?`) && save({ [removeKey]: true })}>Remover token</button>}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-500">Os tokens ficam guardados em segredo no Apps Script: não aparecem na planilha, no site nem aqui depois de salvos.</p>
      <TestQuote call={call} cats={cats} enabled={sh.melhorEnvio || sh.superFrete} />
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={form.sandbox} onChange={set('sandbox')} className="w-4 h-4 accent-purple-600" />
        Usar ambiente de testes das plataformas (sandbox) — deixe desmarcado para valer de verdade
      </label>

      <div className="space-y-2">
        <h4 className="font-extrabold text-slate-800 text-sm">📦 Pacote padrão por categoria</h4>
        <p className="text-[11px] text-slate-500">
          Envelope: só photocards (e itens finos) vão em envelope; dentro de uma caixa eles só somam o peso. Caixa: álbuns, DVDs, vinil… — as alturas se empilham.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Categoria</th><th>Tipo</th><th>Peso (g)</th><th>Altura</th><th>Largura</th><th>Compr. (cm)</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((cat) => {
                const p = form.packageDefaults[cat] || {};
                return (
                  <tr key={cat}>
                    <td className="py-1 font-semibold pr-2">{cat}</td>
                    <td>
                      <select value={p.type || 'caixa'} onChange={(e) => setPkg(cat, 'type', e.target.value)} className="input py-1 px-2 w-24">
                        <option value="envelope">Envelope</option>
                        <option value="caixa">Caixa</option>
                      </select>
                    </td>
                    {['weight', 'height', 'width', 'length'].map((k) => (
                      <td key={k}><input type="number" min="0" value={p[k] ?? ''} onChange={(e) => setPkg(cat, k, e.target.value)} className="input py-1 px-2 w-20" /></td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <button className="btn-primary w-full py-3" disabled={busy}>{busy && <Spinner className="w-4 h-4" />} Salvar configurações de frete</button>
    </form>
  );
}

// Cotação de teste: confere tokens e CEP sem precisar de cliente
function TestQuote({ call, cats, enabled }) {
  const [cep, setCep] = useState('');
  const [category, setCategory] = useState('Photocards');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      setRes(await call('adminTestShippingQuote', { cep, category }));
    } catch (err) {
      setRes({ options: [], errors: [err.message], package: null });
    }
    setBusy(false);
  };
  return (
    <div className="rounded-xl border border-dashed border-purple-200 p-3 space-y-2">
      <strong className="text-sm">🧪 Testar cotação</strong>
      <p className="text-[11px] text-slate-500">Salve os tokens e o CEP de origem antes. O teste cota um item da categoria escolhida para o CEP de destino.</p>
      <div className="flex flex-wrap gap-2">
        <input value={cep} onChange={(e) => setCep(e.target.value)} inputMode="numeric" placeholder="CEP de destino" className="input py-1.5 w-36" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input py-1.5 w-auto">
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button type="button" disabled={busy || !enabled} onClick={test} className="btn-soft">
          {busy && <Spinner className="w-3.5 h-3.5" />} Testar
        </button>
      </div>
      {res && (
        <div className="text-xs space-y-1">
          {res.package && <p className="text-slate-500">Pacote: {res.package.kind} • {res.package.weight} kg • {res.package.height}x{res.package.width}x{res.package.length} cm</p>}
          {res.options.map((o) => (
            <p key={o.key}>✓ {o.company} {o.service} — <strong>{formatBRL(o.price)}</strong> {o.days ? `• ~${o.days} dias` : ''} <span className="text-slate-400">via {o.provider}</span></p>
          ))}
          {res.errors.map((e) => <p key={e} className="font-semibold text-rose-700">✗ {e}</p>)}
          {!res.options.length && !res.errors.length && <p className="text-amber-700">Nenhuma opção para esse CEP.</p>}
        </div>
      )}
    </div>
  );
}
