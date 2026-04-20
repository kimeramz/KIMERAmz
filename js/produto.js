let produto = null;
let selectedSize = '';
let selectedColor = null;
let selectedRating = 0;

const pid = new URLSearchParams(window.location.search).get('id');

function qs(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = qs(id);
  if (el) el.textContent = String(value ?? '');
}

function setHTML(id, value) {
  const el = qs(id);
  if (el) el.innerHTML = value;
}

function normalizeProductList(value = []) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];

    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
    }

    return raw.split(',').map(v => v.trim()).filter(Boolean);
  }

  return [];
}

function isProductHexColor(value = '') {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || '').trim());
}

function colorNameFromHex(hex = '') {
  const key = String(hex || '').trim().toUpperCase();

  const names = {
    '#000000': 'Preto',
    '#111111': 'Preto',
    '#FFFFFF': 'Branco',
    '#F5F5F5': 'Branco',
    '#FF0000': 'Vermelho',
    '#E53935': 'Vermelho',
    '#0000FF': 'Azul',
    '#1D4ED8': 'Azul',
    '#008000': 'Verde',
    '#16A34A': 'Verde',
    '#FFFF00': 'Amarelo',
    '#F59E0B': 'Amarelo',
    '#FFA500': 'Laranja',
    '#FF6F00': 'Laranja',
    '#FFC0CB': 'Rosa',
    '#800080': 'Roxo',
    '#808080': 'Cinza',
    '#964B00': 'Castanho',
    '#A52A2A': 'Castanho',
    '#F5F5DC': 'Bege'
  };

  return names[key] || '';
}

