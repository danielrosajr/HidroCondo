-- HidroCondo v0.4.0-beta. Apply ONCE after 0.2.0 and 0.3.0 migrations.
-- Keeps all existing condominiums, readings, memberships and photos.
-- Execute in Supabase SQL Editor, after taking a backup.
BEGIN;

-- An explicitly authorized platform support account may bootstrap NEW condos.
-- Support accounts are NOT platform admins by default. The SQL Editor operator
-- must explicitly allow a known support user using the separate command in README.
ALTER TABLE public.account_profiles
  ADD COLUMN IF NOT EXISTS can_create_condominiums boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS condo_create ON public.condominiums;
CREATE POLICY condo_create ON public.condominiums FOR INSERT TO authenticated
WITH CHECK (
 owner_id = (SELECT auth.uid())
 AND EXISTS (
   SELECT 1 FROM public.account_profiles p
   WHERE p.user_id = (SELECT auth.uid())
     AND (p.account_type = 'sindico'
       OR (p.account_type = 'suporte' AND p.can_create_condominiums = true))
 )
);
-- account_profiles remains SELECT-only for authenticated users: browser clients
-- cannot set can_create_condominiums themselves.

-- Pending submissions are stored SEPARATELY from official readings. Nothing
-- pending/rejected can affect official graphs, exports or consumption math.
CREATE TABLE IF NOT EXISTS public.historical_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 condominium_id uuid NOT NULL REFERENCES public.condominiums(id) ON DELETE CASCADE,
 meter_id uuid NOT NULL,
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 submitted_by_name text NOT NULL CHECK (char_length(trim(submitted_by_name)) BETWEEN 2 AND 120),
 entries jsonb NOT NULL CHECK (jsonb_typeof(entries) = 'array' AND jsonb_array_length(entries) BETWEEN 1 AND 250),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (meter_id, condominium_id) REFERENCES public.meters(id, condominium_id)
);
CREATE INDEX IF NOT EXISTS hc_hist_submissions_queue_idx
 ON public.historical_submissions(condominium_id, status, created_at DESC);
ALTER TABLE public.historical_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS historical_submissions_view ON public.historical_submissions;
CREATE POLICY historical_submissions_view ON public.historical_submissions
FOR SELECT TO authenticated
USING (public.is_condo_admin(condominium_id)
       OR (submitted_by = (SELECT auth.uid()) AND public.is_condo_member(condominium_id)));
GRANT SELECT ON public.historical_submissions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.historical_submissions FROM authenticated, anon;

-- A worker can create REGULAR readings with a photo, but cannot circumvent
-- approval by sending "entry_kind=historical" directly to the readings API.
DROP POLICY IF EXISTS reading_create ON public.readings;
CREATE POLICY reading_create ON public.readings FOR INSERT TO authenticated
WITH CHECK (
 public.is_condo_member(condominium_id)
 AND created_by = (SELECT auth.uid())
 AND (
   (entry_kind = 'regular' AND (photo_path IS NOT NULL OR public.is_condo_admin(condominium_id)))
   OR (entry_kind = 'historical' AND public.is_condo_admin(condominium_id)
       AND photo_path IS NULL AND measured_on < CURRENT_DATE)
 )
);

