// Mapa "aba da planilha" → "tabela do Supabase".
// Cada coluna da aba vira uma coluna de texto com o nome simplificado
// (ex.: "Preço Unit. (R$)" → preco_unit_rs). A primeira coluna é a chave.

export const TABLES = {
  config: 'config',
  products: 'produtos',
  orders: 'pedidos',
  charges: 'cobrancas',
  clients: 'clientes',
  requests: 'solicitacoes',
  addresses: 'enderecos',
  shipments: 'envios'
};

export const slug = (header) =>
  String(header)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'coluna';

export function columnsOf(headers) {
  const seen = {};
  return headers.map((h) => {
    let c = slug(h);
    if (c === 'pos') c = 'pos_';
    seen[c] = (seen[c] || 0) + 1;
    return seen[c] > 1 ? `${c}_${seen[c]}` : c;
  });
}

// Valor de célula → texto guardado no banco (datas em ISO)
export const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
};
