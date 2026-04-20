let allProducts = [];
let currentView = 'grid';

const DEFAULT_CATEGORIES = [
  'Camisetas',
  'Calças',
  'Vestidos',
  'Calçado',
  'Acessórios',
  'Desporto',
  'Crianças',
  'Formal'
];

function qs(id) {
  return document.getElementById(id);
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get('q'),
    cat: params.get('category'),
    storeId: params.get('store')
  };
}

function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const q = qs('searchInput')?.value.trim();
  if (q) window.location.href = `/pages/lojas?q=${encodeURIComponent(q)}`;
}

function toggleFilters() {
  const panel = qs('filtersPanel');
  if (!panel) return;

  if (window.innerWidth <= 900) {
    panel.classList.toggle('open');
  } else {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

function setHeader(title, subtitle = '') {
  const t = qs('lojaPageTitle');
  const s = qs('lojaPageSub');

  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
}

function setResultsCount(text) {
  const el = qs('resultsCount');
  if (el) el.textContent = text;
}

function getSelectedCategory() {
  return document.querySelector('input[name="cat"]:checked')?.value || '';
}

function renderCategoryList(products = []) {
  const host = qs('catList');
  if (!host) return;

  const dynamicCats = products.map(p => p.category).filter(Boolean);
  const cats = [...new Set([...DEFAULT_CATEGORIES, ...dynamicCats])];

  host.innerHTML = cats.map(cat => `
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;font-size:14px;color:#333;">
      <input type="radio" name="cat" value="${cat}" style="accent-color:#E53935;">
      <span>${cat}</span>
    </label>
  `).join('');

  const { cat } = getParams();
  if (cat) {
    const radio = host.querySelector(`input[name="cat"][value="${cat}"]`);
    if (radio) radio.checked = true;
  }
}

function clearFilters() {
  document.querySelectorAll('input[name="cat"]').forEach(r => r.checked = false);

  const sort = qs('sortSelect');
  if (sort) sort.value = 'newest';

  renderProducts(allProducts, !!getParams().storeId);
  setResultsCount(`${allProducts.length} produto${allProducts.length !== 1 ? 's' : ''}`);
}

function sortProducts(products) {
  const sort = qs('sortSelect')?.value || 'newest';
  const arr = [...products];

  switch (sort) {
    case 'price_asc':
      arr.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case 'price_desc':
      arr.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case 'popular':
      arr.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0));
      break;
    case 'newest':
    default:
      arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      break;
  }

  return arr;
}

function applyFilters() {
  const selectedCat = getSelectedCategory();
  let filtered = [...allProducts];

  if (selectedCat) {
    filtered = filtered.filter(p => p.category === selectedCat);
  }

  filtered = sortProducts(filtered);
  renderProducts(filtered, !!getParams().storeId);
  setResultsCount(`${filtered.length} produto${filtered.length !== 1 ? 's' : ''}`);

  if (window.innerWidth <= 1100) {
  closeFiltersPanel();
}
}

function renderStoreHeader(store) {
  const container = qs('storeHeaderContainer');
  if (!container) return;

  container.style.display = 'block';

  const banner = store.banner_url
    ? `background:url('${store.banner_url}') center/cover no-repeat;`
    : `background:linear-gradient(135deg,#111 0%,#222 100%);`;

  const logo = store.logo_url
    ? `<img src="${store.logo_url}" alt="${store.name}" style="width:100%;height:100%;object-fit:cover;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#E53935;color:#fff;font-weight:800;font-size:28px;">${store.name.slice(0, 2).toUpperCase()}</div>`;

  container.innerHTML = `
    <div style="max-width:1280px;margin:20px auto 0;background:#fff;border:1px solid #EEE;border-radius:20px;overflow:hidden;">
      <div style="height:220px;${banner}"></div>
      <div style="padding:22px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;">
        <div style="width:84px;height:84px;border-radius:50%;overflow:hidden;background:#fff;border:4px solid #fff;box-shadow:0 4px 18px rgba(0,0,0,.08);margin-top:-64px;flex-shrink:0;">
          ${logo}
        </div>

        <div style="flex:1;min-width:240px;">
          <h2 style="font-size:32px;font-weight:900;margin-bottom:8px;">${store.name}</h2>
          <p style="font-size:14px;color:#666;line-height:1.6;margin-bottom:10px;">
            ${store.description || 'Sem descrição disponível.'}
          </p>

          <div style="display:flex;gap:14px;flex-wrap:wrap;">
            ${store.location ? `<span style="font-size:13px;color:#888;">📍 ${store.location}</span>` : ''}
            ${store.category ? `<span style="font-size:13px;color:#888;">🏷️ ${store.category}</span>` : ''}
            ${store.rating ? `<span style="font-size:13px;color:#888;">⭐ ${Number(store.rating).toFixed(1)}</span>` : ''}
            ${store.whatsapp ? `<a href="https://wa.me/${String(store.whatsapp).replace(/\D/g, '')}" target="_blank" style="font-size:13px;color:#16A34A;font-weight:700;">WhatsApp</a>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function hideStoreHeader() {
  const container = qs('storeHeaderContainer');
  if (!container) return;
  container.style.display = 'none';
  container.innerHTML = '';
}

function renderProducts(products, isStoreMode = false) {
  const grid = qs('productsGrid');
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = `
      <p style="padding:40px;grid-column:1/-1;text-align:center;color:#9E9E9E;">
        ${isStoreMode ? 'Esta loja ainda não tem produtos activos.' : 'Sem produtos encontrados.'}
      </p>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const storeName = p.stores?.name || p.store_name || 'Loja';
    const rating = Number(p.rating || 0);
    const ratingStars = rating > 0
      ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
      : '☆☆☆☆☆';

    return `
      <div class="product-card" data-id="${p.id}" style="cursor:pointer;">
        <div class="product-img">
          ${p.thumbnail_url
        ? `<img src="${p.thumbnail_url}" alt="${p.name}" loading="lazy">`
        : '<div class="no-img-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>'}
          ${p.is_new ? '<span class="badge-novo">Novo</span>' : ''}
          ${p.discount_pct > 0 ? `<span class="badge-desc">-${p.discount_pct}%</span>` : ''}
        </div>

        <div class="product-info">
          <p class="product-store">${storeName}</p>
          <h3 class="product-name">${p.name}</h3>
          <div class="product-rating-mini">
            ${ratingStars}
            <span>${rating.toFixed(1)} (${p.review_count || 0})</span>
          </div>

          <div class="product-footer">
            <div class="product-price-wrap">
              <span class="product-price">${fmtMT(p.price)}</span>
              ${p.original_price > p.price ? `<span class="product-original">${fmtMT(p.original_price)}</span>` : ''}
            </div>
            <button
              class="btn btn-red btn-sm"
              onclick="event.preventDefault();event.stopPropagation();addToCart({id:${JSON.stringify(p.id)},name:${JSON.stringify(p.name)},price:${Number(p.price || 0)},thumbnail_url:${JSON.stringify(p.thumbnail_url || '')},store_id:${JSON.stringify(p.store_id || '')},store_name:${JSON.stringify(storeName)}},null,null,1)">
              +
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  bindProductCardClicks();
}

function bindProductCardClicks() {
  document.querySelectorAll('#productsGrid .product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (!id) return;
      window.location.href = `/pages/produto?id=${encodeURIComponent(id)}`;
    });
  });
}

