-- HidroCondo v0.6.0-beta - isolated invitation-only demos.
-- Apply after 0.5.0; back up DB + Storage first. Do not rerun setup.sql.
-- Supabase Authentication > Providers: enable Anonymous Sign-Ins.
BEGIN;

-- Anonymous Auth users have the PostgreSQL 'authenticated' role.
-- Do not let a demonstration guest accidentally use the production membership RPCs.
CREATE OR REPLACE FUNCTION public.is_condo_member(p_condo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
   AND EXISTS (SELECT 1 FROM public.memberships
               WHERE condominium_id=p_condo AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.is_condo_admin(p_condo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
   AND EXISTS (SELECT 1 FROM public.memberships
               WHERE condominium_id=p_condo AND user_id=auth.uid() AND role='sindica');
$$;
-- Redeeming a real worker invitation must require a permanent account.
CREATE OR REPLACE FUNCTION public.hc_redeem_worker_invite(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_condo uuid;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
   THEN RAISE EXCEPTION 'Crie uma conta permanente antes de ativar convite real.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.account_profiles
                WHERE user_id=auth.uid() AND account_type='zelador')
   THEN RAISE EXCEPTION 'Este convite é exclusivo do perfil zelador(a).'; END IF;
 SELECT id, condominium_id INTO v_id,v_condo FROM public.worker_invites
 WHERE token_hash=md5(trim(p_token)) AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Link inválido, vencido ou já utilizado.'; END IF;
 IF EXISTS (SELECT 1 FROM public.memberships WHERE user_id=auth.uid() AND condominium_id=v_condo)
   THEN RAISE EXCEPTION 'Você já tem acesso a este condomínio.'; END IF;
 INSERT INTO public.memberships(condominium_id,user_id,role) VALUES(v_condo,auth.uid(),'zelador');
 UPDATE public.worker_invites SET used_at=now(),used_by=auth.uid() WHERE id=v_id;
 RETURN v_condo;
END; $$;
-- Block account-type RPC for anonymous users, even in legacy projects missing a profile.
CREATE OR REPLACE FUNCTION public.hc_choose_profile(p_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
  THEN RAISE EXCEPTION 'Perfil disponível somente para contas permanentes.'; END IF;
 IF p_role NOT IN ('sindico','zelador') THEN RAISE EXCEPTION 'Perfil inválido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid())
  THEN RAISE EXCEPTION 'Perfil já definido.'; END IF;
 INSERT INTO public.account_profiles(user_id,account_type) VALUES(auth.uid(),p_role);
 RETURN p_role;
END; $$;

CREATE TABLE IF NOT EXISTS public.hc_demo_spaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 100),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > created_at)
);
CREATE TABLE IF NOT EXISTS public.hc_demo_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 space_id uuid NOT NULL REFERENCES public.hc_demo_spaces(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 role text NOT NULL CHECK (role IN ('sindico','zelador')),
 max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 5),
 used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hc_demo_members (
 space_id uuid NOT NULL REFERENCES public.hc_demo_spaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('sindico','zelador')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(space_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.hc_demo_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 space_id uuid NOT NULL REFERENCES public.hc_demo_spaces(id) ON DELETE CASCADE,
 measured_on date NOT NULL,
 value_m3 numeric(12,3) NOT NULL CHECK (value_m3 >= 0),
 author text NOT NULL DEFAULT 'Demonstração',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(space_id,measured_on)
);
CREATE TABLE IF NOT EXISTS public.hc_demo_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 space_id uuid NOT NULL REFERENCES public.hc_demo_spaces(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 entries jsonb NOT NULL CHECK(jsonb_typeof(entries)='array' AND jsonb_array_length(entries) BETWEEN 1 AND 30),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS hc_demo_members_user_idx ON public.hc_demo_members(user_id);
CREATE INDEX IF NOT EXISTS hc_demo_readings_idx ON public.hc_demo_readings(space_id,measured_on DESC);
CREATE INDEX IF NOT EXISTS hc_demo_submissions_idx ON public.hc_demo_submissions(space_id,status);

-- Separate demo tables are never accessed directly from the browser.
ALTER TABLE public.hc_demo_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hc_demo_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hc_demo_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hc_demo_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hc_demo_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hc_demo_spaces,public.hc_demo_invites,public.hc_demo_members,
 public.hc_demo_readings,public.hc_demo_submissions FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.hc_demo_authorized(p_space uuid,p_required_role text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão de demonstração ausente.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hc_demo_spaces WHERE id=p_space
              AND revoked_at IS NULL AND expires_at>now())
  THEN RAISE EXCEPTION 'A demonstração terminou ou foi revogada.'; END IF;
 SELECT role INTO v_role FROM public.hc_demo_members WHERE space_id=p_space AND user_id=auth.uid();
 IF v_role IS NULL THEN RAISE EXCEPTION 'Você não possui acesso a esta demonstração.'; END IF;
 IF p_required_role IS NOT NULL AND v_role<>p_required_role
  THEN RAISE EXCEPTION 'Seu convite não permite esta operação.'; END IF;
 RETURN v_role;
END; $$;

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
 INSERT INTO public.hc_demo_invites(space_id,token_hash,role,max_uses,expires_at)
 VALUES(v_space,md5(v_manager),'sindico',p_max_uses,v_until),
       (v_space,md5(v_worker),'zelador',p_max_uses,v_until);
 -- 12 weeks of explicitly fictional figures, for immediate charts and summaries.
 INSERT INTO public.hc_demo_readings(space_id,measured_on,value_m3,author)
 SELECT v_space,current_date-(13-n)*7,
        (3800+(n-1)*75+((n-1)%4)*4)::numeric(12,3),'Dados fictícios'
 FROM generate_series(1,12) AS n;
 RETURN jsonb_build_object('id',v_space,'name',trim(p_name),'expires_at',v_until,
   'manager_token',v_manager,'worker_token',v_worker,'max_uses',p_max_uses);
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_list()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true'
 OR NOT EXISTS(SELECT 1 FROM public.account_profiles WHERE user_id=auth.uid()
               AND account_type='suporte' AND can_create_condominiums=true)
 THEN RAISE EXCEPTION 'Acesso restrito ao suporte autorizado.'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'created_at',created_at,
  'expires_at',expires_at,'revoked',revoked_at IS NOT NULL) ORDER BY created_at DESC),'[]'::jsonb)
 INTO v_result FROM public.hc_demo_spaces WHERE created_by=auth.uid();
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_revoke(p_space uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.hc_demo_spaces
    WHERE id=p_space AND created_by=auth.uid())
 THEN RAISE EXCEPTION 'Somente quem criou pode encerrar esta demonstração.'; END IF;
 UPDATE public.hc_demo_spaces SET revoked_at=now() WHERE id=p_space AND revoked_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_redeem(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.hc_demo_invites%ROWTYPE; v_role text; v_name text; v_expires timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Inicie a demonstração primeiro.'; END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Link inválido.'; END IF;
 SELECT * INTO v_inv FROM public.hc_demo_invites WHERE token_hash=md5(p_token) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Convite não encontrado.'; END IF;
 SELECT name,expires_at INTO v_name,v_expires FROM public.hc_demo_spaces
 WHERE id=v_inv.space_id AND revoked_at IS NULL AND expires_at>now();
 IF v_name IS NULL OR v_inv.expires_at<=now() THEN RAISE EXCEPTION 'Convite vencido ou demonstração encerrada.'; END IF;
 SELECT role INTO v_role FROM public.hc_demo_members
 WHERE space_id=v_inv.space_id AND user_id=auth.uid();
 IF v_role IS NULL THEN
   IF v_inv.used_count>=v_inv.max_uses THEN RAISE EXCEPTION 'Este convite já atingiu o limite de acessos.'; END IF;
   INSERT INTO public.hc_demo_members(space_id,user_id,role) VALUES(v_inv.space_id,auth.uid(),v_inv.role);
   UPDATE public.hc_demo_invites SET used_count=used_count+1 WHERE id=v_inv.id;
 ELSIF v_role<>v_inv.role THEN
   RAISE EXCEPTION 'Você já participa desta demonstração com outro perfil. Use outro navegador ou aba anônima.';
 END IF;
 RETURN jsonb_build_object('space_id',v_inv.space_id,'name',v_name,'role',v_inv.role,'expires_at',v_expires);
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_snapshot(p_space uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_readings jsonb; v_requests jsonb; v_name text; v_until timestamptz;
BEGIN
 v_role:=public.hc_demo_authorized(p_space);
 SELECT name,expires_at INTO v_name,v_until FROM public.hc_demo_spaces WHERE id=p_space;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'measured_on',measured_on,
 'value_m3',value_m3,'author',author) ORDER BY measured_on),'[]'::jsonb)
 INTO v_readings FROM public.hc_demo_readings WHERE space_id=p_space;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'entries',entries,'status',status,
   'review_note',review_note,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb)
 INTO v_requests FROM public.hc_demo_submissions
 WHERE space_id=p_space AND (v_role='sindico' OR user_id=auth.uid());
 RETURN jsonb_build_object('name',v_name,'role',v_role,'expires_at',v_until,
 'readings',v_readings,'requests',v_requests);
