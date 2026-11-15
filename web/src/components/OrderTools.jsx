import { useState } from 'react';
import { X } from 'lucide-react';
import { detectMembers, formatBRL, nameWithoutMembers, splitInstallments } from '../utils';
import { Modal, ProductImage, Spinner } from './common';
import { PhotoButton } from './PhotoUpload';

const partName = (rest, member) => (rest ? `${rest} — ${member}` : member);

// Separa um pedido em vários (um por membro), dividindo valor e cobranças
export function SplitOrderModal({ order, group, run, onClose }) {
  const detected = detectMembers(order.productName, group);
  const rest = nameWithoutMembers(order.productName, group);
  const initial = detected.length >= 2 ? detected : ['', ''];
  const amounts = splitInstallments(order.itemTotal, initial.length);
  const [parts, setParts] = useState(
    initial.map((m, i) => ({ member: m, productName: m ? partName(rest, m) : '', amount: amounts[i], image: '' }))
  );
  const [busy, setBusy] = useState(false);
  const sum = Math.round(parts.reduce((a, p) => a + (Number(p.amount) || 0), 0) * 100) / 100;
  const diff = Math.round((order.itemTotal - sum) * 100) / 100;
  const setPart = (i, patch) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const redistribute = (list) => {
    const values = splitInstallments(order.itemTotal, list.length);
    return list.map((p, i) => ({ ...p, amount: values[i] }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (diff !== 0) return;
    setBusy(true);
    const res = await run(
      'adminSplitOrder',
      { orderId: order.orderId, parts: parts.map((p) => ({ ...p, amount: Number(p.amount) })) },
      (r) => `Pedido separado em ${r.orders.length} itens`
    );
    setBusy(false);
    if (res) onClose();
  };

  return (
    <Modal onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="pr-8">
          <h3 className="text-lg font-extrabold text-slate-800">✂️ Separar por membro</h3>
          <p className="text-xs text-slate-500">
            <strong>{order.quantity}x {order.productName}</strong> — {formatBRL(order.itemTotal)} ({order.buyerName}). Cada parte vira um item
            próprio; os pagamentos e prazos são divididos na mesma proporção (o que estava pago continua pago).
          </p>
          {detected.length < 2 && (
            <p className="text-xs text-amber-700 mt-1">Não encontrei vários membros no nome — preencha as partes à mão.</p>
          )}
        </div>
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_2rem] sm:grid-cols-[7rem_1fr_6.5rem_2rem] gap-2 items-center bg-purple-50 rounded-xl p-2">
              <input
                value={p.member}
                onChange={(e) => setPart(i, { member: e.target.value, productName: p.productName || partName(rest, e.target.value) })}
                placeholder="Membro"
                className="input py-1.5 hidden sm:block"
                aria-label={`Membro da parte ${i + 1}`}
              />
              <input required value={p.productName} onChange={(e) => setPart(i, { productName: e.target.value })} placeholder="Nome do item" className="input py-1.5" aria-label={`Nome da parte ${i + 1}`} />
              <input required type="number" step="0.01" min="0.01" value={p.amount} onChange={(e) => setPart(i, { amount: e.target.value })} className="input py-1.5" aria-label={`Valor da parte ${i + 1}`} />
              <button
                type="button"
                disabled={parts.length <= 2}
                onClick={() => setParts(redistribute(parts.filter((_, j) => j !== i)))}
                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 disabled:opacity-30"
                aria-label={`Remover parte ${i + 1}`}
              >
                <X className="w-4 h-4" />
              </button>
              <div className="col-span-full flex items-center gap-2">
                <input type="url" value={p.image} onChange={(e) => setPart(i, { image: e.target.value })} placeholder="Foto desta parte (opcional)" className="input py-1.5 text-xs" />
                <PhotoButton name={p.productName} onUploaded={(url) => setPart(i, { image: url })} />
                {p.image && <ProductImage src={p.image} className="w-9 h-9 rounded-lg shrink-0" />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-soft" onClick={() => setParts(redistribute([...parts, { member: '', productName: '', amount: 0, image: '' }]))}>
            + Adicionar parte
          </button>
          <button type="button" className="text-xs font-bold text-purple-700 underline" onClick={() => setParts(redistribute(parts))}>
            Dividir igual
          </button>
        </div>
        <p className={`text-sm font-bold ${diff === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          Soma: {formatBRL(sum)} de {formatBRL(order.itemTotal)}
          {diff !== 0 && ` — ${diff > 0 ? 'faltam' : 'sobram'} ${formatBRL(Math.abs(diff))}`}
        </p>
        <button className="btn-primary w-full py-3" disabled={busy || diff !== 0}>
          {busy && <Spinner className="w-4 h-4" />} Separar em {parts.length} itens
        </button>
      </form>
    </Modal>
  );
}
