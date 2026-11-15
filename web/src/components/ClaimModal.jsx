import { useState } from 'react';
import { CheckCircle2, Phone, ReceiptText, Undo2, UserRound } from 'lucide-react';
import { api } from '../api';
import { formatBRL, formatDay, formatDayShort, loadBuyer, saveBuyer, splitInstallments, waLink } from '../utils';
import { CopyButton, Modal, PixBox, ProductImage, ProductTags, Spinner } from './common';

export default function ClaimModal({
  product, config, session, initialResult = null, onClose, onClaimed, onViewOrders, onLoginRequired, onSessionExpired, showToast
}) {
  const remembered = loadBuyer();
  const [form, setForm] = useState({
    buyerName: remembered.buyerName || '',
    contact: remembered.contact || '',
    whatsapp: remembered.whatsapp || '',
    quantity: 1,
    shipping: remembered.shipping || config.shippingOptions?.[0] || 'Guardar na bag',
    paymentPlan: 'avista',
    buyerNote: ''
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(initialResult);

  const maxQty = Math.max(1, Math.min(product.available, config.maxPerClaim || 5));
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const params = { ...form, productId: product.id, quantity: Number(form.quantity) };
      if (session) params.token = session.token;
      const res = await api('claim', params);
      saveBuyer({
        buyerName: res.order.buyerName,
        contact: res.order.contact,
        whatsapp: res.order.whatsapp,
        shipping: form.shipping,
        lastCode: res.order.orderId
      });
      setResult(res);
      onClaimed();
    } catch (err) {
      if (err.sessionExpired) return onSessionExpired(product);
      if (err.loginRequired) return onLoginRequired(product);
      showToast(err.message, 'error');
      onClaimed(); // atualiza o estoque mostrado (pode ter esgotado)
    } finally {
      setSending(false);
    }
  };

  const installments = product.installmentDates || [];
  const canSplit = installments.length >= 2;
  const total = product.price * Number(form.quantity);
  const parts = splitInstallments(total, installments.length);

  if (result) {
    const { order } = result;
    const charges = result.charges || [result.charge];
    const first = charges[0];
    const schedule = charges
      .map((c) => `• ${c.description}: ${formatBRL(c.amount)}${c.dueDate ? ` até ${formatDay(c.dueDate)}` : ''}`)
      .join('\n');
    const message =
      `Oii! 💜 Acabei de fazer um claim na CEG!\n\n` +
      `*Pedido:* ${order.orderId}\n*Item:* ${order.quantity}x ${order.productName} (#${order.productId})\n` +
      `*Valor:* ${formatBRL(order.itemTotal)} (${order.payment || 'Pix à vista'})\n*Nome:* ${order.buyerName} (${order.contact})\n*Envio:* ${order.shipping}\n` +
      (order.buyerNote ? `*Observação:* ${order.buyerNote}\n` : '') +
      `\n` +
      (charges.length > 1 ? `*Parcelas:*\n${schedule}\n\n` : '') +
      `Segue meu comprovante do Pix de ${formatBRL(first.amount)}:`;
    return (
      <Modal onClose={onClose}>
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-slate-800">Item reservado para você! 💜</h3>
            <p className="text-xs text-slate-500 mt-1">Agora é só fazer o Pix e mandar o comprovante no WhatsApp.</p>
          </div>

          {session ? (
            <p className="text-xs text-slate-500">
              Pedido <strong className="font-mono text-purple-800">{order.orderId}</strong> • já está em "Meus Pedidos" na sua conta.
            </p>
          ) : (
            <div className="bg-purple-50 border-2 border-dashed border-purple-300 rounded-2xl p-4">
              <span className="block text-[11px] font-bold text-purple-700 uppercase tracking-wider">Código do seu pedido</span>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-2xl font-black text-purple-900 font-mono">{order.orderId}</span>
                <CopyButton text={order.orderId} label="Copiar" />
              </div>
              <p className="text-[11px] text-purple-700 mt-2">
                Guarde esse código! Com ele + seu WhatsApp você vê tudo o que comprou, pagou e ainda deve.
              </p>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl text-left text-xs space-y-1.5 border border-slate-100">
            <Row label="Item" value={`${order.quantity}x ${order.productName}`} />
            <Row label="Envio" value={order.shipping} />
            <Row label="Pagamento" value={order.payment || 'Pix à vista'} />
            {order.buyerNote && !session && <Row label="Observação" value={order.buyerNote} />}
            {charges.length > 1 ? (
              <div className="pt-1.5 border-t border-slate-200 space-y-1">
                {charges.map((c, i) => (
                  <div key={c.chargeId} className={`flex justify-between ${i === 0 ? 'text-sm font-black text-purple-900' : 'text-slate-600'}`}>
                    <span>Parcela {i + 1}{c.dueDate ? ` — até ${formatDay(c.dueDate)}` : ''}</span>
                    <span>{formatBRL(c.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200">
                <span className="font-bold text-purple-900">
                  Valor a pagar{first.dueDate ? ` até ${formatDay(first.dueDate)}` : ' agora'}:
                </span>
                <span className="font-black text-purple-900">{formatBRL(order.itemTotal)}</span>
              </div>
            )}
          </div>

          {session && (
            <AfterClaim
              order={order}
              session={session}
              onOrder={(o) => setResult({ ...result, order: { ...order, ...o } })}
              onUndone={() => {
                onClaimed();
                showToast('Claim desfeito. O item voltou para o catálogo.');
                onClose();
              }}
              onSessionExpired={() => onSessionExpired(product)}
              showToast={showToast}
            />
          )}

          <PixBox config={config} />

          {config.adminWhatsapp && (
            <a
              href={waLink(config.adminWhatsapp, message)}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" /> Enviar comprovante no WhatsApp
            </a>
          )}
          <button onClick={onViewOrders} className="w-full btn-soft py-3 text-sm">
            <ReceiptText className="w-4 h-4" /> Ver meus pedidos
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3 pb-3 pr-8 border-b border-purple-50">
          <ProductImage src={product.image} className="w-16 h-16 rounded-2xl border border-purple-200 shrink-0" />
          <div>
            <span className="text-[11px] font-black text-purple-700 uppercase">
              #{product.id} • {product.member}
            </span>
            <h3 className="font-extrabold text-slate-800 text-sm leading-snug">{product.name}</h3>
            <span className="text-base font-black text-purple-900">{formatBRL(product.price)} cada</span>
            <ProductTags product={product} className="mt-1" />
          </div>
        </div>

        {session ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-900 text-sm">
            <UserRound className="w-4 h-4 shrink-0" />
            <span>
              Comprando como <strong>{session.profile.name}</strong> ({session.profile.contact})
            </span>
          </div>
        ) : (
        <>
        <div>
          <label className="label">Seu nome *</label>
          <input required minLength={2} maxLength={80} value={form.buyerName} onChange={set('buyerName')} placeholder="Ex: Maria Clara Souza" className="input" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Seu @ (Insta / Twitter) *</label>
            <input required maxLength={60} value={form.contact} onChange={set('contact')} placeholder="@seu_user" className="input" />
          </div>
          <div>
            <label className="label">WhatsApp com DDD *</label>
            <input
              required
              type="tel"
              inputMode="numeric"
              value={form.whatsapp}
              onChange={set('whatsapp')}
              placeholder="11999998888"
              className="input"
            />
          </div>
        </div>
        </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Quantidade</label>
            <select value={form.quantity} onChange={set('quantity')} className="input font-bold">
              {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} unidade(s)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Total do item</label>
            <div className="px-3.5 py-2.5 rounded-xl bg-purple-50 text-purple-900 font-black text-sm">
              {formatBRL(product.price * Number(form.quantity))}
            </div>
          </div>
        </div>
        <div>
          <label className="label">Pagamento</label>
          {canSplit ? (
            <div className="space-y-2">
              <PlanOption
                checked={form.paymentPlan === 'avista'}
                onChange={() => setForm({ ...form, paymentPlan: 'avista' })}
                title={`Pix à vista — ${formatBRL(total)}`}
                detail={product.dueDate ? `Pagar até ${formatDay(product.dueDate)}` : 'Pagar após o claim'}
              />
              <PlanOption
                checked={form.paymentPlan === 'parcelado'}
                onChange={() => setForm({ ...form, paymentPlan: 'parcelado' })}
                title={`Pix parcelado — ${installments.length}x de ${formatBRL(parts[0])}`}
                detail={installments.map((d, i) => `${formatDayShort(d)} (${formatBRL(parts[i])})`).join(' • ')}
              />
            </div>
          ) : (
            <div className="px-3.5 py-2.5 rounded-xl bg-purple-50 text-sm">
              <span className="font-bold text-slate-800">Pix à vista — {formatBRL(total)}</span>
              <span className="block text-[11px] text-slate-500">
                {product.dueDate ? `Pagar até ${formatDay(product.dueDate)}` : 'Pagar após o claim'}
              </span>
            </div>
          )}
        </div>
        <div>
          <label className="label">Envio</label>
          <select value={form.shipping} onChange={set('shipping')} className="input">
            {(config.shippingOptions || ['Guardar na bag']).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Observações (opcional)</label>
          <textarea
            value={form.buyerNote}
            onChange={set('buyerNote')}
            maxLength={300}
            rows={2}
            placeholder="Algum pedido especial? Ex: pode guardar junto com meu outro pedido"
            className="input resize-none"
          />
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {product.shippingCost === 'Frete incluso'
            ? 'Frete já incluso no valor. '
            : product.shippingCost === 'Frete não incluso'
              ? 'Frete não incluso: é cobrado à parte, quando o lote chegar. '
              : 'Fretes (internacional e nacional) são cobrados depois, quando o lote chegar. '}
          Você acompanha tudo em "Meus Pedidos".
          Não pedimos dados de cartão: o pagamento é só por Pix.
        </p>
        <button
          type="submit"
          disabled={sending}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-700 to-fuchsia-600 hover:from-purple-800 hover:to-fuchsia-700 text-white font-extrabold text-sm shadow-lg shadow-purple-200 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {sending ? (<><Spinner className="w-4 h-4" /> Reservando...</>) : 'Confirmar claim e reservar 💜'}
        </button>
      </form>
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}:</span>
      <span className="font-bold text-slate-800 text-right">{value}</span>
    </div>
  );
}

function PlanOption({ checked, onChange, title, detail }) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
        checked ? 'border-purple-500 bg-purple-50' : 'border-purple-100 hover:border-purple-300'
      }`}
    >
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 accent-purple-600" />
      <span>
        <span className="block text-sm font-bold text-slate-800">{title}</span>
        <span className="block text-[11px] text-slate-500">{detail}</span>
      </span>
    </label>
  );
}

// Logo depois do claim (com conta): ajustar a observação ou desfazer um toque sem querer
function AfterClaim({ order, session, onOrder, onUndone, onSessionExpired, showToast }) {
  const [note, setNote] = useState(order.buyerNote || '');
  const [busy, setBusy] = useState('');

  const call = async (kind, action, params) => {
    setBusy(kind);
    try {
      return await api(action, { token: session.token, orderId: order.orderId, ...params });
    } catch (err) {
      if (err.sessionExpired) onSessionExpired();
      else showToast(err.message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="text-left space-y-2">
      <label className="label">Observações (opcional)</label>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Algum pedido especial?"
          className="input"
        />
        <button
          type="button"
          disabled={!!busy || note === (order.buyerNote || '')}
          onClick={async () => {
            const res = await call('note', 'updateMyOrder', { buyerNote: note });
            if (res) {
              onOrder(res.order);
              showToast('Observação salva!');
            }
          }}
          className="btn-soft shrink-0"
        >
          {busy === 'note' ? <Spinner className="w-3.5 h-3.5" /> : 'Salvar'}
        </button>
      </div>
      <button
        type="button"
        disabled={!!busy}
        onClick={async () => {
          if (!window.confirm('Desfazer este claim? O item volta para o catálogo e outra pessoa pode pegar.')) return;
          if (await call('undo', 'cancelMyOrder', {})) onUndone();
        }}
        className="w-full text-xs font-bold text-rose-600 hover:text-rose-700 inline-flex items-center justify-center gap-1 py-1"
      >
        {busy === 'undo' ? <Spinner className="w-3.5 h-3.5" /> : <Undo2 className="w-3.5 h-3.5" />} Toquei sem querer — desfazer claim (até 15 min)
      </button>
    </div>
  );
}
