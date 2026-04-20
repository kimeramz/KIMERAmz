/* carrinho.js — Carrega itens do localStorage */

let couponDiscount = 0;
const DELIVERY = KIMERA_CONFIG.business.deliveryFee || 100;

function renderCart() {
  const items = getCart();
  const vazioEl = document.getElementById('carrinhoVazio');
  const contentEl = document.getElementById('carrinhoContent');
  const listEl = document.getElementById('itemsList');
  const labelEl = document.getElementById('cartCountLabel');

  if (!items.length) {
    clearAppliedCoupon();
    if (vazioEl) vazioEl.style.display = 'flex';
    if (contentEl) contentEl.style.display = 'none';
    return;
  }

  if (vazioEl) vazioEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'grid';

  const total = items.reduce((s, i) => s + i.quantity, 0);
  if (labelEl) labelEl.textContent = `${total} ${total === 1 ? 'item' : 'itens'}`;

  listEl.innerHTML = items.map((item, idx) => `
    <div class="cart-item" data-idx="${idx}">
      <div class="item-img">
        ${item.thumbnail_url
      ? `<img src="${item.thumbnail_url}" alt="${item.name}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`
      : `<div style="width:100%;height:100%;background:#F5F5F5;border-radius:10px;display:flex;align-items:center;justify-content:center;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
    }
      </div>
      <div class="item-details">
        <div class="item-store">${item.store_name || 'Kimera Store'}</div>
        <h3 class="item-name">${item.name}</h3>
        <div class="item-meta">
          ${item.size ? `<span class="item-size">Tamanho: ${item.size}</span>` : ''}
          ${item.color_hex
      ? `<span class="item-color-dot" style="background:${item.color_hex};" title="${item.color_name || item.color_hex}"></span>`
      : ''
    }
${item.color_name ? `<span class="item-size">Cor: ${item.color_name}</span>` : ''}
        </div>
        <span class="item-unit-price">${fmtMT(item.price)} / unid.</span>
      </div>
      <div class="item-controls">
        <span class="item-price">${fmtMT(item.price * item.quantity)}</span>
        <div class="qty-row">
          <button class="qty-btn-sm" onclick="changeQty(${idx}, -1)">−</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn-sm" onclick="changeQty(${idx}, +1)">+</button>
        </div>
        <button class="remove-btn" onclick="removeCartItem(${idx})" title="Remover">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    </div>`).join('');

  updateTotals(items);
  renderCouponState(items);
}

function changeQty(idx, delta) {
  const cart = getCart();
  if (!cart[idx]) return;
  cart[idx].quantity = Math.max(1, cart[idx].quantity + delta);
  saveCart(cart);
  renderCart();
}

function removeCartItem(idx) {
  const cart = getCart();
  cart.splice(idx, 1);
  saveCart(cart);
  renderCart();
  showToast('Item removido do carrinho.', 'info');
}

function updateTotals(items) {
  const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const coupon = getAppliedCoupon();
  const discount = getCouponDiscount(sub, coupon);
  const total = Math.max(0, sub + DELIVERY - discount);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  couponDiscount = discount;

  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('totalAmt');
  const labelEl = document.getElementById('subtotalLabel');

  if (subtotalEl) subtotalEl.textContent = fmtMT(sub);
  if (totalEl) totalEl.textContent = fmtMT(total);
  if (labelEl) labelEl.textContent = `Subtotal (${count} ${count === 1 ? 'item' : 'itens'})`;

  renderDiscountRow(discount);
}

function renderDiscountRow(discount) {
  const rows = document.querySelector('.summary-rows');
  if (!rows) return;

  let row = document.getElementById('cartDiscountRow');

  if (!discount) {
    row?.remove();
    return;
  }

  if (!row) {
    row = document.createElement('div');
    row.id = 'cartDiscountRow';
    row.className = 'summary-row';
    rows.appendChild(row);
  }

  row.innerHTML = `<span>Desconto</span><span style="color:#16A34A;">− ${fmtMT(discount)}</span>`;
}

function renderCouponState(items = getCart()) {
  const msg = document.getElementById('cupomMsg');
  const input = document.getElementById('cupomCode');
  const coupon = getAppliedCoupon();
  const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = getCouponDiscount(sub, coupon);

  if (input && coupon?.code) {
    input.value = coupon.code;
  }

  if (!msg) return;

  if (coupon?.code && discount > 0) {
    msg.textContent = `✓ Cupom aplicado: ${coupon.discount_pct}% OFF (${fmtMT(discount)})`;
    msg.style.color = '#16A34A';
  } else {
    msg.textContent = '';
    msg.style.color = '';
  }
}

async function applyCouponFromCart() {
  return applyCupom();
}

async function applyCupom() {
  const code = normalizeCouponCode(document.getElementById('cupomCode')?.value);
  const msg = document.getElementById('cupomMsg');

  if (!code) {
    if (msg) {
      msg.textContent = 'Digite um cupom.';
      msg.style.color = '#DC2626';
    }
    showToast('Digite um cupom.', 'error');
    return;
  }

  try {
    const coupon = await validateCouponForCurrentUser(code);
    const items = getCart();
    const sub = items.reduce((s, i) => s + i.price * i.quantity, 0);
    couponDiscount = getCouponDiscount(sub, coupon);

    saveAppliedCoupon(coupon);
    updateTotals(items);
    renderCouponState(items);

    showToast(`Cupom aplicado: ${coupon.discount_pct}% OFF`);
  } catch (e) {
    clearAppliedCoupon();
    updateTotals(getCart());

    if (msg) {
      msg.textContent = e.message || 'Erro ao validar cupom.';
      msg.style.color = '#DC2626';
    }

    showToast(e.message || 'Erro ao validar cupom.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', renderCart);
window.addEventListener('pageshow', renderCart);
