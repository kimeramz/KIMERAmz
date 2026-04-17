/* checkout.js — WhatsApp manual + multi-loja */

let cartItems = [];
let couponData = null;
let orderRefs = [];

function loadCart() {
  cartItems = getCart();
  renderOrderSummary();
  updatePaymentButtons();
}

function renderOrderSummary() {
  const list = document.getElementById('checkoutItems');
  if (!list) return;

  if (!cartItems.length) {
    list.innerHTML = '<p style="color:#9E9E9E;padding:12px;font-size:14px;">Carrinho vazio. <a href="/pages">Ver produtos</a></p>';
    updateTotals();
    return;
  }

  list.innerHTML = cartItems.map((item, i) => `
    <div class="order-item">
      <div class="order-img" style="overflow:hidden;">
        ${item.thumbnail_url
          ? `<img src="${item.thumbnail_url}" style="width:100%;height:100%;object-fit:cover;">`
          : '<div style="width:100%;height:100%;background:#eee;border-radius:6px;"></div>'}
      </div>
      <div class="order-item-info">
        <p class="order-item-name">${item.name}</p>
        <p class="order-item-meta">${[item.size, item.color].filter(Boolean).join(' · ')} · x${item.quantity}</p>
        <p style="font-size:11px;color:#BDBDBD;">${item.store_name || ''}</p>
      </div>
      <div style="text-align:right;">
        <span class="order-item-price">${fmtMT(item.price * item.quantity)}</span>
        <button onclick="removeCheckoutItem(${i})"
          style="display:block;margin-top:4px;font-size:11px;color:#DC2626;background:none;border:none;cursor:pointer;">
          Remover
        </button>
      </div>
    </div>`).join('');

  updateTotals();
}

function removeCheckoutItem(idx) {
  cartItems.splice(idx, 1);
  saveCart(cartItems);
  renderOrderSummary();
  updatePaymentButtons();
}

