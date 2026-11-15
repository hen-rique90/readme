import { useEffect, useState } from 'react';
import { MapPin, Package, Truck } from 'lucide-react';
import { api } from '../api';
import { formatBRL, formatDate } from '../utils';
import { Badge, ProductImage, Spinner } from './common';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const formatCep = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
export const addressLine = (a) =>
  `${a.street}, ${a.number}${a.complement ? ` (${a.complement})` : ''} — ${a.district}, ${a.city}/${a.state} — CEP ${formatCep(a.cep)}`;

// Formulário de endereço: o CEP preenche rua, bairro, cidade e UF (ViaCEP)
export function AddressForm({ initial, defaultRecipient, token, onSaved, onCancel, onSessionExpired }) {
  const [a, setA] = useState({
    label: 'Casa', recipient: defaultRecipient || '', cep: '', street: '', number: '', complement: '', district: '', city: '', state: '', ...initial
  });
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });

  const lookupCep = async (cep) => {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    setCepBusy(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await res.json();
      if (j.erro) setError('CEP não encontrado. Confira ou preencha o endereço à mão.');
      else {
        setError('');
        setA((cur) => ({ ...cur, street: j.logradouro || cur.street, district: j.bairro || cur.district, city: j.localidade || cur.city, state: j.uf || cur.state }));
      }
    } catch {
      /* sem internet ou ViaCEP fora do ar: a cliente preenche à mão */
    } finally {
      setCepBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('saveAddress', { token, address: a });
      onSaved(res);
    } catch (err) {
      if (err.sessionExpired) onSessionExpired?.();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 p-3 rounded-xl bg-white border border-purple-200">
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <div>
          <label className="label">CEP *</label>
          <input
            required
            inputMode="numeric"
            value={formatCep(a.cep)}
            onChange={(e) => {
              const v = e.target.value;
              setA({ ...a, cep: v });
              if (v.replace(/\D/g, '').length === 8) lookupCep(v);
            }}
            placeholder="00000-000"
            className="input"
          />
        </div>
        <div>
          <label className="label">Rua *{cepBusy && ' (buscando…)'}</label>
          <input required value={a.street} onChange={set('street')} className="input" />
        </div>
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <div>
          <label className="label">Número *</label>
          <input required value={a.number} onChange={set('number')} className="input" />
        </div>
        <div>
          <label className="label">Complemento</label>
          <input value={a.complement} onChange={set('complement')} placeholder="Apto, bloco…" className="input" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_4.5rem] gap-2">
        <div>
          <label className="label">Bairro *</label>
          <input required value={a.district} onChange={set('district')} className="input" />
        </div>
        <div>
          <label className="label">Cidade *</label>
          <input required value={a.city} onChange={set('city')} className="input" />
        </div>
        <div>
          <label className="label">UF *</label>
          <select required value={a.state} onChange={set('state')} className="input px-2">
            <option value="" />
            {UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Quem recebe</label>
          <input value={a.recipient} onChange={set('recipient')} className="input" />
        </div>
        <div>
          <label className="label">Apelido</label>
          <input value={a.label} onChange={set('label')} placeholder="Casa, Trabalho…" className="input" />
        </div>
      </div>
      {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-primary flex-1">{busy && <Spinner className="w-4 h-4" />} Salvar endereço</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn-soft">Cancelar</button>}
      </div>
    </form>
  );
}

