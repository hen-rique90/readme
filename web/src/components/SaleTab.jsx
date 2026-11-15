import { useMemo, useState } from 'react';
import { CheckCircle2, Phone, ShoppingCart } from 'lucide-react';
import {
  CATEGORIES, DEFAULT_GROUP, GROUPS, GROUP_NAMES, formatBRL, formatDay, formatPhone, groupOf, membersOf, sameFirstName,
  splitInstallments, todayKey, waLink, wholeGroupLabel
} from '../utils';
import { DateListInput, PhoneInput, ProductImage, Spinner } from './common';
import { PhotoButton } from './PhotoUpload';

const EMPTY = {
  name: '', contact: '', whatsapp: '',
  source: 'free', productId: '', useStock: true,
  productName: '', image: '', group: DEFAULT_GROUP, otherGroup: false, member: 'OT7', category: 'Photocards', batch: '',
  quantity: 1, unitPrice: '', date: todayKey(), status: 'Comprado', shipping: '',
  mode: 'avista', paid: false, dueDate: '', installmentDates: ['', ''], paidInstallments: 0, note: ''
};

// Registrar uma venda feita fora do site (ou antes do sistema existir)
export default function SaleTab({ data, run }) {
  const [form, setForm] = useState({ ...EMPTY, shipping: data.config.shippingOptions?.[0] || 'Guardar na bag' });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Compradoras conhecidas (pedidos + contas) para preencher rápido
  const buyers = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => { if (o.whatsapp && !map[o.whatsapp]) map[o.whatsapp] = { name: o.buyerName, contact: o.contact, whatsapp: o.whatsapp }; });
    (data.clients || []).forEach((c) => { map[c.whatsapp] = { name: c.name, contact: c.contact, whatsapp: c.whatsapp }; });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.orders, data.clients]);
  const buyerLabel = (b) => `${b.name} — ${formatPhone(b.whatsapp)}`;
  const pickBuyer = (value) => {
    const b = buyers.find((x) => buyerLabel(x) === value);
    setForm(b ? { ...form, name: b.name, contact: b.contact, whatsapp: b.whatsapp } : { ...form, name: value });
  };

  const typedPhone = form.whatsapp.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const owner = typedPhone.length >= 10 ? buyers.find((b) => b.whatsapp === typedPhone) : null;
  const product = data.products.find((p) => p.id === form.productId);
  const group = form.group.trim();
  const known = !form.otherGroup && !!GROUPS[group];
  const total = (Number(form.unitPrice) || 0) * (Number(form.quantity) || 0);
  const dates = form.installmentDates.filter(Boolean);
  const parts = splitInstallments(total, dates.length);

  const submit = async (e) => {
    e.preventDefault();
    if (form.mode === 'parcelado' && dates.length < 2) return window.alert('No Pix parcelado, preencha pelo menos 2 datas.');
    setSaving(true);
    const params = {
      buyer: { name: form.name, contact: form.contact, whatsapp: form.whatsapp },
      quantity: Number(form.quantity),
      unitPrice: form.unitPrice,
      date: form.date,
      status: form.status,
      shipping: form.shipping,
      batch: form.batch,
      note: form.note,
      payment:
        form.mode === 'parcelado'
          ? { mode: 'parcelado', installmentDates: dates, paidInstallments: Number(form.paidInstallments) }
          : { mode: 'avista', paid: form.paid, dueDate: form.paid ? '' : form.dueDate }
    };
    if (form.source === 'catalog') {
      params.productId = form.productId;
      params.useStock = form.useStock;
    } else {
      params.product = { name: form.productName, image: form.image, group, member: form.member, category: form.category, batch: form.batch };
    }
    const res = await run('adminCreateSale', params, (r) => `Venda ${r.order.orderId} registrada!`);
    setSaving(false);
    if (res) {
      setDone(res);
      setForm({ ...EMPTY, shipping: form.shipping, date: form.date, batch: form.batch, group: form.group, otherGroup: form.otherGroup });
    }
  };

  const paidSoFar = form.mode === 'parcelado'
    ? parts.slice(0, Number(form.paidInstallments)).reduce((a, v) => a + v, 0)
    : form.paid ? total : 0;

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <form onSubmit={submit} className="lg:col-span-2 card p-5 space-y-5">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-600" /> Registrar venda
          </h3>
          <p className="text-xs text-slate-500">Para vendas feitas no WhatsApp, em grupo ou antes do site. A cliente vê tudo em "Meus Pedidos".</p>
        </div>

        <Section title="1. Compradora">
          <div>
            <label className="label">Nome * (digite para buscar quem já comprou)</label>
            <input required minLength={2} value={form.name} onChange={(e) => pickBuyer(e.target.value)} list="sale-buyers" className="input" placeholder="Ex: Lara" />
            <datalist id="sale-buyers">{buyers.map((b) => <option key={b.whatsapp} value={buyerLabel(b)} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">WhatsApp com DDD</label>
              <PhoneInput value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-8888" className="input" />
            </div>
            <div>
              <label className="label">@ (Insta / Twitter)</label>
              <input value={form.contact} onChange={set('contact')} placeholder="@user" className="input" />
            </div>
          </div>
          {!form.whatsapp && <p className="text-[11px] text-amber-700">Sem WhatsApp a cliente não consegue ver o pedido em "Meus Pedidos".</p>}
          {owner && form.name && !sameFirstName(owner.name, form.name) && (
            <p className="text-xs font-semibold text-rose-700 bg-rose-50 rounded-xl px-3 py-2">
              ⚠️ Esse WhatsApp já é de <strong>{owner.name}</strong>. Se a venda é de outra pessoa, use o WhatsApp dela — senão as duas
              vão ver os pedidos uma da outra.
            </p>
          )}
        </Section>

        <Section title="2. Produto">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-purple-50">
            {[['free', 'Digitar produto'], ['catalog', 'Do catálogo']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm({ ...form, source: v })}
                className={`py-2 rounded-lg text-sm font-bold ${form.source === v ? 'bg-white text-purple-800 shadow-sm' : 'text-purple-700'}`}>
                {l}
              </button>
            ))}
          </div>
          {form.source === 'catalog' ? (
            <>
              <select required value={form.productId} className="input"
                onChange={(e) => {
                  const p = data.products.find((x) => x.id === e.target.value);
                  setForm({ ...form, productId: e.target.value, unitPrice: p ? p.price : form.unitPrice });
                }}>
                <option value="">Escolha o produto…</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>#{p.id} — {p.name} ({groupOf(p)}) • {p.available} livre(s){p.active ? '' : ' • oculto'}</option>
                ))}
              </select>
              {product && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={form.useStock} onChange={set('useStock')} className="w-4 h-4 accent-purple-600" />
                  Descontar do estoque do catálogo ({product.available} livre(s))
                </label>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="label">Nome do produto *</label>
                <input required value={form.productName} onChange={set('productName')} placeholder="Ex: DVD Arirang Japão - Set completo" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Grupo</label>
                  <select value={known ? group : '__outro__'} className="input"
                    onChange={(e) => {
                      const other = e.target.value === '__outro__';
                      setForm({ ...form, otherGroup: other, group: other ? '' : e.target.value, member: other ? '' : wholeGroupLabel(e.target.value) });
                    }}>
                    {GROUP_NAMES.map((g) => <option key={g}>{g}</option>)}
                    <option value="__outro__">Outro grupo…</option>
                  </select>
                  {!known && <input required value={form.group} onChange={set('group')} placeholder="Nome do grupo" className="input mt-2" />}
                </div>
                <div>
                  <label className="label">Membro</label>
                  {known ? (
                    <select value={form.member} onChange={set('member')} className="input">
                      {[wholeGroupLabel(group), ...membersOf(group)].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  ) : (
                    <input value={form.member} onChange={set('member')} placeholder="Ex: Grupo todo" className="input" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Categoria</label>
                  <select value={form.category} onChange={set('category')} className="input">
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Lote / CEG</label>
                  <input value={form.batch} onChange={set('batch')} list="sale-batches" placeholder="Ex: Caixa 4" className="input" />
                  <datalist id="sale-batches">{[...new Set(data.products.map((p) => p.batch))].map((b) => <option key={b} value={b} />)}</datalist>
                </div>
              </div>
              <div>
                <label className="label">Link da foto</label>
                <div className="flex gap-2 items-center">
                  <input type="url" value={form.image} onChange={set('image')} placeholder="https://… (Drive ou Imgur)" className="input" />
                  <PhotoButton name={form.productName} onUploaded={(url) => setForm((f) => ({ ...f, image: url }))} />
                  {form.image && <ProductImage src={form.image} className="w-12 h-12 rounded-xl border border-purple-100 shrink-0" />}
                </div>
              </div>
            </>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Quantidade</label>
              <input type="number" min="1" required value={form.quantity} onChange={set('quantity')} className="input" />
            </div>
            <div>
              <label className="label">Valor unitário (R$) *</label>
              <input type="number" step="0.01" min="0.01" required value={form.unitPrice} onChange={set('unitPrice')} className="input" />
            </div>
            <div>
              <label className="label">Data da venda</label>
              <input type="date" value={form.date} onChange={set('date')} className="input" />
            </div>
          </div>
        </Section>

        <Section title="3. Pagamento">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-purple-50">
            {[['avista', 'Pix à vista'], ['parcelado', 'Pix parcelado']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setForm({ ...form, mode: v })}
                className={`py-2 rounded-lg text-sm font-bold ${form.mode === v ? 'bg-white text-purple-800 shadow-sm' : 'text-purple-700'}`}>
                {l}
              </button>
            ))}
          </div>
          {form.mode === 'avista' ? (
            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <label className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-sm font-bold text-emerald-900 cursor-pointer">
                <input type="checkbox" checked={form.paid} onChange={set('paid')} className="w-4 h-4 accent-emerald-600" />
                Já está pago
              </label>
              {!form.paid && (
                <div>
                  <label className="label">Prazo para pagar (opcional)</label>
                  <input type="date" value={form.dueDate} onChange={set('dueDate')} className="input" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <DateListInput value={form.installmentDates} onChange={(installmentDates) => setForm({ ...form, installmentDates, paidInstallments: Math.min(form.paidInstallments, installmentDates.length) })} />
              <div className="grid sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="label">Quantas parcelas já foram pagas?</label>
                  <select value={form.paidInstallments} onChange={set('paidInstallments')} className="input">
                    {Array.from({ length: form.installmentDates.length + 1 }, (_, i) => (
                      <option key={i} value={i}>{i === 0 ? 'Nenhuma' : i === form.installmentDates.length ? `Todas (${i})` : `${i} de ${form.installmentDates.length}`}</option>
                    ))}
                  </select>
                </div>
                {dates.length >= 2 && total > 0 && (
                  <ul className="text-xs space-y-0.5">
                    {dates.map((d, i) => (
                      <li key={d + i} className={i < Number(form.paidInstallments) ? 'text-emerald-700 font-semibold' : 'text-slate-600'}>
                        Parcela {i + 1}: {formatBRL(parts[i])} — {formatDay(d)} {i < Number(form.paidInstallments) ? '✓ paga' : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section title="4. Detalhes (opcional)">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status do pedido</label>
              <select value={form.status} onChange={set('status')} className="input">
                {data.config.orderStatuses.filter((s) => s !== 'Cancelado').map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Envio</label>
              <select value={form.shipping} onChange={set('shipping')} className="input">
                {(data.config.shippingOptions || []).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Observação para a cliente</label>
            <input value={form.note} onChange={set('note')} maxLength={300} placeholder="Ex: venda feita no grupo do WhatsApp" className="input" />
          </div>
        </Section>

        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-purple-50">
          <span className="text-sm text-purple-900">
            Total <strong>{formatBRL(total)}</strong> • pago <strong className="text-emerald-700">{formatBRL(paidSoFar)}</strong> • falta{' '}
            <strong className="text-amber-700">{formatBRL(total - paidSoFar)}</strong>
          </span>
          <button className="btn-primary px-6 py-3" disabled={saving}>{saving && <Spinner className="w-4 h-4" />} Registrar venda</button>
        </div>
      </form>

      <div className="space-y-3">
        {done ? (
          <div className="card p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-extrabold"><CheckCircle2 className="w-5 h-5" /> Venda registrada</div>
            <p className="text-sm text-slate-700">
              <strong className="font-mono">{done.order.orderId}</strong> • {done.order.quantity}x {done.order.productName}<br />
              {done.order.buyerName} • {formatBRL(done.order.itemTotal)} ({done.order.payment})
            </p>
            {done.order.whatsapp && (
              <a
                href={waLink(done.order.whatsapp, `Oii ${done.order.buyerName.split(' ')[0]}! 💜 Registramos sua compra na CEG: ${done.order.quantity}x ${done.order.productName} (${formatBRL(done.order.itemTotal)}).\nVocê acompanha pagamentos e prazos em "Meus Pedidos" no site. Para criar sua conta, use seu WhatsApp e o código ${done.order.orderId}.`)}
                target="_blank" rel="noreferrer"
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" /> Avisar a cliente
              </a>
            )}
          </div>
        ) : (
          <div className="card p-5 text-xs text-slate-500 space-y-2">
            <p><strong className="text-slate-700">Produto digitado</strong> vira um item oculto: não aparece no catálogo, só no pedido da cliente (com a foto).</p>
            <p><strong className="text-slate-700">Do catálogo</strong>: escolha um produto já anunciado; marque "descontar do estoque" se a unidade saiu da CEG atual.</p>
            <p><strong className="text-slate-700">Parcelas pagas</strong> entram como "Pago"; as outras ficam pendentes com o vencimento de cada data.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-black text-purple-800 uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}
