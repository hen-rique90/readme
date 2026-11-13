export const MEMBERS = ['OT7', 'RM', 'Jin', 'Suga', 'J-Hope', 'Jimin', 'V', 'Jungkook'];
export const CATEGORIES = ['Photocards', 'Álbuns', 'Merch/DVD', 'Vinil', 'Outros'];

export const formatBRL = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

export const formatPhone = (v) => {
  const d = onlyDigits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};

// wa.me precisa do código do país; o sistema guarda telefones sem o 55
export const waLink = (phone, text) => {
  let d = onlyDigits(phone);
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
};

export const memberBadgeColor = (member) =>
  ({
    OT7: 'bg-purple-600 text-white border-purple-700',
    RM: 'bg-sky-100 text-sky-800 border-sky-200',
    Jin: 'bg-pink-100 text-pink-800 border-pink-200',
    Suga: 'bg-slate-800 text-white border-slate-900',
    'J-Hope': 'bg-amber-100 text-amber-800 border-amber-200',
    Jimin: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    V: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    Jungkook: 'bg-violet-100 text-violet-800 border-violet-200'
  })[member] || 'bg-purple-100 text-purple-800 border-purple-200';

export const orderStatusColor = (status) => {
  if (status === 'Cancelado') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (status === 'Reservado') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'Entregue') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-sky-100 text-sky-800 border-sky-200';
};

export const chargeStatusColor = (status) => {
  if (status === 'Pago') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (status === 'Cancelada') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

// Dados da compradora lembrados só neste aparelho (conveniência)
const BUYER_KEY = 'ceg_minha_conta';

export const loadBuyer = () => {
  try {
    return JSON.parse(localStorage.getItem(BUYER_KEY) || 'null') || {};
  } catch {
    return {};
  }
};

export const saveBuyer = (data) => {
  try {
    localStorage.setItem(BUYER_KEY, JSON.stringify({ ...loadBuyer(), ...data }));
  } catch {
    /* sem armazenamento: tudo bem */
  }
};

export const downloadCSV = (filename, headers, rows) => {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
