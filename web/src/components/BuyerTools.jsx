import { useMemo, useState } from 'react';
import { formatPhone, sameNameGroups } from '../utils';
import { Badge, Modal, Spinner } from './common';

// Corrige nome/@/WhatsApp de TODOS os pedidos, cobranças e da conta de uma compradora
async function updateBuyer(call, params, askMerge) {
  try {
    return await call('adminUpdateBuyer', params);
  } catch (err) {
    if (err.conflict && askMerge(err)) return call('adminUpdateBuyer', { ...params, merge: true });
    throw err;
  }
}

export function EditBuyerModal({ buyer, call, reload, showToast, onClose }) {
  const [form, setForm] = useState({ name: buyer.name, contact: buyer.contact || '', whatsapp: buyer.whatsapp });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await updateBuyer(
        call,
        { whatsapp: buyer.whatsapp, name: form.name, contact: form.contact, newWhatsapp: form.whatsapp },
        (err) =>
          window.confirm(
            `${err.message}\n\nOK = é a mesma pessoa: juntar os pedidos no WhatsApp ${form.whatsapp}.\nCancelar = voltar e conferir o número.`
          )
      );
      if (!res) return;
      showToast(`${res.orders} pedido(s) atualizado(s).${res.merged ? ' Cadastros juntados.' : ''} ${res.account || ''}`);
      await reload();
      onClose();
    } catch (err) {
      setError(err.conflict ? 'Nada foi alterado. Confira o WhatsApp.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="pr-8">
          <h3 className="text-lg font-extrabold text-slate-800">✏️ Corrigir dados da compradora</h3>
          <p className="text-xs text-slate-500">
            Muda em <strong>todos os {buyer.orders ?? ''} pedido(s)</strong>, nas cobranças e na conta dela (se tiver). Se ela tiver conta e
            o WhatsApp mudar, ela passa a entrar com o número novo e a mesma senha.
          </p>
        </div>
        <div>
          <label className="label">Nome</label>
          <input required minLength={2} value={form.name} onChange={set('name')} className="input" />
          <p className="text-[11px] text-slate-400 mt-1">Para diferenciar duas pessoas com o mesmo nome: "Caroline Souza", "Caroline (RJ)"…</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">WhatsApp com DDD</label>
            <input required type="tel" inputMode="numeric" value={form.whatsapp} onChange={set('whatsapp')} className="input" />
          </div>
          <div>
            <label className="label">@ (Insta / Twitter)</label>
            <input value={form.contact} onChange={set('contact')} className="input" />
          </div>
        </div>
        {error && <p className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy && <Spinner className="w-4 h-4" />} Salvar em todos os pedidos
        </button>
      </form>
    </Modal>
  );
}

