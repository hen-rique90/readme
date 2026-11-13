import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, ReceiptText, Settings, ShoppingBag } from 'lucide-react';
import { api, IS_DEMO } from './api';
import Catalog from './components/Catalog';
import ClaimModal from './components/ClaimModal';
import MyOrders from './components/MyOrders';
import Admin from './components/Admin';
import { Toast } from './components/common';

const TABS = { catalog: 'catalogo', orders: 'meus-pedidos', admin: 'adm' };
const tabFromHash = () => {
  const h = window.location.hash.replace('#', '');
  return Object.keys(TABS).find((k) => TABS[k] === h) || 'catalog';
};

export default function App() {
  const [tab, setTabState] = useState(tabFromHash);
  const [catalog, setCatalog] = useState({ products: [], config: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const setTab = (t) => {
    setTabState(t);
    window.location.hash = TABS[t];
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('catalog');
      setCatalog({ products: res.products, config: res.config });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carrega ao abrir, a cada 30s e quando a pessoa volta para a aba
  useEffect(() => {
    loadCatalog();
    const timer = setInterval(() => document.visibilityState === 'visible' && loadCatalog(), 30000);
    const onVisible = () => document.visibilityState === 'visible' && loadCatalog();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadCatalog]);

  const { config, products } = catalog;

  useEffect(() => {
    if (config?.storeName) document.title = config.storeName;
  }, [config?.storeName]);

  const navButton = (key, Icon, label, dark = false) => (
    <button
      onClick={() => setTab(key)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
        tab === key ? (dark ? 'bg-slate-900 text-white' : 'bg-purple-700 text-white') : 'text-purple-900 hover:bg-purple-100/70'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#faf7ff] text-slate-800 font-sans pb-16">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {IS_DEMO && (
        <div className="bg-amber-400 text-amber-950 text-[11px] sm:text-xs py-1.5 px-4 text-center font-bold">
          MODO DEMONSTRAÇÃO — os dados ficam só neste navegador. Configure o Google Planilhas para usar de verdade.
        </div>
      )}
      {config?.noticeBanner && (
        <div className="bg-gradient-to-r from-purple-800 via-violet-700 to-fuchsia-700 text-white text-xs sm:text-sm py-2 px-4 text-center font-medium">
          {config.noticeBanner}
        </div>
      )}

      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => setTab('catalog')} className="flex items-center gap-3 group text-left">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-700 to-fuchsia-500 flex items-center justify-center text-white shadow-md shadow-purple-200">
              <Heart className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold bg-gradient-to-r from-purple-800 to-fuchsia-600 bg-clip-text text-transparent">
                {config?.storeName || 'CEG K-pop'}
              </h1>
              <p className="text-[11px] text-slate-500">Claims em tempo real • Pagamento via Pix</p>
            </div>
          </button>
          <nav className="flex items-center gap-1 bg-purple-50/80 p-1.5 rounded-2xl border border-purple-100">
            {navButton('catalog', ShoppingBag, 'Catálogo')}
            {navButton('orders', ReceiptText, 'Meus Pedidos')}
            {navButton('admin', Settings, 'ADM', true)}
          </nav>
        </div>
      </header>

      {tab === 'catalog' && (
        <Catalog products={products} config={config} loading={loading} error={error} onRefresh={loadCatalog} onClaim={setClaiming} />
      )}
      {tab === 'orders' && <MyOrders config={config} />}
      {tab === 'admin' && <Admin showToast={showToast} onCatalogChange={loadCatalog} />}

      {claiming && config && (
        <ClaimModal
          product={claiming}
          config={config}
          onClose={() => setClaiming(null)}
          onClaimed={loadCatalog}
          onViewOrders={() => {
            setClaiming(null);
            setTab('orders');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
