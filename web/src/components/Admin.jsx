import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, Download, Edit3, Eye, EyeOff, KeyRound, Lock, LogOut, Package, Phone, Plus,
  BellRing, Inbox, ReceiptText, RefreshCw, Settings, ShoppingCart, Trash2, Truck, Users
} from 'lucide-react';
import { api, DEMO_PASSWORD, IS_DEMO, resetDemo } from '../api';
import {
  CATEGORIES, DEFAULT_GROUP, phoneConflicts, detectMembers, matchesSearch, GROUPS, GROUP_NAMES, chargeStatusColor, downloadCSV, formatBRL, formatDate, formatPhone, groupOf, membersOf,
  wholeGroupLabel,
  formatDay, formatDayShort, isAlbumLink, isOverdue, memberBadgeColor, orderStatusColor, splitInstallments, waLink
} from '../utils';
import { Badge, DateListInput, DueBadge, Modal, PhoneInput, ProductImage, ProductTags, Spinner } from './common';
import SaleTab from './SaleTab';
import RemindersTab from './RemindersTab';
import { EditBuyerModal, MergeBuyerModal, SameNamePanel } from './BuyerTools';
import { SplitOrderModal } from './OrderTools';
import RequestsTab from './RequestsTab';
import ShipmentsTab, { ShippingSettings } from './ShipmentsTab';
import { PhotoButton, PhotoUploader } from './PhotoUpload';

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
  const [ordersQuery, setOrdersQuery] = useState({ text: '', n: 0 }); // busca vinda de outra aba

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
  const call = useCallback((action, params = {}) => api(action, { ...params, password }), [password]);

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

  const uploadPhoto = useCallback(
    async (data, name) => (await api('adminUploadPhoto', { data, mimeType: 'image/jpeg', name, password })).url,
    [password]
  );

  if (!data) {
    return <Login loading={loading} onLogin={async (pass) => {
      if (await load(pass)) {
        writePass(pass);
        setPassword(pass);
      }
    }} />;
  }

  const today = data.config.today || '';
  const dueNow = data.charges.filter((c) => c.status === 'Pendente' && c.dueDate && today && c.dueDate <= today).length;

  const conflicts = phoneConflicts(data.orders, data.clients).filter((c) => c.severity === 'diferente').length;

  const pendingRequests = (data.requests || []).filter((r) => r.status === 'Pendente').length;
  const openShipments = (data.shipments || []).filter((x) => x.status !== 'Enviado' && x.status !== 'Cancelado').length;
  const tabs = [
    ['orders', ReceiptText, `Pedidos (${data.orders.length})`],
    ['requests', Inbox, `Solicitações${pendingRequests ? ` (${pendingRequests})` : ''}`],
    ['shipments', Truck, `Envios${openShipments ? ` (${openShipments})` : ''}`],
    ['reminders', BellRing, `Cobranças do dia${dueNow ? ` (${dueNow})` : ''}`],
    ['sale', ShoppingCart, 'Registrar venda'],
    ['buyers', Users, `Compradoras${conflicts ? ` ⚠️${conflicts}` : ''}`],
    ['products', Package, `Produtos (${data.products.length})`],
    ['batch', Truck, 'Cobrar frete do lote'],
    ['settings', Settings, 'Configurações']
  ];

  return (
    <PhotoUploader.Provider value={uploadPhoto}>
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

      {tab === 'orders' && <OrdersTab key={ordersQuery.n} data={data} run={run} initialQuery={ordersQuery.text} />}
      {tab === 'buyers' && (
        <BuyersTab
          data={data}
          run={run}
          call={call}
          showToast={showToast}
          reload={async () => {
            await load(password, true);
            onCatalogChange();
          }}
          onShowOrders={(text) => {
            setOrdersQuery((q) => ({ text, n: q.n + 1 }));
            setTab('orders');
          }}
        />
      )}
      {tab === 'sale' && <SaleTab data={data} run={run} />}
      {tab === 'shipments' && <ShipmentsTab data={data} run={run} />}
      {tab === 'requests' && (
        <RequestsTab
          data={data}
          run={run}
          onShowOrders={(text) => {
            setOrdersQuery((q) => ({ text, n: q.n + 1 }));
            setTab('orders');
          }}
        />
      )}
      {tab === 'reminders' && <RemindersTab call={call} run={run} showToast={showToast} />}
      {tab === 'products' && <ProductsTab data={data} run={run} />}
      {tab === 'batch' && <BatchChargeTab data={data} run={run} />}
      {tab === 'settings' && (
        <div className="space-y-5">
          <SettingsTab data={data} run={run} />
          <ShippingSettings key={JSON.stringify(data.config.shipping || {})} data={data} run={run} call={call} />
        </div>
      )}
    </main>
    </PhotoUploader.Provider>
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

function OrdersTab({ data, run, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery);
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState('');
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [onlyTransfers, setOnlyTransfers] = useState(false);
  const [onlyMulti, setOnlyMulti] = useState(false);
  const productsById = useMemo(() => Object.fromEntries(data.products.map((p) => [p.id, p])), [data.products]);
  const groupOfOrder = (o) => groupOf(productsById[o.productId] || {});
  const isMulti = (o) => o.status !== 'Cancelado' && detectMembers(o.productName, groupOfOrder(o)).length >= 2;
  const multiCount = data.orders.filter(isMulti).length;
  const [transferred, setTransferred] = useState(null); // aviso depois de repassar (o pedido pode sair do filtro)
  const pendingTransfers = data.orders.filter((o) => o.transferName || o.transferWhatsapp).length;
  const [expanded, setExpanded] = useState(null);
  const chargesByOrder = useChargesByOrder(data.charges);
  const batches = [...new Set(data.orders.map((o) => o.batch).filter(Boolean))];

  const filtered = data.orders.filter((o) => {
    const q = query.toLowerCase().trim();
    const owed = sumBy(chargesByOrder[o.orderId] || [], 'Pendente');
    return (
      matchesSearch(q, `${o.orderId} ${o.buyerName} ${o.contact} ${o.productName} ${o.productId}`, [o.whatsapp]) &&
      (!batch || o.batch === batch) &&
      (!status || o.status === status) &&
      (!onlyOwing || owed > 0) &&
      (!(onlyTransfers && pendingTransfers > 0) || !!(o.transferName || o.transferWhatsapp)) &&
      (!(onlyMulti && multiCount > 0) || isMulti(o))
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
        {pendingTransfers > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-fuchsia-700 bg-fuchsia-50 px-2.5 py-1.5 rounded-lg">
            <input type="checkbox" checked={onlyTransfers} onChange={(e) => setOnlyTransfers(e.target.checked)} className="w-4 h-4 accent-fuchsia-600" />
            🔁 Repasses aguardando ({pendingTransfers})
          </label>
        )}
        {multiCount > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-sky-800 bg-sky-50 px-2.5 py-1.5 rounded-lg" title="Itens como 'Jin e Jimin' com o valor somado">
            <input type="checkbox" checked={onlyMulti} onChange={(e) => setOnlyMulti(e.target.checked)} className="w-4 h-4 accent-sky-600" />
            ✂️ Vários membros no mesmo pedido ({multiCount})
          </label>
        )}
      </div>
      {transferred && (
        <Modal onClose={() => setTransferred(null)}>
          <div className="space-y-3 text-center">
            <h3 className="text-lg font-extrabold text-slate-800 pr-8">Pedido repassado para {transferred.buyerName} ✓</h3>
            <p className="text-sm text-slate-600">
              {transferred.quantity}x {transferred.productName} • <span className="font-mono">{transferred.orderId}</span>
            </p>
            {transferNotifyLink(transferred) ? (
              <a href={transferNotifyLink(transferred)} target="_blank" rel="noreferrer"
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" /> Avisar a nova compradora
              </a>
            ) : (
              <p className="text-xs text-amber-700">Sem WhatsApp cadastrado para avisar.</p>
            )}
          </div>
        </Modal>
      )}
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
                      <div className="flex gap-2">
                      <ProductImage src={o.image || productsById[o.productId]?.image} className="w-10 h-10 rounded-lg border border-purple-100 shrink-0" emojiSize="text-sm" />
                      <div>
                      <span className="font-semibold text-slate-800">{o.quantity}x {o.productName}</span>
                      <span className="block text-[11px] text-slate-400">#{o.productId} • {o.batch} • {o.shipping}{o.payment ? ` • ${o.payment}` : ''}</span>
                      {o.paymentMethod === 'Cartão de crédito' && (
                        <span className="mt-1 mr-1 inline-block px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] font-bold text-indigo-800">
                          💳 Cartão — enviar link
                        </span>
                      )}
                      {o.buyerNote && (
                        <span className="mt-1 inline-block px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900">
                          💬 {o.buyerNote}
                        </span>
                      )}
                      {(o.transferName || o.transferWhatsapp) && (
                        <span className="mt-1 ml-1 inline-block px-2 py-1 rounded-lg bg-fuchsia-50 border border-fuchsia-200 text-[11px] font-bold text-fuchsia-800">
                          🔁 Repasse para {o.transferName} — aguardando você
                        </span>
                      )}
                      </div>
                      </div>
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
                        <OrderDetails order={o} charges={charges} run={run} onTransferred={setTransferred} group={groupOfOrder(o)} productImage={productsById[o.productId]?.image} />
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

// Corrigir valor, descrição ou vencimento de uma cobrança já lançada
function EditCharge({ charge, run, onDone }) {
  const [form, setForm] = useState({ amount: charge.amount, description: charge.description, dueDate: charge.dueDate || '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form
      className="bg-purple-50 rounded-xl p-2.5 border border-purple-300 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (charge.status === 'Pago' && Number(form.amount) !== charge.amount &&
          !window.confirm('Essa cobrança já está paga. Mudar o valor muda o total pago dela. Continuar?')) return;
        if (await run('adminUpdateCharge', { chargeId: charge.chargeId, ...form }, 'Cobrança corrigida')) onDone();
      }}
    >
      <input required value={form.description} onChange={set('description')} className="input py-1.5" aria-label="Descrição" />
      <div className="grid grid-cols-2 gap-2">
        <input required type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} className="input py-1.5" aria-label="Valor" />
        <input type="date" value={form.dueDate} onChange={set('dueDate')} className="input py-1.5" aria-label="Vencimento" />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-1.5">Salvar</button>
        <button type="button" onClick={onDone} className="btn-soft">Cancelar</button>
      </div>
    </form>
  );
}

