import { useEffect, useState } from 'react';
import { formatDay, formatDayShort, imageCandidates, isOverdue } from '../utils';
import { Check, Copy, Loader2, Sparkles, X } from 'lucide-react';

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const color =
    toast.type === 'error'
      ? 'bg-rose-600 border-rose-700'
      : toast.type === 'warning'
        ? 'bg-amber-500 border-amber-600'
        : 'bg-purple-700 border-purple-800';
  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 z-[60] sm:max-w-sm" role="status">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl shadow-xl border text-white ${color}`}>
        <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
        <span className="text-sm font-medium flex-1">{toast.message}</span>
        <button onClick={onClose} className="opacity-80 hover:opacity-100" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copiar', className = '' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copiado!' : label}
    </button>
  );
}

export function ProductImage({ src, className, alt = '', emojiSize = 'text-2xl' }) {
  const candidates = imageCandidates(src);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [src]);
  if (attempt >= candidates.length) {
    return <div className={`${className} bg-purple-50 flex items-center justify-center ${emojiSize}`}>💜</div>;
  }
  return (
    <img
      key={candidates[attempt]}
      src={candidates[attempt]}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((a) => a + 1)}
      className={`${className} object-cover`}
    />
  );
}

export function Spinner({ className = 'w-5 h-5' }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function Badge({ className, children }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function PixBox({ config }) {
  if (!config?.pixKey) return null;
  return (
    <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between gap-2">
      <div className="text-left min-w-0">
        <span className="block text-[10px] uppercase tracking-wider text-purple-300 font-bold">
          Chave Pix{config.pixName ? ` • ${config.pixName}` : ''}
        </span>
        <span className="text-xs font-mono truncate block">{config.pixKey}</span>
      </div>
      <CopyButton text={config.pixKey} label="Copiar Pix" />
    </div>
  );
}

export function Modal({ onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white rounded-3xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 shadow-2xl border border-purple-100 relative my-8`}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function DueBadge({ charge }) {
  if (!charge.dueDate || charge.status === 'Cancelada') return null;
  if (charge.status === 'Pago') return <span className="text-[11px] text-slate-400">venc. {formatDay(charge.dueDate)}</span>;
  return isOverdue(charge) ? (
    <Badge className="bg-rose-100 text-rose-700 border-rose-200">Vencida {formatDayShort(charge.dueDate)}</Badge>
  ) : (
    <span className="text-[11px] font-semibold text-amber-700">até {formatDay(charge.dueDate)}</span>
  );
}

// Caixinha para preencher as datas do Pix parcelado
export function DateListInput({ value, onChange }) {
  const dates = value || [];
  const setAt = (i, v) => onChange(dates.map((d, j) => (j === i ? v : d)));
  return (
    <div className="space-y-2">
      {dates.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs font-bold text-purple-800 w-16 shrink-0">Parcela {i + 1}</span>
          <input type="date" required value={d} onChange={(e) => setAt(i, e.target.value)} className="input py-2" />
          <button
            type="button"
            onClick={() => onChange(dates.filter((_, j) => j !== i))}
            className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 shrink-0"
            aria-label={`Remover parcela ${i + 1}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...dates, ''])}
        disabled={dates.length >= 12}
        className="btn-soft w-full"
      >
        + Adicionar data de pagamento
      </button>
    </div>
  );
}
