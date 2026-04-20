/* rastrear.js — suporte a pagamento manual via WhatsApp + colunas reais */

const STATUS_MAP = {
  pending:        { label: 'Pagamento Pendente',      icon: '⏳', cls: 'pending' },
  awaiting_proof: { label: 'Pagamento Em Validação',  icon: '🔄', cls: 'pending' },
  processing:     { label: 'Pagamento Em Validação',  icon: '🔄', cls: 'pending' },
  paid:           { label: 'Pagamento Confirmado',    icon: '✅', cls: 'done' },
  production:     { label: 'Em Produção',             icon: '🏭', cls: 'active' },
  shipped:        { label: 'Enviado',                 icon: '🚚', cls: 'shipped' },
  delivered:      { label: 'Entregue',                icon: '🏠', cls: 'done' },
  cancelled:      { label: 'Cancelado',               icon: '❌', cls: 'danger' },
  failed:         { label: 'Pagamento Rejeitado',     icon: '❌', cls: 'danger' }
};

const STEPS = ['paid', 'production', 'shipped', 'delivered'];

let currentOrderRef = '';
let currentOrderId = '';
let currentOrderData = null;
let currentOrders = [];
let currentMasterRef = '';
let proofFile = null;
let pollInterval = null;

function getStartupWhatsapp() {
  return '258849368285';
}

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString('pt-MZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

async function getLinkedCustomProject(orderRef) {
  if (!orderRef) return null;

  try {
    const rows = await sbGet(
      'custom_projects',
      `?order_ref=eq.${orderRef}&select=id,order_ref,status,updated_at`
    );

    return rows?.[0] || null;
  } catch (e) {
    console.error('[Rastrear] getLinkedCustomProject:', e);
    return null;
  }
}

function mapCustomProjectStatusToTrackingStatus(customStatus) {
  const map = {
    pending_payment: 'awaiting_proof',
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

async function getDisplayStatus(order) {
  if (!order) return 'pending';

  if (order.payment_status === 'awaiting_proof') return 'awaiting_proof';
  if (order.payment_status === 'processing' && order.status === 'pending') return 'processing';
  if (order.payment_status === 'failed') return 'failed';

  if (order.payment_status !== 'paid') {
    return order.status || 'pending';
  }

  const linkedProject = await getLinkedCustomProject(order.order_ref);

  if (linkedProject?.status) {
    const mapped = mapCustomProjectStatusToTrackingStatus(linkedProject.status);
    if (mapped) return mapped;
  }

  if (order.payment_status === 'paid' && order.status === 'pending') return 'paid';

  return order.status || 'paid';
}

function normalizeTrackingItem(item = {}) {
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

function renderTrackingItems(items = [], compact = false) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="font-size:12px;color:#9E9E9E;margin:0;">Sem itens registados.</p>';
  }

  return `
    <div style="display:flex;flex-direction:column;gap:${compact ? '8px' : '10px'};margin-top:${compact ? '8px' : '10px'};">
      ${items.map(rawItem => {
        const item = normalizeTrackingItem(rawItem);
        const meta = [
          `Qtd: ${item.quantity || 1}`,
          item.size ? `Tamanho: ${item.size}` : '',
          item.color_name ? `Cor: ${item.color_name}` : ''
        ].filter(Boolean).join(' | ');

        return `
          <div style="display:flex;gap:10px;align-items:center;min-width:0;">
            <div style="width:${compact ? '38px' : '46px'};height:${compact ? '38px' : '46px'};border-radius:8px;overflow:hidden;background:#f3f3f3;flex-shrink:0;">
              ${item.thumbnail_url
                ? `<img src="${item.thumbnail_url}" alt="${item.name || 'Produto'}" style="width:100%;height:100%;object-fit:cover;">`
                : '<div style="width:100%;height:100%;background:#eee;"></div>'}
            </div>
            <div style="min-width:0;">
              <div style="font-size:${compact ? '12px' : '13px'};font-weight:800;color:#111;line-height:1.3;">${item.name || 'Produto'}</div>
              <div style="font-size:11px;color:#666;line-height:1.35;">
                ${meta || 'Item da encomenda'}
                ${item.color_hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color_hex};border:1px solid #ddd;margin-left:5px;vertical-align:-1px;"></span>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function searchOrder() {
  const input = document.getElementById('orderNum');
  const ref = input?.value.trim().toUpperCase();

  if (!ref) {
    showToast('Insira a referência do pedido.', 'error');
    return;
  }

  currentOrderRef = ref;
  await loadOrder(ref);
}

async function loadOrder(ref) {
  const trackingCard = document.getElementById('trackingCard');
  const emptyTrack = document.getElementById('emptyTrack');

  if (trackingCard) trackingCard.style.display = 'none';
  if (emptyTrack) emptyTrack.style.display = 'none';

  try {
    const rows = await sbGet(
      'orders',
      `?or=(order_ref.eq.${ref},master_ref.eq.${ref})&select=*`
    );

    if (!rows.length) {
      if (emptyTrack) emptyTrack.style.display = 'block';
      return;
    }

    if (rows.length === 1) {
      const order = rows[0];

      currentOrders = [order];
      currentOrderId = order.id;
      currentOrderRef = order.order_ref || ref;
      currentOrderData = order;
      currentMasterRef = order.master_ref || order.order_ref || ref;

      await renderOrder(order);

      if (trackingCard) trackingCard.style.display = 'block';

      startPolling(ref);
      return;
    }

    currentOrders = rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    currentOrderData = null;
    currentOrderId = '';
    currentOrderRef = ref;
    currentMasterRef = ref;

    await renderMultiOrder(currentOrders);

    if (trackingCard) trackingCard.style.display = 'block';

    startPolling(ref);
  } catch (e) {
    console.error('[Rastrear] loadOrder:', e);
    showToast('Erro ao pesquisar pedido.', 'error');
  }
}

async function renderMultiOrder(orders) {
  const trackingProduct = document.getElementById('trackingProduct');
  const timeline = document.getElementById('trackingTimeline');
  const proofSec = document.getElementById('proofSection');
  const validationBox = document.getElementById('paymentValidationBox');
  const validationContent = document.getElementById('paymentValidationContent');

  if (!trackingProduct || !timeline) return;

  const totalGeral = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalSuborders = orders.length;

  trackingProduct.innerHTML = `
    <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
      <h3 style="font-size:20px;font-weight:800;margin:0;">Compra multi-loja</h3>
      <p class="track-order-id">Ref. geral: <strong>${currentMasterRef}</strong></p>
      <p class="track-date">Sub-encomendas: <strong>${totalSuborders}</strong></p>
      <p class="track-total">Total geral: <strong>${fmtMT(totalGeral)}</strong></p>
    </div>
  `;

  if (validationBox && validationContent) {
    validationBox.style.display = 'block';
    validationContent.innerHTML = `
      <h4 style="margin:0 0 8px;font-size:15px;">Compra dividida por lojas</h4>
      <p style="margin:0;color:#616161;font-size:13px;line-height:1.5;">
        Esta compra foi dividida em várias encomendas, uma por loja. Abaixo estão os estados individuais de cada uma.
      </p>
    `;
  }

  if (proofSec) {
    proofSec.style.display = 'none';
  }

  const renderedOrders = await Promise.all(
    orders.map(async (o) => {
      const displayStatus = await getDisplayStatus(o);
      const itemsHtml = renderTrackingItems(o.items || [], true);

      return `
        <div class="timeline-step active" style="margin-bottom:16px;padding:14px;border:1px solid #eee;border-radius:14px;background:#fff;">
          <div style="width:100%;">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
              <div>
                <h4 style="margin:0 0 6px;font-size:15px;">${o.store_name || 'Loja'}</h4>
                <p style="font-size:12px;color:#E53935;margin:0 0 4px;">Ref: ${o.order_ref}</p>
                <p style="font-size:12px;color:#757575;margin:0;">Total: ${fmtMT(o.total || 0)}</p>
                ${itemsHtml}
              </div>
              <span class="track-status-pill status-${displayStatus}">
                ${STATUS_MAP[displayStatus]?.label || displayStatus}
              </span>
            </div>
          </div>
        </div>
      `;
    })
  );

  timeline.innerHTML = renderedOrders.join('');
}

async function renderOrder(order) {
  const trackingProduct = document.getElementById('trackingProduct');
  const proofSec = document.getElementById('proofSection');
  const validationBox = document.getElementById('paymentValidationBox');
  const validationContent = document.getElementById('paymentValidationContent');

  if (!trackingProduct) return;

  const items = order.items || [];
  const first = items[0] || {};
  const displayStatus = await getDisplayStatus(order);
  const itemsHtml = renderTrackingItems(items, false);

  const paymentMeta = `
    <div style="margin-top:10px;display:grid;gap:4px;">
      <p class="track-order-id">Referência: <strong>${order.order_ref}</strong></p>
      <p class="track-date">Encomendado: ${new Date(order.created_at).toLocaleDateString('pt-MZ', { day:'2-digit', month:'long', year:'numeric' })}</p>
      <p class="track-total">Total: <strong>${fmtMT(order.total)}</strong></p>
      ${order.register_code ? `<p style="font-size:12px;color:#16A34A;">Código de registo: <strong>${order.register_code}</strong></p>` : ''}
      ${order.validated_at ? `<p style="font-size:12px;color:#616161;">Pagamento validado em: <strong>${fmtDateTime(order.validated_at)}</strong></p>` : ''}
    </div>
  `;

  trackingProduct.innerHTML = `
    <div class="track-img">
      ${first.thumbnail_url
        ? `<img src="${first.thumbnail_url}" alt="${first.name || 'Produto'}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`
        : '<div style="width:100%;height:100%;background:#eee;border-radius:8px;"></div>'}
    </div>
    <div style="flex:1;min-width:0;">
      <h3>${items.map(i => normalizeTrackingItem(i).name).join(', ') || 'Encomenda'}</h3>
      ${itemsHtml}
      ${paymentMeta}
    </div>
    <div class="track-status-pill status-${displayStatus}">
      ${STATUS_MAP[displayStatus]?.label || displayStatus}
    </div>`;

  if (validationBox && validationContent) {
    validationBox.style.display = 'none';

    if (displayStatus === 'awaiting_proof') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;">Pagamento em validação</h4>
        <p style="margin:0;color:#616161;font-size:13px;line-height:1.5;">
          A sua encomenda foi registada e o pagamento está a ser analisado pela equipa da Kimera.
          Assim que a validação terminar, o estado será atualizado automaticamente.
        </p>
      `;
    } else if (displayStatus === 'processing') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;">Comprovativo em análise</h4>
        <p style="margin:0;color:#616161;font-size:13px;line-height:1.5;">
          O pagamento está neste momento em validação interna.
          Não é necessário reenviar comprovativo.
        </p>
        ${order.proof_submitted_at ? `
          <p style="margin:10px 0 0;font-size:12px;color:#9E9E9E;">
            Registado em: <strong>${fmtDateTime(order.proof_submitted_at)}</strong>
          </p>` : ''}
      `;
    } else if (displayStatus === 'failed' || order.status === 'cancelled') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;color:#DC2626;">Pagamento não validado</h4>
        <p style="margin:0;color:#616161;font-size:13px;line-height:1.5;">
          O pagamento não foi confirmado pela equipa da Kimera.
          Entre em contacto com o suporte para mais informações.
        </p>
        ${order.validation_notes ? `
          <p style="margin:10px 0 0;font-size:12px;color:#DC2626;">
            Motivo: <strong>${order.validation_notes}</strong>
          </p>` : ''}
      `;
    } else if (displayStatus === 'paid' && order.status === 'pending') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;color:#16A34A;">Pagamento confirmado</h4>
        <p style="margin:0 0 10px;color:#616161;font-size:13px;line-height:1.5;">
          O pagamento foi validado com sucesso. A encomenda seguirá agora para preparação.
        </p>
        ${order.register_code ? `<p style="margin:0;font-size:12px;color:#16A34A;">Código de registo: <strong>${order.register_code}</strong></p>` : ''}
      `;
    } else if (['production', 'shipped', 'delivered'].includes(displayStatus)) {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;color:#16A34A;">Pagamento confirmado</h4>
        <p style="margin:0 0 10px;color:#616161;font-size:13px;line-height:1.5;">
          O pagamento já foi validado e a encomenda está a seguir o fluxo normal.
        </p>
        ${order.register_code ? `<p style="margin:0;font-size:12px;color:#16A34A;">Código de registo: <strong>${order.register_code}</strong></p>` : ''}
        ${order.validated_at ? `<p style="margin:6px 0 0;font-size:12px;color:#616161;">Validado em: <strong>${fmtDateTime(order.validated_at)}</strong></p>` : ''}
      `;
    }
  }

  renderTimeline(displayStatus);

  if (proofSec) {
    if (displayStatus === 'delivered') {
      proofSec.style.display = 'block';
      checkExistingProof(order.id);
    } else {
      proofSec.style.display = 'none';
    }
  }
}

