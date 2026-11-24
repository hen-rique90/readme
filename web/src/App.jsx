import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import { api, IS_DEMO } from './api';
import PhoneLookup from './components/PhoneLookup';
import Admin from './components/Admin';
import { Toast } from './components/common';

// Duas telas: a consulta pelo telefone (pública) e o painel ADM (#adm)
const tabFromHash = () => (window.location.hash.replace('#', '') === 'adm' ? 'admin' : 'consulta');

export default function App() {
  const [tab, setTabState] = useState(tabFromHash);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const setTab = (t) => {
    setTabState(t);
    window.location.hash = t === 'admin' ? 'adm' : '';
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      setConfig((await api('catalog')).config);
    } catch {
      /* a consulta funciona mesmo sem isso */
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    document.title = tab === 'admin' ? 'ADM — Cantinho da Army' : 'Cantinho da Army';
  }, [tab]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] text-[#2F2F2F] pb-16">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {IS_DEMO && (
        <div className="bg-amber-400 text-amber-950 text-[11px] sm:text-xs py-1.5 px-4 text-center font-bold">
          MODO DEMONSTRAÇÃO — os dados ficam só neste navegador. Telefone de exemplo: (11) 98888-7777
        </div>
      )}
      {config?.noticeBanner && tab === 'consulta' && (
        <div className="bg-gradient-to-r from-[#5B5BD6] to-[#7676FF] text-white text-xs sm:text-sm py-2 px-4 text-center font-medium">
          {config.noticeBanner}
        </div>
      )}

      {tab === 'admin' ? (
        <>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
            <button onClick={() => setTab('consulta')} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#5B5BD6]">
              <ArrowLeft className="w-4 h-4" /> Voltar para a consulta
            </button>
          </div>
          <Admin showToast={showToast} onCatalogChange={loadConfig} />
        </>
      ) : (
        <>
          <PhoneLookup />
          <footer className="text-center mt-10">
            <button onClick={() => setTab('admin')} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-[#5B5BD6]">
              <Settings className="w-3 h-3" /> Área da ADM
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
