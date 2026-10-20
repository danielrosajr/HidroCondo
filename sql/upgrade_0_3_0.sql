-- HidroCondo v0.3.0-beta — run AFTER upgrade_0_2_0.sql; backup first.
-- No data is dropped; each user can hold multiple condominium memberships.
begin;

alter table public.memberships drop constraint if exists memberships_user_id_key;

-- Allow a manager to create more than one condominium (the owner trigger still creates membership).
drop policy if exists condo_create on public.condominiums;
create policy condo_create on public.condominiums for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists(select 1 from public.account_profiles ap
    where ap.user_id=(select auth.uid()) and ap.account_type='sindico')
);

-- Worker can redeem invitations to other condominiums without losing current memberships.
create or replace function public.hc_redeem_worker_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_condo uuid;
begin
 if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
 if not exists (select 1 from public.account_profiles where user_id=auth.uid() and account_type='zelador') then
   raise exception 'Este convite é exclusivo de contas zelador(a).';
 end if;
 select id, condominium_id into v_id,v_condo from public.worker_invites
 where token_hash=md5(trim(p_token)) and used_at is null and expires_at>now()
 for update;
 if v_id is null then raise exception 'Link inválido, vencido ou já utilizado. Peça um novo.'; end if;
 if exists (select 1 from public.memberships
            where condominium_id=v_condo and user_id=auth.uid()) then
   raise exception 'Você já tem acesso a este condomínio.';
 end if;
 insert into public.memberships(condominium_id,user_id,role)
 values(v_condo,auth.uid(),'zelador');
 update public.worker_invites set used_at=now(),used_by=auth.uid() where id=v_id;
 return v_condo;
end;$$;

-- Historical readings can omit photos. This is explicitly labelled and never silently
-- treated as a camera reading. Keep the existing RLS for all other operations.
alter table public.readings add column if not exists entry_kind text not null default 'regular';
alter table public.readings drop constraint if exists readings_entry_kind_check;
alter table public.readings add constraint readings_entry_kind_check
  check (entry_kind in ('regular','historical'));

drop policy if exists reading_create on public.readings;
create policy reading_create on public.readings for insert to authenticated
with check (
 public.is_condo_member(condominium_id)
 and created_by=(select auth.uid())
 and (photo_path is not null or public.is_condo_admin(condominium_id)
      or (entry_kind='historical' and measured_on < current_date))
);

-- Protect chronological meter values at database level, including edits and direct API calls.
-- The advisory lock serializes modifications to one meter while finding neighbours.
create or replace function public.hc_validate_reading_sequence()
returns trigger language plpgsql set search_path = '' as $$
declare v_previous numeric(12,3); v_next numeric(12,3);
begin
 if new.measured_on > current_date then
   raise exception 'A data da leitura não pode ser futura.';
 end if;
 if new.entry_kind='historical' and new.measured_on>=current_date and new.photo_path is null then
   raise exception 'Leitura histórica sem foto precisa ser anterior a hoje.';
 end if;
 if tg_op='UPDATE' and new.entry_kind is distinct from old.entry_kind then
   raise exception 'A classificação histórica da leitura não pode ser alterada.';
 end if;
 perform pg_advisory_xact_lock(hashtext(new.meter_id::text)::bigint);
 select r.value_m3 into v_previous from public.readings r
 where r.meter_id=new.meter_id and r.measured_on<new.measured_on
   and (tg_op='INSERT' or r.id<>new.id)
 order by r.measured_on desc limit 1;
 select r.value_m3 into v_next from public.readings r
 where r.meter_id=new.meter_id and r.measured_on>new.measured_on
   and (tg_op='INSERT' or r.id<>new.id)
 order by r.measured_on asc limit 1;
 if v_previous is not null and new.value_m3<v_previous then
   raise exception 'Leitura menor que a anterior deste hidrômetro.';
 end if;
 if v_next is not null and new.value_m3>v_next then
   raise exception 'Leitura maior que a leitura posterior deste hidrômetro.';
 end if;
 return new;
end;$$;
drop trigger if exists hc_reading_sequence on public.readings;
create trigger hc_reading_sequence before insert or update of measured_on,value_m3,entry_kind
on public.readings for each row execute function public.hc_validate_reading_sequence();

-- Keep inherited readings immutable as far as source and classification are concerned.
create or replace function public.guard_reading_update()
returns trigger language plpgsql set search_path = '' as $$
begin
 if (new.id, new.condominium_id, new.meter_id, new.photo_path, new.created_by,
     new.registered_by_name, new.created_at, new.entry_kind)
    is distinct from
    (old.id, old.condominium_id, old.meter_id, old.photo_path, old.created_by,
     old.registered_by_name, old.created_at, old.entry_kind) then
   raise exception 'Não é permitido alterar origem, autoria, tipo ou foto da medição.';
 end if;
 if (new.measured_on, new.value_m3) is distinct from (old.measured_on, old.value_m3) then
   if char_length(trim(coalesce(new.correction_note,'')))<5 then
     raise exception 'Informe o motivo da correção (mínimo 5 caracteres).';
   end if;
 end if;
 return new;
end;$$;

-- These helper functions are used by security triggers only.
revoke all on function public.hc_validate_reading_sequence() from public,anon;
commit;