function renderTimeline(currentStatus) {
  const timeline = document.getElementById('trackingTimeline');
  if (!timeline) return;

  if (currentStatus === 'awaiting_proof' || currentStatus === 'processing' || currentStatus === 'failed' || currentStatus === 'cancelled') {
    timeline.innerHTML = `
      <div class="timeline-step active">
        <div class="t-icon active">${STATUS_MAP[currentStatus]?.icon || '⏳'}</div>
        <div class="t-info">
          <h4>${STATUS_MAP[currentStatus]?.label || currentStatus}</h4>
          <p>Estado actual</p>
        </div>
      </div>
    `;
    return;
  }

  const currentIdx = STEPS.indexOf(currentStatus);

  timeline.innerHTML = STEPS.map((step, i) => {
    const s = STATUS_MAP[step];
    const done = i < currentIdx || currentStatus === 'delivered';
    const active = STEPS[i] === currentStatus;

    return `
      <div class="timeline-step ${done ? 'done' : active ? 'active' : ''}">
        <div class="t-icon ${done ? 'done' : active ? 'active' : 'pending'}">
          ${done ? '✓' : s.icon}
        </div>
        <div class="t-info">
          <h4>${s.label}</h4>
          ${active ? '<p>Estado actual</p>' : done ? '<p>Concluído</p>' : '<p>A aguardar...</p>'}
        </div>
      </div>
      ${i < STEPS.length - 1 ? `<div class="t-connector ${done ? 'done' : ''}"></div>` : ''}
    `;
  }).join('');
}