function updateTotals() {
  const sub = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const disc = couponData ? Math.round(sub * couponData.discount_pct / 100) : 0;
  const del = cartItems.length ? KIMERA_CONFIG.business.deliveryFee : 0;
  const total = sub - disc + del;

  setText('checkSubtotal', fmtMT(sub));
  setText('checkDiscount', disc > 0 ? `− ${fmtMT(disc)}` : '0,00 MT');
  setText('checkDelivery', fmtMT(del));
  setText('checkTotal', fmtMT(total));
  setText('checkTotalBtn', `Confirmar e Enviar por WhatsApp ${fmtMT(total)}`);

  const commission = Math.round(total * KIMERA_CONFIG.business.commissionRate);
  setText('checkCommission', fmtMT(commission));

  return { sub, disc, del, total };
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function validatePayPhone(input) {
  const val = input.value.replace(/\D/g, '');
  const hint = document.getElementById('payPhoneHint');

  if (val.length >= 9) {
    if (hint) {
      hint.textContent = '✓ Número válido';
      hint.style.color = '#16A34A';
    }
  } else {
    if (hint) hint.textContent = '';
  }
}

async function applyCoupon() {
  const code = document.getElementById('cupomInput')?.value.trim().toUpperCase();
  if (!code) return;

  try {
    const rows = await sbGet('coupons', `?code=eq.${code}&is_active=eq.true`);
    if (!rows?.length) {
      showToast('Cupão inválido ou expirado.', 'error');
      return;
    }

    const c = rows[0];
    if (c.expires_at && new Date(c.expires_at) < new Date()) {
      showToast('Cupão expirado.', 'error');
      return;
    }

    if (c.used_count >= c.max_uses) {
      showToast('Cupão esgotado.', 'error');
      return;
    }

    couponData = c;
    showToast(`Cupão aplicado! ${c.discount_pct}% de desconto.`);
    updateTotals();
  } catch {
    showToast('Erro ao verificar cupão.', 'error');
  }
}

function toggleConfirm() {
  updatePaymentButtons();
}

function updatePaymentButtons() {
  const chk = document.getElementById('confirmCheck')?.checked;
  const btnWa = document.getElementById('confirmBtnWhatsApp');
  const btnMpesa = document.getElementById('confirmBtnMpesa');

  if (btnWa) {
    btnWa.disabled = !chk;
    btnWa.style.opacity = chk ? '1' : '0.5';
  }

  if (btnMpesa) {
    btnMpesa.disabled = true;
    btnMpesa.style.opacity = '0.45';
  }
}

function validateForm() {
  const name = document.getElementById('clientName')?.value.trim();
  const phone = document.getElementById('clientPhone')?.value.trim();
  const payPhone = document.getElementById('payPhone')?.value.trim();
  const province = document.getElementById('province')?.value.trim();

  if (!name) {
    showToast('Preencha o nome.', 'error');
    return null;
  }
  if (!phone) {
    showToast('Preencha o contacto.', 'error');
    return null;
  }
  if (!payPhone) {
    showToast('Introduza o número usado no pagamento.', 'error');
    return null;
  }
  if (!province) {
    showToast('Preencha o endereço de entrega.', 'error');
    return null;
  }
  if (!cartItems.length) {
    showToast('O carrinho está vazio.', 'error');
    return null;
  }

  return { name, phone, payPhone, province };
}

function groupByStore(items) {
  const map = {};
  items.forEach(item => {
    const key = item.store_id || 'no-store';
    if (!map[key]) {
      map[key] = {
        store_id: item.store_id || null,
        store_name: item.store_name || '',
        items: []
      };
    }
    map[key].items.push(item);
  });
  return Object.values(map);
}

function getStartupWhatsapp() {
  const raw = document.getElementById('startupWhatsapp')?.value || '+258 849368285';
  return raw.replace(/\D/g, '');
}

function formatPhone258(v) {
  return '258' + String(v || '').replace(/\D/g, '');
}

async function createOrdersManual(formData) {
  const { name, phone, payPhone, province } = formData;
  const { sub, disc, del, total } = updateTotals();
  const extra = document.getElementById('extraInfo')?.value.trim() || '';
  const groups = groupByStore(cartItems);

  const createdOrders = [];

  for (const group of groups) {
    const groupSub = group.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const groupShare = sub > 0 ? groupSub / sub : 1;
    const groupDel = groups.length === 1 ? del : Math.round(del * groupShare);
    const groupDisc = Math.round(disc * groupShare);
    const groupTotal = groupSub - groupDisc + groupDel;
    const commission = Math.round(groupTotal * KIMERA_CONFIG.business.commissionRate);
    const storeAmt = groupTotal - commission;
    const ref = 'KIM-' + Date.now().toString().slice(-8) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();

    const rows = await sbPost('orders', {
      order_ref: ref,
      customer_name: name,
      customer_phone: formatPhone258(phone),
      payment_phone: formatPhone258(payPhone),

      store_id: group.store_id,
      store_name: group.store_name,

      items: group.items,
      subtotal: groupSub,
      delivery_fee: groupDel,
      discount: groupDisc,
      total: groupTotal,
      commission_amount: commission,
      store_amount: storeAmt,
      coupon_code: couponData?.code || null,

      status: 'pending',
      payment_status: 'awaiting_proof',
      payment_method: 'manual_whatsapp',

      payment_tx_ref: null,
      payment_receipt_code: null,
      register_code: null,
      proof_submitted_at: null,
      validated_at: null,
      validated_by: null,
      validation_notes: null,
      customer_notified_at: null,
      seller_notified_at: null,

      delivery_address: { province, extra }
    });

    createdOrders.push({
      id: rows[0]?.id,
      ref,
      store_name: group.store_name,
      total: groupTotal,
      items: group.items
    });
  }

  return { createdOrders, total };
}

function buildWhatsAppMessage(formData, createdOrders, total) {
  const itemsText = cartItems
    .map(i => `- ${i.name} x${i.quantity}${i.size ? ` | Tam: ${i.size}` : ''}${i.color ? ` | Cor: ${i.color}` : ''}`)
    .join('\n');

  const refsText = createdOrders
    .map(o => `- ${o.ref}${o.store_name ? ` | Loja: ${o.store_name}` : ''}`)
    .join('\n');

  return `Olá, quero confirmar o pagamento da minha encomenda.%0A%0A` +
    `Refs. da encomenda:%0A${refsText}%0A%0A` +
    `Cliente: ${formData.name}%0A` +
    `Contacto: +258${String(formData.phone).replace(/\D/g, '')}%0A` +
    `Número usado no pagamento: +258${String(formData.payPhone).replace(/\D/g, '')}%0A%0A` +
    `Itens:%0A${itemsText}%0A%0A` +
    `Total a pagar: ${fmtMT(total)}%0A%0A` +
    `Vou enviar o comprovativo nesta conversa.%0A%0A` +
    `Dados para validação:%0A` +
    `- Referência da transação:%0A` +
    `- Código do recibo:%0A`;
}

function showProcessingOverlay(name, total, phone) {
  const overlay = document.getElementById('paymentOverlay');
  if (!overlay) return;

  setText('payName', name);
  setText('payAmount', fmtMT(total));
  setText('payPhone2', phone);

  overlay.style.display = 'flex';

  const steps = [
    'A criar encomenda...',
    'A preparar mensagem de pagamento...',
    'A abrir WhatsApp para envio do comprovativo...'
  ];

  const lbl = document.getElementById('payStep');
  let i = 0;
  const iv = setInterval(() => {
    if (lbl && i < steps.length) lbl.textContent = steps[i++];
    else clearInterval(iv);
  }, 1200);

  overlay._iv = iv;
}

function hideProcessingOverlay() {
  const overlay = document.getElementById('paymentOverlay');
  if (!overlay) return;
  if (overlay._iv) clearInterval(overlay._iv);
  overlay.style.display = 'none';
}

async function placeOrderWhatsApp() {
  const form = validateForm();
  if (!form) return;

  const { total } = updateTotals();
  showProcessingOverlay(form.name, total, form.payPhone);

  try {
    const { createdOrders, total } = await createOrdersManual(form);

    orderRefs = createdOrders.map(o => o.ref);
    const primaryRef = orderRefs[0];

    const whatsappNumber = getStartupWhatsapp();
    const text = buildWhatsAppMessage(form, createdOrders, total);
    const waUrl = `https://wa.me/${whatsappNumber}?text=${text}`;

    saveCart([]);
    hideProcessingOverlay();

    window.open(waUrl, '_blank');

    showToast('Encomenda criada. Envie o comprovativo no WhatsApp para validação.', 'info');

    setTimeout(() => {
      window.location.href = `/pages/rastrear?ref=${primaryRef}&success=1`;
    }, 900);
  } catch (e) {
    console.error('[Checkout] Erro no fluxo WhatsApp:', e);
    hideProcessingOverlay();
    showToast('Erro ao criar encomenda. Tente novamente.', 'error');
  }
}

function showMpesaUnavailable() {
  showToast('M-Pesa API ainda não está configurado. Use o botão do WhatsApp.', 'warning');
}

document.addEventListener('DOMContentLoaded', loadCart);