function isLightHexColor(hex = '') {
  const value = String(hex || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return false;

  const r = parseInt(value.slice(1, 3), 16);
  const g = parseInt(value.slice(3, 5), 16);
  const b = parseInt(value.slice(5, 7), 16);

  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 200;
}

function normalizeProductVariants(value = []) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getProductVariants() {
  return normalizeProductVariants(produto?.variants || []);
}

function getUniqueVariantSizes(variants = []) {
  return [...new Set(
    variants.map(v => String(v.size || '').trim()).filter(Boolean)
  )];
}

function getUniqueVariantColors(variants = []) {
  const seen = new Map();

  variants.forEach(v => {
    const name = String(v.color_name || '').trim();
    const hex = String(v.color_hex || '').trim();
    const key = `${name}__${hex}`;

    if (!name && !hex) return;
    if (!seen.has(key)) {
      seen.set(key, normalizeProductColor({ name, hex }));
    }
  });

  return Array.from(seen.values());
}

function findSelectedVariant() {
  const variants = getProductVariants();
  if (!variants.length) return null;

  const selectedColorName = selectedColor?.name || '';
  const selectedColorHex = selectedColor?.hex || '';

  return variants.find(v => {
    const sameSize = String(v.size || '') === String(selectedSize || '');
    const sameColorName = String(v.color_name || '') === String(selectedColorName || '');
    const sameColorHex = String(v.color_hex || '').toUpperCase() === String(selectedColorHex || '').toUpperCase();

    return sameSize && (sameColorName || sameColorHex);
  }) || null;
}

function getEffectiveStock() {
  const variants = getProductVariants();

  if (variants.length) {
    const variant = findSelectedVariant();
    return variant ? Math.max(0, parseInt(variant.stock || 0, 10)) : 0;
  }

  return Math.max(0, Number(produto?.stock ?? 0));
}

function hasVariants() {
  return getProductVariants().length > 0;
}

function normalizeProductColor(color) {
  if (!color) {
    return { hex: '', name: '', swatch: '#F5F5F5' };
  }

  if (typeof color === 'object') {
    const hex = String(color.hex || '').trim();
    const rawName = String(color.name || '').trim();

    const name = rawName && !isProductHexColor(rawName)
      ? rawName
      : colorNameFromHex(hex) || 'Cor';

    return {
      hex: isProductHexColor(hex) ? hex : '',
      name,
      swatch: isProductHexColor(hex) ? hex : '#F5F5F5'
    };
  }

  const str = String(color).trim();
  const withName = str.match(/^(#[0-9A-Fa-f]{6})(?:\(([^)]+)\))?$/);

  if (withName) {
    const hex = withName[1];
    return {
      hex,
      name: withName[2]?.trim() || colorNameFromHex(hex) || 'Cor',
      swatch: hex
    };
  }

  if (isProductHexColor(str)) {
    return {
      hex: str,
      name: colorNameFromHex(str) || 'Cor',
      swatch: str
    };
  }

  return {
    hex: '',
    name: str,
    swatch: '#F5F5F5'
  };
}

function showLoadingError(msg) {
  const ls = qs('loadingState');
  if (ls) {
    ls.innerHTML = `<p style="color:#DC2626;text-align:center;">${msg}</p>`;
    ls.style.display = 'block';
  }

  const pl = qs('produtoLayout');
  const pt = qs('produtoTabs');
  const rs = qs('relacionadosSection');

  if (pl) pl.style.display = 'none';
  if (pt) pt.style.display = 'none';
  if (rs) rs.style.display = 'none';
}

async function loadProduto() {
  if (!pid) {
    showLoadingError('ID do produto não encontrado na URL.');
    return;
  }

  let loaded = false;

  try {
    const rows = await sbGet(
      'products',
      `?id=eq.${pid}&select=*,stores(id,name,location,logo_url,rating)`
    );

    if (!rows || !rows.length) {
      showLoadingError('Produto não encontrado.');
      return;
    }

    produto = rows[0];
    produto.store_name = produto.stores?.name || '';
    loaded = true;

    renderProduto();
    loadReviews();
    loadProvas();
    loadRelacionados();

    if (typeof trackPageVisit === 'function') {
      trackPageVisit({
        pageType: 'product',
        pagePath: window.location.pathname + window.location.search,
        productId: pid,
        storeId: produto.store_id || produto.stores?.id || null
      });
    }
  } catch (e) {
    console.error('[Produto] loadProduto:', e);
    showLoadingError('Erro ao carregar produto.');
  } finally {
    const ls = qs('loadingState');
    const pl = qs('produtoLayout');
    const pt = qs('produtoTabs');
    const rs = qs('relacionadosSection');

    if (ls) ls.style.display = loaded ? 'none' : 'block';
    if (pl) pl.style.display = loaded ? 'grid' : 'none';
    if (pt) pt.style.display = loaded ? 'block' : 'none';
    if (rs) rs.style.display = loaded ? 'block' : 'none';
  }
}

function renderProduto() {
  selectedSize = '';
  selectedColor = null;
  setText('colorLabel', 'Selecione');

  const p = produto;
  if (!p) return;

  document.title = `Kimera — ${p.name}`;

  const breadStore = qs('breadStore');
  const breadName = qs('breadName');

  if (breadStore) {
    breadStore.textContent = p.store_name || 'Loja';
    breadStore.href = `/pages/lojas?store=${encodeURIComponent(p.stores?.id || p.store_id || '')}`;
  }

  if (breadName) breadName.textContent = p.name || 'Produto';

  setText('prodStore', p.store_name || 'Loja');
  setText('prodName', p.name || '');
  setText('prodDesc', (p.description || '').slice(0, 200));
  setText('descricaoContent', p.description || 'Sem descrição disponível.');

  const avg = Number(p.rating || 0);
  const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

  setHTML(
    'prodRating',
    `<span class="stars-display">${stars}</span>
     <span class="rating-num">${avg.toFixed(1)}</span>
     <span class="rating-cnt">(${p.review_count || 0} avaliações)</span>`
  );

  setText('reviewCountBadge', p.review_count || 0);
  setText('prodPreco', fmtMT(p.price || 0));

  const cp = p.original_price || p.compare_price;
  const prodPrecoOld = qs('prodPrecoOld');
  const prodSave = qs('prodSave');

  if (cp && cp > p.price && prodPrecoOld && prodSave) {
    prodPrecoOld.textContent = fmtMT(cp);
    prodSave.textContent = `Poupa ${Math.round((1 - p.price / cp) * 100)}%`;
    prodSave.style.display = 'inline-block';
  } else {
    if (prodPrecoOld) prodPrecoOld.textContent = '';
    if (prodSave) prodSave.style.display = 'none';
  }

  renderGaleria(p);

  const variants = getProductVariants();
  const sizesGroup = qs('sizesGroup');
  const sizeGrid = qs('sizeGrid');
  const colorsGroup = qs('colorsGroup');
  const colorGrid = qs('colorGrid');

  const sizes = variants.length
    ? getUniqueVariantSizes(variants)
    : normalizeProductList(p.sizes);

  const colors = variants.length
    ? getUniqueVariantColors(variants)
    : normalizeProductList(p.colors).map(normalizeProductColor).filter(c => c.name || c.hex);

  if (sizesGroup && sizeGrid && sizes.length) {
    sizesGroup.style.display = 'block';
    sizeGrid.innerHTML = sizes.map((s, idx) =>
      `<button class="size-btn ${idx === 0 ? 'active' : ''}" onclick="setSize('${String(s).replace(/'/g, "\\'")}', this)">${s}</button>`
    ).join('');

    selectedSize = String(sizes[0]);
  } else if (sizesGroup) {
    sizesGroup.style.display = 'none';
  }

  if (colorsGroup && colorGrid && colors.length) {
    colorsGroup.style.display = 'block';

    colorGrid.innerHTML = colors.map(c => `
      <button class="swatch-btn ${isLightHexColor(c.swatch) ? 'light' : ''}"
        style="background:${c.swatch};"
        data-name="${String(c.name || '').replace(/"/g, '&quot;')}"
        data-hex="${String(c.hex || '').replace(/"/g, '&quot;')}"
        onclick="setColor('${String(c.name || '').replace(/'/g, "\\'")}', '${String(c.hex || '').replace(/'/g, "\\'")}', this)"
        title="${c.name}"
        aria-label="${c.name}">
      </button>
    `).join('');
  } else if (colorsGroup) {
    colorsGroup.style.display = 'none';
  }

  const qtyInput = qs('qtyInput');
  if (qtyInput) {
    qtyInput.value = 1;
    qtyInput.min = 1;
    qtyInput.max = 1;
  }

  renderStock(p);
  renderStoreInfo(p);
}

function renderGaleria(p) {
  const galeriaMain = qs('galeriaMain');
  const galeriaThumbs = qs('galeriaThumbs');
  if (!galeriaMain || !galeriaThumbs) return;

  const imgs = [...(p.gallery_urls || []), ...(p.thumbnail_url ? [p.thumbnail_url] : [])]
    .filter((v, i, arr) => v && arr.indexOf(v) === i);

  if (!imgs.length) {
    galeriaMain.innerHTML = `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#F5F5F5;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>`;
    galeriaThumbs.innerHTML = '';
    return;
  }

  galeriaMain.innerHTML = `
    <img id="mainImg"
      src="${imgs[0]}"
      alt="${p.name || 'Produto'}"
      style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;"
      onclick="openLightbox('${imgs[0]}')">
    <div class="zoom-overlay">🔍 Ampliar</div>
  `;

  galeriaThumbs.innerHTML = imgs.map((u, i) => `
    <div class="thumb-item${i === 0 ? ' active' : ''}" onclick="setMainImg('${u}', this)">
      <img src="${u}" alt="" loading="lazy">
    </div>
  `).join('');
}

function renderStock(p) {
  const stockInfo = qs('stockInfo');
  const btnCart = qs('btnCart');
  const btnBuy = qs('btnBuy');
  const qtyInput = qs('qtyInput');

  if (!stockInfo) return;

  if (hasVariants()) {
    const needsSize = getUniqueVariantSizes(getProductVariants()).length > 0 && !selectedSize;
    const needsColor = getUniqueVariantColors(getProductVariants()).length > 0 && !selectedColor;

    if (needsSize || needsColor) {
      stockInfo.textContent = 'Selecione a cor e o tamanho';
      stockInfo.className = 'stock-info';
      if (btnCart) btnCart.disabled = true;
      if (btnBuy) btnBuy.disabled = true;
      if (qtyInput) {
        qtyInput.value = 1;
        qtyInput.min = 1;
        qtyInput.max = 1;
      }
      return;
    }

    const variant = findSelectedVariant();

    if (!variant) {
      stockInfo.textContent = 'Combinação indisponível';
      stockInfo.className = 'stock-info out';
      if (btnCart) btnCart.disabled = true;
      if (btnBuy) btnBuy.disabled = true;
      if (qtyInput) {
        qtyInput.value = 1;
        qtyInput.min = 1;
        qtyInput.max = 1;
      }
      return;
    }

    const stock = Math.max(0, parseInt(variant.stock || 0, 10));

    if (stock <= 0) {
      stockInfo.textContent = 'Sem stock';
      stockInfo.className = 'stock-info out';
      if (btnCart) btnCart.disabled = true;
      if (btnBuy) btnBuy.disabled = true;
    } else if (stock < 5) {
      stockInfo.textContent = `Apenas ${stock} em stock!`;
      stockInfo.className = 'stock-info low';
      if (btnCart) btnCart.disabled = false;
      if (btnBuy) btnBuy.disabled = false;
    } else {
      stockInfo.textContent = `${stock} disponíveis`;
      stockInfo.className = 'stock-info';
      if (btnCart) btnCart.disabled = false;
      if (btnBuy) btnBuy.disabled = false;
    }

    if (qtyInput) {
      const current = Math.max(1, parseInt(qtyInput.value || 1, 10));
      qtyInput.value = Math.min(current, Math.max(1, stock > 0 ? stock : 1));
      qtyInput.min = 1;
      qtyInput.max = Math.max(1, stock > 0 ? stock: 1);
    }
    syncQtyInputWithStock();

    return;
  }

  const stock = Number(p?.stock ?? 0);

  if (stock <= 0) {
    stockInfo.textContent = 'Sem stock';
    stockInfo.className = 'stock-info out';
    if (btnCart) btnCart.disabled = true;
    if (btnBuy) btnBuy.disabled = true;
  } else if (stock < 5) {
    stockInfo.textContent = `Apenas ${stock} em stock!`;
    stockInfo.className = 'stock-info low';
    if (btnCart) btnCart.disabled = false;
    if (btnBuy) btnBuy.disabled = false;
  } else {
    stockInfo.textContent = `${stock} disponíveis`;
    stockInfo.className = 'stock-info';
    if (btnCart) btnCart.disabled = false;
    if (btnBuy) btnBuy.disabled = false;
  }

  if (qtyInput) {
    const current = Math.max(1, parseInt(qtyInput.value || 1, 10));
    qtyInput.value = Math.min(current, Math.max(1, stock));
    qtyInput.min = 1;
    qtyInput.max = Math.max(1, stock > 0 ? stock : 1);
  }
}

function renderStoreInfo(p) {
  const card = qs('storeInfoCard');
  const logo = qs('storeInfoLogo');
  const name = qs('storeInfoName');
  const loc = qs('storeInfoLoc');
  const link = qs('storeInfoLink');

  if (!card) return;

  if (logo) {
    if (p.stores?.logo_url) {
      logo.innerHTML = `<img src="${p.stores.logo_url}" alt="${p.store_name}">`;
    } else {
      logo.innerHTML = `
        <div style="width:100%;height:100%;background:#E53935;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;">
          ${(p.store_name || 'LJ').slice(0, 2).toUpperCase()}
        </div>`;
    }
  }

  if (name) name.textContent = p.store_name || 'Loja';
  if (loc) loc.textContent = p.stores?.location || 'Localização não definida';
  if (link) link.href = `/pages/lojas?store=${encodeURIComponent(p.stores?.id || p.store_id || '')}`;
}

function setMainImg(url, el) {
  const img = qs('mainImg');
  if (img) {
    img.src = url;
    img.onclick = () => openLightbox(url);
  }

  document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
}

function setSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderStock(produto);
  syncQtyInputWithStock();
}

function setColor(name, hex, btn) {
  selectedColor = { name, hex };

  document.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  setText('colorLabel', name || 'Cor');
  renderStock(produto);
  syncQtyInputWithStock();
}

function syncQtyInputWithStock() {
  const inp = qs('qtyInput');
  if (!inp) return;

  const stock = getEffectiveStock();
  const maxQty = stock > 0 ? stock : 1;
  let current = parseInt(inp.value || 1, 10);

  if (!Number.isFinite(current) || current < 1) {
    current = 1;
  }

  if (current > maxQty) {
    current = maxQty;
    showToast(`Só existem ${maxQty} unidades disponíveis desta opção.`, 'info');
  }

  inp.value = current;
  inp.min = 1;
  inp.max = maxQty;
}

function changeQty(delta) {
  const inp = qs('qtyInput');
  if (!inp) return;

  const stock = getEffectiveStock();
  const current = parseInt(inp.value || 1, 10);

  const maxQty = stock > 0 ? stock : 1;
  const next = Math.max(1, Math.min(maxQty, current + delta));

  inp.value = next;
  syncQtyInputWithStock();
}

function validateOptions() {
  const variants = getProductVariants();

  if (variants.length) {
    if (getUniqueVariantSizes(variants).length && !selectedSize) {
      showToast('Seleccione um tamanho.', 'error');
      return false;
    }

    if (getUniqueVariantColors(variants).length && !selectedColor) {
      showToast('Seleccione uma cor.', 'error');
      return false;
    }

    const variant = findSelectedVariant();

    if (!variant) {
      showToast('Essa combinação de cor e tamanho não está disponível.', 'error');
      return false;
    }

    if (parseInt(variant.stock || 0, 10) <= 0) {
      showToast('Esta variante está sem stock.', 'error');
      return false;
    }

    return true;
  }

  if (normalizeProductList(produto?.sizes).length && !selectedSize) {
    showToast('Seleccione um tamanho.', 'error');
    return false;
  }

  if (normalizeProductList(produto?.colors).length && !selectedColor) {
    showToast('Seleccione uma cor.', 'error');
    return false;
  }

  return true;
}

function handleAddToCart() {
  if (!validateOptions()) return;

  const qty = parseInt(document.getElementById('qtyInput')?.value || 1, 10);
  const variant = findSelectedVariant();

  const productToCart = variant
    ? {
        ...produto,
        stock: parseInt(variant.stock || 0, 10),
        selected_variant: {
          color_name: variant.color_name,
          color_hex: variant.color_hex,
          size: variant.size,
          stock: parseInt(variant.stock || 0, 10)
        }
      }
    : produto;

  addToCart(productToCart, selectedSize, selectedColor, qty);
}

function handleBuyNow() {
  if (!validateOptions()) return;
  handleAddToCart();
  window.location.href = '/pages/checkout';
}

function toggleWish() {
  const btn = qs('wishBtn');
  if (!btn) return;

  btn.classList.toggle('active');
  showToast(
    btn.classList.contains('active') ? 'Guardado nos favoritos!' : 'Removido dos favoritos.',
    'info'
  );
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  qs(`tab-${id}`)?.classList.add('active');
  if (btn) btn.classList.add('active');
}

function openLightbox(url) {
  let lb = qs('lightbox');

  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lightbox-close" onclick="closeLightbox()">✕</button>
      <img id="lbImg" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;

    lb.addEventListener('click', e => {
      if (e.target === lb) closeLightbox();
    });

    document.body.appendChild(lb);
  }

  const lbImg = qs('lbImg');
  if (lbImg) lbImg.src = url;
  lb.classList.add('open');
}

function closeLightbox() {
  qs('lightbox')?.classList.remove('open');
}

async function loadReviews() {
  const list = qs('reviewsList');
  const sum = qs('avSummary');
  if (!list) return;

  try {
    const reviews = await sbGet(
      'reviews',
      `?product_id=eq.${pid}&status=eq.approved&order=created_at.desc`
    ) || [];

    if (!reviews.length) {
      list.innerHTML = '<p style="color:#BDBDBD;font-size:14px;">Ainda sem avaliações. Seja o primeiro!</p>';
      return;
    }

    const avg = reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
    const counts = [5, 4, 3, 2, 1].map(n => ({
      n,
      c: reviews.filter(r => r.rating === n).length
    }));

    if (sum) {
      sum.innerHTML = `
        <div>
          <div class="av-big">${avg.toFixed(1)}</div>
          <div class="av-stars-row">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div>
          <p style="font-size:12px;color:#9E9E9E;">${reviews.length} avaliações</p>
        </div>
        <div class="av-bars">
          ${counts.map(({ n, c }) => `
            <div class="av-br">
              <span>${n}★</span>
              <div class="av-track"><div class="av-fill" style="width:${reviews.length ? Math.round(c / reviews.length * 100) : 0}%"></div></div>
              <span>${c}</span>
            </div>
          `).join('')}
        </div>`;
    }

    list.innerHTML = reviews.map(r => {
      const init = (r.author_name || 'A').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const stars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
      const reply = r.reply ? `<div class="rv-reply"><strong>Resposta da loja: </strong>${r.reply}</div>` : '';
      const verif = r.is_verified ? '<span class="rv-verified">✓ Compra verificada</span>' : '';

      return `
        <div class="rv-card">
          <div class="rv-header">
            <div class="rv-av">${init}</div>
            <div>
              <p class="rv-name">${r.author_name || 'Anónimo'}</p>
              <div class="rv-stars">${stars}</div>
            </div>
            <span class="rv-date">${fmtDate(r.created_at)}</span>
            ${verif}
          </div>
          <p class="rv-text">${r.text || ''}</p>
          ${reply}
        </div>`;
    }).join('');

    setText('reviewCountBadge', reviews.length);
  } catch (e) {
    console.warn('[Produto] reviews:', e);
  }
}

function setRating(v) {
  selectedRating = v;
  document.querySelectorAll('.sp-star').forEach((s, i) => {
    s.classList.toggle('active', i < v);
  });
}

async function submitReview() {
  const currentUser = sbCurrentUser();
  if (!currentUser) {
    showToast('Inicie sessão para publicar a avaliação.', 'error');
    setTimeout(() => {
      window.location.href = '/pages/login';
    }, 900);
    return;
  }

  const text = qs('avText')?.value.trim();
  const name =
    qs('avName')?.value.trim() ||
    currentUser.user_metadata?.full_name ||
    currentUser.user_metadata?.name ||
    'Anónimo';

  const btn = document.querySelector('.write-review .btn');

  if (!selectedRating) {
    showToast('Seleccione uma classificação.', 'error');
    return;
  }

  if (!text) {
    showToast('Escreva um comentário.', 'error');
    return;
  }

  if (btn) {
    btn.textContent = 'A publicar...';
    btn.disabled = true;
  }

  try {
    await sbPost('reviews', {
      product_id: pid,
      store_id: produto?.store_id || null,
      user_id: currentUser.id,
      author_name: name,
      rating: selectedRating,
      text,
      status: 'pending',
      is_verified: false,
      created_at: new Date().toISOString()
    });

    showToast('Avaliação enviada! Aguarda aprovação.');

    if (qs('avText')) qs('avText').value = '';
    if (qs('avName')) qs('avName').value = '';

    selectedRating = 0;
    document.querySelectorAll('.sp-star').forEach(s => s.classList.remove('active'));
  } catch (e) {
    console.error('[Produto] submitReview:', e);
    showToast('Erro ao enviar: ' + (e.message || 'desconhecido'), 'error');
  } finally {
    if (btn) {
      btn.textContent = 'Publicar Avaliação';
      btn.disabled = false;
    }
  }
}

async function loadProvas() {
  const grid = qs('provasGrid');
  const empty = qs('provasEmpty');
  if (!grid) return;

  try {
    const provas = await sbGet(
      'delivery_proofs',
      `?product_id=eq.${pid}&is_approved=eq.true&order=created_at.desc&limit=9`
    ) || [];

    if (!provas.length) {
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    grid.innerHTML = provas.map(p => `
      <div class="prova-item" onclick="openLightbox('${p.image_url}')">
        <img src="${p.image_url}" alt="Entrega" loading="lazy">
        ${p.caption ? `<div class="prova-caption">${p.caption}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.warn('[Produto] provas:', e);
    if (empty) empty.style.display = 'block';
  }
}

async function loadRelacionados() {
  const grid = qs('relacionadosGrid');
  const sec = qs('relacionadosSection');
  if (!grid || !produto?.store_id) return;

  try {
    const rows = await sbGet(
      'products',
      `?store_id=eq.${produto.store_id}&is_active=eq.true&id=neq.${pid}&limit=4&select=*`
    ) || [];

    if (!rows.length) {
      if (sec) sec.style.display = 'none';
      return;
    }

    grid.innerHTML = rows.map(p => `
      <div class="product-card" data-id="${p.id}" style="cursor:pointer;">
        <div class="product-img">
          ${p.thumbnail_url
            ? `<img src="${p.thumbnail_url}" alt="${p.name}" loading="lazy">`
            : `<div class="no-img-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg></div>`}
        </div>
        <div class="product-info">
          <h3 class="product-name">${p.name}</h3>
          <div class="product-footer">
            <span class="product-price">${fmtMT(p.price)}</span>
            <button class="btn btn-red btn-sm"
              onclick="event.preventDefault();event.stopPropagation();addToCart({id:'${p.id}',name:${JSON.stringify(p.name)},price:${p.price},thumbnail_url:${JSON.stringify(p.thumbnail_url || '')},store_id:'${p.store_id || ''}',store_name:${JSON.stringify(produto.store_name || '')}},null,null,1)">
              +
            </button>
          </div>
        </div>
      </div>
    `).join('');

    bindRelacionadosClicks();
  } catch (e) {
    console.warn('[Produto] relacionados:', e);
  }
}

function bindRelacionadosClicks() {
  document.querySelectorAll('#relacionadosGrid .product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      if (!id) return;
      window.location.href = `/pages/produto?id=${encodeURIComponent(id)}`;
    });
  });
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-MZ', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProduto();

  const qtyInput = qs('qtyInput');
  if(qtyInput){
    qtyInput.addEventListener('input', () => {
      syncQtyInputWithStock();
    });
    qtyInput.addEventListener('blur', () => {
      syncQtyInputWithStock();
    });
  }
}); 