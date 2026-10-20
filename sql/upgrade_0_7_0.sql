-- HidroCondo v0.7.0-beta: persistent demo invitations, weekly comparison and guided tour.
-- Run only after upgrades 0.2 through 0.6. Backup first; do not rerun setup.sql.
-- No production readings, photos, condominium memberships or demo memberships are deleted.
BEGIN;

-- A configurable, indicative reference per REAL water meter (m³ / 7 days).
ALTER TABLE public.meters ADD COLUMN IF NOT EXISTS weekly_limit_m3 numeric(12,3);
ALTER TABLE public.meters DROP CONSTRAINT IF EXISTS meters_weekly_limit_valid;
ALTER TABLE public.meters ADD CONSTRAINT meters_weekly_limit_valid
 CHECK (weekly_limit_m3 IS NULL OR (weekly_limit_m3 >= 0.001 AND weekly_limit_m3 <= 1000000));
DROP POLICY IF EXISTS meter_update_weekly_reference ON public.meters;
CREATE POLICY meter_update_weekly_reference ON public.meters FOR UPDATE TO authenticated
 USING (public.is_condo_admin(condominium_id))
 WITH CHECK (public.is_condo_admin(condominium_id));
GRANT UPDATE(weekly_limit_m3) ON public.meters TO authenticated;
-- Prevent using the UPDATE privilege to reassign a meter to a different condominium.
CREATE OR REPLACE FUNCTION public.hc_guard_meter_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF (NEW.id,NEW.condominium_id,NEW.name,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.condominium_id,OLD.name,OLD.created_at)
 THEN RAISE EXCEPTION 'Não é permitido alterar a identidade ou o condomínio do hidrômetro.'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS hc_guard_meter_identity ON public.meters;
CREATE TRIGGER hc_guard_meter_identity BEFORE UPDATE ON public.meters
 FOR EACH ROW EXECUTE FUNCTION public.hc_guard_meter_identity();
REVOKE ALL ON FUNCTION public.hc_guard_meter_identity() FROM PUBLIC,anon,authenticated;

-- All demo invitations stay server-side and are accessible only through an
-- audited, owner-scoped SECURITY DEFINER RPC. Do not expose this column with
-- direct table SELECT grants or use it for production invitation tokens.
ALTER TABLE public.hc_demo_invites ADD COLUMN IF NOT EXISTS recovery_token text;
ALTER TABLE public.hc_demo_spaces ADD COLUMN IF NOT EXISTS weekly_limit_m3 numeric(12,3) DEFAULT 80;
ALTER TABLE public.hc_demo_spaces DROP CONSTRAINT IF EXISTS hc_demo_limit_valid;
ALTER TABLE public.hc_demo_spaces ADD CONSTRAINT hc_demo_limit_valid
 CHECK (weekly_limit_m3 IS NULL OR weekly_limit_m3 BETWEEN 0.001 AND 1000000);
-- The token column is deliberately NULL for 0.6 invites: hashes cannot be reversed.
-- The owner can regenerate links, without terminating existing demo memberships.

CREATE OR REPLACE FUNCTION public.hc_demo_create(p_name text,p_hours integer DEFAULT 72,p_max_uses integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_space uuid; v_manager text; v_worker text; v_until timestamptz;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
 OR NOT EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid()
               AND account_type='suporte' AND can_create_condominiums=true)
 THEN RAISE EXCEPTION 'Somente suporte técnico autorizado pode criar demonstrações.'; END IF;
 IF p_hours NOT IN (24,72,168) OR p_max_uses NOT BETWEEN 1 AND 5
 THEN RAISE EXCEPTION 'Escolha 24 horas, 72 horas ou 7 dias; até 5 acessos por perfil.'; END IF;
 IF char_length(trim(coalesce(p_name,''))) NOT BETWEEN 3 AND 100
 THEN RAISE EXCEPTION 'Informe um nome de 3 a 100 caracteres.'; END IF;
 IF (SELECT count(*) FROM public.hc_demo_spaces WHERE created_by=auth.uid()
     AND expires_at>now() AND revoked_at IS NULL) >= 20
 THEN RAISE EXCEPTION 'Limite de 20 demonstrações ativas atingido.'; END IF;
 -- Old demonstration data is disposable; clean up only >7 days after expiry.
 DELETE FROM public.hc_demo_spaces WHERE expires_at<now()-interval '7 days';
 v_until:=now()+make_interval(hours=>p_hours);
 INSERT INTO public.hc_demo_spaces(name,created_by,expires_at)
 VALUES(trim(p_name),auth.uid(),v_until) RETURNING id INTO v_space;
 v_manager:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 v_worker:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.hc_demo_invites(space_id,token_hash,recovery_token,role,max_uses,expires_at)
 VALUES(v_space,md5(v_manager),v_manager,'sindico',p_max_uses,v_until),
       (v_space,md5(v_worker),v_worker,'zelador',p_max_uses,v_until);
 -- 12 weeks of explicitly fictional figures, for immediate charts and summaries.
 INSERT INTO public.hc_demo_readings(space_id,measured_on,value_m3,author)
 SELECT v_space,current_date-(13-n)*7,
        (3800+(n-1)*75+((n-1)%4)*4)::numeric(12,3),'Dados fictícios'
 FROM generate_series(1,12) AS n;
 RETURN jsonb_build_object('id',v_space,'name',trim(p_name),'expires_at',v_until,
   'manager_token',v_manager,'worker_token',v_worker,'max_uses',p_max_uses);
