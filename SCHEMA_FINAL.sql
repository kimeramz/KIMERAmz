-- ══════════════════════════════════════════════════════════════
-- KIMERA — SCHEMA FINAL v6
-- Seguro re-executar: usa IF NOT EXISTS e ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- ══════════════════════════════════════════════════════════════

-- ── FUNÇÃO user_role() em public ──
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth AS $$
  SELECT COALESCE(
    (SELECT raw_user_meta_data ->> 'role' FROM auth.users WHERE id = auth.uid() LIMIT 1),
    'customer'
  );
$$;
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated, anon;

-- ── EXTENSÃO ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABELAS ──
CREATE TABLE IF NOT EXISTS stores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, description text, location text,
  category text DEFAULT 'Moda Geral', logo_url text, banner_url text,
  rating numeric DEFAULT 0, product_count integer DEFAULT 0,
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now()
);

-- Colunas que podem faltar em tabelas já existentes
ALTER TABLE stores ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS category text DEFAULT 'Moda Geral';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS product_count integer DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  store_name text, name text NOT NULL, description text,
  price numeric NOT NULL, original_price numeric,
  stock integer DEFAULT 0, category text,
  sizes text[] DEFAULT '{}', colors text[] DEFAULT '{}',
  thumbnail_url text, gallery_urls text[] DEFAULT '{}',
  discount_pct integer DEFAULT 0,
  is_featured boolean DEFAULT false, is_new boolean DEFAULT true,
  is_active boolean DEFAULT true, sales_count integer DEFAULT 0,
  rating numeric DEFAULT 0, review_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_pct integer DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_count integer DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_ref text UNIQUE NOT NULL,
  customer_id uuid, customer_name text, customer_phone text, payment_phone text,
  store_id uuid REFERENCES stores(id), store_name text,
  items jsonb DEFAULT '[]',
  subtotal numeric DEFAULT 0, delivery_fee numeric DEFAULT 100,
  discount numeric DEFAULT 0, total numeric DEFAULT 0,
  commission_amount numeric DEFAULT 0, store_amount numeric DEFAULT 0,
  coupon_code text, status text DEFAULT 'pending',
  payment_status text DEFAULT 'pending', mpesa_conversation_id text,
  delivery_address jsonb,
  store_payout_done boolean DEFAULT false, store_payout_ref text, store_payout_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_amount numeric DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_payout_done boolean DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_payout_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_payout_at timestamptz;

CREATE TABLE IF NOT EXISTS banners (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text, subtitle text, tag text, cta_text text, link_url text,
  image_url text, bg_color text DEFAULT '#111111',
  position integer DEFAULT 1, type text DEFAULT 'hero',
  is_active boolean DEFAULT true, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text UNIQUE NOT NULL, discount_pct integer NOT NULL,
  max_uses integer DEFAULT 100, used_count integer DEFAULT 0,
  is_active boolean DEFAULT true, expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- reviews: coluna "text" (NÃO "comment")
CREATE TABLE IF NOT EXISTS reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id),
  order_id uuid, author_name text,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  text text, reply text, is_verified boolean DEFAULT false,
  status text DEFAULT 'pending', created_at timestamptz DEFAULT now()
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS text text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

-- delivery_proofs (NÃO "social_proofs")
CREATE TABLE IF NOT EXISTS delivery_proofs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  order_ref text, image_url text NOT NULL,
  caption text, is_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- store_users: vendedores
CREATE TABLE IF NOT EXISTS store_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid, store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  phone text, full_name text, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── TRIGGER: actualiza product_count em stores ──
CREATE OR REPLACE FUNCTION public.update_store_product_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.store_id IS NOT NULL THEN
    UPDATE stores SET product_count = (SELECT COUNT(*) FROM products WHERE store_id = NEW.store_id AND is_active = true) WHERE id = NEW.store_id;
  ELSIF TG_OP IN ('UPDATE','DELETE') THEN
    DECLARE sid uuid := COALESCE(OLD.store_id, NEW.store_id);
    BEGIN
      IF sid IS NOT NULL THEN
        UPDATE stores SET product_count = (SELECT COUNT(*) FROM products WHERE store_id = sid AND is_active = true) WHERE id = sid;
      END IF;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_product_count ON products;
CREATE TRIGGER trg_product_count
  AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION public.update_store_product_count();

-- ── RLS ──
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

-- Drop todas as policies existentes
DO $$ DECLARE r record; BEGIN
  FOR r IN (SELECT policyname,tablename FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('stores','products','orders','banners','coupons','reviews','delivery_proofs','store_users'))
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename); END LOOP;
END $$;

-- STORES
CREATE POLICY "stores_read_all"    ON stores FOR SELECT USING (true);
CREATE POLICY "stores_admin_write" ON stores FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');
CREATE POLICY "stores_owner_write" ON stores FOR UPDATE
  USING (public.user_role()='store_owner' AND id IN (SELECT store_id FROM store_users WHERE user_id=auth.uid() AND is_active=true));

