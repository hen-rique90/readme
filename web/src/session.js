// Sessão da compradora: guardada só neste aparelho (token assinado pelo servidor)
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const KEY = 'ceg_sessao';

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

const write = (value) => {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: a sessão vale só enquanto a página estiver aberta */
  }
};

export function useSession() {
  const [session, setSessionState] = useState(read);

  const setSession = useCallback((value) => {
    write(value);
    setSessionState(value);
  }, []);

  const logout = useCallback(() => setSession(null), [setSession]);

  // Confere no servidor se a sessão guardada ainda vale (e atualiza o nome)
  useEffect(() => {
    const saved = read();
    if (!saved?.token) return;
    api('me', { token: saved.token })
      .then((res) => setSession({ token: saved.token, profile: res.profile }))
      .catch((err) => {
        if (err.sessionExpired) setSession(null);
      });
  }, [setSession]);

  return { session, setSession, logout };
}
