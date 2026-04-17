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
    loja: () => {}
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

/* ── SALVAR PRODUTO ── */
async function saveProduto() {
  if (!myStoreId) return;

  const id = document.getElementById('prodEditId').value;
  const name = document.getElementById('prodName').value.trim();
  const price = parseFloat(document.getElementById('prodPrice').value);

  if (!name || !price) {
    showToast('Nome e preço obrigatórios.', 'error');
    return;
  }

  const mainFile = document.getElementById('prodMainImg').files[0];
  const galleryFiles = Array.from(document.getElementById('prodGallery').files);
  let thumbnail_url = '', gallery_urls = [];

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
      stock: parseInt(document.getElementById('prodStock').value) || 0,
      original_price: parseFloat(document.getElementById('prodOrigPrice').value) || price,
      category: document.getElementById('prodCategory').value,
      discount_pct: parseInt(document.getElementById('prodDiscount').value) || 0,
      description: document.getElementById('prodDesc').value,
      sizes: document.getElementById('prodSizes').value.split(',').map(s => s.trim()).filter(Boolean),
      colors: document.getElementById('prodColors').value.split(',').map(s => s.trim()).filter(Boolean),
      is_featured: document.getElementById('prodFeatured').checked,
      is_new: document.getElementById('prodIsNew').checked,
      is_active: true,
      ...(thumbnail_url && { thumbnail_url }),
      ...(gallery_urls.length && { gallery_urls })
    };

    if (id) await sbPatch('products', id, payload);
    else await sbPost('products', payload);

    showToast(id ? 'Produto actualizado!' : 'Produto criado!');
    closeModal('modalProduto');
    loadStoreProducts();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
    console.error(e);
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
  document.getElementById('prodSizes').value = (p.sizes || []).join(',');
  document.getElementById('prodColors').value = (p.colors || []).join(',');
  document.getElementById('prodDiscount').value = p.discount_pct || '';
  document.getElementById('prodFeatured').checked = !!p.is_featured;
  document.getElementById('prodIsNew').checked = !!p.is_new;

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
async function loadStoreOrders() {
  if (!myStoreId) return;
  const wrap = document.getElementById('storeOrdersTable');

  try {
    allStoreOrders = await sbGet(
      'orders',
      `?store_id=eq.${myStoreId}&payment_status=eq.paid&order=created_at.desc&select=*`
    );

    renderStoreOrdersTable(allStoreOrders);
  } catch (e) {
    console.error('[Dashboard] loadStoreOrders:', e);
    wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar pedidos.</p>';
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

function filterStoreOrders(status, btn) {
  document.querySelectorAll('.otab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const filtered = status === 'all'
    ? allStoreOrders
    : allStoreOrders.filter(o => o.status === status);

  renderStoreOrdersTable(filtered);
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
              <td>${(o.items || []).map(i => i.name).join(', ') || '—'}</td>
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
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
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
              <td>${(o.items || []).map(i => i.name).join(', ') || '—'}</td>
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
            <span class="kpi-value">${fmtMT(pending.reduce((s,o) => s + (o.store_amount || 0), 0))}</span>
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
            <span class="kpi-value">${fmtMT(paid.reduce((s,o) => s + (o.store_amount || 0), 0))}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon red">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Comissão Kimera (8%)</span>
            <span class="kpi-value">${fmtMT(orders.reduce((s,o) => s + (o.commission_amount || 0), 0))}</span>
          </div>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Ref</th>
              <th>Total Pago</th>
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
                <td>${fmtMT(o.total || 0)}</td>
                <td style="color:#E53935;">${fmtMT(o.commission_amount || 0)}</td>
                <td style="color:#16A34A;font-weight:700;">${fmtMT(o.store_amount || 0)}</td>
                <td>${o.store_payout_done ? '<span class="status-pill paid">Repassado ✓</span>' : '<span class="status-pill pending">Pendente</span>'}</td>
                <td>${new Date(o.created_at).toLocaleDateString('pt-MZ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    console.error('[Dashboard] loadRevenueReport:', e);
    el.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro.</p>';
  }
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
      <div class="review-header"><div class="client-av">${(r.author_name || '?').slice(0,2).toUpperCase()}</div>
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
      description: document.getElementById('editLojaDesc').value,
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