-- Submit an immutable batch for review. SECURITY DEFINER is necessary so
-- workers cannot insert/update the protected submissions table on their own.
CREATE OR REPLACE FUNCTION public.hc_submit_historical(
 p_condo uuid, p_meter uuid, p_entries jsonb, p_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_id uuid;
 v_item jsonb;
 v_day date;
 v_day_text text;
 v_value numeric(12,3);
 v_previous numeric(12,3);
 v_last_date date;
 v_seen date[] := ARRAY[]::date[];
 v_normalized jsonb := '[]'::jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login primeiro.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.memberships
                WHERE condominium_id = p_condo AND user_id = auth.uid() AND role = 'zelador')
 THEN RAISE EXCEPTION 'Somente zeladores vinculados podem enviar histórico para aprovação.'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.meters
                WHERE id = p_meter AND condominium_id = p_condo)
 THEN RAISE EXCEPTION 'Hidrômetro não pertence a este condomínio.'; END IF;
 IF char_length(trim(coalesce(p_name,''))) NOT BETWEEN 2 AND 120
 THEN RAISE EXCEPTION 'Informe o nome de quem enviou o histórico.'; END IF;
 IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array'
    OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 250
 THEN RAISE EXCEPTION 'Envie de 1 a 250 leituras por pedido.'; END IF;

 -- Validate each entry, including monotonic ordering and existing neighbors.
 -- The same validation runs AGAIN when the manager approves.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_entries) ORDER BY value->>'measured_on' LOOP
   IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'Formato de histórico inválido.'; END IF;
   v_day_text := v_item->>'measured_on';
   IF v_day_text IS NULL OR v_day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     THEN RAISE EXCEPTION 'Data deve usar AAAA-MM-DD.'; END IF;
   v_day := v_day_text::date;
   IF to_char(v_day, 'YYYY-MM-DD') <> v_day_text OR v_day >= current_date
     THEN RAISE EXCEPTION 'Data histórica inválida ou não anterior a hoje.'; END IF;
   IF v_day = ANY(v_seen) THEN RAISE EXCEPTION 'Data duplicada no histórico: %',v_day; END IF;
   v_seen := array_append(v_seen,v_day);
   IF (v_item->>'value_m3') IS NULL OR (v_item->>'value_m3') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
     THEN RAISE EXCEPTION 'Valor da leitura inválido para %.',v_day; END IF;
   v_value := (v_item->>'value_m3')::numeric(12,3);
   IF v_last_date IS NOT NULL AND v_value < v_previous
     THEN RAISE EXCEPTION 'Leituras históricas decrescentes entre % e %.',v_last_date,v_day; END IF;
   v_previous := v_value; v_last_date := v_day;
   v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('measured_on',v_day,'value_m3',v_value));
 END LOOP;

 INSERT INTO public.historical_submissions(condominium_id,meter_id,submitted_by,submitted_by_name,entries)
 VALUES(p_condo,p_meter,auth.uid(),trim(p_name),v_normalized)
 RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

-- Approval/rejection is atomic. Any conflict, backwards reading or duplicate
-- rolls back the entire approval; the batch remains pending for review.
CREATE OR REPLACE FUNCTION public.hc_review_historical(
 p_submission uuid, p_approve boolean, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_batch public.historical_submissions%ROWTYPE;
 v_item jsonb;
 v_day date;
 v_value numeric(12,3);
BEGIN
 SELECT * INTO v_batch FROM public.historical_submissions WHERE id = p_submission FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF NOT public.is_condo_admin(v_batch.condominium_id)
   THEN RAISE EXCEPTION 'Somente síndico(a) pode aprovar ou rejeitar históricos.'; END IF;
 IF v_batch.status <> 'pending' THEN RAISE EXCEPTION 'Este pedido já foi analisado.'; END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Informe a decisão.'; END IF;
 IF NOT p_approve AND char_length(trim(coalesce(p_reason,''))) < 5
   THEN RAISE EXCEPTION 'Para rejeitar, informe o motivo (mínimo 5 caracteres).'; END IF;

 IF p_approve THEN
  -- Lock the meter by key to prevent concurrent approvals from interleaving.
  PERFORM pg_advisory_xact_lock(hashtext(v_batch.meter_id::text)::bigint);
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_batch.entries) ORDER BY value->>'measured_on' LOOP
    v_day := (v_item->>'measured_on')::date;
    v_value := (v_item->>'value_m3')::numeric(12,3);
    IF v_day >= current_date THEN RAISE EXCEPTION 'Data histórica precisa ser anterior a hoje.'; END IF;
    INSERT INTO public.readings (condominium_id,meter_id,measured_on,value_m3,photo_path,entry_kind,created_by,registered_by_name)
    VALUES (v_batch.condominium_id,v_batch.meter_id,v_day,v_value,NULL,'historical',v_batch.submitted_by,v_batch.submitted_by_name);
    -- Database triggers validate the sequence against all current readings.
  END LOOP;
 END IF;

 UPDATE public.historical_submissions
 SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
     reviewed_by = auth.uid(), reviewed_at = now(),
     review_note = nullif(trim(coalesce(p_reason,'')),'')
 WHERE id = p_submission;
END; $$;

REVOKE ALL ON FUNCTION public.hc_submit_historical(uuid,uuid,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hc_review_historical(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hc_submit_historical(uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hc_review_historical(uuid,boolean,text) TO authenticated;

COMMIT;
