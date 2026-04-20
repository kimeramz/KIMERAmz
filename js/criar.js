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

/* A3 em escala reduzida:
   proporção 297 x 420 => 1 : 1.414
   topo alinhado no início da gola
*/
const DESIGN_BOX = {
  frente: { x: 160, y: 250, w: 170, h: 260 },
  costas: { x: 165, y: 230, w: 170, h: 240 }
};

let selectedColor = '#111111';
let selectedType = 'Regular Size';
let selectedSize = 'M';
let customQty = 1;
let currentView = 'frente';

const BASE_PRICES = {
  'Regular Size': 700,
  'Over Size': 1200
};

const CUSTOM_PRICE = 150;
const XXL_EXTRA = 100;

const designStates = {
  frente: {
    image: null,
    imageSrc: null,
    originalUploadSrc: null,
    originalUploadName: '',
    originalUploadType: '',
    text: '',
    font: 'Inter',
    textColor: '#111111',
    textX: null,
    textY: null,
    imgX: 190,
    imgY: 190,
    textScale: 1,
    imgScale: 1
  },
  costas: {
    image: null,
    imageSrc: null,
    originalUploadSrc: null,
    originalUploadName: '',
    originalUploadType: '',
    text: '',
    font: 'Inter',
    textColor: '#111111',
    textX: null,
    textY: null,
    imgX: 190,
    imgY: 200,
    textScale: 1,
    imgScale: 1
  }
};

const mockupCache = {};
let dragState = {
  active: false,
  type: null,
  offsetX: 0,
  offsetY: 0
};

function state() {
  return designStates[currentView];
}

function getCanvas() {
  return document.getElementById('shirtCanvas');
}

function getKimeraCriarStoreId() {
  return KIMERA_CONFIG?.business?.kimeraCriarStoreId || null;
}

function hasText() {
  return Object.values(designStates).some(v => String(v.text || '').trim().length > 0);
}

function hasImage() {
  return Object.values(designStates).some(v => !!v.image);
}

function hasCustomization() {
  return hasText() || hasImage();
}

function isXXLOrAbove(size) {
  return ['XXL', '3XL', '4XL', '5XL'].includes(String(size || '').toUpperCase());
}

function getBasePriceByType() {
  return BASE_PRICES[selectedType] || 700;
}

function getSizeExtra() {
  return isXXLOrAbove(selectedSize) ? XXL_EXTRA : 0;
}

function getCustomizationExtra() {
  return hasCustomization() ? CUSTOM_PRICE : 0;
}

function getUnitPrice() {
  return getBasePriceByType() + getSizeExtra() + getCustomizationExtra();
}

function handleSearch(e) {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  if (q) window.location.href = `/pages/lojas?q=${encodeURIComponent(q)}`;
}

/* ── VISTAS ── */
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
  if (typeof state().textScale !== 'number' || state().textScale <= 0) {
  state().textScale = 1;
}
  redrawCanvas();
}

/* ── COR DA PEÇA ── */
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
  const st = state();
  const box = DESIGN_BOX[currentView];

  st.text = val;

  if (typeof st.textScale !== 'number' || st.textScale <= 0) {
    st.textScale = 1;
  }
  if(st.textX == null || st.textY == null){
      st.textX = box.x + (box.w /2);
      st.textY = box.y + (box.h /2);
  }

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

  updateTotal();
}

function setSize(size, btn) {
  selectedSize = size;

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  updateTotal();
}

function changeQty(delta) {
  const input = document.getElementById('qtyInput');
  if (!input) return;

  customQty = Math.max(1, Math.min(99, parseInt(input.value || 1, 10) + delta));
  input.value = customQty;
  updateTotal();
}

function updateQtyInput() {
  const input = document.getElementById('qtyInput');
  if (!input) return;

  customQty = Math.max(1, Math.min(99, parseInt(input.value || 1, 10)));
  input.value = customQty;
  updateTotal();
}

