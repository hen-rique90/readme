import { useEffect, useState } from 'react';
import { KeyRound, LogOut, Phone, UserRound } from 'lucide-react';
import { api, IS_DEMO } from '../api';
import { formatPhone, loadBuyer, saveBuyer, waLink } from '../utils';
import { Modal, PhoneInput, Spinner } from './common';
import { AddressForm, addressLine } from './ShippingTools';

// mode: 'login' | 'register' | 'account' | 'changePassword'
export default function AuthModal({ initialMode = 'login', reason, config, session, onClose, onSession, onLogout, showToast }) {
  const mustChange = !!session?.profile?.mustChange;
  const [mode, setMode] = useState(mustChange ? 'changePassword' : initialMode);
  const remembered = loadBuyer();
  const [form, setForm] = useState({
    name: session?.profile?.name || remembered.buyerName || '',
    contact: session?.profile?.contact || remembered.contact || '',
    whatsapp: session?.profile?.whatsapp || remembered.whatsapp || '',
    password: '',
    password2: '',
    currentPassword: '',
    code: ''
  });
  const [needsCode, setNeedsCode] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const run = async (fn) => {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      if (err.needsCode) setNeedsCode(true);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const finish = (res, message) => {
    saveBuyer({ buyerName: res.profile.name, contact: res.profile.contact, whatsapp: res.profile.whatsapp });
    onSession({ token: res.token, profile: res.profile });
    if (res.profile.mustChange) {
      setMode('changePassword');
      return;
    }
    if (message) showToast(message);
    onClose();
  };

  const login = (e) => {
    e.preventDefault();
    run(async () => finish(await api('login', { whatsapp: form.whatsapp, password: form.password }), 'Bem-vinda de volta! 💜'));
  };

  const register = (e) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('As senhas não são iguais.');
    run(async () =>
      finish(
        await api('register', {
          name: form.name,
          contact: form.contact,
          whatsapp: form.whatsapp,
          password: form.password,
          code: needsCode ? form.code : ''
        }),
        'Conta criada! Agora é só dar claim 💜'
      )
    );
  };

  const changePassword = (e) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('As senhas não são iguais.');
    run(async () => {
      const res = await api('changePassword', {
        token: session.token,
        currentPassword: form.currentPassword,
        newPassword: form.password
      });
      onSession({ token: res.token, profile: res.profile });
      showToast('Senha alterada!');
      onClose();
    });
  };

  const saveProfile = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api('updateProfile', { token: session.token, name: form.name, contact: form.contact });
      onSession({ token: session.token, profile: res.profile });
      saveBuyer({ buyerName: res.profile.name, contact: res.profile.contact });
      showToast('Dados atualizados!');
      onClose();
    });
  };

  const forgotLink =
    config?.adminWhatsapp &&
    waLink(config.adminWhatsapp, `Oii! 💜 Esqueci a senha da minha conta na CEG. Meu WhatsApp é ${form.whatsapp || '...'}. Pode gerar uma senha nova?`);

  const errorBox = error && <p className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">{error}</p>;
  const submitBtn = (label) => (
    <button type="submit" disabled={sending} className="btn-primary w-full py-3">
      {sending && <Spinner className="w-4 h-4" />} {label}
    </button>
  );

  const passwordFields = (label = 'Senha') => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label">{label} *</label>
        <input required type="password" minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} className="input" />
      </div>
      <div>
        <label className="label">Repita a senha *</label>
        <input required type="password" minLength={6} autoComplete="new-password" value={form.password2} onChange={set('password2')} className="input" />
      </div>
    </div>
  );

  return (
    <Modal onClose={mustChange ? () => {} : onClose}>
      {(mode === 'login' || mode === 'register') && (
        <div className="space-y-4">
          <div className="pr-8">
            <h3 className="text-xl font-extrabold text-slate-800">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {reason || 'Com a conta, o claim é um toque só e você vê seus pedidos sem precisar de código.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-purple-50">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`py-2 rounded-lg text-sm font-bold ${mode === m ? 'bg-white text-purple-800 shadow-sm' : 'text-purple-700'}`}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          {mode === 'login' ? (
            <form onSubmit={login} className="space-y-3">
              <div>
                <label className="label">WhatsApp com DDD</label>
                <PhoneInput required autoComplete="username" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-8888" className="input" />
              </div>
              <div>
                <label className="label">Senha</label>
                <input required type="password" autoComplete="current-password" value={form.password} onChange={set('password')} className="input" />
              </div>
              {errorBox}
              {submitBtn('Entrar')}
              {forgotLink && (
                <a href={forgotLink} target="_blank" rel="noreferrer" className="block text-center text-xs font-bold text-purple-700 underline">
                  Esqueci minha senha (pedir uma nova para a ADM)
                </a>
              )}
              {IS_DEMO && <p className="text-[11px] text-center text-slate-400">Demonstração: WhatsApp 11988887777, senha 123456</p>}
            </form>
          ) : (
            <form onSubmit={register} className="space-y-3">
              <div>
                <label className="label">Seu nome *</label>
                <input required minLength={2} maxLength={80} value={form.name} onChange={set('name')} placeholder="Ex: Maria Clara Souza" className="input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Seu @ *</label>
                  <input required maxLength={60} value={form.contact} onChange={set('contact')} placeholder="@seu_user" className="input" />
                </div>
                <div>
                  <label className="label">WhatsApp com DDD *</label>
                  <PhoneInput required autoComplete="username" value={form.whatsapp} onChange={set('whatsapp')} placeholder="(11) 99999-8888" className="input" />
                </div>
              </div>
              {passwordFields()}
              {needsCode && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                  <label className="label text-purple-900">Código de um pedido seu</label>
                  <input required value={form.code} onChange={set('code')} placeholder="PED-XXXXXX" className="input font-mono uppercase" />
                  <p className="text-[11px] text-purple-800">
                    Você já comprou com a gente com esse WhatsApp! O código protege seus pedidos. Ele está na mensagem do
                    claim ou a ADM te manda.
                  </p>
                </div>
              )}
              {errorBox}
              {submitBtn('Criar conta')}
              <p className="text-[11px] text-slate-400 text-center">Sua senha fica protegida: nem a ADM consegue ver.</p>
            </form>
          )}
        </div>
      )}

      {mode === 'account' && session && (
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="pr-8 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <UserRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">Minha conta</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {formatPhone(session.profile.whatsapp)}
              </p>
            </div>
          </div>
          <div>
            <label className="label">Nome</label>
            <input required minLength={2} value={form.name} onChange={set('name')} className="input" />
          </div>
          <div>
            <label className="label">@ (Insta / Twitter)</label>
            <input required value={form.contact} onChange={set('contact')} className="input" />
          </div>
          {errorBox}
          {submitBtn('Salvar')}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('changePassword')} className="btn-soft py-2.5">
              <KeyRound className="w-3.5 h-3.5" /> Trocar senha
            </button>
            <button
              type="button"
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="btn-soft py-2.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>
        </form>
      )}

      {mode === 'account' && session && <AddressBook session={session} />}

      {mode === 'changePassword' && session && (
        <form onSubmit={changePassword} className="space-y-3">
          <div className="pr-8">
            <h3 className="text-lg font-extrabold text-slate-800">{mustChange ? 'Crie sua senha nova' : 'Trocar senha'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {mustChange ? 'Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.' : 'Use pelo menos 6 caracteres.'}
            </p>
          </div>
          {!mustChange && (
            <div>
              <label className="label">Senha atual</label>
              <input required type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} className="input" />
            </div>
          )}
          {passwordFields('Nova senha')}
          {errorBox}
          {submitBtn('Salvar senha')}
        </form>
      )}
    </Modal>
  );
}