// "Meus Pedidos": pedir envio dos itens (escolher itens, endereço e frete)
export function ShippingPanel({ orders, shipments, token, profile, onChanged, onSessionExpired, showToast }) {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addressId, setAddressId] = useState('');
  const inShipment = new Set(shipments.filter((s) => s.status !== 'Cancelado').flatMap((s) => s.orderIds));
  const eligible = orders.filter((o) => !['Cancelado', 'Enviado', 'Entregue'].includes(o.status) && !inShipment.has(o.orderId));
  const [selected, setSelected] = useState(() => eligible.filter((o) => o.status === 'Chegou (na bag)').map((o) => o.orderId));
  const [quote, setQuote] = useState(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || addresses) return;
    api('myAddresses', { token })
      .then((r) => {
        setAddresses(r.addresses);
        if (r.addresses[0]) setAddressId(r.addresses[0].addressId);
        else setAdding(true);
      })
      .catch((err) => (err.sessionExpired ? onSessionExpired() : setError(err.message)));
  }, [open, addresses, token, onSessionExpired]);

  const toggle = (id) => {
    setQuote(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const run = async (kind, action, params) => {
    setBusy(kind);
    setError('');
    try {
      return await api(action, { token, orderIds: selected, addressId, ...params });
    } catch (err) {
      if (err.sessionExpired) onSessionExpired();
      else setError(err.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const calculate = async () => {
    setChoice('');
    const res = await run('quote', 'quoteShipping', {});
    if (res) {
      setQuote(res);
      if (res.options[0]) setChoice(res.options[0].key);
    }
  };

  const request = async () => {
    const res = await run('request', 'requestShipping', choice ? { optionKey: choice } : {});
    if (res) {
      showToast(choice ? 'Envio pedido! O frete já está em "Falta pagar".' : 'Envio pedido! A loja vai calcular o frete e te avisar.');
      setOpen(false);
      setQuote(null);
      setSelected([]);
      onChanged();
    }
  };

  return (
    <div className="space-y-3">
      {shipments.length > 0 && (
        <div className="card p-4 space-y-2">
          <h3 className="font-extrabold text-slate-800 flex items-center gap-2"><Truck className="w-4 h-4" /> Meus envios</h3>
          {shipments.map((s) => (
            <div key={s.shipmentId} className="text-xs rounded-xl bg-slate-50 border border-slate-100 p-2.5 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-mono">{s.shipmentId}</strong>
                <Badge className={s.status === 'Enviado' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}>
                  {s.status === 'Aguardando pagamento' && s.paid ? 'Pago — preparando envio' : s.status}
                </Badge>
                <span className="text-slate-400">{formatDate(s.createdAt)}</span>
              </div>
              <p>{s.orderIds.length} item(ns) • {s.service || 'frete a calcular'}{s.price ? ` • ${formatBRL(s.price)}` : ''}{s.days ? ` • ~${s.days} dias úteis` : ''}</p>
              <p className="text-slate-500">{s.address}</p>
              {s.tracking && <p className="font-bold text-emerald-700">📦 Rastreio: {s.tracking}</p>}
            </div>
          ))}
        </div>
      )}

      {eligible.length > 0 && !open && (
        <button type="button" onClick={() => setOpen(true)} className="btn-primary w-full py-3">
          <Package className="w-4 h-4" /> Pedir envio dos meus itens
        </button>
      )}

      {open && (
        <div className="card p-4 space-y-4 border-purple-300">
          <h3 className="font-extrabold text-slate-800 flex items-center gap-2"><Package className="w-4 h-4" /> Pedir envio</h3>

          <div className="space-y-1.5">
            <p className="label">1. Quais itens enviar?</p>
            {eligible.map((o) => (
              <label key={o.orderId} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.includes(o.orderId)} onChange={() => toggle(o.orderId)} className="w-4 h-4 accent-purple-600" />
                <ProductImage src={o.image} className="w-8 h-8 rounded-lg shrink-0" emojiSize="text-xs" />
                <span>
                  {o.quantity}x {o.productName}
                  <span className={`block text-[11px] ${o.status === 'Chegou (na bag)' ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                    {o.status === 'Chegou (na bag)' ? '✓ já chegou' : `${o.status} — ainda não chegou`}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="label">2. Para onde?</p>
            {!addresses && <Spinner className="w-5 h-5 text-purple-600" />}
            {addresses?.map((a) => (
              <label key={a.addressId} className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer text-sm ${addressId === a.addressId ? 'border-purple-500 bg-purple-50' : 'border-purple-100'}`}>
                <input type="radio" checked={addressId === a.addressId} onChange={() => { setAddressId(a.addressId); setQuote(null); }} className="mt-1 accent-purple-600" />
                <span>
                  <strong><MapPin className="w-3.5 h-3.5 inline" /> {a.label}</strong> — {a.recipient}
                  <span className="block text-xs text-slate-500">{addressLine(a)}</span>
                </span>
              </label>
            ))}
            {adding ? (
              <AddressForm
                token={token}
                defaultRecipient={profile?.name}
                onSaved={(res) => {
                  setAddresses(res.addresses);
                  setAddressId(res.address.addressId);
                  setAdding(false);
                  setQuote(null);
                }}
                onCancel={addresses?.length ? () => setAdding(false) : null}
                onSessionExpired={onSessionExpired}
              />
            ) : (
              addresses && addresses.length < 5 && (
                <button type="button" onClick={() => setAdding(true)} className="text-xs font-bold text-purple-700 hover:underline">+ Novo endereço</button>
              )
            )}
          </div>

          <div className="space-y-2">
            <p className="label">3. Frete</p>
            {!quote ? (
              <button type="button" disabled={!selected.length || !addressId || busy === 'quote'} onClick={calculate} className="btn-soft w-full py-2.5">
                {busy === 'quote' && <Spinner className="w-4 h-4" />} Calcular frete
              </button>
            ) : (
              <>
                <p className="text-[11px] text-slate-500">
                  Pacote: {quote.package.kind === 'Envelope' ? '✉️ envelope' : '📦 caixa'} • {quote.package.weight} kg •{' '}
                  {quote.package.height}x{quote.package.width}x{quote.package.length} cm
                </p>
                {quote.options.map((op) => (
                  <label key={op.key} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer ${choice === op.key ? 'border-purple-500 bg-purple-50' : 'border-purple-100'}`}>
                    <input type="radio" checked={choice === op.key} onChange={() => setChoice(op.key)} className="accent-purple-600" />
                    {op.logo ? <img src={op.logo} alt="" className="w-10 h-6 object-contain shrink-0" referrerPolicy="no-referrer" /> : <Truck className="w-5 h-5 text-slate-400" />}
                    <span className="flex-1 text-sm">
                      <strong>{op.company} {op.service}</strong>
                      <span className="block text-[11px] text-slate-500">
                        {op.days ? `~${op.days} dias úteis` : ''} • via {op.provider}
                      </span>
                    </span>
                    <strong className="text-purple-900">{formatBRL(op.price)}</strong>
                  </label>
                ))}
                {quote.unavailable && <p className="text-xs text-amber-700 font-semibold">{quote.message}</p>}
              </>
            )}
          </div>

          {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!quote || (!choice && !quote.unavailable) || busy === 'request'}
              onClick={request}
              className="btn-primary flex-1 py-3"
            >
              {busy === 'request' && <Spinner className="w-4 h-4" />}
              {quote?.unavailable ? 'Pedir envio (a loja calcula o frete)' : 'Pedir envio'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-soft">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