/* ── PREÇO ── */
function updateTotal() {
  const base = getBasePriceByType();
  const sizeExtra = getSizeExtra();
  const customExtra = getCustomizationExtra();
  const unit = getUnitPrice();
  const total = unit * customQty;

  const basePrice = document.getElementById('basePrice');
  const sizeExtraPrice = document.getElementById('sizeExtraPrice');
  const customPrice = document.getElementById('customPrice');
  const unitPrice = document.getElementById('unitPrice');
  const totalPrice = document.getElementById('totalPrice');
  const qtyDisplay = document.getElementById('qtyDisplay');

  if (basePrice) basePrice.textContent = fmtMT(base);
  if (sizeExtraPrice) sizeExtraPrice.textContent = sizeExtra > 0 ? fmtMT(sizeExtra) : '0,00 MT';
  if (customPrice) customPrice.textContent = customExtra > 0 ? fmtMT(customExtra) : '0,00 MT';
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
      const st = state();
      const box = DESIGN_BOX[currentView];

      st.image = img;
      st.imageSrc = e.target.result;
      st.originalUploadSrc = e.target.result;
      st.originalUploadName = file.name || '';
      st.originalUploadType = file.type || '';
      st.imgScale = 1;
      st.imgX = box.x + 20;
      st.imgY = box.y + 20;

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
    originalUploadSrc: null,
    originalUploadName: '',
    originalUploadType: '',
    text: '',
    font: 'Inter',
    textColor: '#111111',
    textX: null,
    textY: null,
    imgX: 190,
    imgY: 190,
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

//permite ajustar o tamanho do texo
function updateTextScale(val) {
  state().textScale = Math.max(0.5, Math.min(3, Number(val) || 1));

  const label = document.getElementById('textScaleVal');
  if (label) {
    label.textContent = `${Math.round(state().textScale * 100)}%`;
  }

  redrawCanvas();
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

//PREVIEW

async function redrawCanvas() {
  const canvas = getCanvas();
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const mockupSrc = MOCKUPS[currentView][selectedColor];
  if (!mockupSrc) return;

  try {
    const mockup = await loadMockup(mockupSrc);

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(mockup, 0, 0, W, H);

    const box = DESIGN_BOX[currentView];

    /* guia visual A3 */
    ctx.save();
    ctx.strokeStyle = 'rgba(229,57,53,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    /* canto superior esquerdo */
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + 18);
    ctx.lineTo(box.x, box.y);
    ctx.lineTo(box.x + 18, box.y);
    ctx.stroke();

    /* canto superior direito */
    ctx.beginPath();
    ctx.moveTo(box.x + box.w - 18, box.y);
    ctx.lineTo(box.x + box.w, box.y);
    ctx.lineTo(box.x + box.w, box.y + 18);
    ctx.stroke();

    /* canto inferior esquerdo */
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.h - 18);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + 18, box.y + box.h);
    ctx.stroke();

    /* canto inferior direito */
    ctx.beginPath();
    ctx.moveTo(box.x + box.w - 18, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h - 18);
    ctx.stroke();

    ctx.restore();

    /* clip da área segura */
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();

    if (state().image) {
      const baseW = 120;
      const drawW = baseW * state().imgScale;
      const ratio = state().image.height / state().image.width;
      const drawH = drawW * ratio;

      ctx.drawImage(state().image, state().imgX, state().imgY, drawW, drawH);
    }

 if (String(state().text || '').trim()) {
  const st = state();
  const textScale = Number(st.textScale) > 0 ? Number(st.textScale) : 1;

  if (st.textX === null || st.textY === null) {
    st.textX = box.x + (box.w / 2);
    st.textY = box.y + (box.h / 2);
  }

  ctx.font = `700 ${28 * textScale}px ${st.font}, sans-serif`;
  ctx.fillStyle = st.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  wrapText(
    ctx,
    st.text,
    st.textX,
    st.textY,
    box.w - 20,
    34 * textScale
  );
}

    ctx.restore();
  } catch (e) {
    console.error('Erro ao desenhar mockup:', e);
  }
}

