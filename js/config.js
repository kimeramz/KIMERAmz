/* ============================================================
   KIMERA — CONFIGURAÇÃO CENTRAL v6
   ============================================================ */

//Ve todos que entram na pagina e trasforma em numeros

function getVisitSessionId() {
  let sid = localStorage.getItem('kimera_visit_session');

  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem('kimera_visit_session', sid);
  }

  return sid;
}

function shouldTrackVisit() {
  const path = window.location.pathname.toLowerCase();

  /* NÃO contar backoffice */
  if (path.includes('/pages/admin')) return false;
  if (path.includes('/pages/dashboard')) return false;

  return true;
}

async function trackPageVisit({ pageType, pagePath = '', productId = null, storeId = null }) {
  try {
    if (!shouldTrackVisit()) return;

    const visitKey = `visit:${pageType}:${pagePath}:${productId || ''}:${storeId || ''}`;
    if (sessionStorage.getItem(visitKey)) return;

    sessionStorage.setItem(visitKey, '1');

    await sbPost('page_visits', {
      page_type: pageType,
      page_path: pagePath,
      product_id: productId,
      store_id: storeId,
      session_id: getVisitSessionId(),
      referrer: document.referrer || '',
      user_agent: navigator.userAgent || '',
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[Analytics] trackPageVisit:', e);
  }
}

const KIMERA_CONFIG = {
  supabase: {
    url:     'https://znquvtdbchmjrdgjcaos.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpucXV2dGRiY2htanJkZ2pjYW9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTk5NDQsImV4cCI6MjA5MTU3NTk0NH0.yrD7OYfhw2b83k30aqoEjazqsq171G1Yt8KgARR4dAY',
    storageUrl: 'https://znquvtdbchmjrdgjcaos.supabase.co/storage/v1',
    buckets: { products:'products', stores:'stores', banners:'banners', proofs:'proofs' }
  },
  mpesa: {
    apiKey:              'COLE_AQUI_SUA_API_KEY',
    serviceProviderCode: 'COLE_AQUI_O_SERVICE_PROVIDER_CODE',
    merchantNumber:      '258849368285',
    country:  'MOZ',
    currency: 'MZN',
    publicKey:'MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArv9yxA69XQKBo24BaF/D+fvlqmGdYjqLQ5WtNBb5tquqGvAvG3WMFETVUSow/LizQalxj2ElMVrUmzu5mGGkxK08bWEXF7a1DEvtVJs6nppIlFJc2SnrU14AOrIrB28ogm58JjAl5BOQawOXD5dfSk7MaAA82pVHoIqEu0FxA8BOKU+RGTihRU+ptw1j4bsAJYiPbSX6i71gfPvwHPYamM0bfI4CmlsUUR3KvCG24rB6FNPcRBhM3jDuv8ae2kC33w9hEq8qNB55uw51vK7hyXoAa+U7IqP1y6nBdlN25gkxEA8yrsl1678cspeXr+3ciRyqoRgj9RD/ONbJhhxFvt1cLBh+qwK2eqISfBb06eRnNeC71oBokDm3zyCnkOtMDGl7IvnMfZfEPFCfg5QgJVk1msPpRvQxmEsrX9MQRyFVzgy2CWNIb7c+jPapyrNwoUbANlN8adU1m6yOuoX7F49x+OjiG2se0EJ6nafeKUXw/+hiJZvELUYgzKUtMAZVTNZfT8jjb58j8GVtuS+6TM2AutbejaCV84ZK58E2CRJqhmjQibEUO6KPdD7oTlEkFy52Y1uOOBXgYpqMzufNPmfdqqqSM4dU70PO8ogyKGiLAIxCetMjjm6FCMEA3Kc8K0Ig7/XtFm9By6VxTJK1Mg36TlHaZKP6VzVLXMtesJECAwEAAQ==',
    sandbox:    { baseUrl:'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomMOZ', sessionPath:'/getSession/', c2bPath:'/c2bPayment/singleStage/' },
    production: { baseUrl:'https://openapi.m-pesa.com/openapi/ipg/v2/vodacomMOZ', sessionPath:'/getSession/', c2bPath:'/c2bPayment/singleStage/' },
    environment: 'sandbox'
  },
  business: {
    commissionRate: 0.08,
    deliveryFee:    100,
    name:           'Kimera Marketplace',
    emailDomain:    'kimera.co.mz',
    kimeraCriarStoreId: '6f866e10-5708-4be4-aac5-240175b23fe6'
  },
  roles: { SUPER_ADMIN:'super_admin', STORE_OWNER:'store_owner', CUSTOMER:'customer' }
};

function parseColorsInput(raw = '') {
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^(#[0-9A-Fa-f]{6})(?:\(([^)]+)\))?$/);
      if (!m) {
        return { hex: entry, name: entry };
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

const SB_URL = KIMERA_CONFIG.supabase.url;
const SB_KEY = KIMERA_CONFIG.supabase.anonKey;

/* ─── HEADERS ─── */
function sbHeaders(extra = {}) {
  const token = localStorage.getItem('kimeraToken') || SB_KEY;
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    ...extra
  };
}

/* ─── PARSE RESPONSE ─── */
async function sbParse(response) {
  const text = await response.text();

  if (!response.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.message || parsed?.error_description || text;
    } catch {}

    if (response.status === 401 && /jwt expired/i.test(msg)) {
      localStorage.removeItem('kimeraToken');
      localStorage.removeItem('kimeraRefresh');
      localStorage.removeItem('kimeraUser');
      window.location.href = '/pages/login.html';
      throw new Error('[401] Sessão expirada. Faça login novamente.');
    }

    throw new Error(`[${response.status}] ${msg}`);
  }

  if (!text || text === 'null') return null;
  try { return JSON.parse(text); } catch { return text; }
}

/* ─── REST HELPERS ─── */
async function sbGet(table, query = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}${query}`, { headers: sbHeaders() });
  return sbParse(r);
}

async function sbPost(table, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(body)
  });
  return sbParse(r);
}

async function sbPatch(table, id, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(body)
  });
  return sbParse(r);
}

async function sbDelete(table, id) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return true;
}

/* ─── STORAGE UPLOAD ─── */
async function sbUpload(bucket, path, file) {
  /* Remove caracteres problemáticos do nome do ficheiro */
  const cleanPath = path.replace(/[^a-zA-Z0-9._\-\/]/g, '_');
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${cleanPath}`, {
    method: 'POST',
    headers: {
      'apikey':        SB_KEY,
      'Authorization': `Bearer ${localStorage.getItem('kimeraToken') || SB_KEY}`,
      'Content-Type':  file.type || 'application/octet-stream',
      'x-upsert':      'true'
    },
    body: file
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error('Upload falhou: ' + err);
  }
  return `${SB_URL}/storage/v1/object/public/${bucket}/${cleanPath}`;
}
function getAppliedCoupon() {
  try {
    const coupon = JSON.parse(localStorage.getItem('kimeraAppliedCoupon') || 'null');
    if (!coupon?.code) return null;

    return {
      ...coupon,
      code: normalizeCouponCode(coupon.code),
      discount_pct: Number(coupon.discount_pct || 0)
    };
  } catch {
    clearAppliedCoupon();
    return null;
  }
}

function saveAppliedCoupon(coupon) {
  if (!coupon?.code) {
    clearAppliedCoupon();
    return null;
  }

  const normalized = {
    ...coupon,
    code: normalizeCouponCode(coupon.code),
    discount_pct: Number(coupon.discount_pct || 0)
  };

  localStorage.setItem('kimeraAppliedCoupon', JSON.stringify(normalized));
  return normalized;
}

function clearAppliedCoupon() {
  localStorage.removeItem('kimeraAppliedCoupon');
}

function normalizeCouponCode(code = '') {
  return String(code || '').trim().toUpperCase();
}

function getCouponDiscount(subtotal, coupon) {
  const pct = Number(coupon?.discount_pct || 0);
  const base = Number(subtotal || 0);

  if (!pct || base <= 0) return 0;
  return Math.max(0, Math.round(base * (pct / 100)));
}

async function validateCouponForCurrentUser(code, customerPhone = '') {
  const user = sbCurrentUser();
  if (!user) {
    throw new Error('É obrigatório iniciar sessão para usar cupom.');
  }

  const cleanCode = normalizeCouponCode(code);
  if (!cleanCode) {
    throw new Error('Digite um cupom.');
  }

  const rows = await sbGet('coupons', `?code=eq.${encodeURIComponent(cleanCode)}&is_active=eq.true`);
  if (!rows?.length) {
    throw new Error('Cupom inválido ou inativo.');
  }

  const c = rows[0];

  if (c.expires_at && new Date(c.expires_at) < new Date()) {
    throw new Error('Cupom expirado.');
  }

  if ((c.used_count || 0) >= (c.max_uses || 1)) {
    throw new Error('Cupom esgotado.');
  }

  const previousUses = await sbGet(
    'coupon_redemptions',
    `?coupon_id=eq.${c.id}&user_id=eq.${user.id}&select=id`
  );

  if ((previousUses?.length || 0) >= (c.max_uses_per_user || 1)) {
    throw new Error('Esta conta já atingiu o limite de uso deste cupom.');
  }

  const cleanCustomerPhone = String(customerPhone).replace(/\D/g, '');
  const cleanAssignedPhone = String(c.assigned_phone || '').replace(/\D/g, '');

  if (cleanAssignedPhone) {
    const accountPhone = String(
      user.phone ||
      user.user_metadata?.phone ||
      user.user_metadata?.phone_number ||
      ''
    ).replace(/\D/g, '');

    const phoneA = cleanCustomerPhone || accountPhone;
    const phoneB = phoneA.startsWith('258') ? phoneA : '258' + phoneA;

    if (!phoneA) {
      throw new Error('Informe o contacto para validar este cupom personalizado.');
    }

    if (cleanAssignedPhone !== phoneA && cleanAssignedPhone !== phoneB) {
      throw new Error('Este cupom é personalizado para outro cliente.');
    }
  }

  return c;
}

/* ─── AUTH ─── */
function sbCurrentUser() {
  try { return JSON.parse(localStorage.getItem('kimeraUser')); } catch { return null; }
}
function sbCurrentRole() {
  const u = sbCurrentUser();
  return u?.user_metadata?.role || 'customer';
}
function requireRole(role) {
  const r = sbCurrentRole();
  if (r !== role) {
    if (r === 'super_admin') window.location.href = '/pages/admin.html';
    else if (r === 'store_owner') window.location.href = '/pages/dashboard.html';
    else window.location.href = '/pages/login.html';
  }
}
function doLogout() {
  localStorage.removeItem('kimeraToken');
  localStorage.removeItem('kimeraRefresh');
  localStorage.removeItem('kimeraUser');
  window.location.href = '/pages/login.html';
}

/* ─── CART ─── */
function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem('kimeraCart') || '[]');
    return Array.isArray(cart) ? cart.map(normalizeCartItem) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  const normalized = Array.isArray(cart) ? cart.map(normalizeCartItem) : [];
  localStorage.setItem('kimeraCart', JSON.stringify(normalized));

  if (!normalized.length) {
    clearAppliedCoupon();
  }

  updateCartBadge();
}

