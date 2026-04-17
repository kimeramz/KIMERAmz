/* home.js — Homepage Kimera */
let banners = [], bannerIdx = 0, bannerTimer;

/* ── BANNERS ── */
async function loadBanners() {
  const wrap = document.getElementById('bannerCarousel');
  if (!wrap) return;

  try {
    banners = await sbGet('banners', '?is_active=eq.true&order=position.asc') || [];
  } catch {
    banners = [];
  }

  if (!banners.length) {
    wrap.innerHTML = `
      <div class="banner-slide active" style="background:linear-gradient(135deg,#111 0%,#1a1a1a 100%);">
        <div class="hero-content">
          <span class="hero-tag">Bem-vindo</span>
          <h1>Vista-se com<br><span>estilo único</span></h1>
          <p>Explore produtos das melhores lojas de Moçambique</p>
          <div class="hero-btns">
            <a href="/pages/lojas" class="btn btn-red">Ver Lojas</a>
            <a href="/pages/criar" class="btn btn-outline">Criar Peça</a>
          </div>
        </div>
      </div>`;
    return;
  }

  wrap.innerHTML = banners.map((b, i) => `
    <div class="banner-slide${i === 0 ? ' active' : ''}"
         style="${b.image_url ? `background:url('${b.image_url}') center/cover no-repeat;` : `background:${b.bg_color || '#111'};`}"
         ${b.link_url ? `onclick="window.location.href='${b.link_url}'"` : ''}>
      <div class="hero-content">
        ${b.tag ? `<span class="hero-tag">${b.tag}</span>` : ''}
        ${b.title ? `<h1>${b.title}</h1>` : ''}
        ${b.subtitle ? `<p>${b.subtitle}</p>` : ''}
        ${b.cta_text ? `<div class="hero-btns"><a href="${b.link_url || '/pages/lojas'}" class="btn btn-red">${b.cta_text}</a></div>` : ''}
      </div>
    </div>
  `).join('');

  const dots = document.getElementById('bannerDots');
  if (dots) {
    dots.innerHTML = banners.map((_, i) =>
      `<button class="banner-dot${i === 0 ? ' active' : ''}" onclick="goToBanner(${i})"></button>`
    ).join('');
  }

  if (banners.length > 1) {
    bannerTimer = setInterval(() => goToBanner((bannerIdx + 1) % banners.length), 5000);
  }
}

function goToBanner(idx) {
  clearInterval(bannerTimer);
  bannerIdx = idx;

  document.querySelectorAll('.banner-slide').forEach((s, i) => {
    s.classList.toggle('active', i === idx);
  });

  document.querySelectorAll('.banner-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });

  if (banners.length > 1) {
    bannerTimer = setInterval(() => goToBanner((bannerIdx + 1) % banners.length), 5000);
  }
}

function bannerPrev() {
  goToBanner((bannerIdx - 1 + banners.length) % banners.length);
}

function bannerNext() {
  goToBanner((bannerIdx + 1) % banners.length);
}

/* ── PRODUTOS ── */
async function loadFeaturedProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  try {
    const products = await sbGet(
      'products',
      '?is_active=eq.true&is_featured=eq.true&order=created_at.desc&limit=8&select=*,stores(name)'
    ) || [];
    renderProductGrid(products, grid);
  } catch {
    grid.innerHTML = '<p style="color:#9E9E9E;padding:20px;grid-column:1/-1;">Sem produtos em destaque.</p>';
  }
}

async function loadBestsellers() {
  const grid = document.getElementById('bestsellerGrid');
  if (!grid) return;

  try {
    const products = await sbGet(
      'products',
      '?is_active=eq.true&order=sales_count.desc&limit=8&select=*,stores(name)'
    ) || [];
    renderProductGrid(products, grid);
  } catch {
    grid.innerHTML = '';
  }
}

