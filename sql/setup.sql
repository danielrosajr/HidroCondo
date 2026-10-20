-- HidroCondo MVP: execute UMA VEZ no SQL Editor de um projeto Supabase novo.
-- Acesso protegido por RLS; NUNCA coloque uma service_role key no site público.
create extension if not exists pgcrypto;

create table public.condominiums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 120),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('sindica','zelador')),
  created_at timestamptz not null default now(),
  primary key (condominium_id, user_id),
  unique (user_id)
);

create table public.condominium_invites (
  condominium_id uuid primary key references public.condominiums(id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(12), 'hex')
);

create table public.meters (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_at timestamptz not null default now(),
  unique (id, condominium_id)
);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  meter_id uuid not null,
  measured_on date not null,
  value_m3 numeric(12,3) not null check (value_m3 >= 0),
  photo_path text,
  created_by uuid not null references auth.users(id),
  registered_by_name text not null check (char_length(trim(registered_by_name)) between 2 and 120),
  correction_note text,
  created_at timestamptz not null default now(),
  foreign key (meter_id, condominium_id) references public.meters(id, condominium_id),
  unique (meter_id, measured_on),
  constraint valid_photo_prefix check (photo_path is null or photo_path like condominium_id::text || '/%')
);
create index readings_meter_date_idx on public.readings(meter_id, measured_on desc);

create table public.readings_audit (
  id bigint generated always as identity primary key,
  reading_id uuid not null references public.readings(id) on delete cascade,
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  old_value_m3 numeric(12,3) not null,
  new_value_m3 numeric(12,3) not null,
  old_measured_on date not null,
  new_measured_on date not null,
  correction_note text not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- Funções internas de permissão. security definer evita recursão nas policies.
create function public.is_condo_member(p_condo uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where condominium_id = p_condo and user_id = (select auth.uid())
  );
$$;

create function public.is_condo_admin(p_condo uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where condominium_id = p_condo and user_id = (select auth.uid()) and role = 'sindica'
  );
$$;

create function public.after_condo_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.memberships (condominium_id, user_id, role)
  values (new.id, new.owner_id, 'sindica');
  insert into public.condominium_invites (condominium_id) values (new.id);
  insert into public.meters (condominium_id, name) values (new.id, 'Hidrômetro principal');
  return new;
end;
$$;
create trigger on_condo_created after insert on public.condominiums
for each row execute function public.after_condo_created();

-- Entrar como zelador usando código longo e aleatório recebido da síndica.
create function public.join_condominium(p_code text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_condo uuid;
begin
  if auth.uid() is null then raise exception 'Faça login antes.'; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'Esta conta já está vinculada a um condomínio.';
  end if;
  select condominium_id into v_condo
    from public.condominium_invites
    where invite_code = lower(trim(p_code));
  if v_condo is null then raise exception 'Código de convite inválido.'; end if;
  insert into public.memberships(condominium_id, user_id, role)
  values (v_condo, auth.uid(), 'zelador');
  return v_condo;
end;
$$;

-- Só permite alteração da leitura/data/notas; não troca autoria, foto ou condomínio.
create function public.guard_reading_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.id, new.condominium_id, new.meter_id, new.photo_path, new.created_by,
      new.registered_by_name, new.created_at)
     is distinct from
     (old.id, old.condominium_id, old.meter_id, old.photo_path, old.created_by,
      old.registered_by_name, old.created_at) then
    raise exception 'Não é permitido alterar origem, autoria ou foto da medição.';
  end if;
  if (new.measured_on, new.value_m3) is distinct from (old.measured_on, old.value_m3) then
    if char_length(trim(coalesce(new.correction_note, ''))) < 5 then
      raise exception 'Informe o motivo da correção (mínimo 5 caracteres).';
    end if;
  end if;
  return new;
end;
$$;
create trigger before_reading_update before update on public.readings
for each row execute function public.guard_reading_update();

create function public.record_reading_correction()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.measured_on, new.value_m3) is distinct from (old.measured_on, old.value_m3) then
    insert into public.readings_audit
      (reading_id, condominium_id, old_value_m3, new_value_m3,
       old_measured_on, new_measured_on, correction_note, changed_by)
    values (old.id, old.condominium_id, old.value_m3, new.value_m3,
            old.measured_on, new.measured_on, new.correction_note, auth.uid());
  end if;
  return new;
end;
$$;
create trigger after_reading_update after update on public.readings
for each row execute function public.record_reading_correction();

alter table public.condominiums enable row level security;
alter table public.memberships enable row level security;
alter table public.condominium_invites enable row level security;
alter table public.meters enable row level security;
alter table public.readings enable row level security;
alter table public.readings_audit enable row level security;

create policy condo_read on public.condominiums for select to authenticated
  using (public.is_condo_member(id));
create policy condo_create on public.condominiums for insert to authenticated
  with check (owner_id = (select auth.uid()) and not exists
    (select 1 from public.memberships where user_id = (select auth.uid())));
create policy membership_read on public.memberships for select to authenticated
  using (public.is_condo_member(condominium_id));
create policy invite_admin_read on public.condominium_invites for select to authenticated
  using (public.is_condo_admin(condominium_id));
create policy meter_read on public.meters for select to authenticated
  using (public.is_condo_member(condominium_id));
create policy meter_create on public.meters for insert to authenticated
  with check (public.is_condo_admin(condominium_id));
create policy reading_read on public.readings for select to authenticated
  using (public.is_condo_member(condominium_id));
create policy reading_create on public.readings for insert to authenticated
  with check (public.is_condo_member(condominium_id)
    and created_by = (select auth.uid())
    and (photo_path is not null or public.is_condo_admin(condominium_id)));
create policy reading_admin_update on public.readings for update to authenticated
  using (public.is_condo_admin(condominium_id))
  with check (public.is_condo_admin(condominium_id));
create policy reading_audit_read on public.readings_audit for select to authenticated
  using (public.is_condo_member(condominium_id));

-- Foto privada (WebP até 5 MB), organizada por condomínio/usuário/arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hidrocondo-fotos', 'hidrocondo-fotos', false, 5242880, array['image/webp'])
on conflict (id) do nothing;

create policy hidro_fotos_read on storage.objects for select to authenticated
using (bucket_id = 'hidrocondo-fotos' and
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then public.is_condo_member(((storage.foldername(name))[1])::uuid)
       else false end);
create policy hidro_fotos_upload on storage.objects for insert to authenticated
with check (bucket_id = 'hidrocondo-fotos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then public.is_condo_member(((storage.foldername(name))[1])::uuid)
       else false end);
create policy hidro_fotos_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'hidrocondo-fotos'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       then public.is_condo_member(((storage.foldername(name))[1])::uuid)
       else false end);

-- Não expor funções internas auxiliares publicamente (Postgres concede execute a PUBLIC por padrão).
revoke all on function public.is_condo_member(uuid) from public, anon;
revoke all on function public.is_condo_admin(uuid) from public, anon;
revoke all on function public.join_condominium(text) from public, anon;
grant execute on function public.is_condo_member(uuid) to authenticated;
grant execute on function public.is_condo_admin(uuid) to authenticated;
grant execute on function public.join_condominium(text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert on public.condominiums to authenticated;
grant select on public.memberships, public.condominium_invites, public.readings_audit to authenticated;
grant select, insert on public.meters to authenticated;
grant select, insert, update on public.readings to authenticated;