function wrapText(ctx, text, centerX, centerY, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
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

  function isInsideImage(pos) {
    if (!state().image) return false;

    const baseW = 120;
    const drawW = baseW * state().imgScale;
    const ratio = state().image.height / state().image.width;
    const drawH = drawW * ratio;

    return (
      pos.x >= state().imgX &&
      pos.x <= state().imgX + drawW &&
      pos.y >= state().imgY &&
      pos.y <= state().imgY + drawH
    );
  }

  function isInsideText(pos) {
    const st = state();
    const text = String(st.text || '').trim();
    if (!text) return false;

    const box = DESIGN_BOX[currentView];
    const textX = st.textX === null ? (box.x + box.w / 2) : st.textX;
    const textY = st.textY === null ? (box.y + box.h / 2) : st.textY;
    const fontSize = 28 * (st.textScale || 1);

    const canvas = getCanvas();
    const ctx = canvas.getContext('2d');
    ctx.font = `700 ${fontSize}px ${st.font}, sans-serif`;

    const textWidth = Math.min(ctx.measureText(text).width, box.w - 20);
    const textHeight = 40 * (st.textScale || 1);

    return (
      pos.x >= textX - textWidth / 2 &&
      pos.x <= textX + textWidth / 2 &&
      pos.y >= textY - textHeight / 2 &&
      pos.y <= textY + textHeight / 2
    );
  }

  function startDrag(e) {
    const pos = getPos(e);

    if (isInsideImage(pos)) {
      dragState.active = true;
      dragState.type = 'image';
      dragState.offsetX = pos.x - state().imgX;
      dragState.offsetY = pos.y - state().imgY;
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (isInsideText(pos)) {
      const st = state();
      const box = DESIGN_BOX[currentView];

      if (st.textX === null || st.textY === null) {
        st.textX = box.x + (box.w / 2);
        st.textY = box.y + (box.h / 2);
      }

      dragState.active = true;
      dragState.type = 'text';
      dragState.offsetX = pos.x - st.textX;
      dragState.offsetY = pos.y - st.textY;
      canvas.style.cursor = 'grabbing';
    }
  }

  function moveDrag(e) {
    if (!dragState.active) return;

    const pos = getPos(e);
    const box = DESIGN_BOX[currentView];

    if (dragState.type === 'image' && state().image) {
      state().imgX = pos.x - dragState.offsetX;
      state().imgY = pos.y - dragState.offsetY;
    }

    if (dragState.type === 'text') {
      const st = state();
      st.textX = pos.x - dragState.offsetX;
      st.textY = pos.y - dragState.offsetY;

      st.textX = Math.max(box.x, Math.min(box.x + box.w, st.textX));
      st.textY = Math.max(box.y, Math.min(box.y + box.h, st.textY));
    }

    redrawCanvas();
  }

  function endDrag() {
    dragState.active = false;
    dragState.type = null;
    canvas.style.cursor = 'default';
  }

  canvas.addEventListener('mousedown', startDrag);
  canvas.addEventListener('mousemove', moveDrag);
  ['mouseup', 'mouseleave'].forEach(ev => canvas.addEventListener(ev, endDrag));

  canvas.addEventListener('touchstart', startDrag, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!dragState.active) return;
    e.preventDefault();
    moveDrag(e);
  }, { passive: false });

  canvas.addEventListener('touchend', endDrag);
}

/* ── EXPORTAÇÕES ── */
async function renderViewToDataUrl(viewName) {
  const canvas = document.createElement('canvas');
  canvas.width = 3508;   // A3 a 300 DPI
  canvas.height = 4961;  // A3 a 300 DPI

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const mockupSrc = MOCKUPS[viewName][selectedColor];
  const mockup = await loadMockup(mockupSrc);
  ctx.drawImage(mockup, 0, 0, canvas.width, canvas.height);

  const st = designStates[viewName];
  const box = DESIGN_BOX[viewName];

  const scaleX = canvas.width / 500;
  const scaleY = canvas.height / 700;

  const scaledBoxX = box.x * scaleX;
  const scaledBoxY = box.y * scaleY;
  const scaledBoxW = box.w * scaleX;
  const scaledBoxH = box.h * scaleY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(scaledBoxX, scaledBoxY, scaledBoxW, scaledBoxH);
  ctx.clip();

  if (st.image) {
    const baseW = 120 * scaleX;
    const drawW = baseW * st.imgScale;
    const ratio = st.image.height / st.image.width;
    const drawH = drawW * ratio;

    ctx.drawImage(
      st.image,
      st.imgX * scaleX,
      st.imgY * scaleY,
      drawW,
      drawH
    );
  }

 const textX = st.textX === null ? (box.x + box.w / 2) : st.textX;
const textY = st.textY === null ? (box.y + box.h / 2) : st.textY;
const textScale = Number(st.textScale) > 0 ? Number(st.textScale) : 1;

ctx.font = `700 ${Math.round(28 * textScale * scaleX)}px ${st.font}, sans-serif`;
ctx.fillStyle = st.textColor;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';

wrapText(
  ctx,
  st.text,
  textX * scaleX,
  textY * scaleY,
  scaledBoxW - (20 * scaleX),
  34 * textScale * scaleY
);

  ctx.restore();

  return canvas.toDataURL('image/png');
}

