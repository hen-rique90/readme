import { useMemo, useState } from 'react';
import { ChevronRight, Filter, Package, RefreshCw, Search, Sparkles } from 'lucide-react';
import { CATEGORIES, MEMBERS, formatBRL, memberBadgeColor } from '../utils';
import { ProductImage, Spinner } from './common';

export default function Catalog({ products, config, loading, error, onRefresh, onClaim }) {
  const [category, setCategory] = useState('Todos');
  const [member, setMember] = useState('Todos');
  const [batch, setBatch] = useState('Todos');
  const [query, setQuery] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const batches = useMemo(() => ['Todos', ...new Set(products.map((p) => p.batch).filter(Boolean))], [products]);
  const categories = useMemo(
    () => ['Todos', ...new Set([...CATEGORIES.filter((c) => products.some((p) => p.category === c)), ...products.map((p) => p.category)])],
    [products]
  );
  const members = useMemo(
    () => ['Todos', ...new Set([...MEMBERS.filter((m) => products.some((p) => p.member === m)), ...products.map((p) => p.member)])],
    [products]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return products.filter(
      (p) =>
        (category === 'Todos' || p.category === category) &&
        (member === 'Todos' || p.member === member) &&
        (batch === 'Todos' || p.batch === batch) &&
        (!onlyAvailable || p.available > 0) &&
        (!q || `${p.name} ${p.id} ${p.member}`.toLowerCase().includes(q))
    );
  }, [products, category, member, batch, query, onlyAvailable]);

  const totalAvailable = products.reduce((acc, p) => acc + p.available, 0);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl mb-6 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/15 text-purple-100 mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Claim na hora, sem fila
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            Viu seu bias disponível? Garanta seu claim! 💜
          </h2>
          <p className="text-purple-100 text-xs sm:text-sm leading-relaxed">
            1. Escolha o item • 2. Clique em <strong>Solicitar / Claim</strong> • 3. O item fica reservado no seu nome
            e você recebe um código para acompanhar o que já pagou e o que falta em <strong>Meus Pedidos</strong>.
          </p>
          {!config?.claimsOpen && config && (
            <p className="mt-3 inline-block px-3 py-1.5 rounded-xl bg-rose-500/90 text-xs font-bold">
              Claims fechados no momento — você ainda pode ver o catálogo.
            </p>
          )}
        </div>
        <div className="hidden lg:flex absolute right-8 top-1/2 -translate-y-1/2 gap-3">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center w-32">
            <span className="block text-2xl font-black">{totalAvailable}</span>
            <span className="text-[11px] text-purple-200 uppercase tracking-wider">Unidades livres</span>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-2xl p-4 text-center w-32">
            <span className="block text-2xl font-black">{products.length}</span>
            <span className="text-[11px] text-purple-200 uppercase tracking-wider">Itens na CEG</span>
          </div>
        </div>
      </div>

      <div className="card p-4 sm:p-5 mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar photocard, álbum, código ou membro..."
              className="input pl-11 bg-purple-50/50"
            />
          </div>
          {batches.length > 2 && (
            <select value={batch} onChange={(e) => setBatch(e.target.value)} className="input md:w-56 font-semibold">
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b === 'Todos' ? 'Todos os lotes' : b}
                </option>
              ))}
            </select>
          )}
          <button onClick={onRefresh} className="btn-soft py-2.5" title="Atualizar estoque">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${
                category === c ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-purple-50">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Membro:
            </span>
            {members.map((m) => (
              <button
                key={m}
                onClick={() => setMember(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${
                  member === m ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-purple-100'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="w-4 h-4 accent-purple-600"
            />
            Mostrar apenas disponíveis
          </label>
        </div>
      </div>

      {error && (
        <div className="card p-6 text-center text-rose-700 font-semibold mb-6">
          {error}{' '}
          <button onClick={onRefresh} className="underline">
            Tentar de novo
          </button>
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className="card p-12 flex justify-center text-purple-600">
          <Spinner className="w-8 h-8" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="w-12 h-12 text-purple-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">Nenhum item encontrado</h3>
          <p className="text-sm text-slate-500 mt-1">Tente limpar os filtros ou buscar por outro membro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} canClaim={config?.claimsOpen} onClaim={() => onClaim(p)} />
          ))}
        </div>
      )}
    </main>
  );
}

function ProductCard({ product: p, canClaim, onClaim }) {
  const soldOut = p.available <= 0;
  const pct = p.totalStock > 0 ? Math.min(100, Math.round((p.sold / p.totalStock) * 100)) : 100;
  return (
    <div
      className={`group bg-white rounded-3xl border overflow-hidden flex flex-col justify-between transition ${
        soldOut ? 'border-slate-200 opacity-75' : 'border-purple-100 hover:border-purple-300 hover:shadow-xl hover:shadow-purple-100/50'
      }`}
    >
      <div>
        <div className="relative h-56 bg-purple-50 overflow-hidden">
          <ProductImage src={p.image} alt={p.name} emojiSize="text-5xl" className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-xl text-xs font-black bg-slate-900/80 text-white">#{p.id}</span>
          <span className={`absolute top-3 right-3 px-3 py-1 rounded-xl text-xs font-extrabold border ${memberBadgeColor(p.member)}`}>
            {p.member}
          </span>
          {soldOut ? (
            <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
              <span className="px-5 py-2 rounded-2xl bg-rose-600 text-white font-black text-sm tracking-widest uppercase -rotate-6 border-2 border-white">
                Esgotado
              </span>
            </div>
          ) : (
            <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow">
              Restam {p.available} de {p.totalStock}
            </span>
          )}
        </div>
        <div className="p-5">
          <div className="flex justify-between gap-2 text-[11px] font-bold text-purple-600 uppercase tracking-wider mb-1">
            <span>{p.category}</span>
            <span className="truncate">{p.batch}</span>
          </div>
          <h3 className="font-bold text-slate-800 leading-snug line-clamp-2 min-h-[2.75rem]">{p.name}</h3>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-slate-500 font-medium mb-1">
              <span>Claims: {p.sold}</span>
              <span>{pct}% reservado</span>
            </div>
            <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${soldOut ? 'bg-rose-500' : 'bg-gradient-to-r from-purple-600 to-fuchsia-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-2">
        <div>
          <span className="block text-[11px] text-slate-400 font-medium">Valor do item (1ª fase)</span>
          <span className="text-xl font-black text-purple-900">{formatBRL(p.price)}</span>
        </div>
        <button
          disabled={soldOut || !canClaim}
          onClick={onClaim}
          className={`px-4 py-3 rounded-2xl font-bold text-sm flex items-center gap-1.5 transition ${
            soldOut || !canClaim
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-700 to-fuchsia-600 hover:from-purple-800 hover:to-fuchsia-700 text-white shadow-md shadow-purple-200 active:scale-95'
          }`}
        >
          {soldOut ? 'Indisponível' : !canClaim ? 'Fechado' : (<>Solicitar / Claim <ChevronRight className="w-4 h-4" /></>)}
        </button>
      </div>
    </div>
  );
}