function updateCartBadge() {
  const n = getCart().reduce((s, i) => s + (i.quantity || 1), 0);
  document.querySelectorAll('.cart-badge').forEach(b => b.textContent = n);
}

function normalizeCartColor(color, colorName = '', colorHex = '') {
  const existingName = String(colorName || '').trim();
  const existingHex = String(colorHex || '').trim();

  if (existingName || existingHex) {
    return {
      color_hex: existingHex || (isHexColor(existingName) ? existingName : ''),
      color_name: existingName && !isHexColor(existingName) ? existingName : ''
    };
  }

  if (!color) {
    return {
      color_hex: '',
      color_name: ''
    };
  }

  if (typeof color === 'object') {
    const hex = String(color.hex || '').trim();
    const name = String(color.name || '').trim();

    return {
      color_hex: hex,
      color_name: name && !isHexColor(name) ? name : ''
    };
  }

  const str = String(color).trim();
  const m = str.match(/^(#[0-9A-Fa-f]{6})(?:\(([^)]+)\))?$/);

  if (m) {
    return {
      color_hex: m[1],
      color_name: m[2] ? m[2].trim() : ''
    };
  }

  if (str.startsWith('#')) {
    return {
      color_hex: str,
      color_name: ''
    };
  }

  return {
    color_hex: '',
    color_name: str
  };
}

function isHexColor(value = '') {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || '').trim());
}

