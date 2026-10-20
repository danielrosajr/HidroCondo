-- HidroCondo v0.8.0-beta: scoped person invitations, membership management.
-- Run ONCE after all migrations through upgrade_0_7_0.sql.
-- Non-destructive: existing condominium owners, memberships and readings remain intact.
BEGIN;

CREATE TABLE IF NOT EXISTS public.hc_member_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 condominium_id uuid NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('sindica', 'zelador')),
 token_hash text NOT NULL UNIQUE,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_by uuid REFERENCES auth.users(id),
 used_at timestamptz,
 revoked_at timestamptz,
 CONSTRAINT hc_member_invite_state CHECK ((used_at IS NULL) = (used_by IS NULL)),
 CONSTRAINT hc_member_invite_expiration CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS hc_member_invites_condo_idx
 ON public.hc_member_invites(condominium_id, created_at DESC);
ALTER TABLE public.hc_member_invites ENABLE ROW LEVEL SECURITY;
-- No direct policies: all operations happen through checked RPCs.
REVOKE ALL ON public.hc_member_invites FROM anon, authenticated, PUBLIC;

-- Never send raw invitation tokens in membership listings, logs or table reads.
-- Invite: only the owner grants management privilege; other managers may invite workers.
CREATE OR REPLACE FUNCTION public.hc_create_member_invite(p_condo uuid, p_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_token text; v_hours int;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false') = 'true'
 THEN RAISE EXCEPTION 'Entre com uma conta permanente.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('sindica','zelador')
 THEN RAISE EXCEPTION 'Perfil de convite inválido.'; END IF;
 SELECT owner_id INTO v_owner FROM public.condominiums WHERE id = p_condo;
 IF v_owner IS NULL OR NOT public.is_condo_admin(p_condo)
 THEN RAISE EXCEPTION 'Apenas gestores do condomínio podem convidar.'; END IF;
 IF p_role = 'sindica' AND v_owner <> auth.uid()
 THEN RAISE EXCEPTION 'Somente o proprietário pode convidar outro(a) síndico(a).'; END IF;
 IF (SELECT count(*) FROM public.hc_member_invites
     WHERE condominium_id = p_condo AND revoked_at IS NULL AND used_at IS NULL AND expires_at > now()) >= 30
 THEN RAISE EXCEPTION 'Limite de convites pendentes. Revogue algum antes de continuar.'; END IF;
 -- 32 random bytes, 256-bit token. Only SHA-256 hash is retained on the server.
 v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 v_hours := CASE WHEN p_role = 'sindica' THEN 24 ELSE 168 END;
 INSERT INTO public.hc_member_invites (condominium_id,role,token_hash,created_by,expires_at)
 VALUES (p_condo,p_role,encode(sha256(convert_to(v_token,'UTF8')),'hex'),auth.uid(),now()+make_interval(hours=>v_hours));
 RETURN v_token;
END; $$;

-- Anyone holding the link may claim the specified role ONCE, after logging in.
-- Membership role is independent of the global account profile: same account can
-- be a manager in one condominium and a worker in another.
CREATE OR REPLACE FUNCTION public.hc_redeem_member_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invite public.hc_member_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false') = 'true'
 THEN RAISE EXCEPTION 'Crie uma conta permanente e faça login para aceitar.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid()
                AND account_type IN ('sindico','zelador'))
 THEN RAISE EXCEPTION 'Este tipo de conta não pode aceitar convites permanentes.'; END IF;
 IF length(trim(coalesce(p_token,''))) <> 64 OR trim(p_token) !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Link de convite inválido.'; END IF;
 SELECT * INTO v_invite FROM public.hc_member_invites
 WHERE token_hash = encode(sha256(convert_to(trim(p_token),'UTF8')),'hex')
 FOR UPDATE;
 IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.used_at IS NOT NULL OR v_invite.expires_at <= now()
 THEN RAISE EXCEPTION 'Link inválido, expirado, revogado ou já utilizado.'; END IF;
 IF EXISTS (SELECT 1 FROM public.memberships
            WHERE condominium_id=v_invite.condominium_id AND user_id=auth.uid())
 THEN RAISE EXCEPTION 'Você já participa deste condomínio.'; END IF;
 INSERT INTO public.memberships(condominium_id,user_id,role)
 VALUES (v_invite.condominium_id,auth.uid(),v_invite.role);
 UPDATE public.hc_member_invites SET used_at=now(),used_by=auth.uid()
 WHERE id=v_invite.id;
 RETURN v_invite.condominium_id;