async function checkExistingProof(orderId) {
  try {
    const rows = await sbGet('delivery_proofs', `?order_id=eq.${orderId}`);
    if (rows.length) {
      const uploadArea = document.getElementById('proofUploadArea');
      const uploaded = document.getElementById('proofUploaded');
      const uploadedImg = document.getElementById('proofUploadedImg');

      if (uploadArea) uploadArea.style.display = 'none';
      if (uploaded) uploaded.style.display = 'block';
      if (uploadedImg) {
        uploadedImg.innerHTML = `<img src="${rows[0].image_url}" style="max-width:100%;border-radius:12px;">`;
      }
    }
  } catch {}
}

function previewProof(input) {
  proofFile = input.files?.[0];
  if (!proofFile) return;

  const reader = new FileReader();
  reader.onload = e => {
    const previewImg = document.getElementById('proofPreviewImg');
    const preview = document.getElementById('proofPreview');
    const uploadBtn = input.parentElement?.querySelector('.upload-area-btn');

    if (previewImg) previewImg.src = e.target.result;
    if (preview) preview.style.display = 'block';
    if (uploadBtn) uploadBtn.style.display = 'none';
  };
  reader.readAsDataURL(proofFile);
}

function resetProof() {
  proofFile = null;

  const fileInput = document.getElementById('proofFileInput');
  const preview = document.getElementById('proofPreview');
  const uploadBtn = preview?.previousElementSibling;

  if (fileInput) fileInput.value = '';
  if (preview) preview.style.display = 'none';
  if (uploadBtn) uploadBtn.style.display = 'flex';
}

