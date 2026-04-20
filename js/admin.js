/* admin.js */

/* ── NAVEGAÇÃO ── */
/* ── SIDEBAR TOGGLE (mobile correcto) ── */

let currentCustomProjectStatusFilter = 'all';

function filterCustomProjects(status, btn) {
  currentCustomProjectStatusFilter = status;

  document.querySelectorAll('#sec-criar .otab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  applyCustomProjectFilters();
}

function applyCustomProjectFilters() {
  let filtered = [...allCustomProjects];

  if (currentCustomProjectStatusFilter !== 'all') {
    filtered = filtered.filter(p => p.status === currentCustomProjectStatusFilter);
  }

  renderCustomProjectsTable(filtered);
}

function getByAnyId(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

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

function getAllowedAdminStatusTransitions(currentStatus) {
  return [
    'pending',
    'paid',
    'production',
    'shipped',
    'delivered',
    'cancelled'
  ];
}

async function updateAdminOrderStatus(id, selectEl) {
  const newStatus = selectEl.value;
  const order = allOrders.find(o => o.id === id);

  if (!order) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  try {
    await sbPatch('orders', id, { status: newStatus });

    order.status = newStatus;

    showToast('Estado do pedido actualizado pelo admin!');

    renderOrdersTable(allOrders);
  } catch (e) {
    console.error('[Admin] updateAdminOrderStatus:', e);
    showToast('Erro ao actualizar estado.', 'error');
    selectEl.value = order.status;
  }
}

window.quickApproveOrder = async function (id) {
  const order = allOrders.find(o => o.id === id);

  if (!order) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  if (order.payment_status === 'paid') {
    showToast('Este pedido já foi confirmado antes.', 'info');
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

    /* baixar stock só após confirmação do pagamento */
    await decrementOrderStock(order);

    /* libertar KIMERA Criar para revisão */
    await moveCustomProjectsToPendingReview(order.order_ref);

    const check = await sbGet(
      'orders',
      `?id=eq.${id}&select=id,order_ref,store_id,status,payment_status,register_code,payment_tx_ref,payment_receipt_code`
    );

    console.log('[ADMIN] pedido após quickApproveOrder:', check?.[0]);

    showToast('Pagamento confirmado com sucesso!');
    await loadOrders(true);
    await loadDashboard();
    await loadStorePayments();
    await loadCustomProjects?.();
  } catch (e) {
    console.error('[ADMIN] quickApproveOrder error:', e);
    showToast('Erro ao confirmar pagamento: ' + e.message, 'error');
  }
};

async function getOrderPaymentStatusByRef(orderRef) {
  if (!orderRef) return null;

  try {
    const rows = await sbGet('orders', `?order_ref=eq.${orderRef}&select=payment_status`);
    return rows?.[0]?.payment_status || null;
  } catch (e) {
    console.error('[Admin] getOrderPaymentStatusByRef:', e);
    return null;
  }
}

function getOrderGroupKey(order) {
  return order.master_ref || order.order_ref;
}

function groupOrdersByMasterRef(orders = []) {
  const map = {};

  orders.forEach(order => {
    const key = getOrderGroupKey(order);

    if (!map[key]) {
      map[key] = {
        master_ref: key,
        customer_name: order.customer_name || '—',
        customer_phone: order.customer_phone || '—',
        created_at: order.created_at,
        orders: []
      };
    }

    map[key].orders.push(order);
  });

  return Object.values(map).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getGroupTotal(group) {
  return group.orders.reduce((sum, o) => sum + (o.total || 0), 0);
}

function getGroupPaymentStatus(group) {
  const statuses = group.orders.map(o => o.payment_status);

  if (statuses.every(s => s === 'paid')) return 'paid';
  if (statuses.some(s => s === 'processing' || s === 'awaiting_proof')) return 'processing';
  if (statuses.every(s => s === 'failed')) return 'failed';

  return 'pending';
}

function getGroupStatusLabel(group) {
  const status = getGroupPaymentStatus(group);
  if (status === 'paid') return 'Pagamento completo';
  if (status === 'processing') return 'Pagamento em validação';
  if (status === 'failed') return 'Pagamento falhado';
  return 'Pendente';
}

function showSection(id, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');

  const ttl = document.getElementById('topbarTitle');
  if (ttl) {
    ttl.textContent = (btn?.textContent?.trim() || id).replace(/\d+$/, '').trim();
  }

  stopAdminOrdersPolling();

  const loaders = {
    dashboard: loadDashboard,
    pedidos: loadOrders,
    pagamentos: loadStorePayments,
    lojas: loadLojas,
    vendedores: loadVendedores,
    banners: loadBanners,
    produtos: loadAdminProducts,
    provas: loadProvas,
    avaliacoes: loadReviews,
    cupons: loadCoupons,
    visitas: loadVisitsDashboard,
    criar: loadCustomProjects
  };

  try {
    if (typeof loaders[id] === 'function') {
      if (id === 'pedidos') {
        loaders[id](false);
        startAdminOrdersPolling();
      } else {
        loaders[id]();
      }
    }
  } catch (e) {
    console.error('[Admin] showSection loader error:', id, e);
  }

  closeSidebar();
}

let allCustomProjects = [];

async function loadCustomProjects() {
  const wrap = document.getElementById('customProjectsTable');
  if (!wrap) return;

  wrap.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';

  try {
    const rows = await sbGet('custom_projects', '?order=created_at.desc&select=*');
    allCustomProjects = rows || [];
    applyCustomProjectFilters();
  } catch (e) {
    console.error('[Admin] loadCustomProjects:', e);
    wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar criações personalizadas.</p>';
  }
}

function renderCustomProjectsTable(projects = []) {
  const wrap = document.getElementById('customProjectsTable');
  if (!wrap) return;

  if (!projects.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem criações personalizadas nesta categoria.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Ref</th>
          <th>Cliente</th>
          <th>Tipo</th>
          <th>Tamanho</th>
          <th>Qtd</th>
          <th>Total</th>
          <th>Estado</th>
          <th>Actualizar</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${projects.map(p => `
          <tr>
            <td class="order-id">${p.order_ref || p.project_ref || p.id || '—'}</td>
            <td>${p.customer_name || '—'}</td>
            <td>${p.fit_type || p.product_type || '—'}</td>
            <td>${p.size || '—'}</td>
            <td>${p.quantity || 1}</td>
            <td>${fmtMT(p.total_price || p.total || 0)}</td>
            <td>
              <span class="status-pill ${mapCustomProjectStatusClass(p.status)}">
                ${p.status || 'draft'}
              </span>
            </td>
            <td>
              <select class="status-select" onchange="updateCustomProjectStatusFromTable('${p.id}', this)">
                <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>draft</option>
                <option value="pending_review" ${p.status === 'pending_review' ? 'selected' : ''}>pending_review</option>
                <option value="approved" ${p.status === 'approved' ? 'selected' : ''}>approved</option>
                <option value="in_production" ${p.status === 'in_production' ? 'selected' : ''}>in_production</option>
                <option value="finished" ${p.status === 'finished' ? 'selected' : ''}>finished</option>
                <option value="delivered" ${p.status === 'delivered' ? 'selected' : ''}>delivered</option>
                <option value="rejected" ${p.status === 'rejected' ? 'selected' : ''}>rejected</option>
              </select>
            </td>
            <td>
              <div class="td-actions">
                <button class="act-btn edit" onclick="viewCustomProject('${p.id}')">Ver</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function updateCustomProjectStatusFromTable(id, selectEl) {
  const newStatus = selectEl.value;
  const project = allCustomProjects.find(p => p.id === id);

  if (!project) {
    showToast('Criação não encontrada.', 'error');
    return;
  }

  try {
    await sbPatch('custom_projects', id, {
      status: newStatus,
      updated_at: new Date().toISOString()
    });

    project.status = newStatus;
    showToast('Estado da criação actualizado!');
    applyCustomProjectFilters();
  } catch (e) {
    console.error('[Admin] updateCustomProjectStatusFromTable:', e);
    showToast('Erro ao actualizar estado da criação.', 'error');
    selectEl.value = project.status;
  }
}

async function decrementOrderStock(order) {
  if (!order?.items?.length) return;

  for (const rawItem of order.items) {
    const item = typeof normalizeCartItem === 'function'
      ? normalizeCartItem(rawItem)
      : rawItem;

    const productId = item.product_id || item.id || null;
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));

    if (!productId) continue;

    try {
      const rows = await sbGet(
        'products',
        `?id=eq.${productId}&select=id,name,stock,variants`
      );

      const product = rows?.[0];
      if (!product) {
        console.warn('[ADMIN] Produto não encontrado para baixar stock:', productId);
        continue;
      }

      const variants = Array.isArray(product.variants)
        ? product.variants
        : (() => {
            try {
              const parsed = JSON.parse(product.variants || '[]');
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })();

      const itemSize = String(item.size || '').trim();
      const itemColorName = String(item.color_name || '').trim();
      const itemColorHex = String(item.color_hex || '').trim().toUpperCase();

      if (variants.length) {
        let changed = false;

        const updatedVariants = variants.map(v => {
          const variantSize = String(v.size || '').trim();
          const variantColorName = String(v.color_name || '').trim();
          const variantColorHex = String(v.color_hex || '').trim().toUpperCase();

          const sameSize = variantSize === itemSize;
          const sameColor =
            (itemColorName && variantColorName === itemColorName) ||
            (itemColorHex && variantColorHex === itemColorHex);

          if (sameSize && sameColor) {
            const currentVariantStock = Math.max(0, parseInt(v.stock || 0, 10));
            const newVariantStock = Math.max(0, currentVariantStock - qty);

            changed = true;

            return {
              ...v,
              stock: newVariantStock
            };
          }

          return v;
        });

        if (changed) {
          const totalStock = updatedVariants.reduce((sum, v) => {
            return sum + Math.max(0, parseInt(v.stock || 0, 10));
          }, 0);

          await sbPatch('products', productId, {
            variants: updatedVariants,
            stock: totalStock
          });

          console.log('[ADMIN] Stock por variante atualizado:', {
            product_id: productId,
            product_name: product.name,
            size: itemSize,
            color_name: itemColorName,
            color_hex: itemColorHex,
            quantity: qty
          });

          continue;
        }
      }

      const currentStock = Math.max(0, parseInt(product.stock || 0, 10));
      const newStock = Math.max(0, currentStock - qty);

      await sbPatch('products', productId, {
        stock: newStock
      });

      console.log('[ADMIN] Stock global atualizado:', {
        product_id: productId,
        product_name: product.name,
        old_stock: currentStock,
        quantity: qty,
        new_stock: newStock
      });

    } catch (e) {
      console.error('[ADMIN] decrementOrderStock error:', {
        product_id: productId,
        error: e
      });
    }
  }
}

async function moveCustomProjectsToPendingReview(orderRef) {
  if (!orderRef) return;

  try {
    const rows = await sbGet('custom_projects', `?order_ref=eq.${orderRef}`);

    if (!rows?.length) {
      console.log('[ADMIN] Nenhum custom_project ligado à order_ref:', orderRef);
      return;
    }

    for (const project of rows) {
      await sbPatch('custom_projects', project.id, {
        status: 'pending_review',
        updated_at: new Date().toISOString()
      });
    }

    console.log('[ADMIN] custom_projects movidos para pending_review:', orderRef);
  } catch (e) {
    console.error('[ADMIN] moveCustomProjectsToPendingReview error:', e);
  }
}

function mapCustomProjectStatusToOrderStatus(customStatus) {
  const map = {
    pending_review: 'paid',
    approved: 'paid',
    in_production: 'production',
    finished: 'production',
    shipped: 'shipped',
    delivered: 'delivered',
    rejected: 'cancelled'
  };

  return map[customStatus] || null;
}

//
async function moveCustomProjectsToPendingReview(orderRef) {
  if (!orderRef) return;

  try {
    const rows = await sbGet('custom_projects', `?order_ref=eq.${orderRef}`);

    if (!rows?.length) {
      console.log('[ADMIN] Nenhum custom_project ligado à order_ref:', orderRef);
      return;
    }

    for (const project of rows) {
      await sbPatch('custom_projects', project.id, {
        status: 'pending_review',
        updated_at: new Date().toISOString()
      });
    }

    console.log('[ADMIN] custom_projects movidos para pending_review:', orderRef);
  } catch (e) {
    console.error('[ADMIN] moveCustomProjectsToPendingReview error:', e);
  }
}
///
function mapCustomProjectStatusClass(status) {
  const map = {
    pending_payment: 'pending',
    pending_review: 'pending',
    approved: 'paid',
    in_production: 'production',
    finished: 'production',
    shipped: 'shipped',
    delivered: 'paid',
    rejected: 'danger'
  };

  return map[status] || 'pending';
}
////
async function syncOrderStatusFromCustomProject(project, newCustomStatus) {
  if (!project?.order_ref) return;

  const mappedOrderStatus = mapCustomProjectStatusToOrderStatus(newCustomStatus);
  if (!mappedOrderStatus) return;

  try {
    const orders = await sbGet(
      'orders',
      `?order_ref=eq.${project.order_ref}&select=id,order_ref,payment_status,status`
    );

    if (!orders?.length) return;

    const order = orders[0];

    if (order.payment_status !== 'paid') {
      console.warn('[ADMIN] Pedido ainda não pago. Sync abortado:', project.order_ref);
      return;
    }

    await sbPatch('orders', order.id, {
      status: mappedOrderStatus
    });

    console.log('[ADMIN] Pedido sincronizado com custom_project:', {
      order_ref: project.order_ref,
      custom_status: newCustomStatus,
      order_status: mappedOrderStatus
    });
  } catch (e) {
    console.error('[ADMIN] syncOrderStatusFromCustomProject error:', e);
  }
}
///
function buildDownloadButton(url, label, filename = 'ficheiro') {
  if (!url) return '';
  return `
    <a class="btn btn-outline" href="${url}" download="${filename}" target="_blank" rel="noopener noreferrer">
      ${label}
    </a>
  `;
}

function getKimeraCriarStoreId() {
  return '6f866e10-5708-4be4-aac5-240175b23fe6';
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function viewCustomProject(id) {
  const project = (allCustomProjects || []).find(p => p.id === id);

  if (!project) {
    showToast('Criação não encontrada.', 'error');
    return;
  }

  const paymentLocked = project.order_payment_status && project.order_payment_status !== 'paid';
  const body = document.getElementById('modalCustomProjectBody');

  if (!body) {
    showToast('Modal da criação não encontrado.', 'error');
    return;
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Informações do Projeto</h4>
        <p style="margin:0 0 8px;"><strong>Project Ref:</strong> ${project.project_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Order Ref:</strong> ${project.order_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Cliente:</strong> ${project.customer_name || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Contacto:</strong> ${project.customer_phone || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Loja:</strong> ${project.store_name || 'KIMERA MZ'}</p>
        <p style="margin:0 0 8px;"><strong>Tipo:</strong> ${project.fit_type || project.product_type || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Tamanho:</strong> ${project.size || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Quantidade:</strong> ${project.quantity || 1}</p>
        <p style="margin:0 0 8px;"><strong>Cor base:</strong> ${project.shirt_color || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Total:</strong> ${fmtMT(project.total_price || 0)}</p>
        <p style="margin:0;"><strong>Estado:</strong> ${project.status || 'pending_payment'}</p>
      </div>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Downloads Técnicos</h4>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${buildDownloadButton(project.front_mockup_url, 'Mockup Frente', 'mockup_frente.png')}
          ${buildDownloadButton(project.back_mockup_url, 'Mockup Costas', 'mockup_costas.png')}
          ${buildDownloadButton(project.front_original_upload_url, 'Imagem Adicionada Frente', 'imagem_adicionada_frente.png')}
          ${buildDownloadButton(project.back_original_upload_url, 'Imagem Adicionada Costas', 'imagem_adicionada_costas.png')}
          ${buildDownloadButton(project.front_text_png_url, 'Texto Transparente Frente', 'texto_frente.png')}
          ${buildDownloadButton(project.back_text_png_url, 'Texto Transparente Costas', 'texto_costas.png')}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Mockup Frente</h4>
        ${project.front_mockup_url
          ? `<img src="${project.front_mockup_url}" style="width:100%;border-radius:12px;">`
          : '<p style="color:#9E9E9E;">Sem mockup de frente.</p>'}
      </div>

      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Mockup Costas</h4>
        ${project.back_mockup_url
          ? `<img src="${project.back_mockup_url}" style="width:100%;border-radius:12px;">`
          : '<p style="color:#9E9E9E;">Sem mockup de costas.</p>'}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Imagem enviada pelo cliente (Frente)</h4>
        ${project.front_original_upload_url
          ? `
            <img src="${project.front_original_upload_url}" style="width:100%;border-radius:12px;margin-bottom:12px;">
            <div>${buildDownloadButton(project.front_original_upload_url, 'Imagem Adicionada Frente', 'imagem_adicionada_frente.png')}</div>
          `
          : '<p style="color:#9E9E9E;">Sem imagem enviada pelo cliente na frente.</p>'}
      </div>

      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Imagem enviada pelo cliente (Costas)</h4>
        ${project.back_original_upload_url
          ? `
            <img src="${project.back_original_upload_url}" style="width:100%;border-radius:12px;margin-bottom:12px;">
            <div>${buildDownloadButton(project.back_original_upload_url, 'Imagem Adicionada Costas', 'imagem_adicionada_costas.png')}</div>
          `
          : '<p style="color:#9E9E9E;">Sem imagem enviada pelo cliente nas costas.</p>'}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Texto Transparente Frente</h4>
        ${project.front_text_png_url
          ? `<img src="${project.front_text_png_url}" style="width:100%;border-radius:12px;background-image:linear-gradient(45deg,#f5f5f5 25%,transparent 25%),linear-gradient(-45deg,#f5f5f5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f5f5f5 75%),linear-gradient(-45deg,transparent 75%,#f5f5f5 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0px;">`
          : '<p style="color:#9E9E9E;">Sem texto transparente de frente.</p>'}
      </div>

      <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Texto Transparente Costas</h4>
        ${project.back_text_png_url
          ? `<img src="${project.back_text_png_url}" style="width:100%;border-radius:12px;background-image:linear-gradient(45deg,#f5f5f5 25%,transparent 25%),linear-gradient(-45deg,#f5f5f5 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f5f5f5 75%),linear-gradient(-45deg,transparent 75%,#f5f5f5 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0px;">`
          : '<p style="color:#9E9E9E;">Sem texto transparente de costas.</p>'}
      </div>
    </div>

    <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;margin-bottom:20px;">
      <h4 style="margin:0 0 12px;font-size:16px;">Dados Técnicos Frente</h4>
      <pre style="white-space:pre-wrap;font-size:12px;color:#555;background:#fafafa;border-radius:10px;padding:12px;overflow:auto;">${escapeHtml(JSON.stringify(project.front_design_json || {}, null, 2))}</pre>
    </div>

    <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;margin-bottom:20px;">
      <h4 style="margin:0 0 12px;font-size:16px;">Dados Técnicos Costas</h4>
      <pre style="white-space:pre-wrap;font-size:12px;color:#555;background:#fafafa;border-radius:10px;padding:12px;overflow:auto;">${escapeHtml(JSON.stringify(project.back_design_json || {}, null, 2))}</pre>
    </div>

    <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;margin-bottom:20px;">
      <h4 style="margin:0 0 12px;font-size:16px;">Notas internas</h4>
      <textarea id="customProjectInternalNotes" style="width:100%;min-height:100px;border:1px solid #ddd;border-radius:10px;padding:12px;font-size:13px;resize:vertical;">${project.internal_notes || ''}</textarea>
    </div>

    <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
      <h4 style="margin:0 0 12px;font-size:16px;">Estado da produção</h4>
      <p style="margin:0 0 12px;font-size:12px;color:${paymentLocked ? '#DC2626' : '#757575'};">
        ${paymentLocked
          ? 'A produção está bloqueada até o pagamento deste pedido ser confirmado.'
          : 'O fluxo técnico só deve avançar após confirmação do pagamento.'}
      </p>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <select id="customProjectStatusSelect" class="status-select">
          <option value="pending_payment" ${project.status === 'pending_payment' ? 'selected' : ''}>pending_payment</option>
          <option value="pending_review" ${project.status === 'pending_review' ? 'selected' : ''}>pending_review</option>
          <option value="approved" ${project.status === 'approved' ? 'selected' : ''}>approved</option>
          <option value="in_production" ${project.status === 'in_production' ? 'selected' : ''}>in_production</option>
          <option value="finished" ${project.status === 'finished' ? 'selected' : ''}>finished</option>
          <option value="shipped" ${project.status === 'shipped' ? 'selected' : ''}>shipped</option>
          <option value="delivered" ${project.status === 'delivered' ? 'selected' : ''}>delivered</option>
          <option value="rejected" ${project.status === 'rejected' ? 'selected' : ''}>rejected</option>
        </select>

        <button class="btn btn-red" onclick="updateCustomProjectStatus('${project.id}')">
          Guardar Estado
        </button>
      </div>
    </div>
  `;

  openModal('modalCustomProjectView');
}



async function updateCustomProjectStatus(id) {
  const select = document.getElementById('customProjectStatusSelect');
  const notes = document.getElementById('customProjectInternalNotes');

  if (!select) return;

  const newStatus = select.value;
  const internalNotes = notes?.value.trim() || '';

  const project = (allCustomProjects || []).find(p => p.id === id);
  if (!project) {
    showToast('Projeto não encontrado.', 'error');
    return;
  }

  try {
    const orderRows = await sbGet(
      'orders',
      `?order_ref=eq.${project.order_ref}&select=id,order_ref,payment_status,status`
    );

    const linkedOrder = orderRows?.[0] || null;

    const technicalStatuses = [
      'pending_review',
      'approved',
      'in_production',
      'finished',
      'shipped',
      'delivered'
    ];

    if (technicalStatuses.includes(newStatus) && linkedOrder?.payment_status !== 'paid') {
      showToast('A produção só pode avançar depois da confirmação do pagamento.', 'error');
      return;
    }

    await sbPatch('custom_projects', id, {
      status: newStatus,
      internal_notes: internalNotes,
      updated_at: new Date().toISOString()
    });

    await syncOrderStatusFromCustomProject(project, newStatus);

    showToast('Estado da criação actualizado!');
    await loadCustomProjects();
    await loadOrders?.(true);
    closeModal('modalCustomProjectView');
  } catch (e) {
    console.error('[ADMIN] updateCustomProjectStatus:', e);
    showToast('Erro ao actualizar estado da criação.', 'error');
  }
}

function generateCouponCode() {
  const code = 'KIM' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const input = document.getElementById('cupomCode');
  if (input) input.value = code;
}

function renderCouponStats(coupons = []) {
  const wrap = document.getElementById('couponStats');
  if (!wrap) return;

  const now = new Date();

  const total = coupons.length;
  const active = coupons.filter(c => c.is_active).length;
  const expired = coupons.filter(c => c.expires_at && new Date(c.expires_at) < now).length;
  const usedAtLeastOnce = coupons.filter(c => (c.used_count || 0) > 0).length;
  const available = coupons.filter(c =>
    c.is_active &&
    (!c.expires_at || new Date(c.expires_at) >= now) &&
    (c.used_count || 0) < (c.max_uses || 1)
  ).length;

  wrap.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-info">
        <span class="kpi-label">Total de Cupons</span>
        <span class="kpi-value">${total}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-info">
        <span class="kpi-label">Activos</span>
        <span class="kpi-value">${active}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-info">
        <span class="kpi-label">Expirados</span>
        <span class="kpi-value">${expired}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-info">
        <span class="kpi-label">Já Usados</span>
        <span class="kpi-value">${usedAtLeastOnce}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-info">
        <span class="kpi-label">Disponíveis</span>
        <span class="kpi-value">${available}</span>
      </div>
    </div>
  `;
}

async function loadCoupons() {
  const wrap = document.getElementById('cuponsTable');
  if (!wrap) return;

  wrap.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';

  try {
    const coupons = await sbGet('coupons', '?order=created_at.desc');
    renderCouponStats(coupons || []);

    if (!coupons?.length) {
      wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem cupons criados.</p>';
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Desconto</th>
            <th>Validade</th>
            <th>Usos</th>
            <th>Restrição</th>
            <th>Estado</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${coupons.map(c => `
            <tr>
              <td class="order-id">${c.code}</td>
              <td>${c.discount_pct}%</td>
              <td>
                ${c.expires_at ? fmtDate(c.expires_at) : 'Sem prazo'}
                ${c.expires_at && new Date(c.expires_at) < new Date()
        ? '<div style="font-size:11px;color:#DC2626;">Expirado</div>'
        : ''
      }
              </td>
              <td>
                ${c.used_count || 0} / ${c.max_uses || 1}
                ${(c.used_count || 0) >= (c.max_uses || 1)
        ? '<div style="font-size:11px;color:#D97706;">Esgotado</div>'
        : ''
      }
              </td>
              <td>${c.assigned_phone || 'Livre'}</td>
              <td>
                <span class="status-pill ${c.is_active ? 'paid' : 'pending'}">
                  ${c.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <div class="td-actions">
                  <button class="act-btn edit" onclick="editCupom('${c.id}')">Editar</button>
                  <button class="act-btn ${c.is_active ? 'del' : 'edit'}" onclick="toggleCupomStatus('${c.id}', ${!c.is_active})">
                    ${c.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button class="act-btn del" onclick="deleteCupom('${c.id}')">Apagar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error('[Admin] loadCoupons:', e);
    wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar cupons.</p>';
  }
}

async function saveCupom() {
  const id = document.getElementById('cupomEditId')?.value || '';
  const code = document.getElementById('cupomCode')?.value.trim().toUpperCase();
  const description = document.getElementById('cupomDesc')?.value.trim() || '';
  const discount_pct = parseInt(document.getElementById('cupomDiscount')?.value || '0', 10);
  const expiryRaw = document.getElementById('cupomExpiry')?.value || '';
  const max_uses = parseInt(document.getElementById('cupomMaxUses')?.value || '1', 10);
  const assigned_phone = document.getElementById('cupomAssignedPhone')?.value.trim() || null;
  const is_active = document.getElementById('cupomActive')?.checked === true;

  if (!code) {
    showToast('Código do cupom obrigatório.', 'error');
    return;
  }

  if (!discount_pct || discount_pct < 1 || discount_pct > 100) {
    showToast('Desconto inválido.', 'error');
    return;
  }

  const payload = {
    code,
    description,
    discount_pct,
    expires_at: expiryRaw ? new Date(expiryRaw).toISOString() : null,
    max_uses: max_uses > 0 ? max_uses : 1,
    assigned_phone,
    is_active
  };

  try {
    if (id) {
      await sbPatch('coupons', id, payload);
      showToast('Cupom actualizado!');
    } else {
      await sbPost('coupons', {
        ...payload,
        used_count: 0
      });
      showToast('Cupom criado!');
    }

    closeModal('modalCupom');
    loadCoupons();
  } catch (e) {
    console.error('[Admin] saveCupom:', e);
    showToast('Erro ao guardar cupom: ' + (e.message || 'desconhecido'), 'error');
  }
}

async function editCupom(id) {
  try {
    const rows = await sbGet('coupons', `?id=eq.${id}`);
    const c = rows?.[0];
    if (!c) return;

    document.getElementById('cupomEditId').value = c.id;
    document.getElementById('cupomCode').value = c.code || '';
    document.getElementById('cupomDesc').value = c.description || '';
    document.getElementById('cupomDiscount').value = c.discount_pct || '';
    document.getElementById('cupomExpiry').value = c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 16) : '';
    document.getElementById('cupomMaxUses').value = c.max_uses || 1;
    document.getElementById('cupomAssignedPhone').value = c.assigned_phone || '';
    document.getElementById('cupomActive').checked = c.is_active === true;
    document.getElementById('cupomModalTitle').textContent = 'Editar Cupom';

    openModal('modalCupom');
  } catch (e) {
    showToast('Erro ao carregar cupom.', 'error');
  }
}

async function toggleCupomStatus(id, status) {
  try {
    await sbPatch('coupons', id, { is_active: status });
    showToast(status ? 'Cupom activado!' : 'Cupom desactivado.', 'info');
    loadCoupons();
  } catch (e) {
    showToast('Erro ao mudar estado do cupom.', 'error');
  }
}

async function deleteCupom(id) {
  if (!confirm('Apagar este cupom?')) return;

  try {
    await sbDelete('coupons', id);
    showToast('Cupom apagado.');
    loadCoupons();
  } catch (e) {
    showToast('Erro ao apagar cupom.', 'error');
  }
}

/*async function loadDeliveryProofs() {
  const grid = document.getElementById('provasGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';

  try {
    const rows = await sbGet(
      'delivery_proofs',
      '?order=created_at.desc&select=*'
    );

    if (!rows || !rows.length) {
      grid.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Nenhuma prova encontrada.</p>';
      return;
    }

    grid.innerHTML = rows.map(p => `
      <div class="proof-admin-card">
        <div class="proof-admin-img-wrap">
          <img src="${p.image_url}" alt="Prova de entrega" class="proof-admin-img">
        </div>

        <div class="proof-admin-body">
          <p><strong>Pedido:</strong> ${p.order_ref || '—'}</p>
          <p><strong>Cliente:</strong> ${p.customer_name || '—'}</p>
          <p><strong>Data:</strong> ${p.created_at ? new Date(p.created_at).toLocaleDateString('pt-MZ') : '—'}</p>
          <p>
            <strong>Estado:</strong>
            <span class="status-pill ${p.is_approved ? 'paid' : 'pending'}">
              ${p.is_approved ? 'Aprovada' : 'Pendente'}
            </span>
          </p>

          <div class="proof-admin-actions">
            ${!p.is_approved
              ? `<button class="btn btn-red btn-sm" onclick="approveDeliveryProof('${p.id}')">Aprovar</button>`
              : `<button class="btn btn-outline btn-sm" onclick="rejectDeliveryProof('${p.id}')">Rejeitar</button>`
            }
            <button class="btn btn-outline btn-sm" onclick="deleteDeliveryProof('${p.id}')">Apagar</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('[Admin] loadDeliveryProofs:', e);
    grid.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar provas.</p>';
  }
}

window.approveDeliveryProof = async function (id) {
  try {
    await sbPatch('delivery_proofs', id, { is_approved: true });
    showToast('Prova aprovada com sucesso!');
    await loadDeliveryProofs();
  } catch (e) {
    console.error('[Admin] approveDeliveryProof:', e);
    showToast('Erro ao aprovar prova.', 'error');
  }
};

window.rejectDeliveryProof = async function (id) {
  try {
    await sbPatch('delivery_proofs', id, { is_approved: false });
    showToast('Prova rejeitada.');
    await loadDeliveryProofs();
  } catch (e) {
    console.error('[Admin] rejectDeliveryProof:', e);
    showToast('Erro ao rejeitar prova.', 'error');
  }
};

window.deleteDeliveryProof = async function (id) {
  const ok = confirm('Tem certeza que deseja apagar esta prova de entrega?');
  if (!ok) return;

  try {
    await sbDelete('delivery_proofs', id);
    showToast('Prova apagada com sucesso!');
    await loadDeliveryProofs();
  } catch (e) {
    console.error('[Admin] deleteDeliveryProof:', e);
    showToast('Erro ao apagar prova.', 'error');
  }
};*/

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

    const kpiRevenue = document.getElementById('kpiRevenue');
    const kpiOrders = document.getElementById('kpiOrders');
    const kpiStores = document.getElementById('kpiStores');
    const kpiCommissions = document.getElementById('kpiCommissions');
    const pendingBadge = document.getElementById('pendingBadge');

    if (kpiRevenue) kpiRevenue.textContent = fmtMT(revenue);
    if (kpiOrders) kpiOrders.textContent = String(orders.length);
    if (kpiStores) kpiStores.textContent = String(stores.filter(s => s.is_active).length);
    if (kpiCommissions) kpiCommissions.textContent = fmtMT(commissions);
    if (pendingBadge) pendingBadge.textContent = String(pending);

    const recent = await sbGet(
      'orders',
      '?order=created_at.desc&limit=8&select=order_ref,total,status,payment_status'
    );
    renderRecentOrders(recent || []);

    try {
      if (typeof loadAnalytics === 'function') {
        await loadAnalytics();
      }
    } catch (e) {
      console.error('[Admin] loadAnalytics error:', e);
    }

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

async function loadOrders(silent = false) {
  const wrap = getByAnyId('ordersTable', 'ordersWrap', 'ordersTableWrap', 'pedidosTable');
  if (!wrap) return;

  if (!silent) {
    wrap.innerHTML = '<div style="padding:20px;text-align:center;"><div class="loading-spinner"></div></div>';
  }

  try {
    const rows = await sbGet('orders', '?order=created_at.desc&select=*');

    const oldJson = JSON.stringify(allOrders || []);
    const newJson = JSON.stringify(rows || []);

    if (silent && oldJson === newJson) {
      return;
    }

    allOrders = rows || [];
    renderOrdersTable(allOrders);
  } catch (e) {
    console.error('[Admin] loadOrders:', e);

    if (!silent) {
      wrap.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar pedidos.</p>';
    }
  }
}

function populateOrderStoreFilter(orders = []) {
  const sel = document.getElementById('orderStoreFilter');
  if (!sel) return;

  const current = sel.value;
  const stores = [...new Set(
    orders.map(o => o.store_name).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  sel.innerHTML = `
    <option value="">Todas as lojas</option>
    ${stores.map(store => `<option value="${store}">${store}</option>`).join('')}
  `;

  if (stores.includes(current)) {
    sel.value = current;
  }
}

function normalizeOrderItemForDisplay(item = {}) {
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

function renderOrderItems(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<span style="color:#9E9E9E;">—</span>';
  }

  return items.map(rawItem => {
    const item = normalizeOrderItemForDisplay(rawItem);

    const itemName = item.name || 'Produto';
    const itemQty = Number(item.quantity || 1);
    const itemSize = item.size || '';
    const itemColorName = item.color_name || '';
    const itemColorHex = item.color_hex || '';

    return `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;min-width:220px;">
        <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;background:#f3f3f3;flex-shrink:0;">
          ${item.thumbnail_url
        ? `<img src="${item.thumbnail_url}" alt="${itemName}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#eee;">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
                   <rect x="3" y="3" width="18" height="18" rx="2"/>
                   <circle cx="8.5" cy="8.5" r="1.5"/>
                   <polyline points="21 15 16 10 5 21"/>
                 </svg>
               </div>`
      }
        </div>

        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:13px;color:#111;line-height:1.3;overflow-wrap:anywhere;">
            ${itemName}
          </div>

          <div style="font-size:12px;color:#666;line-height:1.45;">
            Qtd: ${itemQty}
            ${itemSize ? ` | Tam: ${itemSize}` : ''}
            ${itemColorName ? ` | Cor: ${itemColorName}` : ''}
            ${!itemColorName && itemColorHex ? ` | Cor` : ''}
            ${itemColorHex ? `
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${itemColorHex};border:1px solid #ddd;margin-left:5px;vertical-align:-1px;"></span>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

let adminOrdersPollInterval = null;

function startAdminOrdersPolling() {
  stopAdminOrdersPolling();

  adminOrdersPollInterval = setInterval(() => {
    const pedidosSection = document.getElementById('sec-pedidos');
    if (!pedidosSection || !pedidosSection.classList.contains('active')) return;
    if (document.hidden) return;

    loadOrders(true);
  }, 10000);
}

function stopAdminOrdersPolling() {
  if (adminOrdersPollInterval) {
    clearInterval(adminOrdersPollInterval);
    adminOrdersPollInterval = null;
  }
}

function renderOrderItemsDetailed(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#9E9E9E;">Sem itens.</p>';
  }

  return items.map(rawItem => {
    const item = normalizeOrderItemForDisplay(rawItem);

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
          <div><strong>Preço unitário:</strong> ${fmtMT(item.price || 0)}</div>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

function renderOrdersTable(orders) {
  const wrap = getByAnyId('ordersTable', 'ordersWrap', 'ordersTableWrap', 'pedidosTable');
  if (!wrap) {
    console.error('[Admin] Nenhum container de pedidos encontrado para render.');
    return;
  }

  if (!orders?.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem pedidos encontrados.</p>';
    return;
  }

  const grouped = groupOrdersByMasterRef(orders);

  wrap.innerHTML = grouped.map(group => {
    const groupPaymentStatus = getGroupPaymentStatus(group);
    const total = getGroupTotal(group);
    const discount = group.orders.reduce((sum, o) => sum + (o.discount || 0), 0);
    const coupons = [...new Set(group.orders.map(o => o.coupon_code).filter(Boolean))];

    return `
      <div class="order-group-card" style="background:#fff;border:1px solid #eee;border-radius:18px;padding:18px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
          <div>
            <h3 style="font-size:18px;font-weight:800;margin:0 0 6px;">Compra ${group.master_ref}</h3>
            <p style="font-size:13px;color:#666;margin:0 0 4px;"><strong>Cliente:</strong> ${group.customer_name}</p>
            <p style="font-size:13px;color:#666;margin:0 0 4px;"><strong>Contacto:</strong> ${group.customer_phone}</p>
            <p style="font-size:13px;color:#666;margin:0;"><strong>Data:</strong> ${new Date(group.created_at).toLocaleDateString('pt-MZ')}</p>
          </div>

          <div style="text-align:right;">
            <p style="font-size:13px;margin:0 0 8px;"><strong>Total geral:</strong> ${fmtMT(total)}</p>
            ${discount > 0 ? `<p style="font-size:13px;margin:0 0 8px;color:#16A34A;"><strong>Desconto:</strong> ${fmtMT(discount)}</p>` : ''}
            ${coupons.length ? `<p style="font-size:13px;margin:0 0 8px;"><strong>Cupom:</strong> ${coupons.join(', ')}</p>` : ''}
            <span class="status-pill ${groupPaymentStatus === 'paid'
        ? 'paid'
        : groupPaymentStatus === 'processing'
          ? 'pending'
          : groupPaymentStatus === 'failed'
            ? 'danger'
            : 'pending'
      }">
              ${getGroupStatusLabel(group)}
            </span>
          </div>
        </div>

        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Sub-ref</th>
                <th>Loja</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Pagamento</th>
                <th>Actualizar</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${group.orders.map(o => {
        const allowedStatuses = getAllowedAdminStatusTransitions(o.status);

        return `
                  <tr>
                    <td class="order-id">${o.order_ref}</td>
                    <td>${o.store_name || '—'}</td>
                    <td>${renderOrderItems(o.items)}</td>
                    <td>${fmtMT(o.total || 0)}</td>
                    <td>
                      <span class="status-pill ${o.status}">${o.status}</span>
                    </td>
                    <td>
                      <span class="status-pill ${o.payment_status === 'paid'
            ? 'paid'
            : ['awaiting_proof', 'processing'].includes(o.payment_status)
              ? 'pending'
              : o.payment_status === 'failed'
                ? 'danger'
                : 'pending'
          }">
                        ${o.payment_status || '—'}
                      </span>
                    </td>
                    <td>
                      <select class="status-select" onchange="updateAdminOrderStatus('${o.id}', this)">
                        ${allowedStatuses.map(status => `
                          <option value="${status}" ${o.status === status ? 'selected' : ''}>${status}</option>
                        `).join('')}
                      </select>
                    </td>
                    <td>
                      <div class="td-actions">
                        <button class="act-btn edit" onclick="viewOrder('${o.id}')">Ver</button>
                        ${['awaiting_proof', 'processing'].includes(o.payment_status)
            ? `<button class="act-btn edit" onclick="quickApproveOrder('${o.id}')">Confirmar</button>`
            : ''
          }
                        <button class="act-btn edit" onclick="openClientWhatsApp('${o.id}')">WhatsApp</button>
                      </div>
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

//ordem filtro 1
let currentOrderStatusFilter = 'all';

function filterOrdersByStatus(status, btn) {
  currentOrderStatusFilter = status;

  document.querySelectorAll('.otab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  applyOrderFilters();
}

window.filterOrders = function (status, btn) {
  filterOrdersByStatus(status, btn);
};

//ordem filtro 2
function applyOrderFilters() {
  const search = (document.getElementById('orderSearchInput')?.value || '').trim().toLowerCase();
  const storeFilter = document.getElementById('orderStoreFilter')?.value || '';

  let filtered = [...allOrders];

  if (currentOrderStatusFilter !== 'all') {
    filtered = filtered.filter(o => o.status === currentOrderStatusFilter);
  }

  if (search) {
    filtered = filtered.filter(o => {
      const text = [
        o.master_ref || '',
        o.order_ref || '',
        o.store_name || '',
        o.customer_name || ''
      ].join(' ').toLowerCase();

      return text.includes(search);
    });
  }

  if (storeFilter) {
    filtered = filtered.filter(o => o.store_name === storeFilter);
  }

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
  if (!o) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const body = document.getElementById('modalOrderViewBody');
  if (!body) return;

  const address = o.delivery_address || {};
  const itemsHtml = renderOrderItemsDetailed(o.items);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <div style="background:#fafafa;border:1px solid #eee;border-radius:14px;padding:16px;">
        <h4 style="margin:0 0 12px;font-size:16px;">Informações da Encomenda</h4>
        <p style="margin:0 0 8px;"><strong>Master Ref:</strong> ${o.master_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Order Ref:</strong> ${o.order_ref || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Loja:</strong> ${o.store_name || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Estado:</strong> ${o.status || '—'}</p>
        <p style="margin:0 0 8px;"><strong>Pagamento:</strong> ${o.payment_status || '—'}</p>
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
      <h4 style="margin:0 0 12px;font-size:16px;">Pagamento e Rastreio</h4>
      <p style="margin:0 0 8px;"><strong>Método:</strong> ${o.payment_method || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Tx Ref:</strong> ${o.payment_tx_ref || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Código do Recibo:</strong> ${o.payment_receipt_code || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Código de Registo:</strong> ${o.register_code || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Cupom:</strong> ${o.coupon_code || '—'}</p>
      <p style="margin:0 0 8px;"><strong>Desconto:</strong> ${fmtMT(o.discount || 0)}</p>
      <p style="margin:0 0 8px;"><strong>Total:</strong> ${fmtMT(o.total || 0)}</p>
      <p style="margin:0 0 8px;"><strong>Comissão:</strong> ${fmtMT(o.commission_amount || 0)}</p>
      <p style="margin:0;"><strong>Valor da Loja:</strong> ${fmtMT(o.store_amount || 0)}</p>
    </div>

    <div style="background:#fff;border:1px solid #eee;border-radius:14px;padding:16px;">
      <h4 style="margin:0 0 14px;font-size:16px;">Itens Comprados</h4>
      ${itemsHtml}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px;">
      <button class="btn btn-outline" onclick="openClientWhatsApp('${o.id}')">WhatsApp Cliente</button>
      ${['awaiting_proof', 'processing'].includes(o.payment_status)
      ? `<button class="btn btn-red" onclick="quickApproveOrder('${o.id}')">Confirmar Pagamento</button>`
      : ''
    }
    </div>
  `;

  openModal('modalOrderView');
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

    await loadOrders(true);
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
    await loadOrders(true);
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
  const el = getByAnyId('storePaymentsTable', 'paymentsTable', 'storePaymentsWrap', 'pagamentosTable');
  if (!el) {
    console.error('[Admin] Nenhum container de pagamentos encontrado.');
    return;
  }

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
    const proofs = await sbGet('delivery_proofs', '?order=created_at.desc');

    if (!proofs?.length) {
      grid.innerHTML = '<p style="padding:20px;color:#9E9E9E;grid-column:1/-1;">Sem provas enviadas.</p>';
      return;
    }

    grid.innerHTML = proofs.map(p => `
      <div class="prova-card" style="
        background:#fff;
        border:1px solid #eaeaea;
        border-radius:16px;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        min-height:460px;
        height:auto;
      ">
        <div style="
          width:100%;
          height:280px;
          background:#f8f8f8;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
          flex-shrink:0;
        ">
          <img
            src="${p.image_url}"
            alt="Entrega"
            onclick="openProofLightbox('${p.image_url}')"
            style="
              width:100%;
              height:100%;
              object-fit:cover;
              cursor:pointer;
              display:block;
            "
          >
        </div>

        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:6px;flex:1;">
          <p style="font-size:12px;color:#666;margin:0;"><strong>Ref:</strong> ${p.order_ref || '—'}</p>
          <p style="font-size:12px;color:#666;margin:0;"><strong>Cliente:</strong> ${p.customer_name || '—'}</p>
          <p style="font-size:12px;color:#666;margin:0;"><strong>Data:</strong> ${fmtDate(p.created_at)}</p>
          <p style="font-size:12px;color:#666;margin:0;">
            <strong>Estado:</strong>
            <span class="status-pill ${p.is_approved ? 'paid' : 'pending'}" style="font-size:11px;">
              ${p.is_approved ? 'Aprovada' : 'Pendente'}
            </span>
          </p>

          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            ${!p.is_approved
        ? `<button class="act-btn edit" onclick="approveProva('${p.id}')">✓ Aprovar</button>`
        : `<button class="act-btn edit" onclick="rejectProva('${p.id}')">↩ Rejeitar</button>`
      }

            <button class="act-btn del" onclick="deleteProva('${p.id}')">Apagar</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('[Admin] loadProvas:', e);
    grid.innerHTML = `<p style="padding:20px;color:#DC2626;grid-column:1/-1;">Erro: ${e.message}</p>`;
  }
}



window.approveProva = async function (id) {
  try {
    await sbPatch('delivery_proofs', id, { is_approved: true });
    showToast('Prova aprovada com sucesso!');
    await loadProvas();
  } catch (e) {
    console.error('[Admin] approveProva:', e);
    showToast('Erro ao aprovar prova.', 'error');
  }
};

window.rejectProva = async function (id) {
  try {
    await sbPatch('delivery_proofs', id, { is_approved: false });
    showToast('Prova rejeitada.');
    await loadProvas();
  } catch (e) {
    console.error('[Admin] rejectProva:', e);
    showToast('Erro ao rejeitar prova.', 'error');
  }
};

window.deleteProva = async function (id) {
  const ok = confirm('Tem certeza que deseja apagar esta prova de entrega?');
  if (!ok) return;

  try {
    await sbDelete('delivery_proofs', id);
    showToast('Prova apagada com sucesso!');
    await loadProvas();
  } catch (e) {
    console.error('[Admin] deleteProva:', e);
    showToast('Erro ao apagar prova.', 'error');
  }
};

//visitas 2
async function loadVisitsDashboard() {
  try {
    const rows = await sbGet(
      'page_visits',
      '?order=created_at.desc&limit=500&select=id,page_type,page_path,product_id,store_id,created_at'
    );

    const visits = rows || [];

    renderVisitsOverview(visits);
    renderTopVisitedPages(visits);
    renderVisitsTable(visits);
  } catch (e) {
    console.error('[Admin] loadVisitsDashboard:', e);

    const wrap1 = document.getElementById('topVisitedPages');
    const wrap2 = document.getElementById('visitsTableWrap');

    if (wrap1) {
      wrap1.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar estatísticas de visitas.</p>';
    }

    if (wrap2) {
      wrap2.innerHTML = '<p style="padding:20px;color:#DC2626;">Erro ao carregar visitas.</p>';
    }
  }
}

function renderVisitsOverview(visits = []) {
  const total = visits.length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = visits.filter(v => String(v.created_at || '').slice(0, 10) === todayStr).length;

  const uniquePages = new Set(
    visits.map(v => v.page_path).filter(Boolean)
  ).size;

  const productVisits = visits.filter(v => v.page_type === 'product' || !!v.product_id).length;

  const totalEl = document.getElementById('visitsTotal');
  const todayEl = document.getElementById('visitsToday');
  const uniqueEl = document.getElementById('visitsUniquePages');
  const productsEl = document.getElementById('visitsProducts');

  if (totalEl) totalEl.textContent = String(total);
  if (todayEl) todayEl.textContent = String(todayCount);
  if (uniqueEl) uniqueEl.textContent = String(uniquePages);
  if (productsEl) productsEl.textContent = String(productVisits);
}

function renderTopVisitedPages(visits = []) {
  const wrap = document.getElementById('topVisitedPages');
  if (!wrap) return;

  if (!visits.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem visitas registadas ainda.</p>';
    return;
  }

  const counts = {};

  visits.forEach(v => {
    const key = v.page_path || '(sem página)';
    counts[key] = (counts[key] || 0) + 1;
  });

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  wrap.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Página</th>
            <th>Visitas</th>
          </tr>
        </thead>
        <tbody>
          ${top.map(([page, count]) => `
            <tr>
              <td>${page}</td>
              <td>${count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderVisitsTable(visits = []) {
  const wrap = document.getElementById('visitsTableWrap');
  if (!wrap) return;

  if (!visits.length) {
    wrap.innerHTML = '<p style="padding:20px;color:#9E9E9E;">Sem visitas registadas ainda.</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Página</th>
            <th>Produto</th>
            <th>Loja</th>
          </tr>
        </thead>
        <tbody>
          ${visits.map(v => `
            <tr>
              <td>${fmtDate(v.created_at)}</td>
              <td>${v.page_type || '—'}</td>
              <td>${v.page_path || '—'}</td>
              <td>${v.product_id || '—'}</td>
              <td>${v.store_id || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

//visitas
async function loadAnalytics() {
  const summary = document.getElementById('analyticsSummary');
  const chart = document.getElementById('analyticsChart');
  if (!summary || !chart) return;

  try {
    const rows = await sbGet('page_visits', '?order=created_at.desc&limit=500');

    const total = rows.length;
    const uniqueVisitors = new Set(rows.map(r => r.session_id).filter(Boolean)).size;
    const productViews = rows.filter(r => r.page_type === 'product').length;
    const storeViews = rows.filter(r => r.page_type === 'store').length;
    const homeViews = rows.filter(r => r.page_type === 'home').length;

    summary.innerHTML = `
      <div class="kpi-card"><div class="kpi-info"><span class="kpi-label">Total de visitas</span><span class="kpi-value">${total}</span></div></div>
      <div class="kpi-card"><div class="kpi-info"><span class="kpi-label">Visitantes únicos</span><span class="kpi-value">${uniqueVisitors}</span></div></div>
      <div class="kpi-card"><div class="kpi-info"><span class="kpi-label">Visitas a produtos</span><span class="kpi-value">${productViews}</span></div></div>
      <div class="kpi-card"><div class="kpi-info"><span class="kpi-label">Visitas a lojas</span><span class="kpi-value">${storeViews}</span></div></div>
      <div class="kpi-card"><div class="kpi-info"><span class="kpi-label">Visitas à home</span><span class="kpi-value">${homeViews}</span></div></div>
    `;

    const byDay = {};
    rows.forEach(r => {
      const day = new Date(r.created_at).toLocaleDateString('pt-MZ');
      byDay[day] = (byDay[day] || 0) + 1;
    });

    const days = Object.keys(byDay).slice(-7);
    chart.innerHTML = days.map(day => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:90px;font-size:12px;color:#666;">${day}</div>
        <div style="flex:1;background:#f1f1f1;border-radius:999px;height:12px;overflow:hidden;">
          <div style="height:100%;background:#E53935;width:${Math.min(byDay[day] * 10, 100)}%;"></div>
        </div>
        <div style="width:40px;font-size:12px;font-weight:700;">${byDay[day]}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('[Admin] loadAnalytics:', e);
  }
}

function openProofLightbox(url) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:12px;">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
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

  loadBannerStoreOptions();

  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });


  if (document.hidden) {
    stopAdminOrdersPolling();
  } else {
    const pedidosSection = document.getElementById('sec-pedidos');
    if (pedidosSection && pedidosSection.classList.contains('active')) {
      loadOrders(true);
      startAdminOrdersPolling();
    }
  }
  const activeSection =
    document.querySelector('.admin-section.active')?.id?.replace('sec-', '') || 'dashboard';

  const activeBtn = document.querySelector('.sidebar-item.active');
  showSection(activeSection, activeBtn);
});