END; $$;

-- A manager can review who currently has access, and pending invitation status.
-- Auth email is returned only for members of that one condominium.
CREATE OR REPLACE FUNCTION public.hc_list_condo_people(p_condo uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_members jsonb; v_invites jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false') = 'true'
    OR NOT public.is_condo_admin(p_condo)
 THEN RAISE EXCEPTION 'Acesso restrito à administração deste condomínio.'; END IF;
 SELECT owner_id INTO v_owner FROM public.condominiums WHERE id=p_condo;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'user_id',m.user_id,'email',u.email,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),
     'role',m.role,'owner',m.user_id=v_owner,'since',m.created_at
   ) ORDER BY m.created_at),'[]'::jsonb)
 INTO v_members
 FROM public.memberships m JOIN auth.users u ON u.id=m.user_id
 WHERE m.condominium_id=p_condo;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',i.id,'role',i.role,'created_at',i.created_at,'expires_at',i.expires_at,
     'revoked',i.revoked_at IS NOT NULL,'used',i.used_at IS NOT NULL
   ) ORDER BY i.created_at DESC),'[]'::jsonb)
 INTO v_invites FROM public.hc_member_invites i
 WHERE i.condominium_id=p_condo AND i.created_at > now() - interval '30 days';
 RETURN jsonb_build_object('is_owner',v_owner=auth.uid(),'members',v_members,'invites',v_invites);
END; $$;

-- Revoke pending invitations. Manager invitations may only be revoked by owner.
CREATE OR REPLACE FUNCTION public.hc_revoke_member_invite(p_invite uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invite public.hc_member_invites%ROWTYPE; v_owner uuid;
BEGIN
 SELECT * INTO v_invite FROM public.hc_member_invites WHERE id=p_invite FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado.'; END IF;
 IF NOT public.is_condo_admin(v_invite.condominium_id)
 THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
 SELECT owner_id INTO v_owner FROM public.condominiums WHERE id=v_invite.condominium_id;
 IF v_invite.role='sindica' AND v_owner<>auth.uid()
 THEN RAISE EXCEPTION 'Somente o proprietário pode revogar convites de síndico(a).'; END IF;
 IF v_invite.used_at IS NOT NULL THEN RAISE EXCEPTION 'Convite já utilizado. Gerencie o acesso na lista de pessoas.'; END IF;
 UPDATE public.hc_member_invites SET revoked_at=now()
 WHERE id=p_invite AND revoked_at IS NULL;
END; $$;

-- Manager may remove workers; only owner may remove other managers.
-- Owner is never removed by an invitation or by this RPC.
CREATE OR REPLACE FUNCTION public.hc_remove_condo_member(p_condo uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_role text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_condo_admin(p_condo)
 THEN RAISE EXCEPTION 'Somente a administração pode gerenciar acessos.'; END IF;
 SELECT owner_id INTO v_owner FROM public.condominiums WHERE id=p_condo;
 IF p_user=v_owner THEN RAISE EXCEPTION 'O proprietário não pode ser removido.'; END IF;
 SELECT role INTO v_role FROM public.memberships
 WHERE condominium_id=p_condo AND user_id=p_user FOR UPDATE;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada neste condomínio.'; END IF;
 IF v_role='sindica' AND v_owner<>auth.uid()
 THEN RAISE EXCEPTION 'Somente o proprietário pode remover outro(a) síndico(a).'; END IF;
 DELETE FROM public.memberships WHERE condominium_id=p_condo AND user_id=p_user;
END; $$;

REVOKE ALL ON FUNCTION public.hc_create_member_invite(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_redeem_member_invite(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_list_condo_people(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_revoke_member_invite(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_remove_condo_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hc_create_member_invite(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_redeem_member_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_list_condo_people(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_revoke_member_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_remove_condo_member(uuid,uuid) TO authenticated;
COMMIT;
