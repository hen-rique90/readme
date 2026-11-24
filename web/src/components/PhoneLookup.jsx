import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Phone } from 'lucide-react';
import { api } from '../api';
import { formatBRL, formatDay, formatPhone, waLink } from '../utils';
import { PhoneInput, PixBox, ProductImage, Spinner } from './common';

const LAST_PHONE = 'ceg_consulta_telefone';
const readLast = () => {
  try { return localStorage.getItem(LAST_PHONE) || ''; } catch { return ''; }
};
const saveLast = (v) => {
  try { localStorage.setItem(LAST_PHONE, v); } catch { /* ignore */ }
};

const money = (v) => (v === '' || v === null || v === undefined ? '' : formatBRL(v));

function Status({ value, due }) {
  if (!value) return null;
  const style = {
    Pago: ['🟢', 'text-[#28A745]'],
    Pendente: ['🔴', 'text-[#D32F2F]'],
    Parcial: ['🟡', 'text-[#C88A00]']
  }[value] || ['', 'text-slate-600'];
  return (
    <span className={`font-bold whitespace-nowrap ${style[1]}`}>
      {style[0]} {value}
      {value !== 'Pago' && due && <span className="block text-[11px] font-semibold text-slate-500">até {formatDay(due)}</span>}
    </span>
  );
}

