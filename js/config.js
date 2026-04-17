/* ============================================================
   KIMERA — CONFIGURAÇÃO CENTRAL v3
   ============================================================ */

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
    emailDomain:    'kimera.co.mz'
  },
  roles: { SUPER_ADMIN:'super_admin', STORE_OWNER:'store_owner', CUSTOMER:'customer' }
};

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
function getCart()       { try { return JSON.parse(localStorage.getItem('kimeraCart') || '[]'); } catch { return []; } }
function saveCart(cart)  { localStorage.setItem('kimeraCart', JSON.stringify(cart)); updateCartBadge(); }
function updateCartBadge() {
  const n = getCart().reduce((s, i) => s + (i.quantity || 1), 0);
  document.querySelectorAll('.cart-badge').forEach(b => b.textContent = n);
}
function addToCart(p, size, color, qty = 1) {
  const cart = getCart();
  const idx  = cart.findIndex(i => i.product_id === p.id && i.size === size && i.color === color);
  if (idx > -1) cart[idx].quantity += qty;
  else cart.push({ product_id:p.id, name:p.name, price:p.price, thumbnail_url:p.thumbnail_url||p.thumbnail, store_id:p.store_id, store_name:p.store_name, size, color, quantity:qty });
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