async function loadStorePage(storeId) {
  try {
    const storeRows = await sbGet('stores', `?id=eq.${storeId}&select=*`);
    const store = storeRows?.[0];

    if (!store) {
      setHeader('Loja não encontrada', 'A loja solicitada não existe ou foi removida.');
      renderProducts([], true);
      setResultsCount('0 produtos');
      return;
    }

    renderStoreHeader(store);
    setHeader(store.name, store.description || 'Explore os produtos desta loja');
    setResultsCount('A carregar produtos...');

    const filtersPanel = qs('filtersPanel');
    if (filtersPanel) filtersPanel.style.display = 'none';

    const products = await sbGet(
      'products',
      `?store_id=eq.${storeId}&is_active=eq.true&select=*,stores(id,name,logo_url)&order=created_at.desc`
    ) || [];

    allProducts = sortProducts(products);
    renderProducts(allProducts, true);
    setResultsCount(`${allProducts.length} produto${allProducts.length !== 1 ? 's' : ''} nesta loja`);
  } catch (e) {
    console.error('[LOJAS] loadStorePage:', e);
    const grid = qs('productsGrid');
    if (grid) {
      grid.innerHTML = '<p style="padding:20px;grid-column:1/-1;color:#DC2626;">Erro ao carregar loja.</p>';
    }
  }
}


function openFiltersPanel() {
  const panel = document.getElementById('filtersPanel');
  const overlay = document.getElementById('filtersOverlay');

  if (!panel) return;

  panel.classList.add('open');
  overlay?.classList.add('open');
  document.body.classList.add('filters-open');
}

function closeFiltersPanel() {
  const panel = document.getElementById('filtersPanel');
  const overlay = document.getElementById('filtersOverlay');

  panel?.classList.remove('open');
  overlay?.classList.remove('open');
  document.body.classList.remove('filters-open');
}

function toggleFilters() {
  const panel = document.getElementById('filtersPanel');
  if (!panel) return;

  if (panel.classList.contains('open')) {
    closeFiltersPanel();
  } else {
    openFiltersPanel();
  }
}

async function loadCatalogPage() {
  const { q, cat } = getParams();
  const searchInput = qs('searchInput');

  hideStoreHeader();

  if (searchInput && q) searchInput.value = q;

  if (q) {
    setHeader(`Resultados para "${q}"`, 'Pesquisa no marketplace');
  } else if (cat) {
    setHeader(cat, 'Produtos filtrados por categoria');
  } else {
    setHeader('Produtos', 'Descubra os melhores produtos do marketplace');
  }

  let query = '?is_active=eq.true&select=*,stores(id,name,logo_url)&order=created_at.desc';

  if (q) query += `&name=ilike.*${encodeURIComponent(q)}*`;
  if (cat) query += `&category=eq.${encodeURIComponent(cat)}`;

  try {
    const products = await sbGet('products', query) || [];
    allProducts = sortProducts(products);

    renderCategoryList(allProducts);
    renderProducts(allProducts, false);
    setResultsCount(`${allProducts.length} produto${allProducts.length !== 1 ? 's' : ''} encontrado${allProducts.length !== 1 ? 's' : ''}`);

    const filtersPanel = qs('filtersPanel');
    if (filtersPanel) filtersPanel.style.display = 'block';
  } catch (e) {
    console.error('[LOJAS] loadCatalogPage:', e);
    const grid = qs('productsGrid');
    if (grid) {
      grid.innerHTML = '<p style="padding:20px;grid-column:1/-1;color:#DC2626;">Erro ao carregar produtos.</p>';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const { storeId } = getParams();

  if (storeId) {
    await loadStorePage(storeId);
    trackPageVisit({
      pageType: 'store',
      pagePath: window.location.pathname + window.location.search,
      storeId
    });
  } else {
    await loadCatalogPage();
    trackPageVisit({
      pageType: 'catalog',
      pagePath: window.location.pathname + window.location.search
    });
  }
});
