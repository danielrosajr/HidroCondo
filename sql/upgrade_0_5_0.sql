-- HidroCondo v0.5.0-beta: optional photos for historical entries.
-- Prerequisites: upgrade_0_2_0.sql, upgrade_0_3_0.sql, upgrade_0_4_0.sql.
-- BACK UP database + Storage before running. Run once using Supabase SQL Editor.
-- The change keeps all existing photos, condominiums, members and readings.
BEGIN;

-- Historical entries may have a WebP photograph, but only a condominium
-- manager may write them into the official readings table. A manager may
-- upload from their own authenticated account; no photos are mandatory.
DROP POLICY IF EXISTS reading_create ON public.readings;
CREATE POLICY reading_create ON public.readings FOR INSERT TO authenticated
WITH CHECK (
 public.is_condo_member(condominium_id)
 AND created_by = (SELECT auth.uid())
 AND (
   (entry_kind = 'regular' AND
     (photo_path IS NOT NULL OR public.is_condo_admin(condominium_id)))
   OR (entry_kind = 'historical' AND public.is_condo_admin(condominium_id)
       AND measured_on < CURRENT_DATE
       AND (photo_path IS NULL OR
            photo_path LIKE (condominium_id::text || '/' || (SELECT auth.uid())::text || '/%')))
 )
);

-- Replace both existing SECURITY DEFINER RPCs with strict ownership / object
-- validation. Pending batches stay outside official readings until approval.
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
 v_photo text;
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
   -- Each optional photo must belong to this logged-in worker and this
   -- condominium. Reject paths from other users or missing Storage objects.
   v_photo := nullif(trim(coalesce(v_item->>'photo_path','')), '');
   IF v_photo IS NOT NULL THEN
     IF v_photo !~ ('^' || p_condo::text || '/' || auth.uid()::text || '/[a-f0-9-]{36}[.]webp$')
        OR NOT EXISTS (
          SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = 'hidrocondo-fotos' AND o.name = v_photo
        )
     THEN RAISE EXCEPTION 'Foto histórica inválida ou não autorizada para %.',v_day; END IF;
   END IF;
   v_previous := v_value; v_last_date := v_day;
   v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('measured_on',v_day,'value_m3',v_value,'photo_path',v_photo));
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
 v_photo text;
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
    v_photo := nullif(trim(coalesce(v_item->>'photo_path','')), '');
    IF v_photo IS NOT NULL THEN
      IF v_photo !~ ('^' || v_batch.condominium_id::text || '/' || v_batch.submitted_by::text || '/[a-f0-9-]{36}[.]webp$')
         OR NOT EXISTS (
           SELECT 1 FROM storage.objects o
           WHERE o.bucket_id = 'hidrocondo-fotos' AND o.name = v_photo
         )
      THEN RAISE EXCEPTION 'Foto histórica inválida ou removida para %.', v_day; END IF;
    END IF;
    INSERT INTO public.readings (condominium_id,meter_id,measured_on,value_m3,photo_path,entry_kind,created_by,registered_by_name)
    VALUES (v_batch.condominium_id,v_batch.meter_id,v_day,v_value,v_photo,'historical',v_batch.submitted_by,v_batch.submitted_by_name);
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
