import { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, CreditCard, Phone, RefreshCw } from 'lucide-react';
import { formatBRL, formatDay, formatDayShort, formatPhone } from '../utils';
import { Badge, Spinner } from './common';

const TITLES = {
  overdue: ['⚠️ Vencidas', 'bg-rose-50 border-rose-200'],
  today: ['📅 Vencem hoje', 'bg-amber-50 border-amber-200'],
  soon: ['⏰ Vencem em breve', 'bg-sky-50 border-sky-200']
};

// Cobranças do dia: quem cobrar hoje, com a mensagem de WhatsApp pronta
export default function RemindersTab({ call, run, showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hideDone, setHideDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await call('adminReminders'));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [call, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const send = async (g) => {
    // abre o WhatsApp na hora (antes de qualquer espera, para o navegador não bloquear)
    window.open(g.link, '_blank', 'noopener');
    setData((d) => ({ ...d, groups: d.groups.map((x) => (x === g ? { ...x, remindedToday: true } : x)) }));
    await run('adminMarkReminded', { chargeIds: g.items.map((i) => i.chargeId) });
  };

  if (!data) {
    return (
      <div className="card p-10 flex justify-center text-purple-600">
        <Spinner className="w-7 h-7" />
      </div>
    );
  }

  const groups = data.groups.filter((g) => !hideDone || !g.remindedToday);
  const pendingToday = data.groups.filter((g) => !g.remindedToday).length;

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <BellRing className="w-5 h-5 text-purple-600" /> Cobranças do dia — {formatDay(data.today)}
          </h3>
          <p className="text-xs text-slate-500">
            Vencidas, vencendo hoje e nos próximos {data.daysBefore} dia(s). Toque em "Enviar cobrança": o WhatsApp abre com a mensagem pronta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="w-4 h-4 accent-purple-600" />
            Esconder quem já foi cobrada hoje
          </label>
          <button onClick={load} className="btn-soft" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {data.groups.length === 0 ? (
        <div className="card p-10 text-center text-slate-500 text-sm">Nenhuma cobrança vencida ou vencendo nos próximos dias. 🎉</div>
      ) : (
        <>
          <p className="text-sm font-bold text-slate-700">
            {pendingToday === 0 ? '✓ Todas as clientes já foram cobradas hoje.' : `Faltam ${pendingToday} cliente(s) para cobrar hoje.`}
          </p>
          {['overdue', 'today', 'soon'].map((kind) => {
            const list = groups.filter((g) => g.kind === kind);
            if (!list.length) return null;
            return (
              <div key={kind} className="space-y-2">
                <h4 className="font-extrabold text-slate-800">
                  {TITLES[kind][0]} ({list.length})
                </h4>
                <div className="grid md:grid-cols-2 gap-3">
                  {list.map((g) => (
                    <div key={g.whatsapp || g.name} className={`rounded-2xl border p-4 space-y-2 ${TITLES[kind][1]} ${g.remindedToday ? 'opacity-70' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-800">{g.name}</span>{' '}
                          <span className="text-xs text-purple-700 font-semibold">{g.contact}</span>
                          <span className="block text-xs text-slate-500">{g.whatsapp ? formatPhone(g.whatsapp) : 'sem WhatsApp'}</span>
                        </div>
                        <span className="text-lg font-black text-slate-900">{formatBRL(g.total)}</span>
                      </div>
                      <ul className="text-xs text-slate-700 space-y-0.5">
                        {g.items.map((i) => (
                          <li key={i.chargeId}>
                            • {i.quantity}x {i.productName} — {i.description} ({formatBRL(i.amount)}){' '}
                            <strong>
                              {i.kind === 'overdue' ? `venceu ${formatDayShort(i.dueDate)}` : i.kind === 'today' ? 'vence hoje' : `até ${formatDayShort(i.dueDate)}`}
                            </strong>
                            {i.paymentMethod === 'Cartão de crédito' && ' 💳'}
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {g.remindedToday ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> cobrada hoje
                          </Badge>
                        ) : (
                          <span />
                        )}
                        {g.link ? (
                          <button
                            onClick={() => send(g)}
                            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold"
                          >
                            <Phone className="w-3.5 h-3.5" /> {g.remindedToday ? 'Enviar de novo' : 'Enviar cobrança'}
                          </button>
                        ) : (
                          <span className="text-xs text-amber-700">Sem WhatsApp — corrija no pedido</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {data.cards.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-extrabold text-slate-800 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Escolheram cartão — enviar link de pagamento ({data.cards.length})
          </h4>
          <div className="card divide-y divide-purple-50">
            {data.cards.map((c) => (
              <div key={c.orderId} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{c.name}</strong> — <span className="font-mono text-xs">{c.orderId}</span> • {c.quantity}x {c.productName} •{' '}
                  <strong>{formatBRL(c.total)}</strong>
                </span>
                {c.link && (
                  <a href={c.link} target="_blank" rel="noreferrer" className="btn-soft">
                    <Phone className="w-3.5 h-3.5" /> Mandar link
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            A mensagem abre com o pedido e o valor; cole o link da maquininha no fim. Quando ela pagar, marque a cobrança como "Pago" no pedido.
          </p>
        </div>
      )}
    </div>
  );
}
