import { useState } from 'react';
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
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`${className} bg-purple-50 flex items-center justify-center ${emojiSize}`}>💜</div>;
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover`} />;
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
