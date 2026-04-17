/* admin.js */

/* ── NAVEGAÇÃO ── */
/* ── SIDEBAR TOGGLE (mobile correcto) ── */
function toggleSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen = sidebar?.classList.contains('open');
  sidebar?.classList.toggle('open', !isOpen);
  overlay?.classList.toggle('open', !isOpen);
  document.body.classList.toggle('sidebar-open', !isOpen);
}
function closeSidebar() {
  document.getElementById('adminSidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  document.body.classList.remove('sidebar-open');
}

window.quickApproveOrder = async function (id) {
  const order = allOrders.find(o => o.id === id);

  if (!order) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const txRef = prompt('Introduza a referência da transação:');
  if (!txRef) return;

  const receiptCode = prompt('Introduza o código do recibo:');
  if (!receiptCode) return;

  const registerCode = `REG-${order.order_ref}`;

  const payload = {
    payment_status: 'paid',
    status: 'paid',
    payment_tx_ref: txRef.trim(),
    payment_receipt_code: receiptCode.trim(),
    register_code: registerCode,
    validated_at: new Date().toISOString(),
    validated_by: 'super_admin',
    validation_notes: 'Pagamento confirmado manualmente pelo admin'
  };

  console.log('[ADMIN] quickApproveOrder payload:', payload);

  try {
    await sbPatch('orders', id, payload);

    const check = await sbGet(
      'orders',
      `?id=eq.${id}&select=id,order_ref,store_id,status,payment_status,register_code,payment_tx_ref,payment_receipt_code`
    );

    console.log('[ADMIN] pedido após quickApproveOrder:', check?.[0]);

    showToast('Pagamento confirmado com sucesso!');
    await loadOrders();
    await loadDashboard();
    await loadStorePayments();
  } catch (e) {
    console.error('[ADMIN] quickApproveOrder error:', e);
    showToast('Erro ao confirmar pagamento: ' + e.message, 'error');
  }
};

function showSection(id, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');

  const ttl = document.getElementById('topbarTitle');
  if (ttl) ttl.textContent = (btn?.textContent?.trim() || id).replace(/\d+$/, '').trim();

  const loaders = {
    dashboard: loadDashboard,
    pedidos: loadOrders,
    pagamentos: loadStorePayments,
    lojas: loadLojas,
    vendedores: loadVendedores,
    banners: loadBanners,
    produtos: loadAdminProducts,
    provas: loadProvas,
    avaliacoes: loadReviews
  };

  loaders[id]?.();

  closeSidebar();
}

/* ── DASHBOARD ── */
async function loadDashboard() {
  try {
    const [orders, stores] = await Promise.all([
      sbGet('orders', '?select=total,status,commission_amount,payment_status'),
      sbGet('stores', '?select=id,is_active')
    ]);

    const paid = orders.filter(o =>
      o.payment_status === 'paid' &&
      ['paid', 'production', 'shipped', 'delivered'].includes(o.status)
    );

    const revenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const commissions = paid.reduce((s, o) => s + (o.commission_amount || 0), 0);
    const pending = orders.filter(o => o.payment_status === 'awaiting_proof').length;

    document.getElementById('kpiRevenue')?.textContent !== undefined && (document.getElementById('kpiRevenue').textContent = fmtMT(revenue));
    document.getElementById('kpiOrders')?.textContent !== undefined && (document.getElementById('kpiOrders').textContent = orders.length);
    document.getElementById('kpiStores')?.textContent !== undefined && (document.getElementById('kpiStores').textContent = stores.filter(s => s.is_active).length);
    document.getElementById('kpiCommissions')?.textContent !== undefined && (document.getElementById('kpiCommissions').textContent = fmtMT(commissions));
    document.getElementById('pendingBadge')?.textContent !== undefined && (document.getElementById('pendingBadge').textContent = pending);

    const recent = await sbGet('orders', '?order=created_at.desc&limit=8&select=order_ref,total,status,payment_status');
    renderRecentOrders(recent);
  } catch (e) {
    console.error('[Admin] Dashboard error:', e);
  }
}

function renderRecentOrders(orders) {
  const el = document.getElementById('recentOrders');
  if (!el) return;
  if (!orders?.length) { el.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem pedidos ainda.</p>'; return; }
  el.innerHTML = `<div class="admin-table-wrap" style="border:none;">
    <table class="admin-table"><thead><tr><th>Ref</th><th>Total</th><th>Estado</th></tr></thead>
    <tbody>${orders.map(o => `<tr>
      <td class="order-id">${o.order_ref || '—'}</td>
      <td>${fmtMT(o.total || 0)}</td>
      <td><span class="status-pill ${o.status || ''}">${o.status || '—'}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

/* ── PEDIDOS ── */
let allOrders = [];
let currentValidationOrder = null;

async function loadOrders() {
  const wrap = document.getElementById('ordersTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';
  try {
    allOrders = await sbGet('orders', '?order=created_at.desc&select=*');
    renderOrdersTable(allOrders);
  } catch (e) {
    console.error('[Admin] loadOrders:', e);
    wrap.innerHTML = `<p style="padding:20px;color:#DC2626;">Erro: ${e.message}</p>`;
  }
}

function renderOrdersTable(orders) {
  const wrap = document.getElementById('ordersTableWrap');
  if (!wrap) return;

  if (!orders?.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem pedidos.</p>';
    return;
  }

  wrap.innerHTML = `<table class="admin-table">
    <thead>
      <tr>
        <th>Ref</th>
        <th>Cliente</th>
        <th>Contacto</th>
        <th>Total</th>
        <th>Comissão</th>
        <th>Loja</th>
        <th>Estado</th>
        <th>Pagamento</th>
        <th>Data</th>
        <th>Acção</th>
      </tr>
    </thead>
    <tbody>
      ${orders.map(o => `<tr>
        <td class="order-id">${o.order_ref || '—'}</td>
        <td>
          <div class="td-client">
            <div class="client-av">${(o.customer_name || '?').slice(0, 2).toUpperCase()}</div>
            ${o.customer_name || '—'}
          </div>
        </td>
        <td>${o.customer_phone || '—'}</td>
        <td>${fmtMT(o.total || 0)}</td>
        <td style="color:#E53935;">${fmtMT(o.commission_amount || 0)}</td>
        <td>${o.store_name || '—'}</td>
        <td>
          <select class="status-select" onchange="updateOrderStatus('${o.id}',this)">
            ${['pending', 'paid', 'production', 'shipped', 'delivered', 'cancelled'].map(s =>
    `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
       <td>
  <span class="status-pill ${o.payment_status === 'paid' ? 'paid' :
      ['awaiting_proof', 'processing'].includes(o.payment_status) ? 'pending' :
        o.payment_status === 'failed' ? 'danger' : 'pending'
    }">
    ${o.payment_status || '—'}
  </span>
</td>
        <td>${fmtDate(o.created_at)}</td>
        <td>
  <div class="td-actions">
    <button class="act-btn edit" onclick="viewOrder('${o.id}')">Ver</button>

    ${['awaiting_proof', 'processing'].includes(o.payment_status)
      ? `<button class="act-btn edit" onclick="quickApproveOrder('${o.id}')">Confirmar</button>`
      : ''
    }

    ${o.payment_status === 'paid'
      ? `<button class="act-btn edit" onclick="replyClientWhatsApp()">Confirmado</button>`
      : ''
    }

    <button class="act-btn edit" onclick="openClientWhatsApp('${o.id}')">WhatsApp</button>
  </div>
</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function filterOrders(status, btn) {
  document.querySelectorAll('.otab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtered = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
  renderOrdersTable(filtered);
}

async function updateOrderStatus(id, sel) {
  try {
    await sbPatch('orders', id, { status: sel.value });
    showToast('Estado actualizado!');
    /* Actualiza na lista local */
    const o = allOrders.find(x => x.id === id);
    if (o) o.status = sel.value;
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

function viewOrder(id) {
  const o = allOrders.find(x => x.id === id);
  if (!o) return;

  alert(
    `Pedido: ${o.order_ref}\n` +
    `Cliente: ${o.customer_name}\n` +
    `Contacto: ${o.customer_phone || '—'}\n` +
    `Total: ${fmtMT(o.total)}\n` +
    `Estado: ${o.status}\n` +
    `Pagamento: ${o.payment_status || '—'}\n` +
    `Método: ${o.payment_method || '—'}\n` +
    `Tx Ref: ${o.payment_tx_ref || '—'}\n` +
    `Recibo: ${o.payment_receipt_code || '—'}\n` +
    `Registo: ${o.register_code || '—'}\n` +
    `Data: ${fmtDate(o.created_at)}`
  );
}

/* Nova funcao Whatsapp*/

function getOrderById(id) {
  return allOrders.find(x => x.id === id) || null;
}

//
window.approveManualPayment = async function () {
  if (!currentValidationOrder) {
    showToast('Nenhum pedido seleccionado para validação.', 'error');
    return;
  }

  const txRef = document.getElementById('manualTxRef')?.value.trim();
  const receiptCode = document.getElementById('manualReceiptCode')?.value.trim();
  const registerCode = document.getElementById('manualRegisterCode')?.value.trim();
  const notes = document.getElementById('manualValidationNotes')?.value.trim();

  if (!txRef || !receiptCode || !registerCode) {
    showToast('Preencha referência da transação, código do recibo e código de registo.', 'error');
    return;
  }

  const payload = {
    payment_status: 'paid',
    status: 'paid',
    register_code: registerCode,
    payment_tx_ref: txRef,
    payment_receipt_code: receiptCode,
    validated_at: new Date().toISOString(),
    validated_by: 'super_admin',
    validation_notes: notes || ''
  };

  console.log('[ADMIN] currentValidationOrder:', currentValidationOrder);
  console.log('[ADMIN] payload:', payload);

  try {
    await sbPatch('orders', currentValidationOrder.id, payload);

    const check = await sbGet(
      'orders',
      `?id=eq.${currentValidationOrder.id}&select=id,order_ref,status,payment_status,register_code,payment_tx_ref,payment_receipt_code`
    );

    console.log('[ADMIN] pedido após patch:', check?.[0]);

    showToast('Pagamento confirmado com sucesso!');
    closeModal('modalValidarPagamento');

    await loadOrders();
    await loadDashboard();
    await loadStorePayments();
  } catch (e) {
    console.error('[ADMIN] Erro em approveManualPayment:', e);
    showToast('Erro ao confirmar pagamento: ' + e.message, 'error');
  }
};
//

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function buildClientWhatsAppMessage(order, registerCode = '') {
  return `Olá. Confirmámos o pagamento da sua encomenda.%0A%0A` +
    `Ref. da encomenda: ${order.order_ref || '—'}%0A` +
    `Estado: Pagamento confirmado%0A` +
    `Código de registo: ${registerCode || order.register_code || 'A definir'}%0A%0A` +
    `A sua encomenda seguirá agora para preparação.%0AObrigado por comprar connosco.`;
}

function openClientWhatsApp(id) {
  const order = getOrderById(id);
  if (!order) return;

  const phone = normalizePhone(order.customer_phone);
  if (!phone) {
    showToast('O cliente não tem contacto registado.', 'error');
    return;
  }

  const msg = buildClientWhatsAppMessage(order);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

function replyClientWhatsApp() {
  if (!currentValidationOrder) return;

  const phone = normalizePhone(currentValidationOrder.customer_phone);
  if (!phone) {
    showToast('Sem contacto do cliente.', 'error');
    return;
  }

  const regCode = document.getElementById('manualRegisterCode')?.value.trim();
  const msg = buildClientWhatsAppMessage(currentValidationOrder, regCode);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

// 

async function rejectManualPayment() {
  if (!currentValidationOrder) return;

  const notes = document.getElementById('manualValidationNotes')?.value.trim();

  try {
    await sbPatch('orders', currentValidationOrder.id, {
      payment_status: 'failed',
      status: 'cancelled',
      validation_notes: notes || 'Pagamento manual rejeitado.',
      validated_at: new Date().toISOString(),
      validated_by: 'super_admin'
    });

    showToast('Pagamento rejeitado.');
    closeModal('modalValidarPagamento');
    await loadOrders();
    await loadDashboard();
  } catch (e) {
    console.error('[Admin] rejectManualPayment:', e);
    showToast('Erro: ' + e.message, 'error');
  }
}

function exportOrders() {
  const rows = ['Ref,Cliente,Total,Comissão,Estado,Data'];
  allOrders.forEach(o => rows.push([o.order_ref, o.customer_name, o.total, o.commission_amount, o.status, o.created_at].join(',')));
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pedidos_kimera.csv';
  a.click();
  showToast('CSV exportado!');
}

/* ── PAGAMENTOS PARA LOJAS ── */
let currentPaymentOrder = null;


async function loadStorePayments() {
  const el = document.getElementById('storePaymentsTable');
  if (!el) return;

  el.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';

  try {
    const orders = await sbGet(
      'orders',
      '?store_payout_done=eq.false&payment_status=eq.paid&status=in.(paid,production,shipped,delivered)&order=created_at.desc&select=*'
    );

    const badge = document.getElementById('payBadge');
    if (badge) badge.textContent = orders.length;

    if (!orders?.length) {
      el.innerHTML = '<p style="padding:20px;color:#16A34A;font-weight:600;">✓ Todos os repasses em dia.</p>';
      return;
    }

    el.innerHTML = `<div class="admin-table-wrap"><table class="admin-table">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Loja</th>
          <th>Total Pago</th>
          <th>Comissão (8%)</th>
          <th>Valor p/ Loja</th>
          <th>Estado</th>
          <th>Aprovação Super Admin</th>
        </tr>
      </thead>
      <tbody>${orders.map(o => `<tr>
        <td class="order-id">${o.order_ref}</td>
        <td>${o.store_name || '—'}</td>
        <td>${fmtMT(o.total || 0)}</td>
        <td style="color:#E53935;">${fmtMT(o.commission_amount || 0)}</td>
        <td style="color:#16A34A;font-weight:700;">${fmtMT(o.store_amount || 0)}</td>
        <td><span class="status-pill ${o.status}">${o.status}</span></td>
        <td><button class="btn btn-red btn-sm" onclick='openPaymentApproval(${JSON.stringify(o).replace(/'/g, "&#39;")})'>🔒 Aprovar Repasse</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch (e) {
    console.error('[Admin] loadStorePayments:', e);
    el.innerHTML = `<p style="padding:20px;color:#DC2626;">Erro: ${e.message}</p>`;
  }
}

function openPaymentApproval(order) {
  currentPaymentOrder = order;
  const body = document.getElementById('modalPagamentoBody');
  if (!body) return;
  body.innerHTML = `
    <div style="background:#F0FDF4;border-radius:12px;padding:20px;margin-bottom:16px;">
      <p style="font-size:13px;color:#757575;margin-bottom:6px;">Pedido: <strong>${order.order_ref}</strong></p>
      <p style="font-size:13px;color:#757575;margin-bottom:6px;">Loja: <strong>${order.store_name || '—'}</strong></p>
      <p style="font-size:13px;color:#757575;margin-bottom:6px;">Pago pelo cliente: <strong>${fmtMT(order.total)}</strong></p>
      <p style="font-size:13px;color:#E53935;margin-bottom:6px;">Comissão Kimera (8%): <strong>${fmtMT(order.commission_amount)}</strong></p>
      <p style="font-size:18px;font-weight:800;color:#16A34A;">A repassar à loja: ${fmtMT(order.store_amount)}</p>
    </div>
    <div class="config-field"><label>Referência de Transferência (opcional)</label>
      <input type="text" id="payRefInput" placeholder="Ref da transferência M-Pesa..." style="height:40px;padding:0 12px;border:1.5px solid #E0E0E0;border-radius:8px;font-size:13px;font-family:var(--font);width:100%;"/></div>
    <p style="font-size:12px;color:#9E9E9E;margin-top:8px;">⚠️ Esta acção é irreversível. Confirme apenas após efectuar o pagamento.</p>`;
  openModal('modalPagamento');
}

async function approveStorePayment() {
  if (!currentPaymentOrder) return;
  const ref = document.getElementById('payRefInput')?.value.trim();
  const btn = document.getElementById('btnAprovarPag');
  if (btn) { btn.textContent = 'A processar...'; btn.disabled = true; }
  try {
    await sbPatch('orders', currentPaymentOrder.id, {
      store_payout_done: true,
      store_payout_ref: ref || null,
      store_payout_at: new Date().toISOString()
    });
    showToast('Repasse aprovado e registado!');
    closeModal('modalPagamento');
    loadStorePayments();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = '✓ Confirmar Repasse'; btn.disabled = false; }
  }
}

/* ── LOJAS ── */
async function loadLojas() {
  const grid = document.getElementById('lojasGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:20px;grid-column:1/-1;text-align:center;"><div class="loading-spinner"></div></div>';
  try {
    const stores = await sbGet('stores', '?order=created_at.desc');
    /* Popular selects de lojas */
    ['vendStore', 'storeFilter'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const placeholder = id === 'storeFilter' ? '<option value="">Todas as lojas</option>' : '<option value="">— Seleccionar —</option>';
      sel.innerHTML = placeholder + (stores || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    });
    if (!stores?.length) { grid.innerHTML = '<p style="padding:20px;color:#9E9E9E;grid-column:1/-1;">Sem lojas criadas.</p>'; return; }
    grid.innerHTML = stores.map(s => `
      <div class="store-admin-card">
        <div class="sac-header" style="${s.banner_url ? `background:url('${s.banner_url}') center/cover;` : 'background:#F5F5F5;'}"></div>
        <div class="sac-body">
          <div class="sac-logo" style="overflow:hidden;">
            ${s.logo_url
        ? `<img src="${s.logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<div style="width:100%;height:100%;background:#E53935;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;">${s.name.slice(0, 2).toUpperCase()}</div>`}
          </div>
          <h3>${s.name}</h3>
          <p>${s.description || ''}</p>
          <div class="sac-stats"><span>${s.product_count || 0} prod.</span><span>★ ${s.rating || '—'}</span></div>
          <div class="sac-status">
            <span class="status-pill ${s.is_active ? 'paid' : 'pending'}">${s.is_active ? 'Activa' : 'Inactiva'}</span>
            <div class="td-actions">
              <button class="act-btn edit" onclick="editLoja('${s.id}')">Editar</button>
              <button class="act-btn del" onclick="toggleLojaStatus('${s.id}',${!s.is_active})">${s.is_active ? 'Suspender' : 'Activar'}</button>
            </div>
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    console.error('[Admin] loadLojas:', e);
    grid.innerHTML = `<p style="padding:20px;color:#DC2626;grid-column:1/-1;">Erro: ${e.message}</p>`;
  }
}

function editLoja(id) {
  sbGet('stores', `?id=eq.${id}`).then(rows => {
    const s = rows?.[0]; if (!s) return;
    document.getElementById('lojaEditId').value = s.id;
    document.getElementById('lojaName').value = s.name || '';
    document.getElementById('lojaLocation').value = s.location || '';
    document.getElementById('lojaDesc').value = s.description || '';
    document.getElementById('lojaModalTitle').textContent = 'Editar Loja';
    openModal('modalLoja');
  }).catch(e => showToast('Erro ao carregar loja: ' + e.message, 'error'));
}

async function saveLoja() {
  const id = document.getElementById('lojaEditId')?.value;
  const name = document.getElementById('lojaName')?.value.trim();
  if (!name) { showToast('Nome da loja obrigatório.', 'error'); return; }

  const logoFile = document.getElementById('lojaLogo')?.files[0];
  const bannerFile = document.getElementById('lojaBanner')?.files[0];
  let logo_url = '', banner_url = '';

  /* Botão em loading */
  const btn = document.querySelector('#modalLoja .btn-red');
  if (btn) { btn.textContent = 'A guardar...'; btn.disabled = true; }

  try {
    if (logoFile) logo_url = await sbUpload('stores', `logos/${Date.now()}_${logoFile.name.replace(/\s/g, '_')}`, logoFile);
    if (bannerFile) banner_url = await sbUpload('stores', `banners/${Date.now()}_${bannerFile.name.replace(/\s/g, '_')}`, bannerFile);

    const payload = {
      name,
      location: document.getElementById('lojaLocation')?.value || '',
      description: document.getElementById('lojaDesc')?.value || '',
      category: document.getElementById('lojaCategory')?.value || 'Moda Geral',
      is_active: true,
      ...(logo_url && { logo_url }),
      ...(banner_url && { banner_url })
    };

    if (id) await sbPatch('stores', id, payload);
    else await sbPost('stores', payload);

    showToast(id ? 'Loja actualizada!' : 'Loja criada!');
    closeModal('modalLoja');
    loadLojas();
  } catch (e) {
    console.error('[Admin] saveLoja:', e);
    showToast('Erro ao guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Guardar Loja'; btn.disabled = false; }
  }
}

async function toggleLojaStatus(id, status) {
  try {
    await sbPatch('stores', id, { is_active: status });
    showToast(status ? 'Loja activada!' : 'Loja suspensa.', 'info');
    loadLojas();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

function previewLojaImg(inputId, labelId, previewId) {
  const file = document.getElementById(inputId)?.files[0];
  if (!file) return;
  const lbl = document.getElementById(labelId);
  const img = document.getElementById(previewId);
  if (lbl) lbl.textContent = file.name;
  if (img) { img.src = URL.createObjectURL(file); img.style.display = 'block'; }
}

/* ── VENDEDORES ── */
async function loadVendedores() {
  const el = document.getElementById('vendedoresTable');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';
  try {
    /* store_users é a tabela correcta */
    const vendors = await sbGet('store_users', '?order=created_at.desc&select=*,stores(name)');
    if (!vendors?.length) { el.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem vendedores criados.</p>'; return; }
    el.innerHTML = `<table class="admin-table">
      <thead><tr><th>Nome</th><th>Telemóvel</th><th>Loja</th><th>Criado em</th><th>Estado</th><th>Acção</th></tr></thead>
      <tbody>${vendors.map(v => `<tr>
        <td><div class="td-client"><div class="client-av">${(v.full_name || '?').slice(0, 2).toUpperCase()}</div>${v.full_name || '—'}</div></td>
        <td>${v.phone || '—'}</td>
        <td>${v.stores?.name || '—'}</td>
        <td>${fmtDate(v.created_at)}</td>
        <td><span class="status-pill ${v.is_active !== false ? 'paid' : 'pending'}">${v.is_active !== false ? 'Activo' : 'Inactivo'}</span></td>
        <td><button class="act-btn del" onclick="revokeAccess('${v.id}')">Revogar</button></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    console.error('[Admin] loadVendedores:', e);
    el.innerHTML = `<p style="padding:20px;color:#DC2626;">Erro: ${e.message}</p>`;
  }
}

async function createVendedor() {
  const phoneVal = document.getElementById('vendPhone')?.value.trim();
  const pwd = document.getElementById('vendPwd')?.value;
  const storeId = document.getElementById('vendStore')?.value;
  const name = document.getElementById('vendName')?.value.trim();

  if (!phoneVal || !pwd || !storeId) { showToast('Preencha todos os campos obrigatórios.', 'error'); return; }
  if (pwd.length < 8) { showToast('Senha mínima de 8 caracteres.', 'error'); return; }

  const btn = document.querySelector('#modalVendedor .btn-red');
  if (btn) { btn.textContent = 'A criar...'; btn.disabled = true; }

  try {
    if (typeof createVendedorAuth !== 'function') throw new Error('auth.js não carregado.');

    const data = await createVendedorAuth(phoneVal, pwd, storeId, name);
    const userId = data?.user?.id || data?.id;

    /* Registar na tabela store_users */
    await sbPost('store_users', {
      user_id: userId || null,
      store_id: storeId,
      phone: '258' + phoneVal.replace(/\D/g, ''),
      full_name: name || '',
      is_active: true,
      created_at: new Date().toISOString()
    });

    showToast('Acesso criado! Vendedor pode fazer login.');
    closeModal('modalVendedor');
    loadVendedores();
  } catch (e) {
    console.error('[Admin] createVendedor:', e);
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Criar Acesso'; btn.disabled = false; }
  }
}

async function revokeAccess(id) {
  if (!confirm('Revogar acesso deste vendedor?')) return;
  try {
    await sbPatch('store_users', id, { is_active: false });
    showToast('Acesso revogado.', 'info');
    loadVendedores();
  } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

/* ── BANNERS ── */
async function loadBanners() {
  const grid = document.getElementById('bannersGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:20px;text-align:center;grid-column:1/-1;"><div class="loading-spinner"></div></div>';
  try {
    const banners = await sbGet('banners', '?order=position.asc');
    if (!banners?.length) { grid.innerHTML = '<p style="padding:20px;color:#9E9E9E;grid-column:1/-1;">Sem banners. Crie o primeiro!</p>'; return; }
    grid.innerHTML = banners.map(b => `
      <div class="banner-admin-card">
        <div class="banner-thumb" style="${b.image_url ? `background:url('${b.image_url}') center/cover;` : `background:${b.bg_color || '#111'};`}">
          <div class="banner-thumb-overlay">
            <span class="status-pill ${b.is_active ? 'paid' : 'pending'}">${b.is_active ? 'Activo' : 'Inactivo'}</span>
            <span style="font-size:11px;background:rgba(0,0,0,.5);color:#fff;padding:2px 8px;border-radius:4px;">${b.type === 'mid' ? 'Meio' : 'Principal'} · Pos.${b.position}</span>
          </div>
        </div>
        <div class="banner-info">
          <h4>${b.title || '(sem título)'}</h4>
          <p>${b.subtitle || ''}</p>
          <div class="td-actions" style="margin-top:10px;">
            <button class="act-btn edit" onclick="editBanner('${b.id}')">Editar</button>
            <button class="act-btn ${b.is_active ? 'del' : 'edit'}" onclick="toggleBanner('${b.id}',${!b.is_active})">${b.is_active ? 'Desactivar' : 'Activar'}</button>
            <button class="act-btn del" onclick="deleteBanner('${b.id}')">Apagar</button>
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    console.error('[Admin] loadBanners:', e);
    grid.innerHTML = `<p style="padding:20px;color:#DC2626;grid-column:1/-1;">Erro: ${e.message}</p>`;
  }
}

function previewBanner(input) {
  const file = input.files[0]; if (!file) return;
  const img = document.getElementById('bannerPreview');
  const zone = document.getElementById('bannerUploadZone');
  if (img) { img.src = URL.createObjectURL(file); img.style.display = 'block'; }
  if (zone) zone.style.display = 'none';
}

async function saveBanner() {
  const id = document.getElementById('bannerEditId')?.value;
  const imgF = document.getElementById('bannerImg')?.files[0];
  const btn = document.querySelector('#modalBanner .btn-red');
  if (btn) { btn.textContent = 'A guardar...'; btn.disabled = true; }

  let image_url = '';
  try {
    if (imgF) image_url = await sbUpload('banners', `${Date.now()}_${imgF.name.replace(/\s/g, '_')}`, imgF);

    const selectedStoreId = document.getElementById('bannerStoreLink')?.value || '';

    const payload = {
      title: document.getElementById('bannerTitle')?.value || '',
      tag: document.getElementById('bannerTag')?.value || '',
      subtitle: document.getElementById('bannerSubtitle')?.value || '',
      cta_text: document.getElementById('bannerCta')?.value || '',
      link_url: selectedStoreId ? `/pages/lojas?store=${selectedStoreId}` : '',
      bg_color: document.getElementById('bannerColor')?.value || '#111111',
      position: parseInt(document.getElementById('bannerPosition')?.value) || 1,
      type: document.getElementById('bannerType')?.value || 'hero',
      is_active: document.getElementById('bannerActive')?.checked !== false,
      ...(image_url && { image_url })
    };

    if (id) await sbPatch('banners', id, payload);
    else await sbPost('banners', payload);

    showToast('Banner guardado!');
    closeModal('modalBanner');
    loadBanners();
  } catch (e) {
    console.error('[Admin] saveBanner:', e);
    showToast('Erro: ' + e.message, 'error');
  } finally {
    if (btn) { btn.textContent = 'Guardar Banner'; btn.disabled = false; }
  }
}

function editBanner(id) {
  sbGet('banners', `?id=eq.${id}`).then(async rows => {
    const b = rows?.[0];
    if (!b) return;

    document.getElementById('bannerEditId').value = b.id;
    document.getElementById('bannerTitle').value = b.title || '';
    document.getElementById('bannerTag').value = b.tag || '';
    document.getElementById('bannerSubtitle').value = b.subtitle || '';
    document.getElementById('bannerCta').value = b.cta_text || '';
    document.getElementById('bannerColor').value = b.bg_color || '#111111';
    document.getElementById('bannerPosition').value = b.position || 1;
    document.getElementById('bannerType').value = b.type || 'hero';
    document.getElementById('bannerActive').checked = b.is_active !== false;
    document.getElementById('bannerModalTitle').textContent = 'Editar Banner';

    const match = (b.link_url || '').match(/[?&]store=([^&]+)/);
    const selectedStoreId = match ? decodeURIComponent(match[1]) : '';
    await loadBannerStoreOptions(selectedStoreId);

    if (b.image_url) {
      const img = document.getElementById('bannerPreview');
      const zone = document.getElementById('bannerUploadZone');
      if (img) { img.src = b.image_url; img.style.display = 'block'; }
      if (zone) zone.style.display = 'none';
    }

    openModal('modalBanner');
  }).catch(e => showToast('Erro: ' + e.message, 'error'));
}

async function toggleBanner(id, status) {
  try { await sbPatch('banners', id, { is_active: status }); loadBanners(); } catch (e) { showToast(e.message, 'error'); }
}
async function deleteBanner(id) {
  if (!confirm('Apagar banner?')) return;
  try { await sbDelete('banners', id); showToast('Banner apagado.'); loadBanners(); } catch (e) { showToast(e.message, 'error'); }
}

async function loadBannerStoreOptions(selectedId = '') {
  const sel = document.getElementById('bannerStoreLink');
  if (!sel) return;

  try {
    const stores = await sbGet('stores', '?is_active=eq.true&order=name.asc&select=id,name');
    sel.innerHTML =
      '<option value="">Seleccionar loja</option>' +
      stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    if (selectedId) sel.value = selectedId;
  } catch (e) {
    console.error('[Admin] loadBannerStoreOptions:', e);
  }
}

/* ── PRODUTOS ── */
async function loadAdminProducts() {
  const wrap = document.getElementById('prodTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';
  const storeId = document.getElementById('storeFilter')?.value;
  try {
    const q = (storeId ? `?store_id=eq.${storeId}` : '?') + '&order=created_at.desc&select=*,stores(name)';
    const products = await sbGet('products', q);
    if (!products?.length) { wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem produtos.</p>'; return; }
    wrap.innerHTML = `<table class="admin-table">
      <thead><tr><th>Produto</th><th>Loja</th><th>Preço</th><th>Stock</th><th>Estado</th><th>Acção</th></tr></thead>
      <tbody>${products.map(p => `<tr>
        <td><div class="td-product"><div class="td-img" style="overflow:hidden;">${p.thumbnail_url ? `<img src="${p.thumbnail_url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">` : '<div style="width:100%;height:100%;background:#eee;border-radius:6px;"></div>'}</div>${p.name}</div></td>
        <td>${p.stores?.name || p.store_name || '—'}</td>
        <td>${fmtMT(p.price)}</td>
        <td>${p.stock > 5 ? `<span class="stock-ok">${p.stock}</span>` : p.stock > 0 ? `<span class="stock-low">${p.stock}</span>` : '<span class="stock-out">0</span>'}</td>
        <td><span class="status-pill ${p.is_active ? 'paid' : 'pending'}">${p.is_active ? 'Activo' : 'Inactivo'}</span></td>
        <td><button class="act-btn del" onclick="deleteProduct('${p.id}')">Apagar</button></td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) { wrap.innerHTML = `<p style="padding:20px;color:#DC2626;">Erro: ${e.message}</p>`; }
}

function filterProdTable(q) {
  document.querySelectorAll('#prodTableWrap tbody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}
async function deleteProduct(id) {
  if (!confirm('Apagar produto?')) return;
  try { await sbDelete('products', id); showToast('Produto apagado.'); loadAdminProducts(); } catch (e) { showToast(e.message, 'error'); }
}

/* ── PROVAS SOCIAIS ── */
async function loadProvas() {
  const grid = document.getElementById('provasGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:20px;text-align:center;grid-column:1/-1;"><div class="loading-spinner"></div></div>';
  try {
    /* Super admin vê todas, incluindo não aprovadas */
    const proofs = await sbGet('delivery_proofs', '?order=created_at.desc');
    if (!proofs?.length) { grid.innerHTML = '<p style="padding:20px;color:#9E9E9E;grid-column:1/-1;">Sem provas enviadas.</p>'; return; }
    grid.innerHTML = proofs.map(p => `
      <div class="prova-card">
        <img src="${p.image_url}" alt="Entrega" onclick="openProofLightbox('${p.image_url}')"
             style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;">
        <div style="padding:10px;">
          <p style="font-size:12px;color:#757575;">Ref: ${p.order_ref || '—'}</p>
          <p style="font-size:12px;color:#757575;">${fmtDate(p.created_at)}</p>
          <div class="td-actions" style="margin-top:8px;">
            ${!p.is_approved
        ? `<button class="act-btn edit" onclick="approveProva('${p.id}')">✓ Aprovar</button>`
        : '<span class="status-pill paid" style="font-size:11px;">Aprovada</span>'}
            <button class="act-btn del" onclick="deleteProva('${p.id}')">Apagar</button>
          </div>
        </div>
      </div>`).join('');
  } catch (e) { grid.innerHTML = `<p style="padding:20px;color:#DC2626;grid-column:1/-1;">Erro: ${e.message}</p>`; }
}

function openProofLightbox(url) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:12px;">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}
async function approveProva(id) {
  try { await sbPatch('delivery_proofs', id, { is_approved: true }); showToast('Prova aprovada!'); loadProvas(); } catch (e) { showToast(e.message, 'error'); }
}
async function deleteProva(id) {
  if (!confirm('Apagar?')) return;
  try { await sbDelete('delivery_proofs', id); loadProvas(); } catch (e) { showToast(e.message, 'error'); }
}

/* ── AVALIAÇÕES ── */
async function loadReviews() {
  const el = document.getElementById('reviewsList');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';
  try {
    const reviews = await sbGet('reviews', '?order=created_at.desc');
    if (!reviews?.length) { el.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem avaliações.</p>'; return; }
    el.innerHTML = reviews.map(r => `
      <div class="review-card" style="margin-bottom:14px;">
        <div class="review-header">
          <div class="client-av">${(r.author_name || '?').slice(0, 2).toUpperCase()}</div>
          <div><p class="review-author">${r.author_name || 'Anónimo'}</p>
               <div class="stars">${'★'.repeat(r.rating || 0)}${'☆'.repeat(5 - (r.rating || 0))}</div></div>
          <span class="review-date" style="margin-left:auto;">${fmtDate(r.created_at)}</span>
          <span class="status-pill ${r.status === 'approved' ? 'paid' : r.status === 'pending' ? 'pending' : 'danger'}">${r.status}</span>
        </div>
        <p class="review-text">"${r.text}"</p>
        <div class="review-actions">
          ${r.status !== 'approved' ? `<button class="act-btn edit" onclick="approveReview('${r.id}')">Aprovar</button>` : ''}
          <button class="act-btn del" onclick="deleteReview('${r.id}')">Remover</button>
        </div>
      </div>`).join('');
  } catch (e) { el.innerHTML = `<p style="padding:20px;color:#DC2626;">Erro: ${e.message}</p>`; }
}

async function approveReview(id) {
  try { await sbPatch('reviews', id, { status: 'approved' }); showToast('Avaliação aprovada!'); loadReviews(); } catch (e) { showToast(e.message, 'error'); }
}
async function deleteReview(id) {
  if (!confirm('Remover avaliação?')) return;
  try { await sbDelete('reviews', id); loadReviews(); } catch (e) { showToast(e.message, 'error'); }
}

/* ── MODAIS ── */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  modal.querySelectorAll('input,textarea').forEach(f => { if (f.type !== 'checkbox' && f.type !== 'color') f.value = ''; });
  modal.querySelectorAll('img').forEach(i => i.style.display = 'none');
  modal.querySelectorAll('.upload-field').forEach(u => u.style.display = 'flex');
  ['bannerEditId', 'lojaEditId'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['bannerPreview'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  ['bannerUploadZone'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'flex'; });
  const tt = modal.querySelector('.modal-header h3');
  if (tt && id === 'modalBanner') tt.textContent = 'Novo Banner';
  if (tt && id === 'modalLoja') tt.textContent = 'Nova Loja';
}
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  if (!sbCurrentUser()) {
    window.location.href = '/pages/login';
    return;
  }

  if (sbCurrentRole() !== KIMERA_CONFIG.roles.SUPER_ADMIN) {
    window.location.href =
      sbCurrentRole() === KIMERA_CONFIG.roles.STORE_OWNER
        ? '/pages/dashboard'
        : '/pages/login';
    return;
  }

  loadDashboard();
  loadLojas();
  loadBannerStoreOptions();

  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });
});