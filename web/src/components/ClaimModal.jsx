import { useState } from 'react';
import { CheckCircle2, Phone, ReceiptText } from 'lucide-react';
import { api } from '../api';
import { formatBRL, loadBuyer, saveBuyer, waLink } from '../utils';
import { CopyButton, Modal, PixBox, ProductImage, Spinner } from './common';

export default function ClaimModal({ product, config, onClose, onClaimed, onViewOrders, showToast }) {
  const remembered = loadBuyer();
  const [form, setForm] = useState({
    buyerName: remembered.buyerName || '',
    contact: remembered.contact || '',
    whatsapp: remembered.whatsapp || '',
    quantity: 1,
    shipping: remembered.shipping || config.shippingOptions?.[0] || 'Guardar na bag'
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const maxQty = Math.max(1, Math.min(product.available, config.maxPerClaim || 5));
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const res = await api('claim', { ...form, productId: product.id, quantity: Number(form.quantity) });
      saveBuyer({
        buyerName: form.buyerName,
        contact: form.contact,
        whatsapp: res.order.whatsapp,
        shipping: form.shipping,
        lastCode: res.order.orderId
      });
      setResult(res);
      onClaimed();
    } catch (err) {
      showToast(err.message, 'error');
      onClaimed(); // atualiza o estoque mostrado (pode ter esgotado)
    } finally {
      setSending(false);
    }
  };

  if (result) {
    const { order } = result;
    const message =
      `Oii! 💜 Acabei de fazer um claim na CEG!\n\n` +
      `*Pedido:* ${order.orderId}\n*Item:* ${order.quantity}x ${order.productName} (#${order.productId})\n` +
      `*Valor:* ${formatBRL(order.itemTotal)}\n*Nome:* ${order.buyerName} (${order.contact})\n*Envio:* ${order.shipping}\n\n` +
      `Segue meu comprovante do Pix:`;
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

          <div className="bg-slate-50 p-4 rounded-2xl text-left text-xs space-y-1.5 border border-slate-100">
            <Row label="Item" value={`${order.quantity}x ${order.productName}`} />
            <Row label="Envio" value={order.shipping} />
            <div className="flex justify-between text-sm pt-1.5 border-t border-slate-200">
              <span className="font-bold text-purple-900">Valor a pagar agora:</span>
              <span className="font-black text-purple-900">{formatBRL(order.itemTotal)}</span>
            </div>
          </div>

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
          </div>
        </div>

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
          <label className="label">Envio</label>
          <select value={form.shipping} onChange={set('shipping')} className="input">
            {(config.shippingOptions || ['Guardar na bag']).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Fretes (internacional e nacional) são cobrados depois, quando o lote chegar. Você acompanha tudo em "Meus Pedidos".
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
