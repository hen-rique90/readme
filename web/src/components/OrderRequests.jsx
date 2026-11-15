import { useState } from 'react';
import { api } from '../api';
import { addDaysKey, formatDate, formatDay, todayKey } from '../utils';
import { Badge, Spinner } from './common';

const STATUS_COLOR = {
  Pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  Aceita: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Resolvida: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Recusada: 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelada: 'bg-slate-100 text-slate-500 border-slate-200'
};

export const RequestStatus = ({ status }) => <Badge className={STATUS_COLOR[status] || STATUS_COLOR.Pendente}>{status}</Badge>;

// "Meus Pedidos": pedir correção ou mais prazo, e ver as respostas da loja
export default function OrderRequests({ order, token, onChanged, onSessionExpired }) {
  const [open, setOpen] = useState(''); // 'correction' | 'extension'
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requests = order.requests || [];
  const pendingCharges = order.charges.filter((c) => c.status === 'Pendente');
  const pendingOf = (type) => requests.some((r) => r.type === type && r.status === 'Pendente');
  const currentDue = pendingCharges.map((c) => c.dueDate).filter(Boolean).sort().pop();
  const minDate = addDaysKey(todayKey(), 1);

  const call = async (action, params) => {
    setBusy(true);
    setError('');
    try {
      await api(action, { token, orderId: order.orderId, ...params });
      setOpen('');
      setMessage('');
      setDate('');
      onChanged();
    } catch (err) {
      if (err.sessionExpired) onSessionExpired();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {requests.length > 0 && (
        <ul className="space-y-1.5">
          {requests.map((r) => (
            <li key={r.requestId} className="text-xs rounded-xl bg-slate-50 border border-slate-100 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{r.type === 'Prorrogação' ? '📅 Pedido de mais prazo' : '🛠️ Pedido de correção'}</strong>
                <RequestStatus status={r.status} />
                <span className="text-slate-400">{formatDate(r.createdAt)}</span>
              </div>
              {r.requestedDate && <p className="text-slate-600">Você pediu prazo até {formatDay(r.requestedDate)}.</p>}
              {r.message && <p className="text-slate-600">"{r.message}"</p>}
              {r.status === 'Aceita' && r.approvedDate && (
                <p className="font-bold text-emerald-700">✓ Novo prazo: {formatDay(r.approvedDate)}</p>
              )}
              {r.reply && <p className="font-semibold text-purple-900">💬 Loja: {r.reply}</p>}
              {r.status === 'Pendente' && (
                <button type="button" disabled={busy} onClick={() => call('cancelMyRequest', { requestId: r.requestId })} className="text-[11px] font-bold text-slate-500 underline mt-1">
                  Cancelar pedido
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!open && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {pendingCharges.length > 0 && !pendingOf('Prorrogação') && order.status !== 'Cancelado' && (
            <button type="button" onClick={() => setOpen('extension')} className="text-xs font-bold text-purple-700 hover:underline">
              📅 Pedir mais prazo para pagar
            </button>
          )}
          {!pendingOf('Correção') && (
            <button type="button" onClick={() => setOpen('correction')} className="text-xs font-bold text-purple-700 hover:underline">
              🛠️ Algo errado? Pedir correção
            </button>
          )}
        </div>
      )}

      {open === 'extension' && (
        <form
          className="p-3 rounded-xl bg-purple-50 border border-purple-200 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            call('requestExtension', { newDate: date, message });
          }}
        >
          <p className="text-xs text-purple-900">
            {currentDue ? <>Hoje o prazo é <strong>{formatDay(currentDue)}</strong>. </> : null}
            Até quando você consegue pagar? A loja confirma e te avisa.
          </p>
          <input required type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="input" aria-label="Nova data" />
          <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Motivo (opcional)" className="input" />
          {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="btn-primary flex-1">{busy && <Spinner className="w-4 h-4" />} Pedir prorrogação</button>
            <button type="button" onClick={() => setOpen('')} className="btn-soft">Voltar</button>
          </div>
        </form>
      )}

      {open === 'correction' && (
        <form
          className="p-3 rounded-xl bg-purple-50 border border-purple-200 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            call('requestCorrection', { message });
          }}
        >
          <p className="text-xs text-purple-900">Conte o que está errado neste pedido (valor, nome, item, foto…). A loja confere e te responde.</p>
          <textarea required minLength={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={3} placeholder="Ex: o valor certo é R$ 90, não R$ 95" className="input resize-none" />
          {error && <p className="text-xs text-rose-700 font-semibold">{error}</p>}
          <div className="flex gap-2">
            <button disabled={busy} className="btn-primary flex-1">{busy && <Spinner className="w-4 h-4" />} Enviar para a loja</button>
            <button type="button" onClick={() => setOpen('')} className="btn-soft">Voltar</button>
          </div>
        </form>
      )}
    </div>
  );
}