function renderProductGrid(products, container) {
  if (!container) return;

  if (!products?.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = products.map(p => {
    const store = p.stores?.name || p.store_name || '';
    const img = p.thumbnail_url
      ? `<img src="${p.thumbnail_url}" alt="${p.name}" loading="lazy">`
      : `<div class="no-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

    return `
      <div class="product-card" data-id="${p.id}" style="cursor:pointer;">
        <div class="product-img">
          ${img}
          ${p.is_new ? '<span class="badge-novo">Novo</span>' : ''}
          ${p.discount_pct > 0 ? `<span class="badge-desc">-${p.discount_pct}%</span>` : ''}
        </div>

        <div class="product-info">
          <p class="product-store">${store}</p>
          <h3 class="product-name">${p.name}</h3>

          <div class="product-footer">
            <div>
              <span class="product-price">${fmtMT(p.price)}</span>
              ${p.original_price > p.price ? `<span class="product-original">${fmtMT(p.original_price)}</span>` : ''}
            </div>

            <button class="btn btn-red btn-sm"
              onclick="event.preventDefault();event.stopPropagation();quickAdd('${p.id}',${JSON.stringify(p.name)},${p.price},${JSON.stringify(p.thumbnail_url || '')},'${p.store_id || ''}',${JSON.stringify(store)})">
              +
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  bindHomeProductCardClicks(container);
}

function bindHomeProductCardClicks(container) {
  container.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (!id) return;
      window.location.href = `/pages/produto?id=${encodeURIComponent(id)}`;
    });
  });
}

function quickAdd(id, name, price, thumb, storeId, storeName) {
  addToCart(
    {
      id,
      name,
      price,
      thumbnail_url: thumb,
      store_id: storeId,
      store_name: storeName
    },
    null,
    null,
    1
  );
}

/* ── LOJAS ── */
async function loadStores() {
  const grid = document.getElementById('storesGrid');
  if (!grid) return;

  try {
    const stores = await sbGet('stores', '?is_active=eq.true&order=rating.desc&limit=6') || [];
    if (!stores.length) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = stores.map(s => `
      <a href="/pages/lojas?store=${s.id}" class="store-card">
        <div class="store-logo">
          ${s.logo_url
            ? `<img src="${s.logo_url}" alt="${s.name}">`
            : `<div class="store-logo-placeholder">${s.name.slice(0, 2).toUpperCase()}</div>`}
        </div>
        <div class="store-info">
          <h3>${s.name}</h3>
          <p>${s.product_count || 0} produtos</p>
          ${s.rating ? `<span class="store-rating">★ ${Number(s.rating).toFixed(1)}</span>` : ''}
        </div>
      </a>
    `).join('');
  } catch {
    grid.innerHTML = '';
  }
}

/* ── PROVA SOCIAL ── */
async function loadSocialProof() {
  const grid = document.getElementById('socialGrid');
  if (!grid) return;

  try {
    const proofs = await sbGet('delivery_proofs', '?is_approved=eq.true&order=created_at.desc&limit=9') || [];
    if (!proofs.length) {
      document.querySelector('.social-section')?.remove();
      return;
    }

    grid.innerHTML = proofs.map(p => `
      <div class="social-item" onclick="openLightbox('${p.image_url}')">
        <img src="${p.image_url}" alt="Entrega" loading="lazy">
        <div class="social-overlay">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Entregue</span>
        </div>
      </div>
    `).join('');
  } catch {
    document.querySelector('.social-section')?.remove();
  }
}

function openLightbox(url) {
  const lb = document.createElement('div');
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  lb.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}

/* ── NAVEGAÇÃO ── */
function filterByCategory(cat) {
  window.location.href = `/pages/lojas?category=${encodeURIComponent(cat)}`;
}

function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const q = document.getElementById('searchInput')?.value.trim();
  if (q) window.location.href = `/pages/lojas?q=${encodeURIComponent(q)}`;
}

function updateUserBtn() {
  const btn = document.getElementById('userBtn');
  if (!btn) return;

  const user = sbCurrentUser();
  if (!user) {
    btn.href = '/pages/login';
    return;
  }

  const role = sbCurrentRole();
  btn.href =
    role === 'super_admin'
      ? '/pages/admin'
      : role === 'store_owner'
      ? '/pages/dashboard'
      : '/pages/login';
}

document.addEventListener('DOMContentLoaded', () => {
  loadBanners();
  loadFeaturedProducts();
  loadBestsellers();
  loadStores();
  loadSocialProof();
  updateUserBtn();
});