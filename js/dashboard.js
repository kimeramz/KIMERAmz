/* dashboard.js — Dashboard do vendedor totalmente funcional */

let myStoreId = null;
let myStoreData = null;
let allStoreOrders = [];
let currentPeriod = 'month';
let dashboardPollInterval = null;



function isValidatedOrder(order) {
  return order?.payment_status === 'paid';
}

function getAllowedStoreStatusTransitions(currentStatus) {
  const flow = {
    paid: ['paid', 'production'],
    production: ['production', 'shipped'],
    shipped: ['shipped', 'delivered'],
    delivered: ['delivered']
  };

  return flow[currentStatus] || [currentStatus];
}

function getSeenOrdersKey() {
  return `kimera_seen_validated_orders_${myStoreId || 'store'}`;
}

function getNotifiedOrdersKey() {
  return `kimera_notified_validated_orders_${myStoreId || 'store'}`;
}

function getNotifiedValidatedOrders() {
  try {
    return JSON.parse(localStorage.getItem(getNotifiedOrdersKey()) || '[]');
  } catch {
    return [];
  }
}

function saveNotifiedValidatedOrders(ids) {
  localStorage.setItem(getNotifiedOrdersKey(), JSON.stringify(ids));
}

function detectToastNewOrders(orders) {
  const notified = getNotifiedValidatedOrders();
  return orders.filter(o => isValidatedOrder(o) && !notified.includes(o.id));
}

function markOrdersAsNotified(orders) {
  const notified = getNotifiedValidatedOrders();
  const ids = [...new Set([...notified, ...orders.map(o => o.id)])];
  saveNotifiedValidatedOrders(ids);
}

function getSeenValidatedOrders() {
  try {
    return JSON.parse(localStorage.getItem(getSeenOrdersKey()) || '[]');
  } catch {
    return [];
  }
}

function saveSeenValidatedOrders(ids) {
  localStorage.setItem(getSeenOrdersKey(), JSON.stringify(ids));
}

function detectNewValidatedOrders(orders) {
  const seen = getSeenValidatedOrders();
  return orders.filter(o => isValidatedOrder(o) && !seen.includes(o.id));
}

function markOrdersAsSeen(orders) {
  const seen = getSeenValidatedOrders();
  const ids = [...new Set([...seen, ...orders.map(o => o.id)])];
  saveSeenValidatedOrders(ids);
}

function showNewValidatedNotice(orders) {
  const box = document.getElementById('newValidatedNotice');
  const txt = document.getElementById('newValidatedNoticeText');

  if (!box || !txt) return;

  if (!orders.length) {
    box.style.display = 'none';
    return;
  }

  const count = orders.length;
  txt.textContent =
    count === 1
      ? 'Há 1 novo pedido com pagamento confirmado.'
      : `Há ${count} novos pedidos com pagamento confirmado.`;

  box.style.display = 'flex';
}

async function initDashboard() {
  if (!sbCurrentUser()) {
    window.location.href = '/pages/login';
    return;
  }

  if (
    sbCurrentRole() !== KIMERA_CONFIG.roles.STORE_OWNER &&
    sbCurrentRole() !== KIMERA_CONFIG.roles.SUPER_ADMIN
  ) {
    window.location.href = '/pages/login';
    return;
  }

  const user = sbCurrentUser();

  const name = user.user_metadata?.full_name || 'Vendedor';
  document.getElementById('ownerName').textContent = name;
  document.getElementById('ownerAv').textContent = name.slice(0, 2).toUpperCase();

  try {
    const rows = await sbGet('store_users', `?user_id=eq.${user.id}&select=store_id,stores(*)`);
    if (!rows?.length) {
      showToast('Loja não atribuída. Contacte o admin pelo WhatsApp 849368285.', 'error');
      return;
    }

    myStoreId = rows[0].store_id;
    myStoreData = rows[0].stores || null;

    if (!myStoreId || !myStoreData) {
      showToast('Dados da loja não encontrados.', 'error');
      return;
    }

    document.getElementById('storeNameSidebar').textContent = myStoreData.name;

    const av = document.getElementById('storeAvatarSidebar');
    av.textContent = myStoreData.logo_url ? '' : myStoreData.name.slice(0, 2).toUpperCase();
    if (myStoreData.logo_url) {
      av.style.backgroundImage = `url('${myStoreData.logo_url}')`;
    }

    document.getElementById('editLojaName').value = myStoreData.name || '';
    document.getElementById('editLojaDesc').value = myStoreData.description || '';
    document.getElementById('editLojaLocation').value = myStoreData.location || '';

    loadMyStore();
    loadStoreOverview();
  } catch (e) {
    console.error('[Dashboard] initDashboard:', e);
    showToast('Erro ao carregar dashboard da loja.', 'error');
  }
}

async function loadMyStore() {
  try {
    const rows = await sbGet('stores', `?id=eq.${myStoreId}`);
    myStoreData = rows[0];
    if (!myStoreData) return;

    document.getElementById('storeNameSidebar').textContent = myStoreData.name;

    const av = document.getElementById('storeAvatarSidebar');
    av.textContent = myStoreData.logo_url ? '' : myStoreData.name.slice(0, 2).toUpperCase();
    if (myStoreData.logo_url) av.style.backgroundImage = `url('${myStoreData.logo_url}')`;

    document.getElementById('editLojaName').value = myStoreData.name || '';
    document.getElementById('editLojaDesc').value = myStoreData.description || '';
    document.getElementById('editLojaLocation').value = myStoreData.location || '';

    const viewBtn = document.getElementById('viewStoreBtn');
    if (viewBtn) viewBtn.href = `/pages/lojas?store=${myStoreId}`;
  } catch (e) {
    console.error(e);
  }
}

