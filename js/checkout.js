/* checkout.js — WhatsApp manual + multi-loja v6 */

let cartItems = [];
let couponData = null;
let orderRefs = [];
let masterOrderRef = '';
let cupomDate;
let checkoutInitialized = false;

function requireCheckoutAuth() {
  const user = sbCurrentUser();

  if (!user) {
    showToast('Para comprar, é obrigatório ter conta e iniciar sessão.', 'error');
    setTimeout(() => {
      window.location.href = '/pages/login';
    }, 900);
    return false;
  }

  return true;
}

function loadCart() {
  cartItems = getCart();
  renderOrderSummary();
  updatePaymentButtons();
}

async function initCheckout() {
  if (!requireCheckoutAuth()) return;

  loadCart();
  await restoreAppliedCoupon({ silent: true });
  checkoutInitialized = true;
}

function calcOrderItemFinancials(item = {}) {
  const qty = Math.max(1, parseInt(item.quantity || 1, 10));
  const unitPrice = Number(item.price || 0);
  const unitCost = Number(item.cost_price || 0);

  const unitProfit = unitPrice - unitCost;
  const grossRevenue = unitPrice * qty;
  const totalCost = unitCost * qty;
  const grossProfit = unitProfit * qty;

  const commissionRate = 0.03;
  const profitCommissionAmount = Math.max(0, grossProfit * commissionRate);
  const netProfit = grossProfit - profitCommissionAmount;

  return {
    ...item,

    unit_price: unitPrice,
    unit_cost: unitCost,
    unit_profit: unitProfit,

    gross_revenue: grossRevenue,
    total_cost: totalCost,
    gross_profit: grossProfit,

    commission_rate: commissionRate,
    profit_commission_amount: profitCommissionAmount,
    net_profit: netProfit
  };
}

function calcOrderFinancialTotals(items = []) {
  return items.reduce((acc, item) => {
    acc.gross_revenue_total += Number(item.gross_revenue || 0);
    acc.total_cost_amount += Number(item.total_cost || 0);
    acc.gross_profit_total += Number(item.gross_profit || 0);
    acc.profit_commission_amount += Number(item.profit_commission_amount || 0);
    acc.net_profit_total += Number(item.net_profit || 0);
    return acc;
  }, {
    gross_revenue_total: 0,
    total_cost_amount: 0,
    gross_profit_total: 0,
    profit_commission_amount: 0,
    net_profit_total: 0
  });
}

