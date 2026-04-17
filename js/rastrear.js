/* rastrear.js — suporte a pagamento manual via WhatsApp + colunas reais */

const STATUS_MAP = {
  pending:        { label: 'Pagamento Pendente',       icon: '⏳', cls: 'pending' },
  awaiting_proof: { label: 'Aguardando Comprovativo',  icon: '📩', cls: 'pending' },
  processing:     { label: 'Em Validação',             icon: '🔄', cls: 'pending' },
  paid:           { label: 'Pagamento Confirmado',     icon: '✅', cls: 'done' },
  production:     { label: 'Em Produção',              icon: '🏭', cls: 'active' },
  shipped:        { label: 'Enviado',                  icon: '🚚', cls: 'shipped' },
  delivered:      { label: 'Entregue',                 icon: '🏠', cls: 'done' },
  cancelled:      { label: 'Cancelado',                icon: '❌', cls: 'danger' },
  failed:         { label: 'Pagamento Rejeitado',      icon: '❌', cls: 'danger' }
};

const STEPS = ['paid', 'production', 'shipped', 'delivered'];

let currentOrderRef = '';
let currentOrderId = '';
let currentOrderData = null;
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

function getDisplayStatus(order) {
  if (order.payment_status === 'awaiting_proof') return 'awaiting_proof';
  if (order.payment_status === 'processing' && order.status === 'pending') return 'processing';
  if (order.payment_status === 'failed') return 'failed';
  if (order.payment_status === 'paid' && order.status === 'pending') return 'paid';
  return order.status;
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
    const rows = await sbGet('orders', `?order_ref=eq.${ref}&select=*`);

    if (!rows.length) {
      if (emptyTrack) emptyTrack.style.display = 'block';
      return;
    }

    const order = rows[0];
    currentOrderId = order.id;
    currentOrderRef = order.order_ref || ref;
    currentOrderData = order;

    renderOrder(order);

    if (trackingCard) trackingCard.style.display = 'block';

    startPolling(ref);
  } catch {
    showToast('Erro ao pesquisar pedido.', 'error');
  }
}

function renderOrder(order) {
  const trackingProduct = document.getElementById('trackingProduct');
  const proofSec = document.getElementById('proofSection');
  const validationBox = document.getElementById('paymentValidationBox');
  const validationContent = document.getElementById('paymentValidationContent');

  if (!trackingProduct) return;

  const items = order.items || [];
  const first = items[0] || {};
  const displayStatus = getDisplayStatus(order);

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
    <div>
      <h3>${items.map(i => i.name).join(', ')}</h3>
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
        <h4 style="margin:0 0 8px;font-size:15px;">Pagamento por validar</h4>
        <p style="margin:0 0 12px;color:#616161;font-size:13px;line-height:1.5;">
          A sua encomenda foi criada, mas ainda estamos à espera do comprovativo no WhatsApp.
          Envie o comprovativo, a referência da transação e o código do recibo.
        </p>
        <button class="btn btn-red" onclick="sendProofWhatsApp()">Enviar comprovativo por WhatsApp</button>
      `;
    } else if (displayStatus === 'processing') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;">Comprovativo em validação</h4>
        <p style="margin:0 0 10px;color:#616161;font-size:13px;line-height:1.5;">
          A equipa da Kimera está a validar os dados do pagamento antes de libertar a encomenda.
        </p>
        ${order.proof_submitted_at ? `<p style="margin:0;font-size:12px;color:#9E9E9E;">Comprovativo sinalizado em: <strong>${fmtDateTime(order.proof_submitted_at)}</strong></p>` : ''}
      `;
    } else if (displayStatus === 'failed' || order.status === 'cancelled') {
      validationBox.style.display = 'block';
      validationContent.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:15px;color:#DC2626;">Pagamento rejeitado</h4>
        <p style="margin:0 0 10px;color:#616161;font-size:13px;line-height:1.5;">
          O pagamento não foi validado. Pode reenviar o comprovativo com a referência da transação e o código do recibo.
        </p>
        ${order.validation_notes ? `<p style="margin:0 0 12px;font-size:12px;color:#DC2626;">Motivo: <strong>${order.validation_notes}</strong></p>` : ''}
        <button class="btn btn-outline" onclick="sendProofWhatsApp()">Reenviar por WhatsApp</button>
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

async function sendProofWhatsApp() {
  if (!currentOrderData) return;

  const phone = getStartupWhatsapp();
  const customerPhone = normalizePhone(currentOrderData.customer_phone || currentOrderData.payment_phone || '');

  const text =
    `Olá, quero enviar/reenviar o comprovativo da encomenda.%0A%0A` +
    `Ref. da encomenda: ${currentOrderData.order_ref}%0A` +
    `Cliente: ${currentOrderData.customer_name || '—'}%0A` +
    `Contacto: +${customerPhone || '258'}%0A` +
    `Total: ${fmtMT(currentOrderData.total || 0)}%0A%0A` +
    `Vou enviar agora:%0A` +
    `- Comprovativo%0A` +
    `- Referência da transação%0A` +
    `- Código do recibo`;

  try {
    await sbPatch('orders', currentOrderData.id, {
      payment_status: 'processing',
      proof_submitted_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[Rastrear] Não foi possível sinalizar proof_submitted_at:', e);
  }

  window.open(`https://wa.me/${phone}?text=${text}`, '_blank');

  currentOrderData.payment_status = 'processing';
  currentOrderData.proof_submitted_at = new Date().toISOString();
  renderOrder(currentOrderData);
  showToast('Agora envie o comprovativo, a referência da transação e o código do recibo.', 'info');
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
  if (!proofFile || !currentOrderId) return;

  const btn = document.getElementById('proofSubmitBtn');
  if (btn) {
    btn.textContent = 'A enviar...';
    btn.disabled = true;
  }

  try {
    const path = `proofs/${currentOrderId}/${Date.now()}_${proofFile.name.replace(/[^a-z0-9.]/gi, '_')}`;
    const imageUrl = await sbUpload('proofs', path, proofFile);

    await sbPost('delivery_proofs', {
      order_id: currentOrderId,
      order_ref: currentOrderRef,
      image_url: imageUrl,
      is_approved: false,
      created_at: new Date().toISOString()
    });

    const uploadArea = document.getElementById('proofUploadArea');
    const uploaded = document.getElementById('proofUploaded');
    const uploadedImg = document.getElementById('proofUploadedImg');

    if (uploadArea) uploadArea.style.display = 'none';
    if (uploaded) uploaded.style.display = 'block';
    if (uploadedImg) {
      uploadedImg.innerHTML = `<img src="${imageUrl}" style="max-width:100%;border-radius:12px;">`;
    }

    showToast('Foto enviada com sucesso! Obrigado! 🙏');
  } catch {
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
      const rows = await sbGet('orders', `?order_ref=eq.${ref}&select=*`);
      if (!rows?.[0]) return;

      currentOrderData = rows[0];
      renderOrder(rows[0]);

      const displayStatus = getDisplayStatus(rows[0]);
      if (['delivered', 'cancelled', 'failed'].includes(displayStatus)) {
        clearInterval(pollInterval);
      }
    } catch {
      /* silencioso */
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