async function renderTextLayerToDataUrl(viewName) {
  const canvas = document.createElement('canvas');
  canvas.width = 3508;   // A3 a 300 DPI
  canvas.height = 4961;  // A3 a 300 DPI

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const st = designStates[viewName];
  const box = DESIGN_BOX[viewName];

  if (!String(st.text || '').trim()) return '';

  const scaleX = canvas.width / 500;
  const scaleY = canvas.height / 700;

  const scaledBoxX = box.x * scaleX;
  const scaledBoxY = box.y * scaleY;
  const scaledBoxW = box.w * scaleX;
  const scaledBoxH = box.h * scaleY;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 ${Math.round(28 * scaleX)}px ${st.font}, sans-serif`;
  ctx.fillStyle = st.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  wrapText(
    ctx,
    st.text,
    scaledBoxX + scaledBoxW / 2,
    scaledBoxY + scaledBoxH / 2,
    scaledBoxW - (20 * scaleX),
    34 * scaleY
  );

  return canvas.toDataURL('image/png');
}


//ALGO 
function makeWeightedProgressUpdater(start, end, label) {
  return (filePercent) => {
    const globalPercent = start + ((end - start) * (filePercent / 100));
    updateCreateProgress(globalPercent, label);
  };
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const base64 = parts[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function getSupabaseAccessToken() {
  try {
    const directKeys = [
      'supabase.auth.token',
      'sb-auth-token',
      'kimeraToken'
    ];

    for (const key of directKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const token =
          parsed?.currentSession?.access_token ||
          parsed?.session?.access_token ||
          parsed?.access_token ||
          null;

        if (token) return token;
      } catch {
        if (typeof raw === 'string' && raw.length > 20) {
          return raw;
        }
      }
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (!key.includes('auth-token')) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const token =
          parsed?.currentSession?.access_token ||
          parsed?.session?.access_token ||
          parsed?.access_token ||
          null;

        if (token) return token;
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

//helper COM PROGRESSO

async function uploadDataUrlAssetWithProgress(bucket, path, dataUrl, onProgress) {
  if (!dataUrl) return '';

  const blob = dataUrlToBlob(dataUrl);
  const token = getSupabaseAccessToken();

  if (!token) {
    throw new Error('Sessão inválida para upload.');
  }

  const supabaseUrl =
    KIMERA_CONFIG?.supabase?.url ||
    window.SUPABASE_URL ||
    '';

  const supabaseAnonKey =
    KIMERA_CONFIG?.supabase?.anonKey ||
    window.SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl) {
    throw new Error('SUPABASE URL não encontrada.');
  }

  if (!supabaseAnonKey) {
    throw new Error('SUPABASE ANON KEY não encontrada.');
  }

  const safePath = String(path || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${safePath}`;

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', blob.type || 'image/png');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      if (typeof onProgress === 'function') {
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${safePath}`;
        resolve(publicUrl);
      } else {
        reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText || 'sem resposta'}`));
      }
    };

    xhr.onerror = () => reject(new Error('Erro de rede no upload.'));
    xhr.send(blob);
  });
}

