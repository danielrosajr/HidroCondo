-- HidroCondo 0.2.0: MIGRAÇÃO para projeto que já executou sql/setup.sql.
-- Execute uma vez no SQL Editor Supabase; não reexecute setup.sql.
-- Revisar numa base de testes antes de executar em produção.
begin;

create table if not exists public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 account_type text not null check (account_type in ('sindico','zelador','suporte')),
 created_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
drop policy if exists profile_self_read on public.account_profiles;
create policy profile_self_read on public.account_profiles for select to authenticated
 using (user_id = (select auth.uid()));
-- Preserve os perfis de quem já está vinculado ao condomínio.
insert into public.account_profiles(user_id,account_type)
 select user_id, case when role = 'sindica' then 'sindico' else 'zelador' end
 from public.memberships on conflict (user_id) do nothing;

create or replace function public.hc_signup_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.account_profiles(user_id,account_type)
 values(new.id,
   case when new.raw_user_meta_data->>'hc_role'='sindico' then 'sindico'
        else 'zelador' end)
 on conflict (user_id) do nothing;
 return new;
end;$$;
drop trigger if exists hc_on_auth_signup on auth.users;
create trigger hc_on_auth_signup after insert on auth.users
for each row execute function public.hc_signup_profile();

-- Contas antigas SEM condomínio podem escolher seu perfil apenas UMA vez.
create or replace function public.hc_choose_profile(p_role text)
returns text language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Faça login primeiro.'; end if;
 if p_role not in ('sindico','zelador') then raise exception 'Perfil inválido.'; end if;
 if exists(select 1 from public.account_profiles where user_id=auth.uid()) then
   raise exception 'Perfil já definido. Contate o suporte para ajustes.';
 end if;
 insert into public.account_profiles(user_id,account_type) values(auth.uid(),p_role);
 return p_role;
end;$$;

-- Só uma conta do tipo síndico(a) pode criar um condomínio.
drop policy if exists condo_create on public.condominiums;
create policy condo_create on public.condominiums for insert to authenticated
with check(owner_id=(select auth.uid())
 and exists (select 1 from public.account_profiles ap where ap.user_id=(select auth.uid()) and ap.account_type='sindico')
 and not exists(select 1 from public.memberships m where m.user_id=(select auth.uid())));