END; $$;


CREATE OR REPLACE FUNCTION public.hc_demo_links(p_space uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_space public.hc_demo_spaces%ROWTYPE;
 v_manager text;v_worker text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
 THEN RAISE EXCEPTION 'É necessário entrar como suporte permanente.'; END IF;
 SELECT * INTO v_space FROM public.hc_demo_spaces
 WHERE id=p_space AND created_by=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Demonstração não pertence a este suporte.'; END IF;
 IF v_space.revoked_at IS NOT NULL OR v_space.expires_at<=now()
 THEN RAISE EXCEPTION 'Demonstração encerrada ou expirada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid()
   AND account_type='suporte' AND can_create_condominiums=true)
 THEN RAISE EXCEPTION 'Conta sem autorização de gerenciar demonstrações.'; END IF;
 SELECT recovery_token INTO v_manager FROM public.hc_demo_invites
 WHERE space_id=p_space AND role='sindico' ORDER BY created_at DESC LIMIT 1;
 SELECT recovery_token INTO v_worker FROM public.hc_demo_invites
 WHERE space_id=p_space AND role='zelador' ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('id',p_space,'expires_at',v_space.expires_at,
   'recoverable',(v_manager IS NOT NULL AND v_worker IS NOT NULL),
   'manager_token',v_manager,'worker_token',v_worker);
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_rotate_links(p_space uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_space public.hc_demo_spaces%ROWTYPE;
 v_manager text;v_worker text;v_max integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
 THEN RAISE EXCEPTION 'Somente suporte autorizado pode regenerar os links.'; END IF;
 SELECT * INTO v_space FROM public.hc_demo_spaces
 WHERE id=p_space AND created_by=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Demonstração não encontrada para sua conta.'; END IF;
 IF v_space.revoked_at IS NOT NULL OR v_space.expires_at<=now()
 THEN RAISE EXCEPTION 'Não é possível renovar convites de demonstração encerrada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid()
   AND account_type='suporte' AND can_create_condominiums=true)
 THEN RAISE EXCEPTION 'Sua conta não tem esta autorização.'; END IF;
 SELECT max_uses INTO v_max FROM public.hc_demo_invites
 WHERE space_id=p_space LIMIT 1;
 v_max:=coalesce(v_max,1);
 v_manager:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 v_worker:=replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 -- Old unclaimed links cease working. Joined visitors remain until workspace expiry.
 DELETE FROM public.hc_demo_invites WHERE space_id=p_space;
 INSERT INTO public.hc_demo_invites(space_id,token_hash,recovery_token,role,max_uses,expires_at)
 VALUES(p_space,md5(v_manager),v_manager,'sindico',v_max,v_space.expires_at),
       (p_space,md5(v_worker),v_worker,'zelador',v_max,v_space.expires_at);
 RETURN jsonb_build_object('id',p_space,'expires_at',v_space.expires_at,
  'manager_token',v_manager,'worker_token',v_worker,'recoverable',true);
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_set_limit(p_space uuid,p_weekly_limit numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.hc_demo_authorized(p_space,'sindico');
 IF p_weekly_limit IS NOT NULL AND
   (p_weekly_limit<0.001 OR p_weekly_limit>1000000 OR scale(p_weekly_limit)>3)
 THEN RAISE EXCEPTION 'Use um limite entre 0,001 e 1.000.000 m³/7 dias.'; END IF;
 UPDATE public.hc_demo_spaces SET weekly_limit_m3=p_weekly_limit WHERE id=p_space;
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_snapshot(p_space uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_readings jsonb; v_requests jsonb;
 v_name text; v_until timestamptz; v_limit numeric;
BEGIN
 v_role:=public.hc_demo_authorized(p_space);
 SELECT name,expires_at,weekly_limit_m3 INTO v_name,v_until,v_limit
 FROM public.hc_demo_spaces WHERE id=p_space;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'measured_on',measured_on,
 'value_m3',value_m3,'author',author) ORDER BY measured_on),'[]'::jsonb)
 INTO v_readings FROM public.hc_demo_readings WHERE space_id=p_space;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'entries',entries,'status',status,
   'review_note',review_note,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb)
 INTO v_requests FROM public.hc_demo_submissions
 WHERE space_id=p_space AND (v_role='sindico' OR user_id=auth.uid());
 RETURN jsonb_build_object('name',v_name,'role',v_role,'expires_at',v_until,
 'weekly_limit_m3',v_limit,'readings',v_readings,'requests',v_requests);
END; $$;

REVOKE ALL ON FUNCTION public.hc_demo_links(uuid),
 public.hc_demo_rotate_links(uuid), public.hc_demo_set_limit(uuid,numeric)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hc_demo_links(uuid),
 public.hc_demo_rotate_links(uuid), public.hc_demo_set_limit(uuid,numeric)
 TO authenticated;
COMMIT;
