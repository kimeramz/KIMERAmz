/* criar.js — Personalizador com mockup real frente/costas */

const MOCKUPS = {
  frente: {
    '#111111': '../assets/mockups/front-black.png',
    '#FFFFFF': '../assets/mockups/front-white.png'
  },
  costas: {
    '#111111': '../assets/mockups/back-black.png',
    '#FFFFFF': '../assets/mockups/back-white.png'
  }
};

const DESIGN_BOX = {
  frente: { x: 155, y: 175, w: 190, h: 210 },
  costas: { x: 155, y: 180, w: 190, h: 210 }
};

let selectedColor = '#111111';
let selectedType = 'Regular Size';
let selectedSize = 'M';
let customQty = 1;
let currentView = 'frente';

const BASE_PRICE = 700;
const CUSTOM_PRICE = 150;

const designStates = {
  frente: {
    image: null,
    imageSrc: null,
    text: '',
    font: 'Inter',
    textColor: '#111111',
    imgX: 180,
    imgY: 210,
    imgScale: 1
  },
  costas: {
    image: null,
    imageSrc: null,
    text: '',
    font: 'Inter',
    textColor: '#111111',
    imgX: 180,
    imgY: 210,
    imgScale: 1
  }
};

const mockupCache = {};
let dragState = {
  active: false,
  offsetX: 0,
  offsetY: 0
};

/* ── HELPERS ── */
function state() {
  return designStates[currentView];
}

function hasText() {
  return Object.values(designStates).some(v => v.text.trim().length > 0);
}

function hasImage() {
  return Object.values(designStates).some(v => !!v.image);
}

function getCanvas() {
  return document.getElementById('shirtCanvas');
}

function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (q) window.location.href = `/pages/lojas?q=${encodeURIComponent(q)}`;
}

/* ── VISTA ── */
function setView(view, btn) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const txt = document.getElementById('customText');
  if (txt) txt.value = state().text || '';

  const zoomInput = document.getElementById('zoomInput');
  const zoomVal = document.getElementById('zoomVal');
  if (zoomInput) zoomInput.value = Math.round(state().imgScale * 100);
  if (zoomVal) zoomVal.textContent = `${Math.round(state().imgScale * 100)}%`;

  redrawCanvas();
}

/* ── COR DA CAMISETA ── */
function setShirtColor(color, btn) {
  selectedColor = color;
  document.querySelectorAll('.options-panel .color-swatches .swatch').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');
  redrawCanvas();
}

/* ── TEXTO ── */
function toggleTextPanel() {
  const panel = document.getElementById('textPanel');
  if (!panel) return;
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'flex' : 'none';
}

function updateText(val) {
  state().text = val;
  updateTotal();
  redrawCanvas();
}

function updateFont(font) {
  state().font = font;
  redrawCanvas();
}

function setTextColor(color, btn) {
  state().textColor = color;
  document.querySelectorAll('#textColorSwatches .swatch').forEach(s => s.classList.remove('active'));
  if (btn) btn.classList.add('active');
  redrawCanvas();
}