async function enrichCartItemsWithCost(items = []) {
  const ids = [...new Set(
    items
      .map(i => i.product_id || i.id || null)
      .filter(Boolean)
      .filter(id => !String(id).startsWith('custom-'))
  )];

  if (!ids.length) {
    return items.map(item => calcOrderItemFinancials({
      ...item,
      cost_price: Number(item.cost_price || 0)
    }));
  }

  const rows = await sbGet(
    'products',
    `?id=in.(${ids.join(',')})&select=id,cost_price`
  );

  const costMap = {};
  (rows || []).forEach(p => {
    costMap[p.id] = Number(p.cost_price || 0);
  });

  return items.map(item => {
    const productId = item.product_id || item.id || null;

    return calcOrderItemFinancials({
      ...item,
      cost_price: String(productId || '').startsWith('custom-')
        ? Number(item.cost_price || 0)
        : Number(costMap[productId] || 0)
    });
  });
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
        <p class="order-item-meta">
          ${[
            item.size ? `Tamanho: ${item.size}` : '',
            item.color_name ? `Cor: ${item.color_name}` : ''
          ].filter(Boolean).join(' · ')}
          ${item.color_hex ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color_hex};border:1px solid #ddd;margin-left:4px;vertical-align:-1px;"></span>` : ''}
          · x${item.quantity}
        </p>
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
  const disc = getCouponDiscount(sub, couponData);
  const del = cartItems.length ? KIMERA_CONFIG.business.deliveryFee : 0;
  const total = Math.max(0, sub - disc + del);

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

function normalizePhoneDigits(v = '') {
  return String(v).replace(/\D/g, '');
}

function getCheckoutCustomerPhone() {
  return normalizePhoneDigits(document.getElementById('clientPhone')?.value || '');
}

function setCouponMessage(message = '', type = 'info') {
  const msg = document.getElementById('couponMsg');
  if (!msg) return;

  const colors = {
    success: '#16A34A',
    error: '#DC2626',
    info: '#757575'
  };

  msg.textContent = message;
  msg.style.color = colors[type] || colors.info;
}

function syncCouponUI() {
  const input = document.getElementById('cupomInput');
  const applied = document.getElementById('cupomAppliedInfo');

  if (input && couponData?.code) {
    input.value = couponData.code;
  }

  if (!applied) return;

  if (couponData?.code) {
    applied.innerHTML = `Cupom <strong>${couponData.code}</strong> aplicado (${couponData.discount_pct}% OFF)`;
    applied.style.display = 'block';
  } else {
    applied.style.display = 'none';
    applied.innerHTML = '';
  }
}

async function restoreAppliedCoupon({ silent = true } = {}) {
  const saved = getAppliedCoupon();

  if (!saved?.code || !cartItems.length) {
    couponData = null;
    clearAppliedCoupon();
    syncCouponUI();
    setCouponMessage('');
    updateTotals();
    return null;
  }

  try {
    couponData = saveAppliedCoupon(
      await validateCouponForCurrentUser(saved.code, getCheckoutCustomerPhone())
    );

    syncCouponUI();
    setCouponMessage(`Cupom validado: ${couponData.discount_pct}% OFF`, 'success');
    updateTotals();
    return couponData;
  } catch (e) {
    couponData = null;
    clearAppliedCoupon();
    syncCouponUI();
    setCouponMessage(e.message || 'Cupom removido. Valide novamente.', 'error');
    updateTotals();

    if (!silent) {
      showToast(e.message || 'Cupom removido. Valide novamente.', 'error');
    }

    return null;
  }
}

async function applyCoupon() {
  const user = sbCurrentUser();
  if (!user) {
    showToast('É obrigatório iniciar sessão para usar cupom.', 'error');
    setTimeout(() => {
      window.location.href = '/pages/login';
    }, 900);
    return;
  }

  const code = normalizeCouponCode(document.getElementById('cupomInput')?.value);
  if (!code) {
    showToast('Digite um cupom.', 'error');
    return;
  }

  try {
    couponData = saveAppliedCoupon(
      await validateCouponForCurrentUser(code, getCheckoutCustomerPhone())
    );
    updateTotals();
    syncCouponUI();
    setCouponMessage(`Cupom validado: ${couponData.discount_pct}% OFF`, 'success');
    showToast(`Cupom aplicado com sucesso: ${couponData.discount_pct}% OFF`);
  } catch (e) {
    console.error('[Checkout] applyCoupon:', e);
    couponData = null;
    clearAppliedCoupon();
    updateTotals();
    syncCouponUI();
    setCouponMessage(e.message || 'Erro ao validar cupom.', 'error');
    showToast(e.message || 'Erro ao validar cupom.', 'error');
  }
}

function removeCoupon(silent = false) {
  couponData = null;
  clearAppliedCoupon();

  const input = document.getElementById('cupomInput');
  if (input) input.value = '';

  syncCouponUI();
  setCouponMessage('');
  updateTotals();

  if (!silent) {
    showToast('Cupom removido.', 'info');
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
  const digits = normalizePhoneDigits(v);
  return digits.startsWith('258') ? digits : '258' + digits;
}

function sanitizeOrderItems(items = []) {
  return items.map(item => {
    const normalized = normalizeCartItem(item);

    const clean = {
      product_id: normalized.product_id,
      name: normalized.name,
      quantity: normalized.quantity,
      price: normalized.price,
      size: normalized.size,
      color_name: normalized.color_name,
      color_hex: normalized.color_hex,
      thumbnail_url: normalized.thumbnail_url
    };

    if (normalized.customization) {
      clean.customization = normalized.customization;
    }

    return clean;
  });
}

async function validateCartStockBeforeOrder(items = []) {
  for (const rawItem of items) {
    const item = normalizeCartItem(rawItem);
    const productId = item.product_id || null;
    const qty = Math.max(1, parseInt(item.quantity || 1, 10));

    if (!productId || String(productId).startsWith('custom-')) {
      continue;
    }

    const rows = await sbGet(
      'products',
      `?id=eq.${productId}&select=id,name,stock,variants`
    );

    const product = rows?.[0];
    if (!product) {
      throw new Error(`O produto "${item.name || 'Produto'}" já não está disponível.`);
    }

    let variants = [];
    if (Array.isArray(product.variants)) {
      variants = product.variants;
    } else {
      try {
        const parsed = JSON.parse(product.variants || '[]');
        variants = Array.isArray(parsed) ? parsed : [];
      } catch {
        variants = [];
      }
    }

    if (variants.length) {
      const itemSize = String(item.size || '').trim();
      const itemColorName = String(item.color_name || '').trim();
      const itemColorHex = String(item.color_hex || '').trim().toUpperCase();

      const variant = variants.find(v => {
        const sameSize = String(v.size || '').trim() === itemSize;
        const sameColorName = String(v.color_name || '').trim() === itemColorName;
        const sameColorHex = String(v.color_hex || '').trim().toUpperCase() === itemColorHex;

        return sameSize && (sameColorName || sameColorHex);
      });

      if (!variant) {
        throw new Error(`A variante escolhida para "${product.name}" já não está disponível.`);
      }

      const variantStock = Math.max(0, parseInt(variant.stock || 0, 10));

      if (qty > variantStock) {
        throw new Error(`Stock insuficiente para "${product.name}" (${itemColorName || itemColorHex || 'cor'} / ${itemSize || 'sem tamanho'}). Disponível: ${variantStock}.`);
      }

      continue;
    }

    const productStock = Math.max(0, parseInt(product.stock || 0, 10));

    if (qty > productStock) {
      throw new Error(`Stock insuficiente para "${product.name}". Disponível: ${productStock}.`);
    }
  }
}

async function createOrdersManual(formData) {
  const { name, phone, payPhone, province } = formData;
  const extra = document.getElementById('extraInfo')?.value.trim() || '';
  const currentUser = sbCurrentUser();
  const groups = groupByStore(cartItems);

  if (!currentUser) {
    throw new Error('É obrigatório iniciar sessão para concluir a compra.');
  }

  const activeCoupon = couponData || getAppliedCoupon();
  if (activeCoupon?.code) {
    couponData = saveAppliedCoupon(
      await validateCouponForCurrentUser(activeCoupon.code, phone)
    );
  }

  const { sub, disc, del, total } = updateTotals();

  const createdOrders = [];
  const masterRef = 'KIM-' + Date.now().toString().slice(-8) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    // 1. normalizar
const sanitizedItems = sanitizeOrderItems(group.items);

// 2. enriquecer com custo + lucro
const enrichedItems = await enrichCartItemsWithCost(sanitizedItems);
const orderItems = enrichedItems;
// 3. calcular totais reais
const totals = calcOrderFinancialTotals(enrichedItems);

// 4. manter lógica de divisão de entrega/desconto
const groupSub = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0);
const groupShare = sub > 0 ? groupSub / sub : 1;
const groupDel = groups.length === 1 ? del : Math.round(del * groupShare);
const groupDisc = Math.round(disc * groupShare);
const groupTotal = groupSub - groupDisc + groupDel;

// 🔴 NOVO MODELO
const commission = totals.profit_commission_amount;
const storeAmt = totals.net_profit_total;

    const ref = `${masterRef}-${index + 1}`;

    const rows = await sbPost('orders', {
  customer_user_id: currentUser.id,
  master_ref: masterRef,
  order_ref: ref,
  customer_name: name,
  customer_phone: formatPhone258(phone),
  payment_phone: formatPhone258(payPhone),

  store_id: group.store_id,
  store_name: group.store_name,

  items: enrichedItems,

  subtotal: groupSub,
  delivery_fee: groupDel,
  discount: groupDisc,
  total: groupTotal,

  commission_amount: commission,
  store_amount: storeAmt,

  gross_revenue_total: totals.gross_revenue_total,
  total_cost_amount: totals.total_cost_amount,
  gross_profit_total: totals.gross_profit_total,
  profit_commission_rate: 0.03,
  profit_commission_amount: totals.profit_commission_amount,
  net_profit_total: totals.net_profit_total,
  financial_status: 'active',

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

/* ligar custom_projects ao pedido */
const customProjectIds = group.items
  .map(item => item?.customization?.project_id || null)
  .filter(Boolean);

for (const projectId of customProjectIds) {
  await sbPatch('custom_projects', projectId, {
    order_ref: ref,
    customer_user_id: currentUser.id,
    customer_name: name,
    customer_phone: formatPhone258(phone),
    status: 'pending_payment',
    updated_at: new Date().toISOString()
  });
}

createdOrders.push({
  id: rows[0]?.id,
  ref,
  master_ref: masterRef,
  store_name: group.store_name,
  total: groupTotal,
  items: enrichedItems,
});

  }

  if (couponData?.id) {
    const previousUses = await sbGet(
      'coupon_redemptions',
      `?coupon_id=eq.${couponData.id}&user_id=eq.${currentUser.id}&select=id`
    );

    if ((previousUses?.length || 0) >= (couponData.max_uses_per_user || 1)) {
      throw new Error('Esta conta já atingiu o limite de uso deste cupom.');
    }

    await sbPost('coupon_redemptions', {
      coupon_id: couponData.id,
      user_id: currentUser.id,
      order_id: createdOrders[0]?.id || null
    });

    await sbPatch('coupons', couponData.id, {
      used_count: (couponData.used_count || 0) + 1
    });
  }

  return {
    createdOrders,
    total,
    masterRef
  };
}

function buildWhatsAppMessage(formData, createdOrders, total, masterRef) {
  const itemsText = sanitizeOrderItems(cartItems)
    .map(i => {
      const parts = [];

      if (i.size) {
        parts.push(`Tamanho: ${i.size}`);
      }

      const colorLabel = i.color_name || i.color_hex || '';
      if (colorLabel) {
        parts.push(`Cor: ${colorLabel}`);
      }

      return `- ${i.name} x${i.quantity}${parts.length ? ` | ${parts.join(' | ')}` : ''}`;
    })
    .join('\n');

  const refsText = createdOrders
    .map(o => `- ${o.ref}${o.store_name ? ` | Loja: ${o.store_name}` : ''}`)
    .join('\n');

  const rawMessage =
    `Olá, quero confirmar o pagamento da minha encomenda.\n\n` +
    `Ref. geral da compra:\n${masterRef}\n\n` +
    `Refs. por loja:\n${refsText}\n\n` +
    `Cliente: ${formData.name}\n` +
    `Contacto: +${formatPhone258(formData.phone)}\n` +
    `Número usado no pagamento: +${formatPhone258(formData.payPhone)}\n\n` +
    `Itens:\n${itemsText}\n\n` +
    `Total a pagar: ${fmtMT(total)}\n\n` +
    `Vou enviar o comprovativo nesta conversa.\n\n` +
    `Dados para validação:\n` +
    `- Referência da transação:\n` +
    `- Código do recibo:\n`;

  return encodeURIComponent(rawMessage);
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
function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function openWhatsAppBridgeTab(bridgeTab, waUrl, encodedMessage, primaryRef) {
  if (!bridgeTab) return;

  const rawMessage = decodeURIComponent(encodedMessage);

  bridgeTab.document.open();
  bridgeTab.document.write(`
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>Enviar mensagem no WhatsApp</title>
      <style>
        body{
          font-family:Inter,Arial,sans-serif;
          background:#f7f7f7;
          color:#111;
          margin:0;
          padding:24px;
        }
        .box{
          max-width:760px;
          margin:0 auto;
          background:#fff;
          border:1px solid #eaeaea;
          border-radius:18px;
          padding:24px;
          box-shadow:0 8px 30px rgba(0,0,0,.05);
        }
        h1{
          font-size:22px;
          margin:0 0 10px;
        }
        p{
          color:#666;
          line-height:1.6;
          font-size:14px;
        }
        textarea{
          width:100%;
          min-height:260px;
          border:1px solid #ddd;
          border-radius:12px;
          padding:14px;
          resize:vertical;
          font-size:14px;
          margin:16px 0;
          box-sizing:border-box;
        }
        .actions{
          display:flex;
          gap:12px;
          flex-wrap:wrap;
          margin-top:10px;
        }
        button,a{
          border:none;
          border-radius:12px;
          padding:12px 18px;
          font-size:14px;
          font-weight:700;
          cursor:pointer;
          text-decoration:none;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        }
        .primary{
          background:#25D366;
          color:#fff;
        }
        .secondary{
          background:#111;
          color:#fff;
        }
        .outline{
          background:#fff;
          color:#111;
          border:1px solid #ddd;
        }
        .small{
          font-size:12px;
          color:#888;
          margin-top:14px;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>Enviar mensagem no WhatsApp</h1>
        <p>
          A sua encomenda foi criada. Agora envie a mensagem abaixo no WhatsApp para validar o pagamento.
        </p>

        <textarea id="msgBox">${escapeHtml(rawMessage)}</textarea>

        <div class="actions">
          <a class="primary" href="${waUrl}" target="_self">Abrir WhatsApp</a>
          <button class="secondary" onclick="copyMsg()">Copiar mensagem</button>
          <a class="outline" href="/pages/rastrear.html?ref=${encodeURIComponent(primaryRef)}&success=1" target="_self">Ir para rastreio</a>
        </div>

        <p class="small">
          Se o WhatsApp não abrir automaticamente no seu dispositivo, copie a mensagem e envie manualmente.
        </p>
      </div>

      <script>
        function copyMsg() {
          const val = document.getElementById('msgBox').value;
          navigator.clipboard.writeText(val).then(() => {
            alert('Mensagem copiada com sucesso.');
          }).catch(() => {
            alert('Não foi possível copiar automaticamente. Copie manualmente.');
          });
        }

        setTimeout(() => {
          try {
            window.location.href = ${JSON.stringify(waUrl)};
          } catch (e) {}
        }, 500);
      </script>
    </body>
    </html>
  `);
  bridgeTab.document.close();
}
async function placeOrderWhatsApp() {
  const form = validateForm();
  if (!form) return;

  try {
    await validateCartStockBeforeOrder(cartItems);
  } catch (e) {
    showToast(e.message || 'Alguns produtos já não têm stock suficiente.', 'error');
    return;
  }

  const bridgeTab = window.open('', '_blank');

  const { total } = updateTotals();
  showProcessingOverlay(form.name, total, form.payPhone);

  try {
    const { createdOrders, total, masterRef } = await createOrdersManual(form);

    masterOrderRef = masterRef;
    orderRefs = createdOrders.map(o => o.ref);

    const primaryRef = orderRefs[0];

    const whatsappNumber = getStartupWhatsapp();
    const text = buildWhatsAppMessage(form, createdOrders, total, masterRef);
    const waUrl = `https://wa.me/${whatsappNumber}?text=${text}`;

    saveCart([]);
    clearAppliedCoupon();
    hideProcessingOverlay();

    if (bridgeTab) {
      openWhatsAppBridgeTab(bridgeTab, waUrl, text, primaryRef);
      showToast('Encomenda criada. Use a nova aba para enviar a mensagem no WhatsApp.', 'info');
    } else {
      window.location.href = waUrl;
      showToast('Encomenda criada. A abrir WhatsApp...', 'info');
    }

    setTimeout(() => {
      window.location.href = `/pages/rastrear.html?ref=${masterRef}&success=1`;
    }, 1200);
  } catch (e) {
    console.error('[Checkout] Erro no fluxo WhatsApp:', e);
    hideProcessingOverlay();

    if (bridgeTab && !bridgeTab.closed) {
      bridgeTab.close();
    }

    showToast(e.message || 'Erro ao criar encomenda. Tente novamente.', 'error');
  }
}

function openTermsModal() {
  const modal = document.getElementById('termsModal');
  if (modal) modal.classList.add('open');
}

function closeTermsModal() {
  const modal = document.getElementById('termsModal');
  if (modal) modal.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('termsModal');
  if (modal && e.target === modal) {
    closeTermsModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeTermsModal();
  }
});

function showMpesaUnavailable() {
  showToast('O pagamento por M-pesa encontra-se temporariamente fora de serviço. Use o botão do WhatsApp.', 'warning');
}

async function refreshCheckoutFromStorage() {
  cartItems = getCart();

  if (!cartItems.length) {
    removeCoupon(true);
    renderOrderSummary();
    return;
  }

  renderOrderSummary();
  await restoreAppliedCoupon({ silent: true });
}

window.addEventListener('pageshow', () => {
  if (!checkoutInitialized) return;
  refreshCheckoutFromStorage();
});

document.addEventListener('DOMContentLoaded', initCheckout);