/* ── NAVEGAÇÃO ── */
function toggleSidebar() {
  const s = document.getElementById('adminSidebar');
  const o = document.getElementById('sidebarOverlay');
  const open = s?.classList.contains('open');

  s?.classList.toggle('open', !open);
  o?.classList.toggle('open', !open);
  document.body.classList.toggle('sidebar-open', !open);
}

function closeSidebar() {
  document.getElementById('adminSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

function showDash(id, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const sec = document.getElementById('dash-' + id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');

  const title = document.getElementById('dashTitle');
  if (title) title.textContent = btn?.textContent?.trim() || id;

  const loaders = {
    overview: loadStoreOverview,
    produtos: loadStoreProducts,
    pedidos: loadStoreOrders,
    pagamentos: loadRevenueReport,
    avaliacoes: loadStoreReviews,
    loja: () => { }
  };

  loaders[id]?.();

  if (id === 'pedidos') {
    const newVisibleOrders = allStoreOrders.filter(o => isValidatedOrder(o));
    markOrdersAsSeen(newVisibleOrders);
    showNewValidatedNotice([]);
    loadStoreOverview();
  }

  closeSidebar();
}

function setPeriod(p, btn) {
  currentPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadStoreOverview();
}

/* ── OVERVIEW ── */
async function loadStoreOverview() {
  if (!myStoreId) return;

  try {
    const now = new Date();
    let fromDate;

    if (currentPeriod === 'today') {
      fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (currentPeriod === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      fromDate = d.toISOString();
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    const [orders, products, reviews] = await Promise.all([
      sbGet('orders', `?store_id=eq.${myStoreId}&payment_status=eq.paid&created_at=gte.${fromDate}&select=id,total,status,store_amount,payment_status,created_at,customer_name,order_ref`),
      sbGet('products', `?store_id=eq.${myStoreId}&select=id`),
      sbGet('reviews', `?store_id=eq.${myStoreId}&status=eq.approved&select=rating`)
    ]);

    const validatedOrders = orders.filter(isValidatedOrder);
    const revenue = validatedOrders.reduce((s, o) => s + (o.store_amount || 0), 0);
    const avgRating = reviews.length
      ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : '—';

    const readyToHandle = validatedOrders.filter(o => ['paid', 'production', 'shipped'].includes(o.status)).length;

    document.getElementById('sk-revenue').textContent = fmtMT(revenue);
    document.getElementById('sk-orders').textContent = validatedOrders.length;
    document.getElementById('sk-rating').textContent = avgRating + (reviews.length ? ' ★' : '');
    document.getElementById('sk-products').textContent = products.length;
    document.getElementById('ordersBadge').textContent = readyToHandle;

    const recent = await sbGet('orders', `?store_id=eq.${myStoreId}&payment_status=eq.paid&order=created_at.desc&limit=5&select=*`);
    renderRecentStoreOrders(recent);

    const newOrders = detectNewValidatedOrders(recent);
    showNewValidatedNotice(newOrders);

    if (newOrders.length) {
      showToast(
        newOrders.length === 1
          ? '1 novo pedido foi validado para a sua loja.'
          : `${newOrders.length} novos pedidos foram validados para a sua loja.`,
        'info'
      );
    }

  } catch (e) {
    console.error(e);
  }
}

function renderRecentStoreOrders(orders) {
  const el = document.getElementById('recentStoreOrders');
  if (!el) return;

  if (!orders.length) {
    el.innerHTML = '<p style="padding:16px;color:#9E9E9E;">Sem pedidos validados ainda.</p>';
    return;
  }

  const seen = getSeenValidatedOrders();

  el.innerHTML = `<div class="admin-table-wrap" style="border:none;">
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Cliente</th>
          <th>Total</th>
          <th>Meu valor</th>
          <th>Estado</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>${orders.map(o => {
    const isNew = isValidatedOrder(o) && !seen.includes(o.id);
    return `<tr style="${isNew ? 'background:#F0FDF4;' : ''}">
          <td class="order-id">
            ${o.order_ref}
            ${isNew ? '<span style="margin-left:6px;font-size:10px;background:#16A34A;color:#fff;padding:2px 6px;border-radius:999px;">NOVO</span>' : ''}
          </td>
          <td>${o.customer_name || '—'}</td>
          <td>${fmtMT(o.total || 0)}</td>
          <td style="color:#16A34A;font-weight:700;">${fmtMT(o.store_amount || 0)}</td>
          <td><span class="status-pill ${o.status}">${o.status}</span></td>
          <td>${new Date(o.created_at).toLocaleDateString('pt-MZ')}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>
  </div>`;
}

function parseColorsInput(raw = '') {
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^(#[0-9A-Fa-f]{6})(?:\(([^)]+)\))?$/);

      if (!m) {
        return {
          hex: entry,
          name: entry
        };
      }

      return {
        hex: m[1],
        name: (m[2] || m[1]).trim()
      };
    });
}

function colorsToInput(colors = []) {
  return colors.map(c => {
    if (typeof c === 'string') return c;
    return `${c.hex}${c.name && c.name !== c.hex ? `(${c.name})` : ''}`;
  }).join(',');
}

/* ── PRODUTOS ── */
async function loadStoreProducts() {
  if (!myStoreId) return;
  const wrap = document.getElementById('storeProdTable');

  try {
    const products = await sbGet('products', `?store_id=eq.${myStoreId}&order=created_at.desc`);
    if (!products.length) {
      wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem produtos. Crie o primeiro!</p>';
      return;
    }

    wrap.innerHTML = `<table class="admin-table">
      <thead><tr><th>Produto</th><th>Preço</th><th>Stock</th><th>Destaque</th><th>Estado</th><th>Acções</th></tr></thead>
      <tbody>${products.map(p => `<tr>
        <td><div class="td-product">
          <div class="td-img">${p.thumbnail_url ? `<img src="${p.thumbnail_url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '<div style="width:100%;height:100%;background:#eee;border-radius:6px;"></div>'}</div>
          <span>${p.name}</span></div></td>
        <td>${fmtMT(p.price)}</td>
        <td>${p.stock > 5 ? `<span class="stock-ok">${p.stock}</span>` : p.stock > 0 ? `<span class="stock-low">${p.stock}</span>` : '<span class="stock-out">0</span>'}</td>
        <td>${p.is_featured ? '⭐' : ''}</td>
        <td><span class="status-pill ${p.is_active ? 'paid' : 'pending'}">${p.is_active ? 'Activo' : 'Inactivo'}</span></td>
        <td><div class="td-actions">
          <button class="act-btn edit" onclick="editProduto('${p.id}')">Editar</button>
          <button class="act-btn ${p.is_active ? 'del' : 'edit'}" onclick="toggleProduct('${p.id}',${!p.is_active})">${p.is_active ? 'Desact.' : 'Activar'}</button>
          <button class="act-btn del" onclick="deleteProduto('${p.id}')">Apagar</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar produtos.</p>';
  }
}

const COLOR_PRESET = {
  '#000000': 'Preto',
  '#111111': 'Preto',
  '#FFFFFF': 'Branco',
  '#F5F5F5': 'Branco',
  '#FF0000': 'Vermelho',
  '#E53935': 'Vermelho',
  '#0000FF': 'Azul',
  '#1D4ED8': 'Azul',
  '#008000': 'Verde',
  '#16A34A': 'Verde',
  '#FFFF00': 'Amarelo',
  '#F59E0B': 'Amarelo',
  '#FFA500': 'Laranja',
  '#FF6F00': 'Laranja',
  '#FFC0CB': 'Rosa',
  '#800080': 'Roxo',
  '#808080': 'Cinza',
  '#964B00': 'Castanho',
  '#A52A2A': 'Castanho',
  '#F5F5DC': 'Bege'
};

function isLightPresetColor(hex = '') {
  const value = String(hex || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return false;

  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);

  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 200;
}

function syncHiddenProductColorsInput() {
  const selected = Array.from(document.querySelectorAll('.vendor-color-chip.active'))
    .map(btn => ({
      name: btn.dataset.name,
      hex: btn.dataset.hex
    }));

  const input = document.getElementById('prodColors');
  if (input) input.value = JSON.stringify(selected);

  generateVariantsMatrix();
}

function renderProductColorPresetPicker(selectedColors = []) {
  const wrap = document.getElementById('prodColorPresetList');
  if (!wrap) return;

  const selectedHexes = (selectedColors || [])
    .map(c => {
      if (typeof c === 'string') {
        const m = c.match(/^(#[0-9A-Fa-f]{6})/);
        return m ? m[1].toUpperCase() : c.toUpperCase();
      }

      return String(c?.hex || '').toUpperCase();
    })
    .filter(Boolean);

  wrap.innerHTML = Object.entries(COLOR_PRESET).map(([hex, name]) => `
    <button
      type="button"
      class="vendor-color-chip ${selectedHexes.includes(hex.toUpperCase()) ? 'active' : ''} ${isLightPresetColor(hex) ? 'light' : ''}"
      data-hex="${hex}"
      data-name="${name}"
      onclick="toggleVendorColor(this)">
      <span class="vendor-color-swatch" style="background:${hex};"></span>
      <span class="vendor-color-label">${name}</span>
    </button>
  `).join('');

  syncHiddenProductColorsInput();
}

function toggleVendorColor(btn) {
  btn.classList.toggle('active');
  syncHiddenProductColorsInput();
}

function normalizeInputText(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function injectSoftBreaks(text = '', every = 12) {
  const clean = normalizeInputText(text);

  return clean.replace(
    new RegExp(`([^\\s-]{${every}})(?=[^\\s-])`, 'g'),
    '$1\u200B'
  );
}

function sanitizeSellerDescription(text = '', max = 180) {
  const clean = normalizeInputText(text);

  if (!clean) return '';

  const limited = clean.length > max
    ? clean.slice(0, max).trim()
    : clean;

  return injectSoftBreaks(limited);
}

//INICIA O CAMPO DE PRODUTO LIMPO

function openNovoProduto() {
  document.getElementById('prodEditId').value = '';
  document.getElementById('prodName').value = '';
  document.getElementById('prodPrice').value = '';
  document.getElementById('prodOrigPrice').value = '';
  document.getElementById('prodStock').value = '';
  document.getElementById('prodDesc').value = '';
  document.getElementById('prodCategory').value = '';
  document.getElementById('prodSizes').value = '';
  document.getElementById('prodColors').value = '[]';
document.getElementById('prodVariants').value = '[]';
  document.getElementById('prodDiscount').value = '';
  document.getElementById('prodFeatured').checked = false;
  document.getElementById('prodIsNew').checked = true;
  generateVariantsMatrix();

  const mainInput = document.getElementById('prodMainImg');
  const galleryInput = document.getElementById('prodGallery');
  if (mainInput) mainInput.value = '';
  if (galleryInput) galleryInput.value = '';

  const cropImg = document.getElementById('mainImgCropImg');
  const editor = document.getElementById('mainImgEditor');
  const zone = document.getElementById('mainImgZone');

  if (cropImg) cropImg.src = '';
  if (editor) editor.style.display = 'none';
  if (zone) zone.style.display = 'block';

  renderProductColorPresetPicker([]);

  document.getElementById('prodModalTitle').textContent = 'Novo Produto';
  openModal('modalProduto');
}

/* ── SALVAR PRODUTO ── */
async function saveProduto() {
  if (!myStoreId) {
    showToast('Loja não identificada.', 'error');
    return;
  }

  const id = document.getElementById('prodEditId').value.trim();
  const name = document.getElementById('prodName').value.trim();
  const price = parseFloat(document.getElementById('prodPrice').value);

  const variants = getVariantsFromHidden();
  const totalStock = variants.reduce((sum, v) => sum + Math.max(0, parseInt(v.stock || 0, 10)), 0);
  const selectedColors = parseSelectedColorsInput();

  if (!name || !price) {
    showToast('Nome e preço obrigatórios.', 'error');
    return;
  }

  const mainFile = document.getElementById('prodMainImg').files[0];
  const galleryFiles = Array.from(document.getElementById('prodGallery').files || []);
  const existingThumb = document.getElementById('mainImgCropImg')?.src || '';

  let thumbnail_url = '';
  let gallery_urls = [];

  try {
    if (mainFile) {
      thumbnail_url = await sbUpload('products', `${myStoreId}/${Date.now()}_${mainFile.name}`, mainFile);
    }

    for (const f of galleryFiles) {
      const url = await sbUpload('products', `${myStoreId}/gallery/${Date.now()}_${f.name}`, f);
      gallery_urls.push(url);
    }

    const payload = {
      store_id: myStoreId,
      store_name: myStoreData?.name || '',
      name,
      price,
      variants: variants,
      stock: totalStock,
      original_price: parseFloat(document.getElementById('prodOrigPrice').value || price) || price,
      category: document.getElementById('prodCategory').value || '',
      discount_pct: parseInt(document.getElementById('prodDiscount').value || '0', 10) || 0,
      description: sanitizeSellerDescription (document.getElementById('prodDesc').value,220),
      sizes: document.getElementById('prodSizes').value.split(',').map(s => s.trim()).filter(Boolean),
      colors: selectedColors,
      is_featured: document.getElementById('prodFeatured').checked,
      is_new: document.getElementById('prodIsNew').checked,
      is_active: true,
      thumbnail_url: thumbnail_url || existingThumb || ''
    };

    if (gallery_urls.length) {
      payload.gallery_urls = gallery_urls;
    }

    let savedRows;

    if (id) {
      console.log('[PRODUTO] MODO EDIÇÃO', { id, payload });
      savedRows = await sbPatch('products', id, payload);
    } else {
      payload.created_at = new Date().toISOString();
      payload.sales_count = 0;
      payload.review_count = 0;
      payload.rating = 0;

      console.log('[PRODUTO] MODO CRIAÇÃO', { payload });
      savedRows = await sbPost('products', payload);
    }

    console.log('[PRODUTO] RESPOSTA DO SUPABASE', savedRows);

    const savedId = savedRows?.[0]?.id || id;
    if (!savedId) {
      throw new Error('Supabase não devolveu ID do produto.');
    }

    const confirmRows = await sbGet('products', `?id=eq.${savedId}`);
    console.log('[PRODUTO] CONFIRMAÇÃO NO BANCO', confirmRows);

    showToast(id ? 'Produto actualizado!' : 'Produto criado!');
    closeModal('modalProduto');

    await loadStoreProducts();
    await loadStoreOverview();
  } catch (e) {
    console.error('[PRODUTO] ERRO saveProduto:', e);
    showToast('Erro: ' + (e.message || 'desconhecido'), 'error');
  }
}

async function editProduto(id) {
  const rows = await sbGet('products', `?id=eq.${id}`);
  const p = rows[0];
  if (!p) return;

  document.getElementById('prodEditId').value = p.id;
  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodPrice').value = p.price || '';
  document.getElementById('prodOrigPrice').value = p.original_price || '';
  document.getElementById('prodStock').value = p.stock || '';
  document.getElementById('prodDesc').value = p.description || '';
  document.getElementById('prodCategory').value = p.category || '';
  document.getElementById('prodSizes').value = (p.sizes || []).join(',');
  document.getElementById('prodColors').value = JSON.stringify(
    (p.colors || []).map(c => ({
      name: c.name || c.color_name || '',
      hex: c.hex || c.color_hex || ''
    }))
  );
  document.getElementById('prodVariants').value = JSON.stringify(p.variants || []);
  document.getElementById('prodDiscount').value = p.discount_pct || '';
  document.getElementById('prodFeatured').checked = !!p.is_featured;
  document.getElementById('prodIsNew').checked = !!p.is_new;

  renderProductColorPresetPicker(p.colors || []);
  generateVariantsMatrix();

  if (p.thumbnail_url) {
    const img = document.getElementById('mainImgCropImg');
    img.src = p.thumbnail_url;
    document.getElementById('mainImgEditor').style.display = 'block';
    document.getElementById('mainImgZone').style.display = 'none';
  }

  document.getElementById('prodModalTitle').textContent = 'Editar Produto';
  openModal('modalProduto');
}

async function toggleProduct(id, status) {
  await sbPatch('products', id, { is_active: status });
  showToast(status ? 'Produto activado!' : 'Produto desactivado.', 'info');
  loadStoreProducts();
}

async function deleteProduto(id) {
  if (!confirm('Apagar produto?')) return;
  await sbDelete('products', id);
  showToast('Produto apagado.');
  loadStoreProducts();
}

/* ── PEDIDOS DA LOJA ── */
async function loadStoreOrders(silent = false) {
  if (!myStoreId) return;

  const wrap = document.getElementById('storeOrdersTable');
  if (!wrap) return;

  if (!silent) {
    wrap.innerHTML = '<p style="padding:20px;text-align:center;"><div class="loading-spinner"></div></p>';
  }

  try {
    const rows = await sbGet(
      'orders',
      `?store_id=eq.${myStoreId}&payment_status=eq.paid&order=created_at.desc&select=*`
    );

    const oldJson = JSON.stringify(allStoreOrders || []);
    const newJson = JSON.stringify(rows || []);

    if (silent && oldJson === newJson) {
      return;
    }

    allStoreOrders = rows || [];
    renderStoreOrdersTable(allStoreOrders);
  } catch (e) {
    console.error('[Dashboard] loadStoreOrders:', e);

    if (!silent) {
      wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar pedidos.</p>';
    }
  }
}



async function pollValidatedOrders() {
  if (!myStoreId) return;

  try {
    const freshOrders = await sbGet(
      'orders',
      `?store_id=eq.${myStoreId}&payment_status=eq.paid&order=created_at.desc&select=*`
    );

    allStoreOrders = freshOrders || [];

    const recent = allStoreOrders.slice(0, 5);
    renderRecentStoreOrders(recent);

    const readyToHandle = allStoreOrders.filter(o =>
      ['paid', 'production', 'shipped'].includes(o.status)
    ).length;

    const ordersBadge = document.getElementById('ordersBadge');
    if (ordersBadge) ordersBadge.textContent = readyToHandle;

    const unseenOrders = detectNewValidatedOrders(allStoreOrders);
    showNewValidatedNotice(unseenOrders);

    const toastOrders = detectToastNewOrders(allStoreOrders);
    if (toastOrders.length) {
      markOrdersAsNotified(toastOrders);

      showToast(
        toastOrders.length === 1
          ? 'Entrou 1 novo pedido validado.'
          : `Entraram ${toastOrders.length} novos pedidos validados.`,
        'info'
      );
    }

    const pedidosSection = document.getElementById('dash-pedidos');
    if (pedidosSection?.classList.contains('active')) {
      renderStoreOrdersTable(allStoreOrders);
    }

    const overviewSection = document.getElementById('dash-overview');
    if (overviewSection?.classList.contains('active')) {
      const revenue = allStoreOrders.reduce((s, o) => s + (o.store_amount || 0), 0);
      const skRevenue = document.getElementById('sk-revenue');
      const skOrders = document.getElementById('sk-orders');

      if (skRevenue) skRevenue.textContent = fmtMT(revenue);
      if (skOrders) skOrders.textContent = allStoreOrders.length;
    }

  } catch (e) {
    console.error('[Dashboard] polling error:', e);
  }
}

function startDashboardPolling() {
  stopDashboardPolling();

  dashboardPollInterval = setInterval(() => {
    pollValidatedOrders();
  }, 25000);
}

function stopDashboardPolling() {
  if (dashboardPollInterval) {
    clearInterval(dashboardPollInterval);
    dashboardPollInterval = null;
  }
}

/*Estas funções:
	•	leem tamanhos
	•	leem cores selecionadas
	•	geram variantes
	•	preservam stock já preenchido
	•	recalculam stock total */

  function parseSizesInput(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function parseSelectedColorsInput() {
  const raw = document.getElementById('prodColors')?.value || '[]';

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(c => ({
        name: c.name || c.color_name || '',
        hex: c.hex || c.color_hex || ''
      })).filter(c => c.name);
    }
  } catch {}

  return [];
}

function getVariantsFromHidden() {
  const raw = document.getElementById('prodVariants')?.value || '[]';

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildVariantKey(colorName, size) {
  return `${colorName}__${size}`;
}

function generateVariantsMatrix() {
  const sizes = parseSizesInput(document.getElementById('prodSizes')?.value || '');
  const colors = parseSelectedColorsInput();
  const oldVariants = getVariantsFromHidden();

  const variantsMap = {};
  oldVariants.forEach(v => {
    variantsMap[buildVariantKey(v.color_name, v.size)] = v;
  });

  const variants = [];

  for (const color of colors) {
    for (const size of sizes) {
      const key = buildVariantKey(color.name, size);
      const existing = variantsMap[key];

      variants.push({
        color_name: color.name,
        color_hex: color.hex,
        size,
        stock: existing ? parseInt(existing.stock || 0, 10) : 0
      });
    }
  }

  const hidden = document.getElementById('prodVariants');
  if (hidden) hidden.value = JSON.stringify(variants);

  renderVariantsTable(variants);
  syncTotalStockFromVariants();
}

function renderVariantsTable(variants = []) {
  const wrap = document.getElementById('prodVariantsWrap');
  const table = document.getElementById('prodVariantsTable');

  if (!wrap || !table) return;

  if (!variants.length) {
    wrap.style.display = 'none';
    table.innerHTML = '';
    return;
  }

  wrap.style.display = 'block';

  table.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Cor</th>
          <th>Tamanho</th>
          <th>Stock</th>
        </tr>
      </thead>
      <tbody>
        ${variants.map((v, i) => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="width:14px;height:14px;border-radius:50%;background:${v.color_hex || '#ddd'};border:1px solid #ccc;display:inline-block;"></span>
                <span>${v.color_name}</span>
              </div>
            </td>
            <td>${v.size}</td>
            <td>
              <input
                type="number"
                min="0"
                value="${parseInt(v.stock || 0, 10)}"
                style="width:90px;height:38px;padding:0 10px;border:1px solid #ddd;border-radius:8px;"
                oninput="updateVariantStock(${i}, this.value)"
              />
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

}

function updateVariantStock(index, value) {
  const variants = getVariantsFromHidden();
  if (!variants[index]) return;

  variants[index].stock = Math.max(0, parseInt(value || 0, 10));

  const hidden = document.getElementById('prodVariants');
  if (hidden) hidden.value = JSON.stringify(variants);

  syncTotalStockFromVariants();
}

function syncTotalStockFromVariants() {
  const variants = getVariantsFromHidden();
  const total = variants.reduce((sum, v) => sum + Math.max(0, parseInt(v.stock || 0, 10)), 0);

  const stockInput = document.getElementById('prodStock');
  if (stockInput) stockInput.value = total;
}


function filterStoreOrders(status, btn) {
  document.querySelectorAll('.otab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const filtered = status === 'all'
    ? allStoreOrders
    : allStoreOrders.filter(o => o.status === status);

  renderStoreOrdersTable(filtered);
}

function normalizeStoreOrderItem(item = {}) {
  if (typeof normalizeCartItem === 'function') {
    return normalizeCartItem(item);
  }

  return {
    product_id: item.product_id || item.id || null,
    name: item.name || 'Produto',
    quantity: parseInt(item.quantity || 1, 10),
    price: Number(item.price || 0),
    size: item.size || '',
    color_name: item.color_name || '',
    color_hex: item.color_hex || '',
    thumbnail_url: item.thumbnail_url || item.thumbnail || ''
  };
}

function renderStoreOrderItemsCompact(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '—';
  }

  return items.map(rawItem => {
    const item = normalizeStoreOrderItem(rawItem);
    const meta = [
      `Qtd: ${item.quantity || 1}`,
      item.size ? `Tam: ${item.size}` : '',
      item.color_name ? `Cor: ${item.color_name}` : ''
    ].filter(Boolean).join(' | ');

    return `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;min-width:220px;">
        <div style="width:38px;height:38px;border-radius:8px;overflow:hidden;background:#f3f3f3;flex-shrink:0;">
          ${item.thumbnail_url
        ? `<img src="${item.thumbnail_url}" alt="${item.name || 'Produto'}" style="width:100%;height:100%;object-fit:cover;">`
        : '<div style="width:100%;height:100%;background:#eee;"></div>'}
        </div>
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:12px;color:#111;line-height:1.3;">${item.name || 'Produto'}</div>
          <div style="font-size:11px;color:#666;line-height:1.35;">
            ${meta}
            ${item.color_hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color_hex};border:1px solid #ddd;margin-left:5px;vertical-align:-1px;"></span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function updateStoreOrderStatus(id, selectEl) {
  const newStatus = selectEl.value;
  const order = allStoreOrders.find(o => o.id === id);

  if (!order) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const allowed = getAllowedStoreStatusTransitions(order.status);
  if (!allowed.includes(newStatus)) {
    showToast('Transição de estado inválida.', 'error');
    selectEl.value = order.status;
    return;
  }

  try {
    await sbPatch('orders', id, { status: newStatus });

    order.status = newStatus;

    showToast('Estado do pedido actualizado!');

    if (newStatus === 'delivered') {
      showToast('Pedido marcado como entregue.', 'info');
    }

    renderStoreOrdersTable(allStoreOrders);
    renderRecentStoreOrders(allStoreOrders.slice(0, 5));
    loadRevenueReport();
  } catch (e) {
    console.error('[Dashboard] updateStoreOrderStatus:', e);
    showToast('Erro ao actualizar estado.', 'error');
    selectEl.value = order.status;
  }
}

function renderStoreOrdersTable(orders) {
  const wrap = document.getElementById('storeOrdersTable');

  if (!orders.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem pedidos com pagamento validado.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Cliente</th>
          <th>Contacto</th>
          <th>Produtos</th>
          <th>Total</th>
          <th>Meu valor</th>
          <th>Estado</th>
          <th>Actualizar</th>
          <th>Acção</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => {
    const allowedStatuses = getAllowedStoreStatusTransitions(o.status);

    return `
            <tr>
              <td class="order-id">${o.order_ref}</td>
              <td>${o.customer_name || '—'}</td>
              <td>${o.customer_phone || '—'}</td>
              <td>${renderStoreOrderItemsCompact(o.items)}</td>
              <td>${fmtMT(o.total || 0)}</td>
              <td style="color:#16A34A;font-weight:700;">${fmtMT(o.store_amount || 0)}</td>
              <td><span class="status-pill ${o.status}">${o.status}</span></td>
              <td>
                <select class="status-select" onchange="updateStoreOrderStatus('${o.id}', this)">
                  ${allowedStatuses.map(status => `
                    <option value="${status}" ${o.status === status ? 'selected' : ''}>${status}</option>
                  `).join('')}
                </select>
              </td>
              <td>
              <button class="act-btn edit" onclick="viewStoreOrder('${o.id}')">Ver</button>
              </td>
            </tr>
          `;
  }).join('')}
      </tbody>
    </table>
  `;
}

/* ── RECEITAS ── */
async function loadRevenueReport() {
  if (!myStoreId) return;
  const el = document.getElementById('revenueTable');

  try {
    const orders = await sbGet(
      'orders',
      `?store_id=eq.${myStoreId}&payment_status=eq.paid&status=in.(paid,production,shipped,delivered)&order=created_at.desc&select=*`
    );

    const pending = orders.filter(o => !o.store_payout_done);
    const paid = orders.filter(o => o.store_payout_done);

    el.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:20px;">
        <div class="kpi-card">
          <div class="kpi-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Total a Receber</span>
            <span class="kpi-value">${fmtMT(pending.reduce((s, o) => s + (o.store_amount || 0), 0))}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Já Recebido</span>
            <span class="kpi-value">${fmtMT(paid.reduce((s, o) => s + (o.store_amount || 0), 0))}</span>
          </div>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Comissão (8%)</th>
              <th>Meu valor (92%)</th>
              <th>Estado Repasse</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td class="order-id">${o.order_ref}</td>
                <td style="color:#E53935;">${fmtMT(o.commission_amount || 0)}</td>
                <td style="color:#16A34A;font-weight:700;">${fmtMT(o.store_amount || 0)}</td>
                <td>
                  <span class="status-pill ${o.store_payout_done ? 'paid' : 'pending'}">
                    ${o.store_payout_done ? 'Repassado' : 'Pendente'}
                  </span>
                </td>
                <td>${fmtDate(o.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    console.error('[Dashboard] loadRevenueReport:', e);
    el.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar receitas.</p>';
  }
}

function renderStoreOrderItemsDetailed(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#9E9E9E;">Sem itens.</p>';
  }

  return items.map(rawItem => {
    const item = normalizeStoreOrderItem(rawItem);

    return `
    <div style="display:flex;gap:14px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #f1f1f1;">
      <div style="width:64px;height:64px;border-radius:10px;overflow:hidden;background:#f5f5f5;flex-shrink:0;">
        ${item.thumbnail_url
      ? `<img src="${item.thumbnail_url}" alt="${item.name || 'Produto'}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#eee;">
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
                 <rect x="3" y="3" width="18" height="18" rx="2"/>
                 <circle cx="8.5" cy="8.5" r="1.5"/>
                 <polyline points="21 15 16 10 5 21"/>
               </svg>
             </div>`
    }
      </div>

      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:800;color:#111;margin-bottom:4px;">
          ${item.name || 'Produto'}
        </div>

        <div style="font-size:13px;color:#666;line-height:1.6;">
          <div><strong>Quantidade:</strong> ${item.quantity || 1}</div>
          ${item.size ? `<div><strong>Tamanho:</strong> ${item.size}</div>` : ''}
          ${(item.color_name || item.color_hex) ? `<div><strong>Cor:</strong> ${item.color_name || ''} ${item.color_hex ? `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${item.color_hex};border:1px solid #ddd;margin-left:6px;vertical-align:-1px;"></span>` : ''}</div>` : ''}
        </div>
      </div>
    </div>
  `;
  }).join('');
}

function viewStoreOrder(id) {
  const o = allStoreOrders.find(x => x.id === id);
  if (!o) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const body = document.getElementById('modalStoreOrderViewBody');
  if (!body) return;

  const address = o.delivery_address || {};
  const itemsHtml = renderStoreOrderItemsDetailed(o.items);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Informações da Encomenda</h4>
        <p style="margin:0 0 8px;"><strong>Master Ref:</strong> ${o.master_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Order Ref:</strong> ${o.order_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Loja:</strong> ${o.store_name || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Estado:</strong> ${o.status || '—'}</p>
        <p style="margin:0;"><strong>Data:</strong> ${fmtDate(o.created_at)}</p>
      </div>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Cliente</h4>
        <p style="margin:0 0 8px;"><strong>Nome:</strong> ${o.customer_name || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Contacto:</strong> ${o.customer_phone || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Província / Bairro:</strong> ${address.province || '—'}</p>
        <p style="margin:0;"><strong>Referência / Extra:</strong> ${address.extra || '—'}</p>
      </div>
    </div>

    <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;margin-bottom:20px;">
      <h4 style="margin:0 0 12px;font-size:16px;">Resumo Operacional</h4>
      <p style="margin:0 0 8px;"><strong>Tracking / Ref:</strong> ${o.order_ref || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Pagamento:</strong> ${o.payment_status || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Meu valor:</strong> ${fmtMT(o.store_amount || 0)}</p>
      <p style="margin:0;"><strong>Repasse:</strong> ${o.store_payout_done ? 'Concluído' : 'Pendente'}</p>
    </div>

    <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
      <h4 style="margin:0 0 14px;font-size:16px;">Itens Comprados</h4>
      ${itemsHtml}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">
      <button class="btn btn-outline" onclick="notifyAdminAboutOrder('${o.id}')">Notificar Admin</button>
    </div>
  `;

  openModal('modalStoreOrderView');
}

function notifyAdminAboutOrder(id) {
  const o = allStoreOrders.find(x => x.id === id);
  if (!o) return;

  const adminPhone = '258849368285';

  const msg =
    `Olá Admin.%0A%0A` +
    `Preciso de apoio numa encomenda da loja.%0A%0A` +
    `Ref: ${o.order_ref || '—'}%0A` +
    `Cliente: ${o.customer_name || '—'}%0A` +
    `Loja: ${o.store_name || '—'}%0A` +
    `Estado atual: ${o.status || '—'}%0A%0A` +
    `Peço apoio para atualização/comunicação com o cliente.%0A%0A` +
    `Tracking: ${o.order_ref || '—'}`;

  window.open(`https://wa.me/${adminPhone}?text=${msg}`, '_blank');
}

/* ── AVALIAÇÕES ── */
async function loadStoreReviews() {
  if (!myStoreId) return;
  const el = document.getElementById('storeReviewsList');

  try {
    const reviews = await sbGet('reviews', `?store_id=eq.${myStoreId}&order=created_at.desc`);
    if (!reviews.length) {
      el.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem avaliações ainda.</p>';
      return;
    }

    el.innerHTML = reviews.map(r => `<div class="review-card" style="margin-bottom:16px;">
      <div class="review-header"><div class="client-av">${(r.author_name || '?').slice(0, 2).toUpperCase()}</div>
        <div><p class="review-author">${r.author_name || 'Anónimo'}</p><div class="stars">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</div></div>
        <span class="review-date" style="margin-left:auto;">${new Date(r.created_at).toLocaleDateString('pt-MZ')}</span>
        <span class="status-pill ${r.status === 'approved' ? 'paid' : 'pending'}">${r.status}</span>
      </div>
      <p class="review-text">"${r.text}"</p>
    </div>`).join('');
  } catch {
    el.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro.</p>';
  }
}

/* ── EDITAR LOJA ── */
async function saveMyLoja() {
  if (!myStoreId) return;

  const logoFile = document.getElementById('editLojaLogo').files[0];
  const bannerFile = document.getElementById('editLojaBanner').files[0];
  let logo_url = '', banner_url = '';

  try {
    if (logoFile) logo_url = await sbUpload('stores', `logos/${myStoreId}_${Date.now()}`, logoFile);
    if (bannerFile) banner_url = await sbUpload('stores', `banners/${myStoreId}_${Date.now()}`, bannerFile);

    const payload = {
      name: document.getElementById('editLojaName').value,
      description: sanitizeSellerDescription(document.getElementById('editLojaDesc').value, 180),
      location: document.getElementById('editLojaLocation').value,
      ...(logo_url && { logo_url }),
      ...(banner_url && { banner_url })
    };

    await sbPatch('stores', myStoreId, payload);
    showToast('Loja actualizada!');
    await loadMyStore();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

/* ── IMAGENS / EDITOR ── */
function loadImageEditor(input, editorId, zoneId) {
  const file = input.files[0];
  if (!file) return;

  const img = document.getElementById(editorId.replace('Editor', 'CropImg') || 'mainImgCropImg');
  img.src = URL.createObjectURL(file);
  document.getElementById(editorId).style.display = 'block';
  document.getElementById(zoneId).style.display = 'none';
}

function applyZoom(imgId, zoom) {
  const img = document.getElementById(imgId);
  if (img) img.style.transform = `scale(${zoom / 100})`;
}

function resetImg(inputId, editorId, zoneId) {
  document.getElementById(inputId).value = '';
  document.getElementById(editorId).style.display = 'none';
  document.getElementById(zoneId).style.display = 'flex';
}

function previewGallery(input) {
  const wrap = document.getElementById('galleryPreview');
  wrap.innerHTML = '';

  Array.from(input.files).forEach(f => {
    const url = URL.createObjectURL(f);
    wrap.innerHTML += `<div style="position:relative;width:72px;"><img src="${url}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;"><button onclick="this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#E53935;color:white;border:none;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;">✕</button></div>`;
  });
}

function previewEditImg(inputId, labelId, previewId) {
  const file = document.getElementById(inputId).files[0];
  if (!file) return;

  document.getElementById(labelId).textContent = file.name;
  const img = document.getElementById(previewId);
  img.src = URL.createObjectURL(file);
  img.style.display = 'block';
}

/* ── MODAIS ── */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById('prodEditId') && (document.getElementById('prodEditId').value = '');
  document.getElementById('mainImgEditor') && (document.getElementById('mainImgEditor').style.display = 'none');
  document.getElementById('mainImgZone') && (document.getElementById('mainImgZone').style.display = 'flex');
  document.getElementById('galleryPreview') && (document.getElementById('galleryPreview').innerHTML = '');
  document.querySelectorAll('#modalProduto input[type=text],#modalProduto input[type=number],#modalProduto textarea').forEach(f => f.value = '');
  document.getElementById('prodModalTitle') && (document.getElementById('prodModalTitle').textContent = 'Novo Produto');
}

document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => {
    if (e.target === o) closeSidebar();
    if (e.target === o) o.classList.remove('open');
  })
);

function doLogout() {
  localStorage.removeItem('kimeraToken');
  localStorage.removeItem('kimeraUser');
  window.location.href = '/pages/login';
}

document.addEventListener('DOMContentLoaded', async () => {
  await initDashboard();

  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopDashboardPolling();
    } else {
      pollValidatedOrders();
      startDashboardPolling();
    }
  });

  startDashboardPolling();
});