-- Convites para zeladores: 1 uso, prazo máximo de 7 dias.
create table if not exists public.worker_invites(
 id uuid primary key default gen_random_uuid(),
 condominium_id uuid not null references public.condominiums(id) on delete cascade,
 token_hash text not null unique,
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 used_at timestamptz,
 used_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.worker_invites enable row level security;
-- Não há policies para acesso direto: apenas RPC security definer.
create or replace function public.hc_create_worker_invite(p_condo uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
 if not public.is_condo_admin(p_condo) then raise exception 'Somente síndico(a) pode convidar zeladores.'; end if;
 v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into public.worker_invites(condominium_id,token_hash,created_by,expires_at)
 values(p_condo,md5(v_token),auth.uid(),now()+interval '7 days');
 return v_token;
end;$$;
create or replace function public.hc_redeem_worker_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_condo uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
 if not exists (select 1 from public.account_profiles where user_id=auth.uid() and account_type='zelador') then
   raise exception 'Este convite é exclusivo de contas zelador(a).';
 end if;
 if exists (select 1 from public.memberships where user_id=auth.uid()) then
   raise exception 'Sua conta já está vinculada a um condomínio.';
 end if;
 select id, condominium_id into v_id,v_condo from public.worker_invites
 where token_hash=md5(trim(p_token)) and used_at is null and expires_at>now()
 for update;
 if v_id is null then raise exception 'Link inválido, vencido ou já utilizado. Peça um novo.'; end if;
 insert into public.memberships(condominium_id,user_id,role) values(v_condo,auth.uid(),'zelador');
 update public.worker_invites set used_at=now(),used_by=auth.uid() where id=v_id;
 return v_condo;
end;$$;
-- Desativa o convite permanente da versão 0.1.0.
revoke all on function public.join_condominium(text) from authenticated;

-- Acesso temporário de suporte: somente contas marcadas manualmente como 'suporte'.
create table if not exists public.support_invites(
 id uuid primary key default gen_random_uuid(),
 condominium_id uuid not null references public.condominiums(id) on delete cascade,
 token_hash text not null unique,
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.support_invites enable row level security;
create table if not exists public.support_grants(
 id uuid primary key default gen_random_uuid(),
 condominium_id uuid not null references public.condominiums(id) on delete cascade,
 support_user_id uuid not null references auth.users(id),
 granted_by uuid not null references auth.users(id),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists support_grants_access_idx
 on public.support_grants(condominium_id,support_user_id,expires_at);
alter table public.support_grants enable row level security;

create or replace function public.hc_is_active_support(p_condo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.support_grants g
 join public.account_profiles p on p.user_id=g.support_user_id
 where g.condominium_id=p_condo and g.support_user_id=auth.uid()
   and p.account_type='suporte' and g.revoked_at is null and g.expires_at>now());
$$;
create or replace function public.hc_can_view_condo(p_condo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_condo_member(p_condo) or public.hc_is_active_support(p_condo);
$$;
create or replace function public.hc_can_edit_readings(p_condo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_condo_admin(p_condo) or public.hc_is_active_support(p_condo);
$$;
create or replace function public.hc_create_support_invite(p_condo uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
 if not public.is_condo_admin(p_condo) then raise exception 'Apenas síndico(a) pode autorizar suporte.'; end if;
 v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into public.support_invites(condominium_id,token_hash,created_by,expires_at)
 values(p_condo,md5(v_token),auth.uid(),now()+interval '15 minutes');
 return v_token;
end;$$;
create or replace function public.hc_redeem_support_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_condo uuid; v_owner uuid; v_grant uuid;
begin
 if not exists(select 1 from public.account_profiles where user_id=auth.uid() and account_type='suporte') then
    raise exception 'Somente uma conta de suporte autorizada pode utilizar este link.';
 end if;
 select id,condominium_id,created_by into v_id,v_condo,v_owner
 from public.support_invites where token_hash=md5(trim(p_token)) and used_at is null and expires_at>now()
 for update;
 if v_id is null then raise exception 'Link de suporte inválido, vencido ou utilizado.'; end if;
 insert into public.support_grants(condominium_id,support_user_id,granted_by,expires_at)
 values(v_condo,auth.uid(),v_owner,now()+interval '90 minutes') returning id into v_grant;
 update public.support_invites set used_at=now() where id=v_id;
 return v_grant;
end;$$;
create or replace function public.hc_revoke_support(p_grant uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_condo uuid;
begin
 select condominium_id into v_condo from public.support_grants where id=p_grant;
 if v_condo is null or not public.is_condo_admin(v_condo) then raise exception 'Permissão negada.'; end if;
 update public.support_grants set revoked_at=now() where id=p_grant;
end;$$;

drop policy if exists support_grants_admin_read on public.support_grants;
create policy support_grants_admin_read on public.support_grants for select to authenticated
 using(public.is_condo_admin(condominium_id) or support_user_id=(select auth.uid()));

-- Policies adicionais: suporte vê somente o condomínio autorizado, enquanto o prazo durar.
drop policy if exists support_condo_read on public.condominiums;
create policy support_condo_read on public.condominiums for select to authenticated
 using(public.hc_is_active_support(id));
drop policy if exists support_meters_read on public.meters;
create policy support_meters_read on public.meters for select to authenticated
 using(public.hc_is_active_support(condominium_id));
drop policy if exists support_meters_insert on public.meters;
create policy support_meters_insert on public.meters for insert to authenticated
 with check(public.hc_is_active_support(condominium_id));
drop policy if exists support_readings_read on public.readings;
create policy support_readings_read on public.readings for select to authenticated
 using(public.hc_is_active_support(condominium_id));
drop policy if exists support_readings_update on public.readings;
create policy support_readings_update on public.readings for update to authenticated
 using(public.hc_is_active_support(condominium_id))
 with check(public.hc_is_active_support(condominium_id));
drop policy if exists support_audit_read on public.readings_audit;
create policy support_audit_read on public.readings_audit for select to authenticated
 using(public.hc_is_active_support(condominium_id));
drop policy if exists support_fotos_read on storage.objects;
create policy support_fotos_read on storage.objects for select to authenticated
using(bucket_id='hidrocondo-fotos'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then public.hc_is_active_support(((storage.foldername(name))[1])::uuid)
  else false end);

-- Public não pode executar RPCs sem login.
revoke all on function public.hc_choose_profile(text) from public, anon;
revoke all on function public.hc_create_worker_invite(uuid) from public, anon;
revoke all on function public.hc_redeem_worker_invite(text) from public, anon;
revoke all on function public.hc_is_active_support(uuid) from public, anon;
revoke all on function public.hc_can_view_condo(uuid) from public, anon;
revoke all on function public.hc_can_edit_readings(uuid) from public, anon;
revoke all on function public.hc_create_support_invite(uuid) from public, anon;
revoke all on function public.hc_redeem_support_invite(text) from public, anon;
revoke all on function public.hc_revoke_support(uuid) from public, anon;
grant execute on function public.hc_choose_profile(text) to authenticated;
grant execute on function public.hc_create_worker_invite(uuid) to authenticated;
grant execute on function public.hc_redeem_worker_invite(text) to authenticated;
grant execute on function public.hc_is_active_support(uuid) to authenticated;
grant execute on function public.hc_can_view_condo(uuid) to authenticated;
grant execute on function public.hc_can_edit_readings(uuid) to authenticated;
grant execute on function public.hc_create_support_invite(uuid) to authenticated;
grant execute on function public.hc_redeem_support_invite(text) to authenticated;
grant execute on function public.hc_revoke_support(uuid) to authenticated;
grant select on public.account_profiles,public.support_grants to authenticated;
commit;
