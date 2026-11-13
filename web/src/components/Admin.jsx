import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, Download, Edit3, Eye, EyeOff, Lock, LogOut, Package, Phone, Plus,
  ReceiptText, RefreshCw, Settings, Trash2, Truck, Users
} from 'lucide-react';
import { api, DEMO_PASSWORD, IS_DEMO, resetDemo } from '../api';
import {
  CATEGORIES, MEMBERS, chargeStatusColor, downloadCSV, formatBRL, formatDate, formatPhone,
  memberBadgeColor, orderStatusColor, waLink
} from '../utils';
import { Badge, Modal, ProductImage, Spinner } from './common';

const PASS_KEY = 'ceg_adm_senha';
const CHARGE_STATUSES = ['Pendente', 'Pago', 'Cancelada'];

const readPass = () => {
  try { return sessionStorage.getItem(PASS_KEY) || ''; } catch { return ''; }
};
const writePass = (v) => {
  try { v ? sessionStorage.setItem(PASS_KEY, v) : sessionStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
};

export default function Admin({ showToast, onCatalogChange }) {
  const [password, setPassword] = useState(readPass);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('orders');

  const logout = useCallback(() => {
    writePass('');
    setPassword('');
    setData(null);
  }, []);

  const load = useCallback(async (pass = password, silent = false) => {
    if (!pass) return;
    setLoading(true);
    try {
      const res = await api('adminData', { password: pass });
      setData(res);
      return true;
    } catch (err) {
      if (!silent || err.authError) showToast(err.message, 'error');
      if (err.authError) logout();
      return false;
    } finally {
      setLoading(false);
    }
  }, [password, showToast, logout]);

  useEffect(() => {
    if (password) load(password, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Executa uma ação do ADM e recarrega os dados
  const run = useCallback(async (action, params, successMsg) => {
    try {
      const res = await api(action, { ...params, password });
      await load(password, true);
      onCatalogChange();
      if (successMsg) showToast(typeof successMsg === 'function' ? successMsg(res) : successMsg);
      return res;
    } catch (err) {
      showToast(err.message, 'error');
      if (err.authError) logout();
      return null;
    }
  }, [password, load, showToast, onCatalogChange, logout]);

  if (!data) {
    return <Login loading={loading} onLogin={async (pass) => {
      if (await load(pass)) {
        writePass(pass);
        setPassword(pass);
      }
    }} />;
  }

  const tabs = [
    ['orders', ReceiptText, `Pedidos (${data.orders.length})`],
    ['buyers', Users, 'Compradoras'],
    ['products', Package, `Produtos (${data.products.length})`],
    ['batch', Truck, 'Cobrar frete do lote'],
    ['settings', Settings, 'Configurações']
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
      <Stats data={data} />

      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 ${
                tab === key ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-purple-50'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => load(password)} className="btn-soft" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={() => exportCSV(data)} className="btn-soft">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={logout} className="btn-soft">
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </div>

      {tab === 'orders' && <OrdersTab data={data} run={run} />}
      {tab === 'buyers' && <BuyersTab data={data} />}
      {tab === 'products' && <ProductsTab data={data} run={run} />}
      {tab === 'batch' && <BatchChargeTab data={data} run={run} />}
      {tab === 'settings' && <SettingsTab data={data} run={run} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function Login({ onLogin, loading }) {
  const [pass, setPass] = useState(IS_DEMO ? DEMO_PASSWORD : '');
  return (
    <main className="max-w-sm mx-auto px-4 pt-10">
      <form
        className="card p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onLogin(pass);
        }}
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-800">Painel ADM</h2>
          <p className="text-xs text-slate-500 mt-1">Acesso só para quem organiza a CEG.</p>
        </div>
        <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Senha" className="input" autoFocus />
        <button className="btn-primary w-full py-3" disabled={loading}>
          {loading && <Spinner className="w-4 h-4" />} Entrar
        </button>
        {IS_DEMO && <p className="text-[11px] text-center text-slate-400">Modo demonstração — senha: {DEMO_PASSWORD}</p>}
      </form>
    </main>
  );
}

// ---------------------------------------------------------------------------

function useChargesByOrder(charges) {
  return useMemo(() => {
    const map = {};
    charges.forEach((c) => {
      (map[c.orderId] = map[c.orderId] || []).push(c);
    });
    return map;
  }, [charges]);
}

const sumBy = (list, status) => list.filter((c) => c.status === status).reduce((a, c) => a + c.amount, 0);

function Stats({ data }) {
  const owed = sumBy(data.charges, 'Pendente');
  const paid = sumBy(data.charges, 'Pago');
  const active = data.orders.filter((o) => o.status !== 'Cancelado');
  const free = data.products.filter((p) => p.active).reduce((a, p) => a + p.available, 0);
  const buyers = new Set(active.map((o) => o.whatsapp)).size;
  const cards = [
    ['A receber', formatBRL(owed), 'text-amber-600'],
    ['Recebido', formatBRL(paid), 'text-emerald-600'],
    ['Pedidos ativos', `${active.length} • ${buyers} compradora(s)`, 'text-slate-800'],
    ['Unidades livres', `${free}`, 'text-purple-800']
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(([label, value, color]) => (
        <div key={label} className="card p-4">
          <span className="text-[11px] font-bold text-slate-400 uppercase">{label}</span>
          <p className={`text-lg sm:text-xl font-black mt-0.5 ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function OrdersTab({ data, run }) {
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const chargesByOrder = useChargesByOrder(data.charges);
  const batches = [...new Set(data.orders.map((o) => o.batch).filter(Boolean))];

  const filtered = data.orders.filter((o) => {
    const q = query.toLowerCase().trim();
    const owed = sumBy(chargesByOrder[o.orderId] || [], 'Pendente');
    return (
      (!q || `${o.orderId} ${o.buyerName} ${o.contact} ${o.whatsapp} ${o.productName} ${o.productId}`.toLowerCase().includes(q)) &&
      (!batch || o.batch === batch) &&
      (!status || o.status === status) &&
      (!onlyOwing || owed > 0)
    );
  });

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex flex-wrap gap-2 items-center border-b border-purple-50">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pedido, nome, @, WhatsApp, item..." className="input flex-1 min-w-[200px]" />
        <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input w-auto">
          <option value="">Todos os lotes</option>
          {batches.map((b) => <option key={b}>{b}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          <option value="">Todos os status</option>
          {data.config.orderStatuses.map((s) => <option key={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} className="w-4 h-4 accent-purple-600" />
          Só com pagamento pendente
        </label>
      </div>
      <p className="px-4 pt-3 text-[11px] text-slate-500">
        Mudar para <strong>Cancelado</strong> devolve o item ao estoque e cancela as cobranças pendentes. Clique na seta para ver e marcar pagamentos.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead>
            <tr className="text-[11px] font-extrabold text-purple-900 uppercase bg-purple-50/70">
              <th className="py-3 px-3 w-8"></th>
              <th className="py-3 px-3">Pedido</th>
              <th className="py-3 px-3">Compradora</th>
              <th className="py-3 px-3">Item</th>
              <th className="py-3 px-3">Pago / Falta</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Contato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-50">
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-400">Nenhum pedido encontrado.</td></tr>
            )}
            {filtered.map((o) => {
              const charges = chargesByOrder[o.orderId] || [];
              const owed = sumBy(charges, 'Pendente');
              const paid = sumBy(charges, 'Pago');
              const isOpen = expanded === o.orderId;
              return (
                <Fragment key={o.orderId}>
                  <tr className={`hover:bg-purple-50/30 ${o.status === 'Cancelado' ? 'opacity-60' : ''}`}>
                    <td className="px-3">
                      <button onClick={() => setExpanded(isOpen ? null : o.orderId)} className="p-1.5 rounded-lg bg-purple-50 text-purple-700" aria-label="Detalhes">
                        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="font-black text-purple-800 font-mono block">{o.orderId}</span>
                      <span className="text-[11px] text-slate-400">{formatDate(o.createdAt)}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-800 block">{o.buyerName}</span>
                      <span className="text-xs text-purple-600 font-semibold">{o.contact}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800">{o.quantity}x {o.productName}</span>
                      <span className="block text-[11px] text-slate-400">#{o.productId} • {o.batch} • {o.shipping}</span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="block text-emerald-700 font-bold">{formatBRL(paid)}</span>
                      <span className={`text-xs font-bold ${owed > 0 ? 'text-amber-600' : 'text-slate-400'}`}>falta {formatBRL(owed)}</span>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={o.status}
                        onChange={(e) => run('setOrderStatus', { orderId: o.orderId, status: e.target.value }, `Pedido ${o.orderId}: ${e.target.value}`)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border ${orderStatusColor(o.status)}`}
                      >
                        {data.config.orderStatuses.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <a
                        href={waLink(o.whatsapp, `Oii ${o.buyerName.split(' ')[0]}! 💜 Sobre o seu pedido ${o.orderId} (${o.quantity}x ${o.productName}) na nossa CEG:`)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-xs font-bold"
                      >
                        <Phone className="w-3.5 h-3.5" /> {formatPhone(o.whatsapp)}
                      </a>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-purple-50/40">
                      <td colSpan={7} className="p-4">
                        <OrderDetails order={o} charges={charges} run={run} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrderDetails({ order, charges, run }) {
  const [desc, setDesc] = useState('Frete internacional');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(order.note);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        <h4 className="font-extrabold text-slate-800 text-sm">Cobranças deste pedido</h4>
        {charges.length === 0 && <p className="text-xs text-slate-400">Nenhuma cobrança.</p>}
        {charges.map((c) => (
          <div key={c.chargeId} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl p-2.5 border border-purple-100">
            <div>
              <span className="text-sm font-semibold text-slate-800">{c.description}</span>
              <span className="block text-[11px] text-slate-400">
                {c.chargeId} • criada {formatDate(c.createdAt)}{c.paidAt ? ` • paga ${formatDate(c.paidAt)}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-slate-800">{formatBRL(c.amount)}</span>
              <select
                value={c.status}
                onChange={(e) => run('setChargeStatus', { chargeId: c.chargeId, status: e.target.value }, `Cobrança marcada como ${e.target.value}`)}
                className={`px-2 py-1 rounded-lg text-xs font-bold border ${chargeStatusColor(c.status)}`}
              >
                {CHARGE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {c.status !== 'Pago' && (
                <button
                  onClick={() => window.confirm('Excluir esta cobrança?') && run('deleteCharge', { chargeId: c.chargeId }, 'Cobrança excluída')}
                  className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                  aria-label="Excluir cobrança"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {order.status !== 'Cancelado' && (
          <form
            className="bg-white rounded-xl p-3 border border-purple-100 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run('addCharge', { orderId: order.orderId, description: desc, amount }, 'Cobrança adicionada')) setAmount('');
            }}
          >
            <h4 className="font-extrabold text-slate-800 text-sm">Adicionar cobrança</h4>
            <div className="flex gap-2">
              <input value={desc} onChange={(e) => setDesc(e.target.value)} required placeholder="Ex: Frete nacional" className="input flex-1" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" step="0.01" min="0.01" placeholder="R$" className="input w-28" />
            </div>
            <button className="btn-primary w-full"><Plus className="w-4 h-4" /> Adicionar</button>
          </form>
        )}
        <form
          className="bg-white rounded-xl p-3 border border-purple-100 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('setOrderNote', { orderId: order.orderId, note }, 'Observação salva');
          }}
        >
          <h4 className="font-extrabold text-slate-800 text-sm">Observação (a compradora vê)</h4>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: código de rastreio" className="input flex-1" />
            <button className="btn-soft">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuyersTab({ data }) {
  const [onlyOwing, setOnlyOwing] = useState(true);
  const [query, setQuery] = useState('');
  const chargesByOrder = useChargesByOrder(data.charges);

  const buyers = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => {
      const b = (map[o.whatsapp] = map[o.whatsapp] || { whatsapp: o.whatsapp, name: o.buyerName, contact: o.contact, items: 0, owed: 0, paid: 0, pending: [] });
      if (o.status !== 'Cancelado') b.items += o.quantity;
      (chargesByOrder[o.orderId] || []).forEach((c) => {
        if (c.status === 'Pendente') {
          b.owed += c.amount;
          b.pending.push({ ...c, order: o });
        } else if (c.status === 'Pago') b.paid += c.amount;
      });
    });
    return Object.values(map).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  }, [data.orders, chargesByOrder]);

  const q = query.toLowerCase().trim();
  const list = buyers.filter((b) => (!onlyOwing || b.owed > 0) && (!q || `${b.name} ${b.contact} ${b.whatsapp}`.toLowerCase().includes(q)));

  const reminder = (b) =>
    `Oii ${b.name.split(' ')[0]}! 💜 Passando para lembrar dos pagamentos pendentes da CEG:\n\n` +
    b.pending.map((c) => `• ${c.order.orderId} — ${c.order.quantity}x ${c.order.productName}: ${c.description} (${formatBRL(c.amount)})`).join('\n') +
    `\n\n*Total: ${formatBRL(b.owed)}*\nChave Pix: ${data.config.pixKey}\n\nVocê acompanha tudo em "Meus Pedidos" no site com seu WhatsApp + código ${b.pending[0]?.order.orderId || ''}.`;

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex flex-wrap gap-3 items-center border-b border-purple-50">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar compradora..." className="input flex-1 min-w-[200px]" />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} className="w-4 h-4 accent-purple-600" />
          Só quem está devendo
        </label>
      </div>
      <div className="divide-y divide-purple-50">
        {list.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Ninguém por aqui. 🎉</p>}
        {list.map((b) => (
          <div key={b.whatsapp} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-bold text-slate-800">{b.name}</span>{' '}
              <span className="text-xs text-purple-600 font-semibold">{b.contact}</span>
              <span className="block text-xs text-slate-400">{formatPhone(b.whatsapp)} • {b.items} item(ns)</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-xs">
                <span className="block text-emerald-700 font-bold">Pago {formatBRL(b.paid)}</span>
                <span className={`font-black text-sm ${b.owed > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Deve {formatBRL(b.owed)}</span>
              </div>
              {b.owed > 0 && (
                <a href={waLink(b.whatsapp, reminder(b))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold">
                  <Phone className="w-3.5 h-3.5" /> Cobrar
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_PRODUCT = { id: '', name: '', member: 'OT7', category: 'Photocards', price: '', totalStock: 1, image: '', batch: '', active: true };

function ProductsTab({ data, run }) {
  const lastBatch = data.products[data.products.length - 1]?.batch || '';
  const [form, setForm] = useState({ ...EMPTY_PRODUCT, batch: lastBatch });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const reset = () => {
    setEditing(null);
    setForm({ ...EMPTY_PRODUCT, batch: form.batch });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await run('saveProduct', { product: { ...form, isNew: !editing } }, (r) => (editing ? 'Produto atualizado!' : `Item ${r.product.id} adicionado à CEG!`));
    setSaving(false);
    if (res) reset();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <form onSubmit={save} className="card p-5 space-y-3 h-fit lg:sticky lg:top-24">
        <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Plus className="w-5 h-5 text-purple-600" /> {editing ? `Editando ${editing}` : 'Anunciar item'}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Código (opcional)</label>
            <input value={form.id} disabled={!!editing} onChange={set('id')} placeholder="Automático" className="input disabled:bg-slate-50" />
          </div>
          <div>
            <label className="label">Lote / CEG</label>
            <input value={form.batch} onChange={set('batch')} placeholder="CEG #44 Weverse" className="input" list="batches" />
            <datalist id="batches">
              {[...new Set(data.products.map((p) => p.batch))].map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
        </div>
        <div>
          <label className="label">Nome do produto *</label>
          <input required value={form.name} onChange={set('name')} placeholder="Photocard Jungkook Golden POB" className="input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Membro</label>
            <select value={form.member} onChange={set('member')} className="input">
              {[...new Set([...MEMBERS, form.member])].map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Categoria</label>
            <select value={form.category} onChange={set('category')} className="input">
              {[...new Set([...CATEGORIES, form.category])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Preço (R$) *</label>
            <input required type="number" step="0.01" min="0.01" value={form.price} onChange={set('price')} placeholder="95.00" className="input" />
          </div>
          <div>
            <label className="label">Quantidade total *</label>
            <input required type="number" min="1" value={form.totalStock} onChange={set('totalStock')} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Link da foto</label>
          <input type="url" value={form.image} onChange={set('image')} placeholder="https://..." className="input" />
          <p className="text-[11px] text-slate-400 mt-1">Dica: suba a foto no Imgur ou Google Drive (público) e cole o link direto da imagem.</p>
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1 py-3" disabled={saving}>
            {saving && <Spinner className="w-4 h-4" />} {editing ? 'Salvar alterações' : 'Publicar na CEG'}
          </button>
          {editing && <button type="button" onClick={reset} className="btn-soft px-4">Cancelar</button>}
        </div>
      </form>

      <div className="lg:col-span-2 card overflow-hidden">
        <div className="divide-y divide-purple-50">
          {data.products.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Nenhum produto ainda. Anuncie o primeiro ao lado!</p>}
          {[...data.products].reverse().map((p) => (
            <div key={p.id} className={`p-4 flex flex-wrap items-center justify-between gap-3 ${p.active ? '' : 'bg-slate-50 opacity-70'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <ProductImage src={p.image} className="w-14 h-14 rounded-2xl border border-purple-100 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-black text-purple-700">#{p.id}</span>
                    <Badge className={memberBadgeColor(p.member)}>{p.member}</Badge>
                    <span className="text-xs text-slate-400">{p.category} • {p.batch}</span>
                    {!p.active && <Badge className="bg-slate-200 text-slate-600 border-slate-300">Oculto</Badge>}
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{p.name}</h4>
                  <p className="text-xs font-bold text-purple-900">
                    {formatBRL(p.price)} •{' '}
                    <span className={p.available === 0 ? 'text-rose-600' : 'text-emerald-600'}>{p.available} livres</span>{' '}
                    <span className="text-slate-400 font-medium">({p.sold} vendidos de {p.totalStock})</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setEditing(p.id);
                    setForm({ ...p });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="p-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100"
                  title="Editar"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => run('saveProduct', { product: { ...p, active: !p.active } }, p.active ? 'Item oculto do catálogo' : 'Item visível no catálogo')}
                  className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
                  title={p.active ? 'Ocultar do catálogo' : 'Mostrar no catálogo'}
                >
                  {p.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => window.confirm(`Excluir ${p.id}?`) && run('deleteProduct', { id: p.id }, 'Item excluído')}
                  className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BatchChargeTab({ data, run }) {
  const batches = [...new Set(data.orders.map((o) => o.batch).filter(Boolean))];
  const [batch, setBatch] = useState(batches[0] || '');
  const [description, setDescription] = useState('Frete internacional');
  const [amountPerUnit, setAmountPerUnit] = useState('');
  const [confirming, setConfirming] = useState(false);

  const affected = data.orders.filter((o) => o.batch === batch && o.status !== 'Cancelado');
  const units = affected.reduce((a, o) => a + o.quantity, 0);
  const total = units * Number(amountPerUnit || 0);

  return (
    <div className="card p-5 max-w-xl space-y-4">
      <div>
        <h3 className="text-lg font-extrabold text-slate-800">Cobrar frete (ou taxa) de um lote inteiro</h3>
        <p className="text-xs text-slate-500 mt-1">
          Quando o lote chegar, lance aqui o frete internacional/nacional. Cada pedido ativo do lote recebe uma cobrança
          de <em>valor por unidade × quantidade</em> e aparece como "Falta pagar" para a compradora.
        </p>
      </div>
      {batches.length === 0 ? (
        <p className="text-sm text-slate-400">Ainda não há pedidos.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
        >
          <div>
            <label className="label">Lote</label>
            <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input">
              {batches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Descrição</label>
              <input required value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Valor por unidade (R$)</label>
              <input required type="number" step="0.01" min="0.01" value={amountPerUnit} onChange={(e) => setAmountPerUnit(e.target.value)} className="input" />
            </div>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 text-sm text-purple-900">
            {affected.length} pedido(s) • {units} unidade(s) • total a cobrar <strong>{formatBRL(total)}</strong>
          </div>
          <button className="btn-primary w-full py-3" disabled={affected.length === 0}>
            <Truck className="w-4 h-4" /> Lançar cobrança
          </button>
        </form>
      )}
      {confirming && (
        <Modal onClose={() => setConfirming(false)}>
          <h3 className="text-lg font-extrabold text-slate-800 pr-8">Confirmar cobrança em lote?</h3>
          <p className="text-sm text-slate-600 mt-2">
            "{description}" de {formatBRL(amountPerUnit)} por unidade para {affected.length} pedido(s) do lote <strong>{batch}</strong>.
            Total: <strong>{formatBRL(total)}</strong>.
          </p>
          <div className="flex gap-2 mt-5">
            <button
              className="btn-primary flex-1"
              onClick={async () => {
                setConfirming(false);
                const res = await run('addBatchCharge', { batch, description, amountPerUnit }, (r) => `${r.count} cobranças lançadas (${formatBRL(r.total)})`);
                if (res) setAmountPerUnit('');
              }}
            >
              Confirmar
            </button>
            <button className="btn-soft px-5" onClick={() => setConfirming(false)}>Voltar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsTab({ data, run }) {
  const [form, setForm] = useState({ ...data.config });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return (
    <form
      className="card p-5 max-w-2xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run('saveConfig', { config: form }, 'Configurações salvas!');
      }}
    >
      <h3 className="text-lg font-extrabold text-slate-800">Configurações da CEG</h3>
      <label className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 cursor-pointer">
        <input type="checkbox" checked={!!form.claimsOpen} onChange={(e) => setForm({ ...form, claimsOpen: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        <span className="text-sm font-bold text-purple-900">Claims abertos (desmarque para pausar as vendas)</span>
      </label>
      <div>
        <label className="label">Nome da loja</label>
        <input value={form.storeName} onChange={set('storeName')} className="input" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Chave Pix</label>
          <input value={form.pixKey} onChange={set('pixKey')} className="input" />
        </div>
        <div>
          <label className="label">Nome do titular do Pix</label>
          <input value={form.pixName} onChange={set('pixName')} className="input" />
        </div>
        <div>
          <label className="label">WhatsApp para comprovantes</label>
          <input value={form.adminWhatsapp} onChange={set('adminWhatsapp')} placeholder="5511999999999" className="input" />
        </div>
        <div>
          <label className="label">Máx. unidades por claim</label>
          <input type="number" min="1" value={form.maxPerClaim} onChange={set('maxPerClaim')} className="input" />
        </div>
      </div>
      <div>
        <label className="label">Aviso do topo</label>
        <input value={form.noticeBanner} onChange={set('noticeBanner')} className="input" />
      </div>
      <p className="text-[11px] text-slate-500">
        Para trocar a senha do painel, edite a linha <code>adminPassword</code> na aba <strong>Config</strong> da planilha.
      </p>
      <button className="btn-primary w-full py-3">Salvar</button>
      {IS_DEMO && (
        <button type="button" onClick={() => window.confirm('Apagar todos os dados de demonstração?') && resetDemo()} className="btn-soft w-full">
          Restaurar dados de demonstração
        </button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------

function exportCSV(data) {
  const byOrder = {};
  data.charges.forEach((c) => (byOrder[c.orderId] = byOrder[c.orderId] || []).push(c));
  const brl = (n) => n.toFixed(2).replace('.', ',');
  downloadCSV(
    `CEG_pedidos_${new Date().toISOString().slice(0, 10)}.csv`,
    ['Pedido', 'Data', 'Lote', 'Código', 'Produto', 'Membro', 'Qtd', 'Total item', 'Nome', '@', 'WhatsApp', 'Envio', 'Status', 'Pago', 'Falta pagar', 'Obs'],
    data.orders.map((o) => {
      const ch = byOrder[o.orderId] || [];
      return [o.orderId, formatDate(o.createdAt), o.batch, o.productId, o.productName, o.member, o.quantity, brl(o.itemTotal),
        o.buyerName, o.contact, o.whatsapp, o.shipping, o.status, brl(sumBy(ch, 'Pago')), brl(sumBy(ch, 'Pendente')), o.note];
    })
  );
}