/* ── TIPO / TAMANHO / QUANTIDADE ── */
function setType(type, btn) {
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function setSize(size, btn) {
  selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function changeQty(delta) {
  const input = document.getElementById('qtyInput');
  customQty = Math.max(1, Math.min(99, parseInt(input.value || 1) + delta));
  input.value = customQty;
  updateTotal();
}

function updateQtyInput() {
  const input = document.getElementById('qtyInput');
  customQty = Math.max(1, Math.min(99, parseInt(input.value) || 1));
  input.value = customQty;
  updateTotal();
}

/* ── PREÇO ── */
function updateTotal() {
  const custom = (hasText() || hasImage()) ? CUSTOM_PRICE : 0;
  const unit = BASE_PRICE + custom;
  const total = unit * customQty;

  const customPrice = document.getElementById('customPrice');
  const unitPrice = document.getElementById('unitPrice');
  const totalPrice = document.getElementById('totalPrice');
  const qtyDisplay = document.getElementById('qtyDisplay');

  if (customPrice) customPrice.textContent = custom > 0 ? fmtMT(custom) : '0,00 MT';
  if (unitPrice) unitPrice.textContent = fmtMT(unit);
  if (totalPrice) totalPrice.textContent = fmtMT(total);
  if (qtyDisplay) qtyDisplay.textContent = customQty;
}

/* ── IMAGEM ── */
function triggerImageUpload() {
  document.getElementById('designUpload')?.click();
}

function handleDesignUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state().image = img;
      state().imageSrc = e.target.result;
      state().imgScale = 1;
      state().imgX = DESIGN_BOX[currentView].x + 20;
      state().imgY = DESIGN_BOX[currentView].y + 20;

      const zoomInput = document.getElementById('zoomInput');
      const zoomVal = document.getElementById('zoomVal');
      if (zoomInput) zoomInput.value = 100;
      if (zoomVal) zoomVal.textContent = '100%';

      updateTotal();
      redrawCanvas();
      showToast(`Imagem adicionada na vista ${currentView}.`);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function updateDesignZoom(val) {
  state().imgScale = val / 100;
  const zoomVal = document.getElementById('zoomVal');
  if (zoomVal) zoomVal.textContent = `${val}%`;
  redrawCanvas();
}

function clearCurrentViewDesign() {
  designStates[currentView] = {
    image: null,
    imageSrc: null,
    text: '',
    font: 'Inter',
    textColor: '#111111',
    imgX: 180,
    imgY: 210,
    imgScale: 1
  };

  const txt = document.getElementById('customText');
  if (txt) txt.value = '';

  const zoomInput = document.getElementById('zoomInput');
  const zoomVal = document.getElementById('zoomVal');
  if (zoomInput) zoomInput.value = 100;
  if (zoomVal) zoomVal.textContent = '100%';

  updateTotal();
  redrawCanvas();
  showToast(`Vista ${currentView} limpa.`, 'info');
}

/* ── MOCKUP BASE ── */
function loadMockup(src) {
  if (mockupCache[src]) return Promise.resolve(mockupCache[src]);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      mockupCache[src] = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function redrawCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const mockupSrc = MOCKUPS[currentView][selectedColor];
  if (!mockupSrc) return;

  try {
    const mockup = await loadMockup(mockupSrc);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(mockup, 0, 0, W, H);

    const box = DESIGN_BOX[currentView];

    /* guia visual */
    ctx.save();
    ctx.strokeStyle = 'rgba(229,57,53,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();

    /* clip da área segura */
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    /* imagem do utilizador */
    if (state().image) {
      const baseW = 120;
      const drawW = baseW * state().imgScale;
      const ratio = state().image.height / state().image.width;
      const drawH = drawW * ratio;
      ctx.drawImage(state().image, state().imgX, state().imgY, drawW, drawH);
    }

    /* texto */
    if (state().text.trim()) {
      const fontSize = 28;
      ctx.font = `700 ${fontSize}px ${state().font}, sans-serif`;
      ctx.fillStyle = state().textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      wrapText(
        ctx,
        state().text,
        box.x + box.w / 2,
        box.y + box.h / 2,
        box.w - 20,
        34
      );
    }

    ctx.restore();
  } catch (e) {
    console.error('Erro ao desenhar mockup:', e);
  }
}

function wrapText(ctx, text, centerX, centerY, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (let n = 0; n < words.length; n++) {
    const test = line ? `${line} ${words[n]}` : words[n];
    const metrics = ctx.measureText(test);
    if (metrics.width > maxWidth && line) {
      lines.push(line);
      line = words[n];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l, centerX, startY + i * lineHeight);
  });
}

/* ── DRAG ── */
function initCanvasDrag() {
  const canvas = getCanvas();
  if (!canvas) return;

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    if (evt.touches?.length) {
      return {
        x: (evt.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (evt.touches[0].clientY - rect.top) * (canvas.height / rect.height)
      };
    }
    return {
      x: (evt.clientX - rect.left) * (canvas.width / rect.width),
      y: (evt.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!state().image) return;
    const pos = getPos(e);
    dragState.active = true;
    dragState.offsetX = pos.x - state().imgX;
    dragState.offsetY = pos.y - state().imgY;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!dragState.active || !state().image) return;
    const pos = getPos(e);
    state().imgX = pos.x - dragState.offsetX;
    state().imgY = pos.y - dragState.offsetY;
    redrawCanvas();
  });

  ['mouseup', 'mouseleave'].forEach(ev => {
    canvas.addEventListener(ev, () => {
      dragState.active = false;
      canvas.style.cursor = 'default';
    });
  });

  canvas.addEventListener('touchstart', (e) => {
    if (!state().image) return;
    const pos = getPos(e);
    dragState.active = true;
    dragState.offsetX = pos.x - state().imgX;
    dragState.offsetY = pos.y - state().imgY;
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!dragState.active || !state().image) return;
    e.preventDefault();
    const pos = getPos(e);
    state().imgX = pos.x - dragState.offsetX;
    state().imgY = pos.y - dragState.offsetY;
    redrawCanvas();
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    dragState.active = false;
  });
}

/* ── EXPORTAÇÃO ── */
async function renderViewToDataUrl(viewName) {
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');

  const mockupSrc = MOCKUPS[viewName][selectedColor];
  const mockup = await loadMockup(mockupSrc);
  ctx.drawImage(mockup, 0, 0, canvas.width, canvas.height);

  const st = designStates[viewName];
  const box = DESIGN_BOX[viewName];

  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();

  if (st.image) {
    const baseW = 120;
    const drawW = baseW * st.imgScale;
    const ratio = st.image.height / st.image.width;
    const drawH = drawW * ratio;
    ctx.drawImage(st.image, st.imgX, st.imgY, drawW, drawH);
  }

  if (st.text.trim()) {
    ctx.font = `700 28px ${st.font}, sans-serif`;
    ctx.fillStyle = st.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wrapText(ctx, st.text, box.x + box.w / 2, box.y + box.h / 2, box.w - 20, 34);
  }

  ctx.restore();

  return canvas.toDataURL('image/png');
}

/* ── CARRINHO ── */
async function addCustomToCart() {
  const frontPreview = await renderViewToDataUrl('frente');
  const backPreview = await renderViewToDataUrl('costas');

  const item = {
    product_id: 'custom-' + Date.now(),
    name: `${selectedType} Personalizada`,
    price: BASE_PRICE + ((hasText() || hasImage()) ? CUSTOM_PRICE : 0),
    thumbnail_url: frontPreview,
    store_id: null,
    store_name: 'Kimera — Criar',
    size: selectedSize,
    color: selectedColor,
    quantity: customQty,
    customization: {
      type: selectedType,
      shirtColor: selectedColor,
      frontPreview,
      backPreview,
      frente: {
        text: designStates.frente.text,
        font: designStates.frente.font,
        textColor: designStates.frente.textColor,
        hasImage: !!designStates.frente.image
      },
      costas: {
        text: designStates.costas.text,
        font: designStates.costas.font,
        textColor: designStates.costas.textColor,
        hasImage: !!designStates.costas.image
      }
    }
  };

  const cart = getCart();
  cart.push(item);
  saveCart(cart);

  showToast(`${item.name} adicionada ao carrinho!`);
  setTimeout(() => {
    window.location.href = '/pages/carrinho';
  }, 900);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  initCanvasDrag();
  updateTotal();
  await redrawCanvas();
});