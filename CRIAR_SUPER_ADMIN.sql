-- ══════════════════════════════════════════════════════════════
-- KIMERA — CRIAR / PROMOVER SUPER ADMIN (VERSÃO CORRIGIDA)
-- ══════════════════════════════════════════════════════════════
-- 1) Primeiro registe a conta normalmente em /pages/registo.html
--    usando o número do telefone do admin e a senha desejada.
--
--    Exemplo:
--    +258 849 368 285  →  258849368285@kimera.co.mz
--
-- 2) Depois execute APENAS o UPDATE abaixo para promover esse utilizador
--    para super_admin. Não insira directamente em auth.users.
-- ══════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"super_admin"}'::jsonb,
    updated_at = now()
WHERE email = '258849368285@kimera.co.mz';

-- ══════════════════════════════════════════════════════════════
-- VERIFICAR
-- ══════════════════════════════════════════════════════════════
-- SELECT id, email, raw_user_meta_data
-- FROM auth.users
-- WHERE email = '258849368285@kimera.co.mz';

-- ══════════════════════════════════════════════════════════════
-- CASO TENHA CRIADO UM REGISTO PARTIDO MANUALMENTE E QUEIRA LIMPAR
-- (execute só se tiver certeza)
-- ══════════════════════════════════════════════════════════════
-- DELETE FROM auth.users
-- WHERE email = '258849368285@kimera.co.mz';
--
-- Depois volte a criar a conta pelo formulário /pages/registo.html
-- e execute novamente o UPDATE acima.