END; $$;

-- Validate chronology even when someone bypasses the frontend.
CREATE OR REPLACE FUNCTION public.hc_demo_insert_safe(p_space uuid,p_date date,p_value numeric,p_author text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_prev numeric; v_next numeric; v_id uuid;
BEGIN
 PERFORM public.hc_demo_authorized(p_space);
 IF p_date IS NULL OR p_date>current_date OR p_date<current_date-interval '10 years'
 THEN RAISE EXCEPTION 'Data fora do período permitido.'; END IF;
 IF p_value IS NULL OR p_value<0 OR p_value>=1000000000 OR scale(p_value)>3
 THEN RAISE EXCEPTION 'Leitura inválida (máximo 3 decimais).'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_space::text)::bigint);
 IF (SELECT count(*) FROM public.hc_demo_readings WHERE space_id=p_space)>=350
 THEN RAISE EXCEPTION 'Limite de medições da demonstração atingido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.hc_demo_readings WHERE space_id=p_space AND measured_on=p_date)
 THEN RAISE EXCEPTION 'Já existe uma leitura nesta data.'; END IF;
 SELECT value_m3 INTO v_prev FROM public.hc_demo_readings WHERE space_id=p_space AND measured_on<p_date
 ORDER BY measured_on DESC LIMIT 1;
 SELECT value_m3 INTO v_next FROM public.hc_demo_readings WHERE space_id=p_space AND measured_on>p_date
 ORDER BY measured_on ASC LIMIT 1;
 IF (v_prev IS NOT NULL AND p_value<v_prev) OR (v_next IS NOT NULL AND p_value>v_next)
 THEN RAISE EXCEPTION 'A leitura não respeita a sequência acumulada do hidrômetro.'; END IF;
 INSERT INTO public.hc_demo_readings(space_id,measured_on,value_m3,author)
 VALUES(p_space,p_date,p_value,left(coalesce(nullif(trim(p_author),''),'Visitante de teste'),80))
 RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_add_reading(p_space uuid,p_date date,p_value numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM public.hc_demo_authorized(p_space);
 RETURN public.hc_demo_insert_safe(p_space,p_date,p_value,'Leitura de demonstração');
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_submit_history(p_space uuid,p_entries jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_item jsonb; v_date date; v_val numeric; v_last date; v_last_val numeric; v_id uuid; v_sorted jsonb:='[]'::jsonb;
BEGIN
 PERFORM public.hc_demo_authorized(p_space,'zelador');
 IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 30
 THEN RAISE EXCEPTION 'Envie de 1 a 30 medições por pedido.'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_entries) ORDER BY value->>'measured_on' LOOP
  IF (v_item->>'measured_on') IS NULL OR (v_item->>'measured_on') !~ '^\d{4}-\d{2}-\d{2}$'
  THEN RAISE EXCEPTION 'Data inválida no histórico.'; END IF;
  v_date:=(v_item->>'measured_on')::date;
  IF v_date>=current_date OR v_date<current_date-interval '10 years'
  THEN RAISE EXCEPTION 'Use datas anteriores a hoje.'; END IF;
  IF (v_item->>'value_m3') IS NULL OR (v_item->>'value_m3') !~ '^\d{1,9}(\.\d{1,3})?$'
  THEN RAISE EXCEPTION 'Valor inválido no histórico.'; END IF;
  v_val:=(v_item->>'value_m3')::numeric;
  IF (v_last IS NOT NULL AND v_date=v_last) OR (v_last_val IS NOT NULL AND v_val<v_last_val)
  THEN RAISE EXCEPTION 'Datas repetidas ou leituras decrescentes.'; END IF;
  v_last:=v_date;v_last_val:=v_val;
  v_sorted:=v_sorted||jsonb_build_array(jsonb_build_object('measured_on',v_date,'value_m3',v_val));
 END LOOP;
 IF (SELECT count(*) FROM public.hc_demo_submissions WHERE space_id=p_space)>=60
 THEN RAISE EXCEPTION 'Limite de solicitações de histórico da demonstração atingido.'; END IF;
 INSERT INTO public.hc_demo_submissions(space_id,user_id,entries)
 VALUES(p_space,auth.uid(),v_sorted) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.hc_demo_review_history(p_space uuid,p_request uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rec public.hc_demo_submissions%ROWTYPE; v_item jsonb;
BEGIN
 PERFORM public.hc_demo_authorized(p_space,'sindico');
 SELECT * INTO v_rec FROM public.hc_demo_submissions
 WHERE space_id=p_space AND id=p_request FOR UPDATE;
 IF NOT FOUND OR v_rec.status<>'pending' THEN RAISE EXCEPTION 'Pedido não encontrado ou já analisado.'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Informe a decisão.'; END IF;
 IF p_approve THEN
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_rec.entries) ORDER BY value->>'measured_on' LOOP
   PERFORM public.hc_demo_insert_safe(p_space,(v_item->>'measured_on')::date,
     (v_item->>'value_m3')::numeric,'Histórico fictício aprovado');
  END LOOP;
 END IF;
 UPDATE public.hc_demo_submissions SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
   review_note=left(coalesce(p_reason,''),250),reviewed_at=now() WHERE id=p_request;
END; $$;


-- Manager bulk import is atomic: any inconsistent entry rolls back all rows.
CREATE OR REPLACE FUNCTION public.hc_demo_manager_history(p_space uuid,p_entries jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_item jsonb; v_date date; v_value numeric; v_count integer:=0;
BEGIN
 PERFORM public.hc_demo_authorized(p_space,'sindico');
 IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 30
 THEN RAISE EXCEPTION 'Informe de 1 a 30 medições históricas.'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_entries) ORDER BY value->>'measured_on' LOOP
  IF (v_item->>'measured_on') IS NULL OR (v_item->>'measured_on') !~ '^\d{4}-\d{2}-\d{2}$'
    OR (v_item->>'value_m3') IS NULL OR (v_item->>'value_m3') !~ '^\d{1,9}(\.\d{1,3})?$'
   THEN RAISE EXCEPTION 'Data ou valor histórico inválido.'; END IF;
  v_date:=(v_item->>'measured_on')::date;
  v_value:=(v_item->>'value_m3')::numeric;
  IF v_date >= current_date THEN RAISE EXCEPTION 'Use datas anteriores a hoje.'; END IF;
  PERFORM public.hc_demo_insert_safe(p_space,v_date,v_value,'Histórico fictício');
  v_count:=v_count+1;
 END LOOP;
 RETURN v_count;
END; $$;

-- Avoid exposing internal SECURITY DEFINER helpers as callable browser RPCs.
REVOKE ALL ON FUNCTION public.hc_demo_authorized(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hc_demo_insert_safe(uuid,date,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.hc_demo_create(text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_list() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_revoke(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_redeem(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_snapshot(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_add_reading(uuid,date,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_submit_history(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_review_history(uuid,uuid,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hc_demo_manager_history(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hc_demo_create(text,integer,integer),public.hc_demo_list(),
 public.hc_demo_revoke(uuid),public.hc_demo_redeem(text),public.hc_demo_snapshot(uuid),
 public.hc_demo_add_reading(uuid,date,numeric),public.hc_demo_submit_history(uuid,jsonb),
 public.hc_demo_review_history(uuid,uuid,boolean,text),
 public.hc_demo_manager_history(uuid,jsonb) TO authenticated;
COMMIT;