function buildCustomProjectRef() {
  return 'CP-' + Date.now().toString().slice(-8) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

//Cria a função que grava o projeto
async function saveCustomProjectToDatabase(payload) {
  const rows = await sbPost('custom_projects', payload);
  return rows?.[0] || null;
}


//Helpers da barra
function setCreateLoadingState(isLoading) {
  const btn = document.getElementById('btnAddCustomCart');
  const wrap = document.getElementById('createProgressWrap');

  if (btn) {
    btn.disabled = isLoading;
    btn.style.opacity = isLoading ? '0.75' : '1';
    btn.style.cursor = isLoading ? 'wait' : 'pointer';
  }

  if (wrap) {
    wrap.style.display = isLoading ? 'block' : 'none';
  }

  if (!isLoading) {
    updateCreateProgress(0, 'Pronto');
  }
}

function updateCreateProgress(percent, label = '') {
  const bar = document.getElementById('createProgressBar');
  const txt = document.getElementById('createProgressPercent');
  const lbl = document.getElementById('createProgressLabel');

  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  if (bar) bar.style.width = `${safePercent}%`;
  if (txt) txt.textContent = `${safePercent}%`;
  if (lbl && label) lbl.textContent = label;
}

function makeWeightedProgressUpdater(start, end, label) {
  return (filePercent) => {
    const globalPercent = start + ((end - start) * (filePercent / 100));
    updateCreateProgress(globalPercent, label);
  };
}


/* ── CARRINHO ── */
async function addCustomToCart() {
  setCreateLoadingState(true);
  updateCreateProgress(3, 'A validar sessão...');

  try {
    const currentUser = typeof sbCurrentUser === 'function' ? sbCurrentUser() : null;
    if (!currentUser) {
      showToast('É obrigatório iniciar sessão para criar e guardar a peça.', 'error');
      setTimeout(() => {
        window.location.href = '/pages/login';
      }, 4000);
      return;
    }

    updateCreateProgress(8, 'A gerar mockups...');
    const frontPreview = await renderViewToDataUrl('frente');
    const backPreview = await renderViewToDataUrl('costas');
    const frontTextPng = await renderTextLayerToDataUrl('frente');
    const backTextPng = await renderTextLayerToDataUrl('costas');

    const projectRef = buildCustomProjectRef();
    const kimeraCriarStoreId = getKimeraCriarStoreId();
    const kimeraCriarStoreName = 'KIMERA Criar';

    let frontMockupUrl = '';
    let backMockupUrl = '';
    let frontTextUrl = '';
    let backTextUrl = '';
    let frontOriginalUrl = '';
    let backOriginalUrl = '';
    let savedProject = null;

    try {
      updateCreateProgress(12, 'Upload do mockup frontal...');
      frontMockupUrl = await uploadDataUrlAssetWithProgress(
        'custom-projects',
        `mockups/${projectRef}_front.png`,
        frontPreview,
        makeWeightedProgressUpdater(12, 28, 'Upload do mockup frontal...')
      );

      updateCreateProgress(28, 'Upload do mockup traseiro...');
      backMockupUrl = await uploadDataUrlAssetWithProgress(
        'custom-projects',
        `mockups/${projectRef}_back.png`,
        backPreview,
        makeWeightedProgressUpdater(28, 44, 'Upload do mockup traseiro...')
      );

      if (frontTextPng) {
        updateCreateProgress(44, 'Upload do texto frontal...');
        frontTextUrl = await uploadDataUrlAssetWithProgress(
          'custom-projects',
          `texts/${projectRef}_front_text.png`,
          frontTextPng,
          makeWeightedProgressUpdater(44, 54, 'Upload do texto frontal...')
        );
      } else {
        updateCreateProgress(54, 'Sem texto frontal.');
      }

      if (backTextPng) {
        updateCreateProgress(54, 'Upload do texto traseiro...');
        backTextUrl = await uploadDataUrlAssetWithProgress(
          'custom-projects',
          `texts/${projectRef}_back_text.png`,
          backTextPng,
          makeWeightedProgressUpdater(54, 64, 'Upload do texto traseiro...')
        );
      } else {
        updateCreateProgress(64, 'Sem texto traseiro.');
      }

      if (designStates.frente.originalUploadSrc) {
        updateCreateProgress(64, 'Upload da imagem original frontal...');
        frontOriginalUrl = await uploadDataUrlAssetWithProgress(
          'custom-projects',
          `uploads/${projectRef}_front_upload.png`,
          designStates.frente.originalUploadSrc,
          makeWeightedProgressUpdater(64, 80, 'Upload da imagem original frontal...')
        );
      } else {
        updateCreateProgress(80, 'Sem imagem frontal original.');
      }

      if (designStates.costas.originalUploadSrc) {
        updateCreateProgress(80, 'Upload da imagem original traseira...');
        backOriginalUrl = await uploadDataUrlAssetWithProgress(
          'custom-projects',
          `uploads/${projectRef}_back_upload.png`,
          designStates.costas.originalUploadSrc,
          makeWeightedProgressUpdater(80, 92, 'Upload da imagem original traseira...')
        );
      } else {
        updateCreateProgress(92, 'Sem imagem traseira original.');
      }

      updateCreateProgress(95, 'A guardar projecto...');

      const customProjectPayload = {
        project_ref: projectRef,
        customer_user_id: currentUser.id,
        customer_name: currentUser.user_metadata?.full_name || '',
        customer_phone: currentUser.phone || currentUser.user_metadata?.phone || '',
        store_id: kimeraCriarStoreId,
store_name: kimeraCriarStoreName,
        product_type: 'Camiseta Personalizada',
        fit_type: selectedType,
        size: selectedSize,
        quantity: customQty,
        shirt_color: selectedColor,
        base_price: getBasePriceByType(),
        size_extra: getSizeExtra(),
        customization_extra: getCustomizationExtra(),
        total_price: getUnitPrice() * customQty,
        front_mockup_url: frontMockupUrl,
        back_mockup_url: backMockupUrl,
        front_original_upload_url: frontOriginalUrl,
        back_original_upload_url: backOriginalUrl,
        front_text_png_url: frontTextUrl,
        back_text_png_url: backTextUrl,
        front_design_json: {
          text: designStates.frente.text,
          font: designStates.frente.font,
          textColor: designStates.frente.textColor,
          imgX: designStates.frente.imgX,
          imgY: designStates.frente.imgY,
          imgScale: designStates.frente.imgScale,
          hasImage: !!designStates.frente.image
        },
        back_design_json: {
          text: designStates.costas.text,
          font: designStates.costas.font,
          textColor: designStates.costas.textColor,
          imgX: designStates.costas.imgX,
          imgY: designStates.costas.imgY,
          imgScale: designStates.costas.imgScale,
          hasImage: !!designStates.costas.image
        },
        status: 'pending_payment'
      };

      savedProject = await saveCustomProjectToDatabase(customProjectPayload);
    } catch (storageOrDbError) {
      console.error('[Criar] Erro ao guardar custom_projects:', storageOrDbError);
    }

    updateCreateProgress(97, 'A adicionar ao carrinho...');

    const item = {
      product_id: 'custom-' + Date.now(),
      name: `${selectedType} Personalizada`,
      price: getUnitPrice(),
      thumbnail_url: frontMockupUrl || '',
     store_id: kimeraCriarStoreId,
store_name: kimeraCriarStoreName,
      size: selectedSize,
      color: selectedColor,
      quantity: customQty,
      customization: {
        project_id: savedProject?.id || null,
        project_ref: savedProject?.project_ref || projectRef,
        type: selectedType,
        shirtColor: selectedColor,
        size: selectedSize,
        quantity: customQty,
        basePrice: getBasePriceByType(),
        sizeExtra: getSizeExtra(),
        customizationExtra: getCustomizationExtra(),
        unitPrice: getUnitPrice(),
        frontPreviewUrl: frontMockupUrl || '',
        backPreviewUrl: backMockupUrl || '',
        frontTextPngUrl: frontTextUrl || '',
        backTextPngUrl: backTextUrl || '',
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

    updateCreateProgress(100, 'Concluído!');

    if (!savedProject?.id) {
      showToast('Adicionado ao carrinho, mas o projeto técnico não foi gravado no banco.', 'warning');
    } else {
      showToast(`${item.name} adicionada ao carrinho!`);
    }

    setTimeout(() => {
      window.location.href = '/pages/carrinho';
    }, 4000);

  } catch (e) {
    console.error('[Criar] addCustomToCart fatal:', e);
    showToast('Erro ao adicionar ao carrinho: ' + (e.message || 'desconhecido'), 'error');
  } finally {
    setTimeout(() => {
      setCreateLoadingState(false);
    }, 500);
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  initCanvasDrag();
  updateTotal();
  await redrawCanvas();
});