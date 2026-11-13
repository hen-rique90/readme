import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, LogOut, Package, Phone, ReceiptText } from 'lucide-react';
import { api, IS_DEMO } from '../api';
import { chargeStatusColor, formatBRL, formatDate, formatPhone, loadBuyer, orderStatusColor, saveBuyer, waLink } from '../utils';
import { Badge, PixBox, ProductImage, Spinner } from './common';

export default function MyOrders({ config }) {
  const remembered = loadBuyer();
  const [whatsapp, setWhatsapp] = useState(remembered.whatsapp || '');
  const [code, setCode] = useState(remembered.lastCode || '');
  const [data, setData] = useState(null);
  const autoLogin = !!(remembered.whatsapp && remembered.lastCode);
  const [loading, setLoading] = useState(autoLogin);
  const [error, setError] = useState('');

  const lookup = async (w = whatsapp, c = code) => {
    setLoading(true);
    setError('');
    try {
      const res = await api('myOrders', { whatsapp: w, code: c });
      setData(res);
      saveBuyer({ whatsapp: res.buyer.whatsapp, lastCode: c.toUpperCase().startsWith('PED-') ? c.toUpperCase() : `PED-${c.toUpperCase()}` });
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // Entra automaticamente se este aparelho já fez um claim
  useEffect(() => {
    if (autoLogin) lookup(remembered.whatsapp, remembered.lastCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillDemo = () => {
    try {
      const ex = JSON.parse(localStorage.getItem('ceg_demo_exemplo') || 'null');
      if (ex) {
        setWhatsapp(ex.whatsapp);
        setCode(ex.code);
        lookup(ex.whatsapp, ex.code);
      }
    } catch { /* ignore */ }
  };

  const logout = () => {
    saveBuyer({ whatsapp: '', lastCode: '' });
    setData(null);
    setCode('');
    setWhatsapp('');
  };

  if (!data && loading && autoLogin && !error) {
    return (
      <main className="max-w-xl mx-auto px-4 pt-16 flex justify-center text-purple-600">
        <Spinner className="w-8 h-8" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 pt-8">
        <div className="card p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-3">
              <ReceiptText className="w-6 h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">Meus Pedidos</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Veja o que você comprou, o que já pagou e o que ainda falta pagar.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookup();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">WhatsApp usado no claim</label>
              <input required type="tel" inputMode="numeric" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="11988887777" className="input" />
            </div>
            <div>
              <label className="label">Código de qualquer pedido seu</label>
              <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="PED-XXXXXX" className="input font-mono uppercase" />
              <p className="text-[11px] text-slate-400 mt-1">
                O código aparece depois do claim e na mensagem do WhatsApp. Perdeu? Fale com a ADM da CEG.
              </p>
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? <Spinner className="w-4 h-4" /> : null} Ver meus pedidos
            </button>
            {IS_DEMO && (
              <button type="button" onClick={fillDemo} className="btn-soft w-full">
                Modo demonstração: entrar como uma compradora de exemplo
              </button>
            )}
          </form>
        </div>
      </main>
    );
  }

  const { buyer, orders, totals } = data;
  const pendingCharges = orders.flatMap((o) => o.charges.filter((c) => c.status === 'Pendente').map((c) => ({ ...c, order: o })));
  const pixMessage =
    `Oii! 💜 Sou ${buyer.name} (${buyer.contact}).\nSegue o comprovante do Pix de ${formatBRL(totals.owed)} referente a:\n` +
    pendingCharges.map((c) => `• ${c.order.orderId} — ${c.description} (${formatBRL(c.amount)})`).join('\n');

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">Oi, {buyer.name.split(' ')[0]}! 💜</h2>
          <p className="text-xs text-slate-500">
            {buyer.contact} • {formatPhone(buyer.whatsapp)}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => lookup()} className="btn-soft" disabled={loading}>
            {loading ? <Spinner className="w-3.5 h-3.5" /> : null} Atualizar
          </button>
          <button onClick={logout} className="btn-soft">
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={Clock} label="Falta pagar" value={formatBRL(totals.owed)} tone={totals.owed > 0 ? 'amber' : 'slate'} />
        <SummaryCard icon={CheckCircle2} label="Já pago" value={formatBRL(totals.paid)} tone="emerald" />
        <SummaryCard icon={Package} label="Itens comprados" value={`${totals.items} unidade(s)`} tone="purple" />
      </div>

      {totals.owed > 0 && (
        <div className="card p-5 space-y-3 border-amber-200">
          <h3 className="font-extrabold text-slate-800">Pagamentos pendentes</h3>
          <ul className="text-sm divide-y divide-amber-100">
            {pendingCharges.map((c) => (
              <li key={c.chargeId} className="py-2 flex justify-between gap-3">
                <span className="text-slate-600">
                  <span className="font-mono text-xs text-purple-700 font-bold">{c.order.orderId}</span> · {c.description}
                  <span className="block text-xs text-slate-400">{c.order.quantity}x {c.order.productName}</span>
                </span>
                <span className="font-black text-amber-700 whitespace-nowrap">{formatBRL(c.amount)}</span>
              </li>
            ))}
          </ul>
          <PixBox config={config || data.config} />
          {(config || data.config)?.adminWhatsapp && (
            <a
              href={waLink((config || data.config).adminWhatsapp, pixMessage)}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" /> Enviar comprovante de {formatBRL(totals.owed)}
            </a>
          )}
          <p className="text-[11px] text-slate-400">O status muda para "Pago" assim que a ADM confirmar o comprovante.</p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-extrabold text-slate-800">Meus itens ({orders.length} pedido(s))</h3>
        {orders.map((o) => (
          <div key={o.orderId} className={`card p-4 sm:p-5 ${o.status === 'Cancelado' ? 'opacity-60' : ''}`}>
            <div className="flex gap-3">
              <ProductImage src={o.image} className="w-16 h-16 rounded-2xl border border-purple-100 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-mono">{o.orderId}</span>
                  <Badge className={orderStatusColor(o.status)}>{o.status}</Badge>
                  <span className="text-[11px] text-slate-400">{formatDate(o.createdAt)}</span>
                </div>
                <h4 className="font-bold text-slate-800 mt-1">
                  {o.quantity}x {o.productName}
                </h4>
                <p className="text-xs text-slate-500">
                  {o.batch} • {o.shipping}
                  {o.note ? ` • Obs: ${o.note}` : ''}
                </p>
              </div>
            </div>
            {o.charges.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-purple-50 space-y-1.5">
                {o.charges.map((c) => (
                  <li key={c.chargeId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">{c.description}</span>
                    <span className="flex items-center gap-2">
                      <span className={`font-bold ${c.status === 'Cancelada' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {formatBRL(c.amount)}
                      </span>
                      <Badge className={chargeStatusColor(c.status)}>{c.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    amber: 'text-amber-700 bg-amber-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    purple: 'text-purple-800 bg-purple-50',
    slate: 'text-slate-600 bg-slate-50'
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <span className="text-[11px] font-bold text-slate-400 uppercase">{label}</span>
        <p className={`text-lg font-black ${tones[tone].split(' ')[0]}`}>{value}</p>
      </div>
    </div>
  );
}