function normalizeCartItem(item = {}) {
  const color = normalizeCartColor(item.color, item.color_name, item.color_hex);
  const qty = parseInt(item.quantity || 1, 10);

  const normalized = {
    product_id: item.product_id || item.id || null,
    name: item.name || 'Produto',
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    price: Number(item.price || 0),
    size: item.size || '',
    color_name: color.color_name,
    color_hex: color.color_hex,
    thumbnail_url: item.thumbnail_url || item.thumbnail || '',
    store_id: item.store_id || '',
    store_name: item.store_name || ''
  };

  if (item.customization) {
    normalized.customization = item.customization;
  }

  return normalized;
}

function addToCart(p, size, color, qty = 1) {
  const cart = getCart();
  const normalizedColor = normalizeCartColor(color);
  const productId = p.product_id || p.id || null;

  const availableStock = Math.max(
    0,
    parseInt(p?.selected_variant?.stock ?? p?.stock ?? 0, 10)
  );

  if (availableStock <= 0) {
    showToast('Esta variante está sem stock.', 'error');
    return;
  }

  const idx = cart.findIndex(i =>
    i.product_id === productId &&
    (i.size || '') === (size || '') &&
    (i.color_name || '') === normalizedColor.color_name &&
    (i.color_hex || '') === normalizedColor.color_hex
  );

  if (idx > -1) {
    const nextQty = cart[idx].quantity + qty;
    cart[idx].quantity = Math.min(nextQty, availableStock);

    if (nextQty > availableStock) {
      showToast(`Só existem ${availableStock} unidades disponíveis desta variante.`, 'info');
    }
  } else {
    const safeQty = Math.min(qty, availableStock);

    cart.push(normalizeCartItem({
      product_id: productId,
      name: p.name,
      price: p.price,
      thumbnail_url: p.thumbnail_url || p.thumbnail || '',
      store_id: p.store_id || '',
      store_name: p.store_name || '',
      quantity: safeQty,
      size: size || '',
      color_name: normalizedColor.color_name,
      color_hex: normalizedColor.color_hex
    }));

    if (qty > availableStock) {
      showToast(`Só existem ${availableStock} unidades disponíveis desta variante.`, 'info');
    }
  }

  saveCart(cart);
  showToast(`${p.name} adicionado ao carrinho!`);
}

