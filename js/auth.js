/* auth.js — Supabase Auth via email derivado do telefone
   Phone Auth está desactivado no Supabase.
   Telefone → email interno: 258849368285 → 258849368285@kimera.co.mz
*/

function phoneToEmail(phone) {
  let d = phone.replace(/\D/g, '');
  if (!d.startsWith('258')) {
    d = d.startsWith('0') ? '258' + d.slice(1) : d.length === 9 ? '258' + d : d;
  }
  return d + '@' + KIMERA_CONFIG.business.emailDomain;
}

function togglePwd(id) {
  const el = document.getElementById(id);
  if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function showErr(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 6000);
}

/* ── LOGIN ── */
async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('loginPhone')?.value.trim();
  const pwd   = document.getElementById('loginPwd')?.value;
  const btn   = document.getElementById('loginBtn');

  if (!phone || !pwd) { showErr('loginError', 'Preencha todos os campos.'); return; }

  btn.textContent = 'A entrar...';
  btn.disabled    = true;

  const email = phoneToEmail(phone);
  console.log('[Auth] Login com email interno:', email);

  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pwd })
    });
    const data = await r.json();

    if (!r.ok) {
      const msg = data.error_description || data.error_code || data.msg || 'Credenciais inválidas.';
      showErr('loginError', msg === 'Invalid login credentials'
        ? 'Número ou senha incorrectos.' : msg);
      btn.textContent = 'Entrar';
      btn.disabled    = false;
      return;
    }

    localStorage.setItem('kimeraToken',   data.access_token);
    localStorage.setItem('kimeraRefresh', data.refresh_token || '');
    localStorage.setItem('kimeraUser',    JSON.stringify(data.user));

    /* Mostrar email derivado no admin para debug */
    console.log('[Auth] Login OK. Role:', data.user?.user_metadata?.role);

    const role = data.user?.user_metadata?.role || 'customer';
    if (role === 'super_admin')  window.location.href = 'admin.html';
    else if (role === 'store_owner') window.location.href = 'dashboard.html';
    else window.location.href = 'index.html';

  } catch (ex) {
    console.error('[Auth] Erro login:', ex);
    showErr('loginError', 'Erro de ligação. Tente novamente.');
    btn.textContent = 'Entrar';
    btn.disabled    = false;
  }
}

/* ── REGISTO ── */
async function handleRegisto(e) {
  e.preventDefault();
  const phone   = document.getElementById('regPhone')?.value.trim();
  const pwd     = document.getElementById('regPwd')?.value;
  const confirm = document.getElementById('regConfirm')?.value;
  const btn     = document.getElementById('regBtn');

  if (!phone || !pwd || !confirm) { showErr('regError', 'Preencha todos os campos.'); return; }
  if (pwd !== confirm) { showErr('regError', 'As senhas não coincidem.'); return; }
  if (pwd.length < 8)  { showErr('regError', 'Senha mínima de 8 caracteres.'); return; }

  const email = phoneToEmail(phone);
  btn.textContent = 'A criar conta...';
  btn.disabled    = true;

  try {
    const r = await fetch(`${SB_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: pwd,
        data: { role: 'customer', phone: email.replace('@' + KIMERA_CONFIG.business.emailDomain, '') }
      })
    });
    const data = await r.json();

    if (!r.ok) {
      showErr('regError', data.error_description || data.msg || 'Erro ao criar conta.');
      btn.textContent = 'Registar';
      btn.disabled    = false;
      return;
    }

    if (data.access_token) {
      localStorage.setItem('kimeraToken', data.access_token);
      localStorage.setItem('kimeraUser',  JSON.stringify(data.user));
      showToast('Conta criada! Bem-vindo à Kimera.');
      setTimeout(() => window.location.href = 'index.html', 1200);
    } else {
      showToast('Conta criada! Faça login agora.');
      setTimeout(() => window.location.href = 'login.html', 1400);
    }
  } catch (ex) {
    console.error('[Auth] Erro registo:', ex);
    showErr('regError', 'Erro de ligação. Tente novamente.');
    btn.textContent = 'Registar';
    btn.disabled    = false;
  }
}

/* ── CRIAR VENDEDOR (chamado pelo admin.js) ── */
async function createVendedorAuth(phone, pwd, storeId, name) {
  const email = phoneToEmail(phone);
  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: pwd,
      data: { role: 'store_owner', store_id: storeId, full_name: name,
              phone: email.replace('@' + KIMERA_CONFIG.business.emailDomain, '') }
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || 'Erro ao criar vendedor.');
  return data;
}

window.createVendedorAuth = createVendedorAuth;
window.phoneToEmail       = phoneToEmail;

/* ── REDIRECT automático se já logado ── */
document.addEventListener('DOMContentLoaded', () => {
  const isAuthPage = location.pathname.includes('login') || location.pathname.includes('registo');
  if (!isAuthPage) return;

  const token = localStorage.getItem('kimeraToken');
  const user = typeof sbCurrentUser === 'function'
    ? sbCurrentUser()
    : JSON.parse(localStorage.getItem('kimeraUser') || 'null');

  if (token && user) {
    const role = user?.user_metadata?.role || 'customer';
    if (role === 'super_admin') window.location.href = 'admin.html';
    else if (role === 'store_owner') window.location.href = 'dashboard.html';
    else window.location.href = 'index.html';
  }
});