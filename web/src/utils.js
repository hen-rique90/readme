// Grupos com seus integrantes. "OTn" = o grupo todo (ex.: OT7 para BTS).
export const GROUPS = {
  BTS: ['RM', 'Jin', 'Suga', 'J-Hope', 'Jimin', 'V', 'Jungkook'],
  'Stray Kids': ['Bang Chan', 'Lee Know', 'Changbin', 'Hyunjin', 'Han', 'Felix', 'Seungmin', 'I.N'],
  BLACKPINK: ['Jisoo', 'Jennie', 'Rosé', 'Lisa'],
  TWICE: ['Nayeon', 'Jeongyeon', 'Momo', 'Sana', 'Jihyo', 'Mina', 'Dahyun', 'Chaeyoung', 'Tzuyu'],
  SEVENTEEN: ['S.Coups', 'Jeonghan', 'Joshua', 'Jun', 'Hoshi', 'Wonwoo', 'Woozi', 'DK', 'Mingyu', 'The8', 'Seungkwan', 'Vernon', 'Dino'],
  ENHYPEN: ['Jungwon', 'Heeseung', 'Jay', 'Jake', 'Sunghoon', 'Sunoo', 'Ni-ki'],
  TXT: ['Soobin', 'Yeonjun', 'Beomgyu', 'Taehyun', 'Hueningkai'],
  ATEEZ: ['Hongjoong', 'Seonghwa', 'Yunho', 'Yeosang', 'San', 'Mingi', 'Wooyoung', 'Jongho'],
  NewJeans: ['Minji', 'Hanni', 'Danielle', 'Haerin', 'Hyein'],
  aespa: ['Karina', 'Giselle', 'Winter', 'Ningning'],
  'LE SSERAFIM': ['Sakura', 'Chaewon', 'Yunjin', 'Kazuha', 'Eunchae'],
  IVE: ['Yujin', 'Gaeul', 'Rei', 'Wonyoung', 'Liz', 'Leeseo'],
  ITZY: ['Yeji', 'Lia', 'Ryujin', 'Chaeryeong', 'Yuna']
};
export const GROUP_NAMES = Object.keys(GROUPS);
export const DEFAULT_GROUP = 'BTS';

export const groupOf = (p) => p.group || DEFAULT_GROUP;
export const membersOf = (group) => GROUPS[group] || [];
// Rótulo do "grupo todo": OT7, OT8, OT4... (grupo fora da lista: "Grupo todo")
export const wholeGroupLabel = (group) => (GROUPS[group] ? `OT${GROUPS[group].length}` : 'Grupo todo');