// Central de Compras: a compradora digita o telefone e vê tudo o que comprou
export default function PhoneLookup() {
  const [phone, setPhone] = useState(readLast);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [closed, setClosed] = useState({});

  const consultar = async (e) => {
    e?.preventDefault();
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Digite seu telefone com DDD.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api('consultaTelefone', { whatsapp: phone });
      setData(res);
      setClosed({});
      saveLast(phone);
    } catch (err) {
      setData(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (readLast()) consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CEG → SET → itens
  const cegs = useMemo(() => {
    const out = [];
    (data?.items || []).forEach((it) => {
      let ceg = out.find((c) => c.name === it.ceg);
      if (!ceg) out.push((ceg = { name: it.ceg, sets: [] }));
      let set = ceg.sets.find((s) => s.name === it.set);
      if (!set) ceg.sets.push((set = { name: it.set, items: [] }));
      set.items.push(it);
    });
    return out;
  }, [data]);

  const items = data?.items || [];
  const totalSets = new Set(items.map((i) => `${i.ceg}|${i.set}`)).size;
  const owed = data?.totals?.owed || 0;
  const cfg = data?.config || {};

  return (
    <main className="max-w-[1250px] mx-auto px-3 sm:px-6 pt-6 space-y-6">
      <form onSubmit={consultar} className="bg-white rounded-[18px] shadow-[0_8px_25px_rgba(0,0,0,.08)] p-6 sm:p-9">
        <h1 className="text-center text-3xl sm:text-[38px] font-bold text-[#5B5BD6] mb-6 sm:mb-7 leading-tight">
          Cantinho da Army
        </h1>
        <PhoneInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Digite seu telefone"
          aria-label="Telefone"
          className="w-full px-4 py-4 text-[17px] rounded-xl border border-[#DADDE8] outline-none focus:border-[#5B5BD6] focus:ring-4 focus:ring-[#5B5BD6]/15"
        />
        <button
          disabled={loading}
          className="mt-4 w-full py-4 text-[17px] font-bold rounded-xl text-white bg-gradient-to-r from-[#5B5BD6] to-[#7676FF] hover:-translate-y-0.5 transition flex items-center justify-center gap-2"
        >
          {loading && <Spinner className="w-5 h-5" />} Consultar
        </button>
        {error && <p className="mt-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold">{error}</p>}
      </form>

      {data && !data.buyer && (
        <div className="bg-white rounded-[18px] shadow-[0_8px_25px_rgba(0,0,0,.08)] p-7">
          <h3 className="font-bold text-lg">Nenhum pedido encontrado.</h3>
          <p className="text-sm text-slate-500 mt-1">Confira o número. Se você comprou com outro telefone, consulte por ele.</p>
        </div>
      )}

      {data?.buyer && (
        <>
          <div className="bg-white rounded-[18px] shadow-[0_8px_25px_rgba(0,0,0,.08)] p-6 sm:p-8">
            <div className="text-[28px] sm:text-[32px] font-bold leading-tight">{data.buyer.name}</div>
            <div className="mt-2 text-[17px] text-[#777] flex items-center gap-2">
              <Phone className="w-4 h-4 text-pink-600" /> {formatPhone(data.buyer.whatsapp)}
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-[18px] mt-7">
              {[['Itens', items.length], ['SETs', totalSets], ['CEGs', cegs.length]].map(([label, n]) => (
                <div key={label} className="bg-[#F8F9FD] border border-[#E8EBF4] rounded-[14px] p-4 sm:p-5 text-center">
                  {label}
                  <strong className="block text-3xl text-[#5B5BD6] mt-2">{n}</strong>
                </div>
              ))}
            </div>
            <div className={`mt-4 rounded-[14px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${owed > 0 ? 'bg-rose-50 border border-rose-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <div>
                <span className="text-sm font-semibold text-slate-600">{owed > 0 ? 'Falta pagar' : 'Tudo pago 💜'}</span>
                {owed > 0 && <strong className="block text-2xl text-[#D32F2F]">{formatBRL(owed)}</strong>}
              </div>
              <span className="text-sm text-slate-600">Já pago: <strong className="text-[#28A745]">{formatBRL(data.totals.paid)}</strong></span>
            </div>
            {owed > 0 && (
              <div className="mt-4 space-y-2">
                <PixBox config={cfg} />
                {cfg.adminWhatsapp && (
                  <a
                    href={waLink(cfg.adminWhatsapp, `Oii! 💜 Sou ${data.buyer.name} (${formatPhone(data.buyer.whatsapp)}). Segue o comprovante do pagamento:`)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> Enviar comprovante no WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {cegs.map((ceg) => {
            const open = !closed[ceg.name];
            return (
              <section key={ceg.name} className="bg-white rounded-[18px] shadow-[0_8px_25px_rgba(0,0,0,.08)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setClosed({ ...closed, [ceg.name]: open })}
                  className="w-full text-left px-5 sm:px-6 py-[18px] bg-gradient-to-r from-[#5B5BD6] to-[#7272FF] text-white text-lg sm:text-[22px] font-bold tracking-wide flex items-center gap-2 uppercase"
                >
                  {open ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-5 h-5 shrink-0" />}
                  📦 {ceg.name}
                </button>
                {open && ceg.sets.map((set) => (
                  <div key={set.name}>
                    <div className="bg-[#EEF2FF] px-5 py-[15px] text-[15px] sm:text-[17px] font-bold text-[#444] border-y border-[#E8EBF4] uppercase">
                      📁 {set.name}
                    </div>
                    {/* Celular: um cartão por item */}
                    <div className="md:hidden divide-y divide-[#EEE]">
                      {set.items.map((it, i) => <ItemCard key={i} it={it} />)}
                    </div>
                    {/* Computador: tabela igual à planilha */}
                    <table className="hidden md:table w-full border-collapse text-sm">
                      <thead className="bg-[#F7F8FC]">
                        <tr>
                          {['Item', 'Valor Item', 'Pgto Item', 'Valor Frete', 'Pgto Frete', 'Taxa Alfândega', 'Pgto Alfândega', 'Andamento', 'Observações'].map((h, i) => (
                            <th key={h} className={`p-3.5 border-b-2 border-[#E8EBF4] font-bold ${i === 0 ? 'text-left pl-[22px]' : 'text-center'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {set.items.map((it, i) => (
                          <tr key={i} className="border-b border-[#EEE] hover:bg-[#FAFBFF] text-center">
                            <td className="p-3.5 pl-[22px] text-left">
                              <span className="flex items-center gap-2.5">
                                {it.image && <ProductImage src={it.image} className="w-10 h-10 rounded-lg border border-[#E8EBF4] shrink-0" emojiSize="text-sm" />}
                                <strong className="uppercase">{it.quantity > 1 ? `${it.quantity}x ` : ''}{it.item}</strong>
                              </span>
                            </td>
                            <td className="p-3.5">{money(it.valorItem)}</td>
                            <td className="p-3.5"><Status value={it.pgtoItem} due={it.vencimento} /></td>
                            <td className="p-3.5">{money(it.valorFrete)}</td>
                            <td className="p-3.5"><Status value={it.pgtoFrete} /></td>
                            <td className="p-3.5">{money(it.taxaAlfandega)}</td>
                            <td className="p-3.5"><Status value={it.pgtoAlfandega} /></td>
                            <td className="p-3.5">{it.andamento}</td>
                            <td className="p-3.5 text-left max-w-[16rem]">{it.observacoes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}

function ItemCard({ it }) {
  const rows = [
    ['Item', it.valorItem, it.pgtoItem, it.vencimento],
    ['Frete', it.valorFrete, it.pgtoFrete],
    ['Taxa alfândega', it.taxaAlfandega, it.pgtoAlfandega]
  ].filter((r) => r[1] !== '' && r[1] !== undefined);
  return (
    <div className="p-4 space-y-2.5">
      <div className="flex items-center gap-3">
        {it.image && <ProductImage src={it.image} className="w-14 h-14 rounded-xl border border-[#E8EBF4] shrink-0" emojiSize="text-base" />}
        <div className="min-w-0">
          <strong className="block uppercase">{it.quantity > 1 ? `${it.quantity}x ` : ''}{it.item}</strong>
          {it.andamento && <span className="text-xs font-semibold text-[#5B5BD6]">{it.andamento}</span>}
        </div>
      </div>
      <div className="rounded-xl bg-[#F8F9FD] border border-[#E8EBF4] divide-y divide-[#E8EBF4] text-sm">
        {rows.map(([label, value, status, due]) => (
          <div key={label} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-slate-600">{label}</span>
            <span className="flex items-center gap-3 text-right">
              <span className="font-semibold">{money(value)}</span>
              <Status value={status} due={due} />
            </span>
          </div>
        ))}
      </div>
      {it.observacoes && <p className="text-xs text-slate-600"><strong>Obs.:</strong> {it.observacoes}</p>}
    </div>
  );
}