// Corrigir produto, quantidade e valor unitário do pedido
function EditItem({ order, run, productImage }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productName: order.productName, quantity: order.quantity, unitPrice: order.unitPrice, adjustCharge: true, image: order.image || '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const total = (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-purple-700 hover:underline">
        ✏️ Editar item (produto, quantidade, valor)
      </button>
    );
  }
  return (
    <form
      className="bg-purple-50 rounded-xl p-3 border border-purple-300 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run('adminUpdateOrder', { orderId: order.orderId, ...form }, (r) =>
          r.adjustedCharge ? `Item corrigido; cobrança ajustada para ${formatBRL(r.adjustedCharge.amount)}` : 'Item corrigido'
        );
        if (res) setOpen(false);
      }}
    >
      <h4 className="font-extrabold text-slate-800 text-sm">Editar item</h4>
      <input required value={form.productName} onChange={set('productName')} className="input py-1.5" aria-label="Produto" />
      <div className="flex gap-2 items-center">
        <input type="url" value={form.image} onChange={set('image')} placeholder="Link da foto (Drive ou Imgur)" className="input py-1.5" aria-label="Foto" />
        <PhotoButton name={form.productName} onUploaded={(url) => setForm((f) => ({ ...f, image: url }))} />
        <ProductImage src={form.image || productImage} className="w-10 h-10 rounded-lg border border-purple-100 shrink-0" emojiSize="text-sm" />
      </div>
      {!form.image && productImage && <p className="text-[11px] text-slate-400">Sem foto própria: usa a foto do produto do catálogo.</p>}
      <div className="grid grid-cols-3 gap-2 items-center">
        <input required type="number" min="1" value={form.quantity} onChange={set('quantity')} className="input py-1.5" aria-label="Quantidade" title="Quantidade" />
        <input required type="number" step="0.01" min="0.01" value={form.unitPrice} onChange={set('unitPrice')} className="input py-1.5" aria-label="Valor unitário" title="Valor unitário" />
        <span className="text-xs font-bold text-purple-900">= {formatBRL(total)}</span>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-slate-600">
        <input type="checkbox" checked={form.adjustCharge} onChange={set('adjustCharge')} className="w-4 h-4 accent-purple-600" />
        Ajustar a cobrança do item junto (se for uma só e estiver pendente)
      </label>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-1.5">Salvar</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-soft">Cancelar</button>
      </div>
    </form>
  );
}

