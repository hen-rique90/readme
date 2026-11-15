import { createContext, useContext, useState } from 'react';
import { Camera } from 'lucide-react';
import { Spinner } from './common';

// O painel ADM fornece a função que envia a foto ao Google Drive
export const PhotoUploader = createContext(null);

// Reduz a foto no próprio aparelho (máx. 1200 px, JPEG) para o envio ser rápido
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não consegui abrir essa foto. Tente outra (JPG ou PNG).'));
      el.src = url;
    });
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Botão "📷 Enviar foto": escolhe do celular/computador e devolve o link do Drive
export function PhotoButton({ name = 'foto', onUploaded, className = '' }) {
  const upload = useContext(PhotoUploader);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!upload) return null;
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const data = await shrink(file);
      onUploaded(await upload(data, name));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className={`inline-flex flex-col shrink-0 ${className}`}>
      <label className={`btn-soft py-1.5 cursor-pointer whitespace-nowrap ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        {busy ? <Spinner className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
        {busy ? 'Enviando…' : 'Enviar foto'}
        <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
      </label>
      {error && <span className="text-[11px] font-semibold text-rose-700 max-w-[16rem] mt-1">{error}</span>}
    </span>
  );
}