async function submitProof() {
  if (!proofFile || !currentOrderId || !currentOrderData) return;

  const btn = document.getElementById('proofSubmitBtn');
  if (btn) {
    btn.textContent = 'A enviar...';
    btn.disabled = true;
  }

  try {
    const safeName = proofFile.name.replace(/[^a-z0-9.]/gi, '_');
    const path = `proofs/${currentOrderId}/${Date.now()}_${safeName}`;
    const imageUrl = await sbUpload('proofs', path, proofFile);

    const items = Array.isArray(currentOrderData.items) ? currentOrderData.items : [];

    if (!items.length) {
      throw new Error('A encomenda não tem itens registados.');
    }

    for (const rawItem of items) {
      const item = normalizeTrackingItem(rawItem);

      await sbPost('delivery_proofs', {
        order_id: currentOrderId,
        order_ref: currentOrderRef,
        product_id: item.product_id || null,
        store_id: currentOrderData.store_id || null,
        customer_name: currentOrderData.customer_name || null,
        image_url: imageUrl,
        is_approved: false,
        created_at: new Date().toISOString()
      });
    }

    const uploadArea = document.getElementById('proofUploadArea');
    const uploaded = document.getElementById('proofUploaded');
    const uploadedImg = document.getElementById('proofUploadedImg');

    if (uploadArea) uploadArea.style.display = 'none';
    if (uploaded) uploaded.style.display = 'block';
    if (uploadedImg) {
      uploadedImg.innerHTML = `<img src="${imageUrl}" style="max-width:100%;border-radius:12px;">`;
    }

    showToast('Foto enviada com sucesso! Obrigado! 🙏');
  } catch (e) {
    console.error('[Rastrear] submitProof:', e);
    showToast('Erro ao enviar foto. Tente novamente.', 'error');
  } finally {
    if (btn) {
      btn.textContent = 'Enviar Foto';
      btn.disabled = false;
    }
  }
}