-- PRODUCTS
CREATE POLICY "products_read_active" ON products FOR SELECT USING (is_active=true);
CREATE POLICY "products_admin_all"   ON products FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');
CREATE POLICY "products_owner_all"   ON products FOR ALL
  USING (public.user_role()='store_owner' AND store_id IN (SELECT store_id FROM store_users WHERE user_id=auth.uid() AND is_active=true))
  WITH CHECK (public.user_role()='store_owner' AND store_id IN (SELECT store_id FROM store_users WHERE user_id=auth.uid() AND is_active=true));

-- ORDERS
CREATE POLICY "orders_insert_any"   ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_select_any"   ON orders FOR SELECT USING (true);
CREATE POLICY "orders_admin_all"    ON orders FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');
CREATE POLICY "orders_update_auth"  ON orders FOR UPDATE USING (public.user_role() IN ('super_admin','store_owner'));

-- BANNERS
CREATE POLICY "banners_read_active" ON banners FOR SELECT USING (is_active=true);
CREATE POLICY "banners_admin_all"   ON banners FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');

-- COUPONS
CREATE POLICY "coupons_read_active" ON coupons FOR SELECT USING (is_active=true);
CREATE POLICY "coupons_admin_all"   ON coupons FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');

-- REVIEWS
CREATE POLICY "reviews_read_approved" ON reviews FOR SELECT USING (status='approved');
CREATE POLICY "reviews_insert_any"    ON reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "reviews_admin_all"     ON reviews FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');
CREATE POLICY "reviews_owner_read"    ON reviews FOR SELECT
  USING (public.user_role()='store_owner' AND store_id IN (SELECT store_id FROM store_users WHERE user_id=auth.uid() AND is_active=true));

-- DELIVERY PROOFS
CREATE POLICY "proofs_insert_any"  ON delivery_proofs FOR INSERT WITH CHECK (true);
CREATE POLICY "proofs_read_appr"   ON delivery_proofs FOR SELECT USING (is_approved=true);
CREATE POLICY "proofs_admin_all"   ON delivery_proofs FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');

-- STORE USERS
CREATE POLICY "susers_admin_all" ON store_users FOR ALL USING (public.user_role()='super_admin') WITH CHECK (public.user_role()='super_admin');
CREATE POLICY "susers_self_read" ON store_users FOR SELECT USING (user_id=auth.uid());

-- ── STORAGE ──
INSERT INTO storage.buckets (id,name,public)
  VALUES ('products','products',true),('stores','stores',true),('banners','banners',true),('proofs','proofs',true)
  ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public;

DO $$ DECLARE r record; BEGIN
  FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'storage_%')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname); END LOOP;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "storage_read" ON storage.objects FOR SELECT USING (bucket_id IN ('products','stores','banners','proofs'));
CREATE POLICY "storage_write_auth" ON storage.objects FOR INSERT WITH CHECK (auth.role()='authenticated');
CREATE POLICY "storage_proofs_anon" ON storage.objects FOR INSERT WITH CHECK (bucket_id='proofs');
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE USING (auth.role()='authenticated');
CREATE POLICY "storage_update" ON storage.objects FOR UPDATE USING (auth.role()='authenticated');

-- ── ÍNDICES ──
CREATE INDEX IF NOT EXISTS idx_products_store    ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured) WHERE is_featured=true;
CREATE INDEX IF NOT EXISTS idx_products_search   ON products USING gin(to_tsvector('simple', name || ' ' || COALESCE(description,'')));
CREATE INDEX IF NOT EXISTS idx_orders_ref        ON orders(order_ref);
CREATE INDEX IF NOT EXISTS idx_orders_store      ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payout     ON orders(store_payout_done) WHERE store_payout_done=false;
CREATE INDEX IF NOT EXISTS idx_banners_pos       ON banners(is_active,position);
CREATE INDEX IF NOT EXISTS idx_susers_uid        ON store_users(user_id);
CREATE INDEX IF NOT EXISTS idx_susers_store      ON store_users(store_id);
CREATE INDEX IF NOT EXISTS idx_reviews_prod      ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_proofs_order      ON delivery_proofs(order_id);

-- ══════════════════════════════════════════════════════════════
-- CRIAR / ACTUALIZAR SUPER ADMIN
-- ══════════════════════════════════════════════════════════════
-- Descomente e substitua SUA_SENHA:
-- UPDATE auth.users
--   SET raw_user_meta_data = '{"role":"super_admin"}'::jsonb,
--       email_confirmed_at  = COALESCE(email_confirmed_at, now())
--   WHERE email = '258849368285@kimera.co.mz';

-- VERIFICAR:
-- SELECT email, raw_user_meta_data, public.user_role()
-- FROM auth.users WHERE email LIKE '%@kimera.co.mz';
