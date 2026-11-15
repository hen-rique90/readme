import { useMemo, useState } from 'react';
import { Inbox, Phone } from 'lucide-react';
import { formatBRL, formatDate, formatDay, formatPhone } from '../utils';
import { Spinner } from './common';
import { RequestStatus } from './OrderRequests';

// ADM: pedidos de correção e de prorrogação das clientes
export default function RequestsTab({ data, run, onShowOrders }) {
  const [showAnswered, setShowAnswered] = useState(false);
  const [notify, setNotify] = useState({}); // requestId -> link de aviso no WhatsApp
  const orders = useMemo(() => Object.fromEntries(data.orders.map((o) => [o.orderId, o])), [data.orders]);
  const charges = useMemo(() => Object.fromEntries(data.charges.map((c) => [c.chargeId, c])), [data.charges]);
  const all = data.requests || [];
  const pending = all.filter((r) => r.status === 'Pendente');
  const list = showAnswered ? all : all.filter((r) => r.status === 'Pendente' || notify[r.requestId]);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-purple-600" /> Solicitações das clientes
          </h3>
          <p className="text-xs text-slate-500">
            Pedidos de correção e de mais prazo feitos em "Meus Pedidos". Depois de responder, use "Avisar no WhatsApp" — a cliente também vê a
            resposta no site.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={showAnswered} onChange={(e) => setShowAnswered(e.target.checked)} className="w-4 h-4 accent-purple-600" />
          Mostrar as já respondidas
        </label>
      </div>
      {!pending.length && !Object.keys(notify).length && !showAnswered && (
        <div className="card p-10 text-center text-sm text-slate-500">Nenhuma solicitação esperando resposta. 🎉</div>
      )}
      {list.map((r) => (
        <RequestCard
          key={r.requestId}
          request={r}
          order={orders[r.orderId]}
          charges={r.chargeIds.map((id) => charges[id]).filter(Boolean)}
          run={run}
          notifyLink={notify[r.requestId]}
          onAnswered={(link) => setNotify((n) => ({ ...n, [r.requestId]: link }))}
          onShowOrders={onShowOrders}
        />
      ))}
    </div>
  );
}

function RequestCard({ request: r, order, charges, run, notifyLink, onAnswered, onShowOrders }) {
  const [reply, setReply] = useState('');
  const [date, setDate] = useState(r.requestedDate || '');
  const [busy, setBusy] = useState('');
  const isExtension = r.type === 'Prorrogação';

  const answer = async (decision) => {
    if (decision === 'reject' && !window.confirm('Recusar esta solicitação?')) return;
    setBusy(decision);
    const res = await run(
      'adminAnswerRequest',
      { requestId: r.requestId, decision, reply, date },
      decision === 'accept' ? `Prazo alterado para ${formatDay(date)}` : decision === 'resolve' ? 'Correção marcada como resolvida' : 'Solicitação recusada'
    );
    setBusy('');
    if (res) onAnswered(res.notifyLink);
  };

  return (
    <div className={`card p-4 space-y-3 ${r.status === 'Pendente' ? (isExtension ? 'border-sky-200' : 'border-amber-200') : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-slate-800">{isExtension ? '📅 Prorrogação de pagamento' : '🛠️ Correção'}</strong>
            <RequestStatus status={r.status} />
            <span className="text-[11px] text-slate-400">{formatDate(r.createdAt)}</span>
          </div>
          <p className="text-sm text-slate-700">
            <strong>{r.name}</strong> • {formatPhone(r.whatsapp)} • pedido{' '}
            <button type="button" onClick={() => onShowOrders(r.orderId)} className="font-mono text-purple-700 underline">
              {r.orderId}
            </button>
            {order && <> — {order.quantity}x {order.productName}</>}
          </p>
        </div>
      </div>

      {r.message && <p className="text-sm bg-slate-50 rounded-xl p-3">"{r.message}"</p>}

      {isExtension && (
        <div className="text-sm space-y-1">
          {charges.map((c) => (
            <p key={c.chargeId} className="text-slate-600">
              • {c.description} — {formatBRL(c.amount)} — prazo atual {c.dueDate ? formatDay(c.dueDate) : 'sem prazo'} ({c.status})
            </p>
          ))}
          <p className="font-bold text-sky-800">Pede para pagar até {formatDay(r.requestedDate)}</p>
        </div>
      )}

      {r.status === 'Pendente' ? (
        <div className="space-y-2">
          {isExtension && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              Novo prazo
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input py-1.5 w-auto" />
              <span className="text-slate-400">(pode mudar a data pedida)</span>
            </label>
          )}
          <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={500} placeholder="Resposta para a cliente (opcional)" className="input" />
          <div className="flex flex-wrap gap-2">
            {isExtension ? (
              <button type="button" disabled={!!busy || !date} onClick={() => answer('accept')} className="btn-primary">
                {busy === 'accept' && <Spinner className="w-4 h-4" />} Aceitar prorrogação
              </button>
            ) : (
              <button type="button" disabled={!!busy} onClick={() => answer('resolve')} className="btn-primary">
                {busy === 'resolve' && <Spinner className="w-4 h-4" />} Marcar como resolvida
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => answer('reject')} className="btn-soft">
              Recusar
            </button>
            {!isExtension && (
              <button type="button" onClick={() => onShowOrders(r.orderId)} className="btn-soft">
                Abrir o pedido para corrigir
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-600">
          {r.status === 'Aceita' && r.approvedDate && <p className="font-bold text-emerald-700">Novo prazo: {formatDay(r.approvedDate)}</p>}
          {r.reply && <p>💬 {r.reply}</p>}
        </div>
      )}

      {notifyLink && (
        <a href={notifyLink} target="_blank" rel="noreferrer"
          className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2">
          <Phone className="w-4 h-4" /> Avisar a cliente no WhatsApp
        </a>
      )}
    </div>
  );
}