function startPolling(ref) {
  clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const rows = await sbGet(
        'orders',
        `?or=(order_ref.eq.${ref},master_ref.eq.${ref})&select=*`
      );

      if (!rows?.length) return;

      if (rows.length === 1) {
        currentOrderData = rows[0];
        await renderOrder(rows[0]);

        const displayStatus = await getDisplayStatus(rows[0]);
        if (['delivered', 'cancelled', 'failed'].includes(displayStatus)) {
          clearInterval(pollInterval);
        }

        return;
      }

      currentOrders = rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      await renderMultiOrder(currentOrders);

      let allFinal = true;
      for (const o of currentOrders) {
        const displayStatus = await getDisplayStatus(o);
        if (!['delivered', 'cancelled', 'failed'].includes(displayStatus)) {
          allFinal = false;
          break;
        }
      }

      if (allFinal) {
        clearInterval(pollInterval);
      }
    } catch (e) {
      console.warn('[Rastrear] polling:', e);
    }
  }, 10000);
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  const success = params.get('success');

  const successBanner = document.getElementById('successBanner');
  const orderNum = document.getElementById('orderNum');

  if (success === '1' && successBanner) {
    successBanner.style.display = 'flex';
  }

  if (ref) {
    if (orderNum) orderNum.value = ref;
    loadOrder(ref);
  }
});