function AddressBook({ session }) {
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('myAddresses', { token: session.token }).then((r) => setList(r.addresses)).catch((err) => setError(err.message));
  }, [session.token]);
  const remove = async (a) => {
    if (!window.confirm(`Apagar o endereço "${a.label}"?`)) return;
    try {
      setList((await api('deleteAddress', { token: session.token, addressId: a.addressId })).addresses);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="mt-4 pt-4 border-t border-purple-100 space-y-2">
      <h4 className="font-extrabold text-slate-800 text-sm">📍 Meus endereços</h4>
      {!list && !error && <Spinner className="w-4 h-4 text-purple-600" />}
      {list?.length === 0 && !adding && <p className="text-xs text-slate-500">Nenhum endereço ainda.</p>}
      {list?.map((a) => (
        <div key={a.addressId} className="flex items-start justify-between gap-2 text-xs bg-slate-50 rounded-xl p-2.5">
          <span><strong>{a.label}</strong> — {a.recipient}<span className="block text-slate-500">{addressLine(a)}</span></span>
          <button type="button" onClick={() => remove(a)} className="text-rose-600 font-bold shrink-0">Apagar</button>
        </div>
      ))}
      {adding ? (
        <AddressForm
          token={session.token}
          defaultRecipient={session.profile.name}
          onSaved={(r) => { setList(r.addresses); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        list && list.length < 5 && (
          <button type="button" onClick={() => setAdding(true)} className="btn-soft w-full">+ Novo endereço</button>
        )
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
