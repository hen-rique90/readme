// Dados de exemplo para o modo demonstração.
const img = (id) => `https://images.unsplash.com/${id}?w=600&auto=format&fit=crop&q=80`;

const PRODUCTS = [
  ['Photocard Jungkook - Golden (Weverse POB)', 'Jungkook', 'Photocards', 95, 3, img('photo-1618005182384-a83a8bd57fbe'), 'CEG #42 - Coreia'],
  ['Álbum Proof (Standard Edition) - Lacrado', 'OT7', 'Álbuns', 340, 4, img('photo-1511671782779-c97d3d27a1d4'), 'CEG #42 - Coreia'],
  ['Vinil LP RM - Indigo (Translucent Blue)', 'RM', 'Vinil', 290, 2, img('photo-1603048588665-791ca8aea617'), 'CEG #42 - Coreia'],
  ['Photocard V - Layover (M2U Lucky Draw)', 'V', 'Photocards', 115, 2, img('photo-1579783902614-a3fb3927b675'), 'CEG #42 - Coreia'],
  ['Lightstick ARMY Bomb Map of the Soul SE', 'OT7', 'Merch/DVD', 380, 5, img('photo-1514525253161-7a46d19cd819'), 'CEG #42 - Coreia'],
  ['Photocard Jimin - MUSE (Soundwave LD)', 'Jimin', 'Photocards', 105, 3, img('photo-1534447677768-be436bb09401'), 'CEG #43 - Japão'],
  ['Agust D D-DAY Guitar Pick Set', 'Suga', 'Merch/DVD', 165, 2, img('photo-1510915361894-db8b60106cb1'), 'CEG #43 - Japão'],
  ['Wootteo x RJ Plush Keyring', 'Jin', 'Merch/DVD', 145, 4, img('photo-1558679908-541bcf1249ff'), 'CEG #43 - Japão'],
  ['Álbum J-Hope - HOPE ON THE STREET Vol.1', 'J-Hope', 'Álbuns', 210, 3, img('photo-1470225620780-dba8ba36b745'), 'CEG #43 - Japão']
];

export function seedDemo(backend, gas, password) {
  backend.call('catalog'); // cria as abas
  const config = gas.state.sheets['Config'];
  const set = (key, value) => {
    const row = config.find((r) => r[0] === key);
    if (row) row[1] = value;
  };
  set('adminPassword', password);
  set('pixKey', 'ceg.cantinhodaarmy@gmail.com');
  set('noticeBanner', '💜 CEG #42 & #43 ABERTAS! Fez o claim, o item já é seu. (Modo demonstração)');

  const admin = (action, params) => backend.call(action, { ...params, password });
  PRODUCTS.forEach(([name, member, category, price, totalStock, image, batch]) => {
    admin('saveProduct', { product: { isNew: true, name, member, category, price, totalStock, image, batch } });
  });

  const claim = (productId, quantity, buyerName, contact, whatsapp) =>
    backend.call('claim', { productId, quantity, buyerName, contact, whatsapp, shipping: 'Guardar na bag' });

  const mari = claim('CEG-01', 1, 'Mariana Silva', '@mari_jk97', '11988887777');
  claim('CEG-02', 1, 'Mariana Silva', '@mari_jk97', '11988887777');
  const bia = claim('CEG-04', 2, 'Beatriz Oliveira', '@bia_tae', '21977776666');
  claim('CEG-05', 1, 'Júlia Santos', '@ju_army', '31966665555');

  if (mari.ok) admin('setChargeStatus', { chargeId: mari.charge.chargeId, status: 'Pago' });
  if (mari.ok) admin('setOrderStatus', { orderId: mari.order.orderId, status: 'Comprado' });
  if (bia.ok) admin('setChargeStatus', { chargeId: bia.charge.chargeId, status: 'Pago' });
  admin('addBatchCharge', { batch: 'CEG #42 - Coreia', description: 'Frete internacional', amountPerUnit: 18 });

  // Guarda um acesso de exemplo para "Meus Pedidos"
  if (mari.ok) {
    try {
      localStorage.setItem('ceg_demo_exemplo', JSON.stringify({ whatsapp: '11988887777', code: mari.order.orderId }));
    } catch { /* ignore */ }
  }
}