// Compatibilidade: integrantes do BTS (grupo original da loja)
export const MEMBERS = ['OT7', ...GROUPS.BTS];
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
  /^OT\d+$|^Grupo todo$/.test(member || '')
    ? 'bg-purple-600 text-white border-purple-700'
    : ({
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

// Converte links de página (Google Drive, Imgur) em links diretos de imagem.
// Devolve uma lista de tentativas: se a primeira não carregar, tenta a próxima.
export const imageCandidates = (raw) => {
  const url = String(raw || '').trim();
  if (!url) return [];
  const drive =
    url.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/) ||
    url.match(/drive\.google\.com\/(?:open|uc|thumbnail)\?(?:.*&)?id=([\w-]{10,})/) ||
    url.match(/docs\.google\.com\/uc\?(?:.*&)?id=([\w-]{10,})/);
  if (drive) {
    const id = drive[1];
    return [
      `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
      `https://lh3.googleusercontent.com/d/${id}=w1000`
    ];
  }
  const imgur = url.match(/^https?:\/\/(?:m\.)?imgur\.com\/(?!a\/|gallery\/)(\w{5,8})(?:[/?#].*)?$/i);
  if (imgur) return [`https://i.imgur.com/${imgur[1]}.jpg`];
  return [url];
};

export const isAlbumLink = (raw) => /imgur\.com\/(a|gallery)\//i.test(String(raw || ''));

// Datas de vencimento chegam como 'aaaa-mm-dd'
export const formatDay = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

export const formatDayShort = (key) => formatDay(key).slice(0, 5);

export const todayKey = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // aaaa-mm-dd

export const isOverdue = (charge) => charge.status === 'Pendente' && !!charge.dueDate && charge.dueDate < todayKey();

// Mesma divisão do servidor: parcelas iguais, a última acerta os centavos
export const splitInstallments = (total, n) => {
  if (n < 2) return [total];
  const each = Math.floor((total / n) * 100) / 100;
  const parts = Array(n - 1).fill(each);
  parts.push(Math.round((total - each * (n - 1)) * 100) / 100);
  return parts;
};

// ---- Telefones usados por pessoas com nomes diferentes
const plainName = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';

// distância de edição (para "Soraya" x "Soraia" contar como parecido)
const editDistance = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
};

export const sameFirstName = (a, b) => {
  const x = plainName(a);
  const y = plainName(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(y) || y.startsWith(x) || editDistance(x, y) <= 2;
};

/**
 * Agrupa por WhatsApp e devolve os números com nomes diferentes.
 * severity "diferente": primeiros nomes realmente diferentes (provável outra pessoa);
 * "parecido": variações de escrita (Soraya/Soraia).
 */
export const phoneConflicts = (orders, clients = []) => {
  const map = {};
  const add = (whatsapp, name, source, order) => {
    if (!whatsapp || !name) return;
    const g = (map[whatsapp] = map[whatsapp] || { whatsapp, names: {}, orders: [] });
    const key = name.trim();
    g.names[key] = g.names[key] || { name: key, count: 0, account: false };
    if (source === 'account') g.names[key].account = true;
    else g.names[key].count++;
    if (order) g.orders.push(order);
  };
  orders.forEach((o) => add(o.whatsapp, o.buyerName, 'order', o));
  clients.forEach((c) => add(c.whatsapp, c.name, 'account'));
  return Object.values(map)
    .map((g) => {
      const names = Object.values(g.names);
      if (names.length < 2) return null;
      const different = names.some((a) => names.some((b) => !sameFirstName(a.name, b.name)));
      return { ...g, names, severity: different ? 'diferente' : 'parecido' };
    })
    .filter(Boolean)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'diferente' ? -1 : 1));
};

// ---- Mesmo nome, WhatsApp diferente (pode ser a mesma pessoa com dois números)
const fullPlain = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const sameNameGroups = (orders, clients = []) => {
  const byPhone = {};
  const add = (whatsapp, name, contact, isAccount) => {
    if (!whatsapp || !fullPlain(name)) return;
    const b = (byPhone[whatsapp] = byPhone[whatsapp] || { whatsapp, name, contact: contact || '', orders: 0, account: false });
    if (isAccount) b.account = true;
    else b.orders++;
    if (!b.contact && contact) b.contact = contact;
  };
  orders.forEach((o) => add(o.whatsapp, o.buyerName, o.contact, false));
  clients.forEach((c) => add(c.whatsapp, c.name, c.contact, true));
  const byName = {};
  Object.values(byPhone).forEach((b) => {
    const key = fullPlain(b.name);
    (byName[key] = byName[key] || []).push(b);
  });
  return Object.entries(byName)
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key: `${key}|${list.map((b) => b.whatsapp).sort().join(',')}`, name: list[0].name, buyers: list }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ---- Descobrir os membros citados no nome de um item ("Jin e Jimin", "V,Yoongi e Nam")
const BTS_ALIASES = {
  RM: ['rm', 'nam', 'namjoon', 'namjoom', 'nan', 'namjun'],
  Jin: ['jin', 'seokjin'],
  Suga: ['suga', 'yoongi', 'yoongio', 'yoogi', 'agust', 'agust d'],
  'J-Hope': ['j-hope', 'jhope', 'j hope', 'hope', 'j-hobe', 'hoseok'],
  Jimin: ['jimin', 'jim'],
  V: ['v', 'tae', 'taehyung'],
  Jungkook: ['jungkook', 'jung kook', 'jk', 'kook']
};

const escapeRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const detectMembers = (name, group = 'BTS') => {
  const text = ` ${String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  const aliases = group === 'BTS' || !GROUPS[group]
    ? BTS_ALIASES
    : Object.fromEntries(GROUPS[group].map((m) => [m, [m.toLowerCase()]]));
  const found = [];
  Object.entries(aliases).forEach(([member, words]) => {
    let first = -1;
    words.forEach((w) => {
      const m = new RegExp(`(^|[^a-z])${escapeRx(w)}(?=[^a-z]|$)`).exec(text);
      if (m && (first === -1 || m.index < first)) first = m.index;
    });
    if (first !== -1) found.push([first, member]);
  });
  return found.sort((a, b) => a[0] - b[0]).map(([, m]) => m);
};

// O que sobra do nome sem os membros (ex.: "Yoongi e Jin Goyang LD" → "Goyang LD")
export const nameWithoutMembers = (name, group = 'BTS') => {
  const aliases = group === 'BTS' || !GROUPS[group] ? Object.values(BTS_ALIASES).flat() : GROUPS[group].map((m) => m.toLowerCase());
  let rest = ` ${String(name || '')} `;
  aliases
    .sort((a, b) => b.length - a.length)
    .forEach((w) => {
      rest = rest.replace(new RegExp(`(^|[^A-Za-zÀ-ÿ])${escapeRx(w)}(?=[^A-Za-zÀ-ÿ]|$)`, 'gi'), '$1');
    });
  return rest.replace(/\s+(e|and|&)\s+/gi, ' ').replace(/[,;/+-]+/g, ' ').replace(/\s+/g, ' ').trim();
};

// ---- Telefone enquanto digita: 11988887777 → (11) 98888-7777
export const phoneDigits = (v) => {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 11);
};

export const formatPhoneTyping = (v) => {
  const d = phoneDigits(v);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
};