function OrderDetails({ order, charges, run, onTransferred, group, productImage }) {
  const [splitting, setSplitting] = useState(false);
  const [desc, setDesc] = useState('Frete internacional');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState(order.note);
  const [editingCharge, setEditingCharge] = useState(null);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <EditItem order={order} run={run} productImage={productImage} />
          {order.status !== 'Cancelado' && (
            <button type="button" onClick={() => setSplitting(true)} className="text-xs font-bold text-sky-700 hover:underline">
              ✂️ Separar por membro{detectMembers(order.productName, group).length >= 2 ? ` (${detectMembers(order.productName, group).join(', ')})` : ''}
            </button>
          )}
        </div>
        {splitting && <SplitOrderModal order={order} group={group} run={run} onClose={() => setSplitting(false)} />}
        <h4 className="font-extrabold text-slate-800 text-sm">Cobranças deste pedido</h4>
        {charges.length === 0 && <p className="text-xs text-slate-400">Nenhuma cobrança.</p>}
        {charges.map((c) => editingCharge === c.chargeId ? (
          <EditCharge key={c.chargeId} charge={c} run={run} onDone={() => setEditingCharge(null)} />
        ) : (
          <div key={c.chargeId} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl p-2.5 border border-purple-100">
            <div>
              <span className="text-sm font-semibold text-slate-800">{c.description}</span>
              <span className="block text-[11px] text-slate-400">
                {c.chargeId} • criada {formatDate(c.createdAt)}{c.paidAt ? ` • paga ${formatDate(c.paidAt)}` : ''}
              </span>
              <DueBadge charge={c} />
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
              <button
                onClick={() => setEditingCharge(c.chargeId)}
                className="p-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100"
                aria-label="Corrigir cobrança"
                title="Corrigir valor, descrição ou vencimento"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
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
              if (await run('addCharge', { orderId: order.orderId, description: desc, amount, dueDate }, 'Cobrança adicionada')) setAmount('');
            }}
          >
            <h4 className="font-extrabold text-slate-800 text-sm">Adicionar cobrança</h4>
            <div className="flex gap-2">
              <input value={desc} onChange={(e) => setDesc(e.target.value)} required placeholder="Ex: Frete nacional" className="input flex-1" />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" step="0.01" min="0.01" placeholder="R$" className="input w-28" />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Pagar até
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input py-1.5 w-auto" />
              <span className="text-slate-400">(opcional)</span>
            </label>
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
          <h4 className="font-extrabold text-slate-800 text-sm">Sua observação para a compradora (ela vê)</h4>
          <div className="flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: código de rastreio" className="input flex-1" />
            <button className="btn-soft">Salvar</button>
          </div>
        </form>
        <TransferBox order={order} charges={charges} run={run} onTransferred={onTransferred} />
        {order.history && (
          <div className="bg-white rounded-xl p-3 border border-purple-100">
            <h4 className="font-extrabold text-slate-800 text-sm mb-1">Histórico</h4>
            <ul className="text-[11px] text-slate-500 space-y-0.5">
              {order.history.split(' | ').map((h, i) => <li key={i}>• {h}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function transferNotifyLink(o) {
  return (
    o.whatsapp &&
    waLink(o.whatsapp, `Oii ${o.buyerName.split(' ')[0]}! 💜 O item ${o.quantity}x ${o.productName} (pedido ${o.orderId}) agora está no seu nome na CEG.\nVocê acompanha em "Meus Pedidos" no site. Para criar sua conta, use seu WhatsApp e o código ${o.orderId}.`)
  );
}

function TransferBox({ order, charges, run, onTransferred }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState({ name: '', contact: '', whatsapp: '' });
  const pending = order.transferName || order.transferWhatsapp;
  const paid = charges.filter((c) => c.status === 'Pago').reduce((a, c) => a + c.amount, 0);
  const owed = charges.filter((c) => c.status === 'Pendente').reduce((a, c) => a + c.amount, 0);
  if (pending) {
    return (
      <div className="bg-fuchsia-50 rounded-xl p-3 border border-fuchsia-200 space-y-2">
        <h4 className="font-extrabold text-fuchsia-900 text-sm">🔁 Pedido de repasse da compradora</h4>
        <p className="text-sm text-slate-700">
          {order.buyerName} quer repassar para <strong>{order.transferName}</strong>
          {order.transferWhatsapp && <> ({formatPhone(order.transferWhatsapp)})</>}
          {order.transferContact && <> {order.transferContact}</>}.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={async () => {
              const res = await run('adminApproveTransfer', { orderId: order.orderId }, 'Repasse aprovado!');
              if (res) onTransferred(res.order);
            }}
          >
            Aprovar repasse
          </button>
          <button type="button" className="btn-soft" onClick={() => window.confirm('Recusar este repasse?') && run('adminRejectTransfer', { orderId: order.orderId }, 'Repasse recusado')}>
            Recusar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-3 border border-purple-100 space-y-2">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between font-extrabold text-slate-800 text-sm">
        🔁 Repassar para outra pessoa / corrigir compradora
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!window.confirm(`Passar o pedido ${order.orderId} de ${order.buyerName} para ${to.name}?`)) return;
            const res = await run('adminTransferOrder', { orderId: order.orderId, ...to }, 'Pedido repassado!');
            if (res) onTransferred(res.order);
          }}
        >
          <p className="text-[11px] text-slate-500">
            Use quando a cliente fez o claim no nome dela mas era para outra pessoa, ou para corrigir nome/WhatsApp.
            Vai junto: {formatBRL(paid)} já pago e {formatBRL(owed)} que falta pagar.
          </p>
          <input required minLength={2} value={to.name} onChange={(e) => setTo({ ...to, name: e.target.value })} placeholder="Nome de quem fica com o item" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <PhoneInput value={to.whatsapp} onChange={(e) => setTo({ ...to, whatsapp: e.target.value })} placeholder="WhatsApp com DDD" className="input" />
            <input value={to.contact} onChange={(e) => setTo({ ...to, contact: e.target.value })} placeholder="@ (opcional)" className="input" />
          </div>
          <button className="btn-primary w-full">Repassar pedido</button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuyersTab({ data, run, call, reload, showToast, onShowOrders }) {
  const [editing, setEditing] = useState(null);
  const [merging, setMerging] = useState(null); // { buyer, preselect }
  const [onlyOwing, setOnlyOwing] = useState(true);
  const [temp, setTemp] = useState(null);
  const accounts = useMemo(() => {
    const map = {};
    (data.clients || []).forEach((c) => { map[c.whatsapp] = c; });
    return map;
  }, [data.clients]);
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
    (data.clients || []).forEach((c) => {
      if (!map[c.whatsapp]) map[c.whatsapp] = { whatsapp: c.whatsapp, name: c.name, contact: c.contact, items: 0, owed: 0, paid: 0, pending: [] };
    });
    return Object.values(map).sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  }, [data.orders, data.clients, chargesByOrder]);

  const q = query.toLowerCase().trim();
  const list = buyers.filter((b) => (!onlyOwing || b.owed > 0) && matchesSearch(q, `${b.name} ${b.contact}`, [b.whatsapp]));

  const reminder = (b) =>
    `Oii ${b.name.split(' ')[0]}! 💜 Passando para lembrar dos pagamentos pendentes da CEG:\n\n` +
    b.pending.map((c) => `• ${c.order.orderId} — ${c.order.quantity}x ${c.order.productName}: ${c.description} (${formatBRL(c.amount)})${c.dueDate ? ` — até ${formatDay(c.dueDate)}${isOverdue(c) ? ' ⚠️ vencida' : ''}` : ''}`).join('\n') +
    `\n\n*Total: ${formatBRL(b.owed)}*\nChave Pix: ${data.config.pixKey}\n\n` +
    (accounts[b.whatsapp]
      ? `Você acompanha tudo em "Meus Pedidos" entrando na sua conta no site.`
      : `Crie sua conta no site (botão "Entrar" → "Criar conta") com este WhatsApp e o código ${b.pending[0]?.order.orderId || ''} para acompanhar tudo em "Meus Pedidos".`);

  // dados que as ferramentas de corrigir/juntar precisam
  const orderCount = useMemo(() => {
    const m = {};
    data.orders.forEach((o) => { m[o.whatsapp] = (m[o.whatsapp] || 0) + 1; });
    return m;
  }, [data.orders]);
  const toolBuyer = (b) => ({ ...b, orders: orderCount[b.whatsapp] || 0, account: !!accounts[b.whatsapp] });

  const deleteAccount = (b) =>
    window.confirm(`Excluir a CONTA (login) de ${b.name}? Os pedidos dela continuam no sistema.`) &&
    run('adminDeleteAccount', { whatsapp: b.whatsapp }, 'Conta excluída');

  const resetPassword = async (b) => {
    if (!window.confirm(`Gerar uma senha temporária para ${b.name}? A senha atual dela deixa de funcionar.`)) return;
    const res = await run('adminResetPassword', { whatsapp: b.whatsapp }, 'Senha temporária gerada');
    if (res) setTemp(res);
  };

  return (
    <div className="space-y-4">
    <PhoneConflicts data={data} onShowOrders={onShowOrders} />
    <SameNamePanel
      data={data}
      onEdit={(b) => setEditing(toolBuyer(b))}
      onMerge={(b, preselect) => setMerging({ buyer: toolBuyer(b), preselect })}
    />
    {editing && <EditBuyerModal buyer={editing} call={call} reload={reload} showToast={showToast} onClose={() => setEditing(null)} />}
    {merging && (
      <MergeBuyerModal
        buyer={merging.buyer}
        preselect={merging.preselect}
        buyers={buyers.filter((b) => b.whatsapp).map(toolBuyer)}
        call={call}
        reload={reload}
        showToast={showToast}
        onClose={() => setMerging(null)}
      />
    )}
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
        {temp && (
          <Modal onClose={() => setTemp(null)}>
            <div className="space-y-3 text-center">
              <h3 className="text-lg font-extrabold text-slate-800 pr-8">Senha temporária de {temp.name}</h3>
              <p className="text-3xl font-black font-mono text-purple-900 tracking-wider">{temp.tempPassword}</p>
              <p className="text-xs text-slate-500">Ela entra com essa senha e o site pede para criar uma nova na hora. Esta tela não mostra a senha de novo.</p>
              <a
                href={waLink(temp.whatsapp, `Oii ${temp.name.split(' ')[0]}! 💜 Sua senha temporária da CEG é: ${temp.tempPassword}\nEntre no site com seu WhatsApp e essa senha — ele vai pedir para você criar uma senha nova.`)}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" /> Enviar pelo WhatsApp
              </a>
            </div>
          </Modal>
        )}
        {list.map((b) => (
          <div key={b.whatsapp} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="font-bold text-slate-800">{b.name}</span>{' '}
              <span className="text-xs text-purple-600 font-semibold">{b.contact}</span>{' '}
              {accounts[b.whatsapp] ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓ tem conta</Badge>
              ) : (
                <Badge className="bg-slate-50 text-slate-500 border-slate-200">sem conta</Badge>
              )}
              <span className="block text-xs text-slate-400">{formatPhone(b.whatsapp)} • {b.items} item(ns)</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="text-right text-xs">
                <span className="block text-emerald-700 font-bold">Pago {formatBRL(b.paid)}</span>
                <span className={`font-black text-sm ${b.owed > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Deve {formatBRL(b.owed)}</span>
              </div>
              {b.whatsapp && (
                <>
                  <button onClick={() => setEditing(toolBuyer(b))} className="btn-soft" title="Corrigir nome, @ ou WhatsApp em todos os pedidos">
                    ✏️ Corrigir
                  </button>
                  <button onClick={() => setMerging({ buyer: toolBuyer(b) })} className="btn-soft" title="Mesma pessoa com dois números">
                    🔗 Juntar
                  </button>
                </>
              )}
              {accounts[b.whatsapp] && (
                <button onClick={() => deleteAccount(b)} className="btn-soft" title="Apaga só o login; os pedidos continuam">
                  🗑️ Conta
                </button>
              )}
              {accounts[b.whatsapp] && (
                <button onClick={() => resetPassword(b)} className="btn-soft" title="Para quem esqueceu a senha">
                  <KeyRound className="w-3.5 h-3.5" /> Senha temporária
                </button>
              )}
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
    </div>
  );
}

// Telefones usados por pessoas com nomes diferentes: uma vê os pedidos da outra
function PhoneConflicts({ data, onShowOrders }) {
  const [showSimilar, setShowSimilar] = useState(false);
  const all = phoneConflicts(data.orders, data.clients);
  const list = all.filter((c) => showSimilar || c.severity === 'diferente');
  const similar = all.length - all.filter((c) => c.severity === 'diferente').length;
  if (!all.length) {
    return (
      <div className="card p-4 text-sm text-emerald-800 bg-emerald-50 border-emerald-200">
        ✓ Nenhum WhatsApp está sendo usado por pessoas com nomes diferentes.
      </div>
    );
  }
  return (
    <div className="card p-4 space-y-3 border-amber-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-slate-800">⚠️ Mesmo WhatsApp com nomes diferentes</h3>
          <p className="text-xs text-slate-500">
            Quem entra com esse WhatsApp vê os pedidos de todos os nomes abaixo. Abra os pedidos e use
            "Repassar para outra pessoa / corrigir compradora" para colocar o WhatsApp certo de cada uma.
          </p>
        </div>
        {similar > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={showSimilar} onChange={(e) => setShowSimilar(e.target.checked)} className="w-4 h-4 accent-purple-600" />
            Mostrar também nomes parecidos ({similar}) — ex.: Soraya/Soraia
          </label>
        )}
      </div>
      {list.length === 0 && <p className="text-sm text-emerald-700">✓ Só há variações de escrita do mesmo nome.</p>}
      {list.map((c) => (
        <div key={c.whatsapp} className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${c.severity === 'diferente' ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="text-sm">
            <strong>{formatPhone(c.whatsapp)}</strong>{' '}
            <Badge className={c.severity === 'diferente' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
              {c.severity === 'diferente' ? 'pessoas diferentes?' : 'nome parecido'}
            </Badge>
            <span className="block text-xs text-slate-600 mt-1">
              {c.names.map((n) => `${n.name} (${n.count} pedido${n.count === 1 ? '' : 's'}${n.account ? ', tem conta' : ''})`).join(' • ')}
            </span>
          </div>
          <button type="button" onClick={() => onShowOrders(c.whatsapp)} className="btn-soft">
            Ver os {c.orders.length} pedidos
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

const EMPTY_PRODUCT = {
  id: '', name: '', group: DEFAULT_GROUP, member: 'OT7', category: 'Photocards', price: '', totalStock: 1, image: '', batch: '', active: true,
  dueDate: '', parcelado: false, installmentDates: ['', ''], shippingCost: '', condition: ''
};

function ProductsTab({ data, run }) {
  const lastBatch = data.products[data.products.length - 1]?.batch || '';
  const [form, setForm] = useState({ ...EMPTY_PRODUCT, batch: lastBatch });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [byMember, setByMember] = useState(false);
  const [variants, setVariants] = useState({}); // { Jimin: { on, totalStock, image } }
  const [otherGroup, setOtherGroup] = useState(false); // grupo fora da lista
  const [customMembers, setCustomMembers] = useState(''); // integrantes digitados (grupo fora da lista)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const group = (form.group || '').trim();
  const knownGroup = !otherGroup && !!GROUPS[group];
  // Integrantes para o "por membro": os da lista oficial ou os digitados
  const groupMembers = knownGroup
    ? membersOf(group)
    : [...new Set(customMembers.split(/[,;\n]+/).map((m) => m.trim()).filter(Boolean))];
  // Opções do campo Membro: "OTn" + integrantes (+ o valor atual, se for diferente)
  const memberOptions = [...new Set([wholeGroupLabel(group), ...groupMembers, form.member].filter(Boolean))];
  const usedMembers = [...new Set(data.products.filter((p) => groupOf(p) === group).map((p) => p.member))];
  const chosen = groupMembers.filter((m) => variants[m]?.on);
  const chooseGroup = (value) => {
    const isOther = value === '__outro__';
    setOtherGroup(isOther);
    setVariants({});
    setForm({ ...form, group: isOther ? '' : value, member: isOther ? '' : wholeGroupLabel(value) });
  };
  const setVariant = (m, patch) => setVariants((vs) => ({ ...vs, [m]: { totalStock: 1, image: '', ...vs[m], ...patch } }));

  const reset = () => {
    setEditing(null);
    setVariants({});
    setForm({
      ...EMPTY_PRODUCT,
      batch: form.batch,
      dueDate: form.dueDate,
      group: form.group,
      member: knownGroup ? wholeGroupLabel(group) : form.member
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const product = {
      ...form,
      isNew: !editing,
      installmentDates: form.parcelado ? form.installmentDates.filter(Boolean) : []
    };
    if (form.parcelado && product.installmentDates.length < 2) {
      setSaving(false);
      window.alert('Para o Pix parcelado, preencha pelo menos 2 datas.');
      return;
    }
    if (byMember && !editing) {
      if (!chosen.length) {
        setSaving(false);
        window.alert('Escolha pelo menos um membro.');
        return;
      }
      const res = await run(
        'saveProductBatch',
        { product, variants: chosen.map((m) => ({ member: m, totalStock: variants[m].totalStock, image: variants[m].image })) },
        (r) => `${r.products.length} itens adicionados (${r.products[0].id} a ${r.products[r.products.length - 1].id})!`
      );
      setSaving(false);
      if (res) reset();
      return;
    }
    const res = await run('saveProduct', { product }, (r) => (editing ? 'Produto atualizado!' : `Item ${r.product.id} adicionado à CEG!`));
    setSaving(false);
    if (res) reset();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <form onSubmit={save} className="card p-5 space-y-3 h-fit lg:sticky lg:top-24">
        <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
          <Plus className="w-5 h-5 text-purple-600" /> {editing ? `Editando ${editing}` : 'Anunciar item'}
        </h3>
        {!editing && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-purple-50">
            {[[false, 'Um item'], [true, 'Por membro']].map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setByMember(value)}
                className={`py-2 rounded-lg text-sm font-bold ${byMember === value ? 'bg-white text-purple-800 shadow-sm' : 'text-purple-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {byMember && !editing ? (
            <div>
              <label className="label">Código</label>
              <div className="input bg-slate-50 text-slate-400">Automático</div>
            </div>
          ) : (
            <div>
              <label className="label">Código (opcional)</label>
              <input value={form.id} disabled={!!editing} onChange={set('id')} placeholder="Automático" className="input disabled:bg-slate-50" />
            </div>
          )}
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
        <div>
          <label className="label">Grupo *</label>
          <select value={otherGroup || !GROUPS[group] ? '__outro__' : group} onChange={(e) => chooseGroup(e.target.value)} className="input font-bold">
            {GROUP_NAMES.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="__outro__">Outro grupo…</option>
          </select>
          {(otherGroup || !GROUPS[group]) && (
            <>
              <input
                required
                value={form.group}
                onChange={set('group')}
                placeholder="Nome do grupo (ex: NCT 127)"
                className="input mt-2"
                list="other-groups"
              />
              <datalist id="other-groups">
                {[...new Set(data.products.map(groupOf))].filter((g) => !GROUPS[g]).map((g) => <option key={g} value={g} />)}
              </datalist>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!(byMember && !editing) && (
            <div>
              <label className="label">Membro</label>
              {knownGroup ? (
                <select value={form.member} onChange={set('member')} className="input">
                  {memberOptions.map((m) => <option key={m}>{m}</option>)}
                </select>
              ) : (
                <>
                  <input value={form.member} onChange={set('member')} placeholder="Ex: Taeyong ou Grupo todo" className="input" list="other-members" />
                  <datalist id="other-members">
                    {['Grupo todo', ...usedMembers].map((m) => <option key={m} value={m} />)}
                  </datalist>
                </>
              )}
            </div>
          )}
          <div className={byMember && !editing ? 'col-span-2' : ''}>
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
          {!(byMember && !editing) && (
            <div>
              <label className="label">Quantidade total *</label>
              <input required type="number" min="1" value={form.totalStock} onChange={set('totalStock')} className="input" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Condição</label>
            <select value={form.condition || ''} onChange={set('condition')} className="input">
              <option value="">Não informar</option>
              {(data.config.conditionOptions || ['Novo', 'Lacrado', 'Aberto']).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Frete</label>
            <select value={form.shippingCost || ''} onChange={set('shippingCost')} className="input">
              <option value="">Não informar</option>
              {(data.config.shippingCostOptions || ['Frete incluso', 'Frete não incluso']).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {byMember && !editing && (
          <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Membros ({chosen.length})</span>
              <button
                type="button"
                className="text-xs font-bold text-fuchsia-700 underline"
                onClick={() => {
                  const all = chosen.length < groupMembers.length;
                  const next = {};
                  groupMembers.forEach((m) => { next[m] = { totalStock: 1, image: '', ...variants[m], on: all }; });
                  setVariants(next);
                }}
              >
                {chosen.length < groupMembers.length ? 'Marcar todos' : 'Desmarcar todos'}
              </button>
            </div>
            {!knownGroup && (
              <textarea
                value={customMembers}
                onChange={(e) => setCustomMembers(e.target.value)}
                rows={2}
                placeholder="Integrantes separados por vírgula (ex: Taeyong, Jaehyun, Doyoung)"
                className="input resize-none"
              />
            )}
            {groupMembers.map((m) => {
              const v = variants[m] || {};
              return (
                <div key={m} className={`rounded-xl p-2 ${v.on ? 'bg-white border border-fuchsia-200' : ''}`}>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer min-w-0">
                    <input type="checkbox" checked={!!v.on} onChange={(e) => setVariant(m, { on: e.target.checked })} className="w-4 h-4 accent-fuchsia-600 shrink-0" />
                    <span className="shrink-0">{m}</span>
                    {v.on && form.name && <span className="text-[11px] font-medium text-slate-400 truncate">→ {form.name} — {m}</span>}
                  </label>
                  {v.on && (
                    <div className="grid grid-cols-[4.5rem_1fr] gap-2 mt-2">
                      <input
                        type="number"
                        min="1"
                        value={v.totalStock ?? 1}
                        onChange={(e) => setVariant(m, { totalStock: e.target.value })}
                        className="input py-1.5"
                        aria-label={`Quantidade de ${m}`}
                        title="Quantidade"
                      />
                      <input
                        type="url"
                        value={v.image || ''}
                        onChange={(e) => setVariant(m, { image: e.target.value })}
                        placeholder="Foto deste membro (opcional)"
                        className="input py-1.5"
                        aria-label={`Foto de ${m}`}
                      />
                      <PhotoButton className="col-span-full" name={`${form.name} ${m}`} onUploaded={(url) => setVariant(m, { image: url })} />
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[11px] text-slate-500">
              Cada membro vira um item separado (quantidade 1 por padrão). Sem foto própria, usa a foto geral abaixo.
            </p>
          </div>
        )}
        <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-3 space-y-3">
          <div>
            <label className="label">Prazo para pagamento (Pix à vista)</label>
            <input type="date" value={form.dueDate || ''} onChange={set('dueDate')} className="input" />
            <p className="text-[11px] text-slate-400 mt-1">A compradora vê "pagar até" essa data, e a cobrança já nasce com esse vencimento.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-purple-900 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.parcelado}
              onChange={(e) => setForm({ ...form, parcelado: e.target.checked })}
              className="w-4 h-4 accent-purple-600"
            />
            Aceita Pix parcelado
          </label>
          {form.parcelado && (
            <div className="space-y-2">
              <DateListInput value={form.installmentDates} onChange={(installmentDates) => setForm({ ...form, installmentDates })} />
              {Number(form.price) > 0 && form.installmentDates.length >= 2 && (
                <p className="text-[11px] text-purple-800 font-semibold">
                  {form.installmentDates.length}x de {formatBRL(splitInstallments(Number(form.price), form.installmentDates.length)[0])} por unidade
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="label">{byMember && !editing ? 'Foto geral (opcional)' : 'Link da foto'}</label>
          <div className="flex gap-2 items-start">
            <input type="url" value={form.image} onChange={set('image')} placeholder="https://..." className="input" />
            <PhotoButton name={form.name} onUploaded={(url) => setForm((f) => ({ ...f, image: url }))} />
          </div>
          {form.image && (
            <div className="mt-2 flex items-center gap-3">
              <ProductImage src={form.image} className="w-20 h-20 rounded-xl border border-purple-100 shrink-0" />
              <p className="text-[11px] text-slate-500">
                {isAlbumLink(form.image)
                  ? 'Esse é link de álbum do Imgur. Abra o álbum, clique com o botão direito na foto e use "Copiar endereço da imagem".'
                  : 'Prévia da foto. Se aparecer só o 💜, a foto não está pública ou o link não é de imagem.'}
              </p>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            Aceita link do Google Drive (compartilhado como "Qualquer pessoa com o link") ou do Imgur.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1 py-3" disabled={saving}>
            {saving && <Spinner className="w-4 h-4" />}{' '}
            {editing ? 'Salvar alterações' : byMember ? `Publicar ${chosen.length} itens na CEG` : 'Publicar na CEG'}
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
                    <span className="text-xs text-slate-400">{groupOf(p)} • {p.category} • {p.batch}</span>
                    {!p.active && <Badge className="bg-slate-200 text-slate-600 border-slate-300">Oculto</Badge>}
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{p.name}</h4>
                  <ProductTags product={p} className="my-0.5" />
                  <p className="text-xs font-bold text-purple-900">
                    {formatBRL(p.price)} •{' '}
                    <span className={p.available === 0 ? 'text-rose-600' : 'text-emerald-600'}>{p.available} livres</span>{' '}
                    <span className="text-slate-400 font-medium">({p.sold} vendidos de {p.totalStock})</span>
                  </p>
                  {(p.dueDate || (p.installmentDates || []).length > 0) && (
                    <p className="text-[11px] text-slate-500">
                      {p.dueDate && <>Pagar até {formatDay(p.dueDate)}</>}
                      {p.dueDate && p.installmentDates.length > 0 && ' • '}
                      {p.installmentDates.length > 0 && <>Pix parcelado {p.installmentDates.length}x ({p.installmentDates.map(formatDayShort).join(', ')})</>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setEditing(p.id);
                    setOtherGroup(!GROUPS[groupOf(p)]);
                    setForm({
                      ...p,
                      group: groupOf(p),
                      parcelado: (p.installmentDates || []).length > 0,
                      installmentDates: (p.installmentDates || []).length ? p.installmentDates : ['', '']
                    });
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
  const [dueDate, setDueDate] = useState('');
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
          <div>
            <label className="label">Prazo para pagar (opcional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
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
                const res = await run('addBatchCharge', { batch, description, amountPerUnit, dueDate }, (r) => `${r.count} cobranças lançadas (${formatBRL(r.total)})`);
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
      <label className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 cursor-pointer">
        <input type="checkbox" checked={!!form.requireLogin} onChange={(e) => setForm({ ...form, requireLogin: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        <span className="text-sm font-bold text-purple-900">
          Exigir conta para fazer claim
          <span className="block text-[11px] font-medium text-purple-700">Desmarcado: quem não tem conta também pode dar claim preenchendo nome, @ e WhatsApp.</span>
        </span>
      </label>
      <label className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 cursor-pointer">
        <input type="checkbox" checked={!!form.acceptCard} onChange={(e) => setForm({ ...form, acceptCard: e.target.checked })} className="w-5 h-5 accent-purple-600" />
        <span className="text-sm font-bold text-purple-900">
          Aceitar cartão de crédito
          <span className="block text-[11px] font-medium text-purple-700">A cliente escolhe "Cartão" no claim e vocês mandam o link de pagamento. O site não pede dados de cartão.</span>
        </span>
      </label>
      <div className="rounded-2xl border border-purple-100 p-3 space-y-3">
        <h4 className="font-extrabold text-slate-800 text-sm">📧 Resumo diário de cobranças</h4>
        <div className="grid sm:grid-cols-[1fr_9rem] gap-3">
          <div>
            <label className="label">E-mail que recebe o resumo</label>
            <input type="email" value={form.reminderEmail || ''} onChange={set('reminderEmail')} placeholder="voce@exemplo.com" className="input" />
          </div>
          <div>
            <label className="label">Lembrete (dias antes)</label>
            <input type="number" min="0" max="15" value={form.reminderDaysBefore ?? 2} onChange={set('reminderDaysBefore')} className="input" />
          </div>
        </div>
        <p className={`text-xs font-semibold ${data.config.dailyEmailActive ? 'text-emerald-700' : 'text-amber-700'}`}>
          {data.config.dailyEmailActive
            ? '✓ Envio automático ativo: todo dia por volta das 8h (só manda se houver cobrança).'
            : '⚠️ Envio automático ainda não ativado. No Apps Script, escolha a função "ativarResumoDiario" e clique em Executar (uma vez só).'}
        </p>
        <button
          type="button"
          className="btn-soft"
          onClick={() => run('adminSendDigest', {}, (r) => `Resumo enviado para ${r.to}`)}
        >
          Enviar um resumo de teste agora
        </button>
        <p className="text-[11px] text-slate-400">Salve o e-mail antes de testar. O e-mail sai da conta Google da planilha; confira também a caixa de spam.</p>
      </div>
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
    ['Pedido', 'Data', 'Lote', 'Código', 'Produto', 'Membro', 'Qtd', 'Total item', 'Nome', '@', 'WhatsApp', 'Envio', 'Status', 'Pago', 'Falta pagar', 'Obs', 'Obs. da compradora'],
    data.orders.map((o) => {
      const ch = byOrder[o.orderId] || [];
      return [o.orderId, formatDate(o.createdAt), o.batch, o.productId, o.productName, o.member, o.quantity, brl(o.itemTotal),
        o.buyerName, o.contact, o.whatsapp, o.shipping, o.status, brl(sumBy(ch, 'Pago')), brl(sumBy(ch, 'Pendente')), o.note, o.buyerNote || ''];
    })
  );
}