// Junta duas compradoras (mesma pessoa com dois números)
export function MergeBuyerModal({ buyer, buyers, preselect, call, reload, showToast, onClose }) {
  const others = useMemo(() => buyers.filter((b) => b.whatsapp && b.whatsapp !== buyer.whatsapp), [buyers, buyer]);
  const [otherPhone, setOtherPhone] = useState(preselect || '');
  const [keep, setKeep] = useState('other'); // qual WhatsApp é o certo
  const other = others.find((b) => b.whatsapp === otherPhone);
  const kept = keep === 'this' ? buyer : other;
  const removed = keep === 'this' ? other : buyer;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!other) return setError('Escolha com quem juntar.');
    const finalName = (name || kept.name).trim();
    if (!window.confirm(`Juntar "${removed.name}" (${formatPhone(removed.whatsapp)}) em "${finalName}" (${formatPhone(kept.whatsapp)})?\nTodos os pedidos ficam no WhatsApp ${formatPhone(kept.whatsapp)}.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await call('adminUpdateBuyer', {
        whatsapp: removed.whatsapp,
        newWhatsapp: kept.whatsapp,
        name: finalName,
        contact: kept.contact || removed.contact || '',
        merge: true
      });
      showToast(`Cadastros juntados: ${res.orders} pedido(s) em ${formatPhone(res.whatsapp)}. ${res.account || ''}`);
      await reload();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const Option = ({ value, b }) => (
    <label className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer ${keep === value ? 'border-purple-500 bg-purple-50' : 'border-purple-100'}`}>
      <input type="radio" checked={keep === value} onChange={() => setKeep(value)} className="mt-1 accent-purple-600" />
      <span className="text-sm">
        <strong>{formatPhone(b.whatsapp)}</strong> — {b.name} {b.contact}
        <span className="block text-[11px] text-slate-500">
          {b.orders} pedido(s){b.account ? ' • tem conta' : ''}
        </span>
      </span>
    </label>
  );

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="pr-8">
          <h3 className="text-lg font-extrabold text-slate-800">🔗 Juntar cadastros (mesma pessoa)</h3>
          <p className="text-xs text-slate-500">Os pedidos dos dois números vão para um só. Use só se for a mesma pessoa.</p>
        </div>
        <div>
          <label className="label">Juntar {buyer.name} ({formatPhone(buyer.whatsapp)}) com…</label>
          <select required value={otherPhone} onChange={(e) => setOtherPhone(e.target.value)} className="input">
            <option value="">Escolha a outra compradora…</option>
            {others.map((b) => (
              <option key={b.whatsapp} value={b.whatsapp}>
                {b.name} — {formatPhone(b.whatsapp)} ({b.orders} pedido(s){b.account ? ', conta' : ''})
              </option>
            ))}
          </select>
        </div>
        {other && (
          <>
            <div className="space-y-2">
              <span className="label">Qual WhatsApp é o certo?</span>
              <Option value="this" b={buyer} />
              <Option value="other" b={other} />
            </div>
            <div>
              <label className="label">Nome que fica</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kept.name} className="input" />
            </div>
            {buyer.account && other.account && (
              <p className="text-[11px] text-amber-700">As duas têm conta: fica só a conta do WhatsApp certo (com a senha dela).</p>
            )}
          </>
        )}
        {error && <p className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy || !other}>
          {busy && <Spinner className="w-4 h-4" />} Juntar cadastros
        </button>
      </form>
    </Modal>
  );
}

// Painel: mesmo nome com WhatsApp diferente (decidir se é a mesma pessoa)
const DISMISS_KEY = 'ceg_nomes_verificados';
const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  } catch {
    return [];
  }
};

export function SameNamePanel({ data, onEdit, onMerge }) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [showAll, setShowAll] = useState(false);
  const groups = sameNameGroups(data.orders, data.clients);
  const open = groups.filter((g) => showAll || !dismissed.includes(g.key));
  const dismiss = (key) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: some só até recarregar */
    }
  };
  if (!groups.length) return null;

  return (
    <div className="card p-4 space-y-3 border-sky-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-slate-800">👥 Mesmo nome, WhatsApp diferente ({open.length})</h3>
          <p className="text-xs text-slate-500">
            Pode ser a <strong>mesma pessoa com dois números</strong> (use "Juntar") ou <strong>duas pessoas diferentes</strong> (use
            "Corrigir dados" para diferenciar o nome, ou marque "São pessoas diferentes").
          </p>
        </div>
        {dismissed.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4 accent-purple-600" />
            Mostrar os já verificados
          </label>
        )}
      </div>
      {open.length === 0 && <p className="text-sm text-emerald-700">✓ Todos os nomes repetidos já foram verificados.</p>}
      {open.map((g) => (
        <div key={g.key} className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-slate-800">{g.name}</strong>
            <div className="flex gap-2">
              <button type="button" className="btn-soft" onClick={() => onMerge(g.buyers[0], g.buyers[1]?.whatsapp)}>
                🔗 Juntar (mesma pessoa)
              </button>
              {!dismissed.includes(g.key) && (
                <button type="button" className="btn-soft" onClick={() => dismiss(g.key)}>
                  São pessoas diferentes
                </button>
              )}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.buyers.map((b) => (
              <div key={b.whatsapp} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-sky-100 px-3 py-2 text-xs">
                <span>
                  <strong className="text-sm">{formatPhone(b.whatsapp)}</strong> {b.contact}
                  <span className="block text-slate-500">
                    {b.orders} pedido(s) {b.account && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">tem conta</Badge>}
                  </span>
                </span>
                <button type="button" className="btn-soft py-1.5" onClick={() => onEdit(b)}>
                  ✏️ Corrigir
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
