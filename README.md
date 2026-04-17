# Kimera Marketplace — v6

Marketplace multi-loja moçambicano desenvolvido em HTML, CSS e JavaScript puro com Supabase.

---

## Estrutura

```
kimera/
├── index.html              ← Redirect para pages/index.html
├── SCHEMA_FINAL.sql        ← ⭐ SQL a executar no Supabase (versão final)
├── CRIAR_SUPER_ADMIN.sql   ← Como criar o Super Admin
├── pages/
│   ├── index.html          ← Homepage
│   ├── lojas.html          ← Produtos, lojas e pesquisa
│   ├── produto.html        ← Página do produto
│   ├── carrinho.html       ← Carrinho de compras
│   ├── checkout.html       ← Finalizar compra (M-Pesa)
│   ├── rastrear.html       ← Rastrear pedido
│   ├── criar.html          ← Personalização de peças
│   ├── contactos.html      ← Contactos
│   ├── login.html          ← Login
│   ├── registo.html        ← Registo de cliente
│   ├── admin.html          ← Painel Super Admin
│   └── dashboard.html      ← Dashboard do Vendedor
├── js/
│   ├── config.js           ← Credenciais + helpers Supabase + M-Pesa
│   ├── global.js           ← Funções partilhadas
│   ├── home.js             ← Homepage
│   ├── lojas.js            ← Listagem + página de loja
│   ├── produto.js          ← Página do produto
│   ├── carrinho.js         ← Carrinho
│   ├── checkout.js         ← Checkout multi-loja + M-Pesa C2B
│   ├── rastrear.js         ← Rastreamento
│   ├── criar.js            ← Editor de peças
│   ├── admin.js            ← Super Admin
│   ├── dashboard.js        ← Dashboard vendedor
│   └── auth.js             ← Autenticação
└── css/
    ├── global.css, home.css, lojas.css, produto.css
    ├── carrinho.css, checkout.css, rastrear.css, criar.css
    ├── admin.css, dashboard.css, auth.css, contactos.css
    └── avaliacoes.css
```

---

## Setup Supabase

### 1. Executar o Schema

Abra o **SQL Editor** no Supabase e execute o ficheiro `SCHEMA_FINAL.sql`.

> Este ficheiro é seguro de re-executar. Usa `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para não destruir dados existentes.

### 2. Criar Super Admin

Após executar o schema, descomente e execute no SQL Editor:

```sql
UPDATE auth.users
  SET raw_user_meta_data = '{"role":"super_admin"}'::jsonb,
      email_confirmed_at  = COALESCE(email_confirmed_at, now())
  WHERE email = '258849368285@kimera.co.mz';
```

Se o utilizador ainda não existe, veja o ficheiro `CRIAR_SUPER_ADMIN.sql`.

### 3. Desactivar Email Confirmation (recomendado)

No painel Supabase:
→ **Authentication** → **Settings** → **Email** → desactivar **"Enable email confirmations"**

### 4. Configurar M-Pesa (quando pronto)

No ficheiro `js/config.js`, substitua:
- `COLE_AQUI_SUA_API_KEY` → API Key do portal openapi.m-pesa.com
- `COLE_AQUI_O_SERVICE_PROVIDER_CODE` → Código do merchant

---

## Sistema de Autenticação

O Supabase tem **Phone Auth desactivado**. O sistema usa email derivado do telefone:

```
+258 849 368 285  →  258849368285@kimera.co.mz
```

O utilizador escreve o número de telefone — o sistema converte internamente.

---

## Roles

| Role | Acesso |
|------|--------|
| `customer` | Comprar, rastrear, avaliar |
| `store_owner` | Dashboard da loja, produtos, pedidos |
| `super_admin` | Tudo: admin, lojas, banners, pagamentos |

---

## Correr localmente

```bash
npx serve .
# ou
python -m http.server 3000
```

Aceder em: `http://localhost:3000/pages/index.html`

---

## Problemas resolvidos nesta versão

- ✅ `lojas.js` reconstruído (estava com conteúdo de `home.js`)
- ✅ Todos os links são relativos (sem `/pages/...` absolutos)
- ✅ `produto.html` lê `?id=` via `URLSearchParams` de forma fiável
- ✅ Página de loja integrada em `lojas.html?store=ID`
- ✅ `reviews.text` em toda a stack (não `comment`)
- ✅ `delivery_proofs` em toda a stack (não `social_proofs`)
- ✅ Menu mobile admin fecha correctamente com overlay
- ✅ `checkout.js` suporta múltiplas lojas no mesmo pedido
- ✅ `SCHEMA_FINAL.sql` usa `public.user_role()` (não `auth.user_role()`)
- ✅ `ALTER TABLE IF NOT EXISTS` para colunas que podem faltar
- ✅ Trigger automático para `product_count` nas lojas