/* ─── FORMATAÇÃO ─── */
function fmtMT(val) { return new Intl.NumberFormat('pt-MZ', { minimumFractionDigits:2 }).format(val || 0) + ' MT'; }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('pt-MZ', { day:'2-digit', month:'short', year:'numeric' }) : '—'; }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

/* ─── TOAST ─── */
function showToast(msg, type = 'success') {
  document.querySelector('.k-toast')?.remove();
  const colors = { success:'#16A34A', error:'#DC2626', info:'#2563EB', warning:'#D97706' };
  const t = document.createElement('div');
  t.className = 'k-toast';
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${colors[type]||colors.success};color:#fff;padding:13px 20px;border-radius:10px;font-family:Inter,sans-serif;font-size:14px;font-weight:500;z-index:9999;max-width:340px;line-height:1.4;box-shadow:0 4px 16px rgba(0,0,0,0.15);`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ─── M-PESA ─── */
async function mpesaEncryptKey(key) {
  const bin = Uint8Array.from(atob(KIMERA_CONFIG.mpesa.publicKey), c => c.charCodeAt(0));
  const ck  = await crypto.subtle.importKey('spki', bin.buffer, { name:'RSA-OAEP', hash:'SHA-1' }, false, ['encrypt']);
  const enc = await crypto.subtle.encrypt({ name:'RSA-OAEP' }, ck, new TextEncoder().encode(key));
  return btoa(String.fromCharCode(...new Uint8Array(enc)));
}
async function mpesaGetSession() {
  const c = sessionStorage.getItem('mpesaSession'), ex = sessionStorage.getItem('mpesaSessionExpiry');
  if (c && ex && Date.now() < parseInt(ex)) return c;
  const env = KIMERA_CONFIG.mpesa[KIMERA_CONFIG.mpesa.environment];
  const ek  = await mpesaEncryptKey(KIMERA_CONFIG.mpesa.apiKey);
  const r   = await fetch(`${env.baseUrl}${env.sessionPath}`, { headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${ek}`, 'Origin':'*' } });
  if (!r.ok) throw new Error('Falha sessão M-Pesa');
  const d = await r.json();
  const es = await mpesaEncryptKey(d.output_SessionID);
  sessionStorage.setItem('mpesaSession', es);
  sessionStorage.setItem('mpesaSessionExpiry', Date.now() + 25 * 60 * 1000);
  return es;
}
async function mpesaC2B({ amount, customerMSISDN, reference, description }) {
  const es  = await mpesaGetSession();
  const env = KIMERA_CONFIG.mpesa[KIMERA_CONFIG.mpesa.environment];
  const cid = 'KIM' + Date.now() + Math.random().toString(36).slice(2,6).toUpperCase();
  const r   = await fetch(`${env.baseUrl}${env.c2bPath}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${es}`, 'Origin':'*' },
    body: JSON.stringify({
      input_Amount: String(Math.round(amount)),
      input_Country: KIMERA_CONFIG.mpesa.country,
      input_Currency: KIMERA_CONFIG.mpesa.currency,
      input_CustomerMSISDN: customerMSISDN.replace(/\D/g,''),
      input_ServiceProviderCode: KIMERA_CONFIG.mpesa.serviceProviderCode,
      input_ThirdPartyConversationID: cid,
      input_TransactionReference: reference.slice(0,20),
      input_PurchasedItemsDesc: description.slice(0,100)
    })
  });
  return { ...(await r.json()), convId: cid };
}

/* ─── NAV ─── */
function toggleMobileNav() {
  document.getElementById('mobileNav')?.classList.toggle('open');
}
function imgOrPlaceholder(url, alt = '') {
  if (url) return `<img src="${url}" alt="${alt}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`;
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#eee;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
document.addEventListener('click', e => {
  const nav = document.getElementById('mobileNav'), btn = document.querySelector('.nav-mobile-menu');
  if (nav?.classList.contains('open') && !nav.contains(e.target) && !btn?.contains(e.target)) nav.classList.remove('open');
});
