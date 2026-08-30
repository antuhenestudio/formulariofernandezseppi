-- ============================================================================
-- Neuquén Escucha — Esquema de base de datos para Supabase
-- ============================================================================
-- Cómo usar este archivo:
--   1. Entrá a https://app.supabase.com y creá un proyecto nuevo (gratis).
--   2. Andá a "SQL Editor" (menú izquierdo) > "New query".
--   3. Pegá TODO este archivo y apretá "Run".
--   4. Copiá tu Project URL y anon public key desde Settings > API, y pegalas
--      en assets/shared.js (SUPABASE_URL y SUPABASE_ANON_KEY).
--   5. Creá tu primer usuario admin — ver el paso final de este archivo.
-- ============================================================================


-- ============================================================================
-- 1) TABLA PRINCIPAL: registros_vecinales
--    Guarda cada reclamo / proyecto / aporte positivo cargado desde index.html.
-- ============================================================================
create table if not exists public.registros_vecinales (
    id                      bigint generated always as identity primary key,
    creado_en               timestamptz not null default now(),
    estado                  text not null default 'valid' check (estado in ('valid', 'suspicious', 'spam')),
    tipo_perfil             text not null,
    nombre                  text not null,
    sexo                    text,
    edad                    integer,
    barrio                  text,
    contacto                text not null,
    problematica            text,
    subproblematica         text,
    aspectos_positivos      text[],
    nombre_comercio         text,
    ubicacion_comercio      text,
    impacto_obra            text,
    consecuencia_comercial  text,
    titulo_proyecto         text,
    eje_idea                text,
    por_que_proyecto        text,
    detalle                 text,
    lat                     double precision,
    lng                     double precision,
    archivo_path            text,  -- ruta del adjunto (foto/video/PDF) en Supabase Storage, si cargó uno
    archivo_nombre_original text   -- nombre original del archivo, para mostrarlo en el panel admin
);

-- Si ya habías creado la tabla antes (sin estas dos columnas), esto se las
-- agrega sin tocar ni borrar ningún dato existente. Es seguro correrlo aunque
-- ya hayas ejecutado este script una vez.
alter table public.registros_vecinales add column if not exists archivo_path text;
alter table public.registros_vecinales add column if not exists archivo_nombre_original text;

comment on table public.registros_vecinales is 'Reclamos, proyectos y aportes positivos cargados por vecinos en index.html';

-- Índices para que los filtros del panel admin (admin.html) respondan rápido
-- incluso con miles de registros.
create index if not exists idx_registros_estado on public.registros_vecinales (estado);
create index if not exists idx_registros_barrio on public.registros_vecinales (barrio);
create index if not exists idx_registros_tipo_perfil on public.registros_vecinales (tipo_perfil);
create index if not exists idx_registros_problematica on public.registros_vecinales (problematica);


-- ============================================================================
-- 2) TABLA DE PERFILES: profiles
--    Un renglón por cada usuario admin, con su rol. Se completa sola cuando
--    alguien se registra en Supabase Auth (ver trigger más abajo), y vos le
--    asignás el rol manualmente la primera vez (ver instrucciones al final).
-- ============================================================================
create table if not exists public.profiles (
    id      uuid primary key references auth.users (id) on delete cascade,
    email   text,
    role    text not null default 'sin_asignar' check (role in ('super_admin', 'admin', 'visor', 'sin_asignar'))
);

comment on table public.profiles is 'Rol de cada usuario de Supabase Auth. Roles autorizados a entrar al panel: super_admin, admin, visor.';

-- Cuando alguien se registra en Supabase Auth, crea automáticamente su fila en
-- "profiles" con rol "sin_asignar" (sin acceso hasta que un super_admin se lo
-- cambie manualmente desde el SQL Editor o la tabla).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'sin_asignar');
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();


-- ============================================================================
-- 3) SEGURIDAD: Row Level Security (RLS)
--    Esto es lo que hace que el login sea REALMENTE seguro: sin esto,
--    cualquiera con la anon key podría leer o borrar todos los datos.
-- ============================================================================

alter table public.registros_vecinales enable row level security;
alter table public.profiles enable row level security;

-- Cualquier persona (anónima, sin login) puede INSERTAR un registro nuevo
-- — es lo que hace index.html — pero NO puede leer, editar ni borrar nada.
drop policy if exists "insercion_publica" on public.registros_vecinales;
create policy "insercion_publica"
    on public.registros_vecinales
    for insert
    to anon
    with check (true);

-- Solo usuarios logueados con rol autorizado (admin, super_admin, visor) pueden
-- LEER los registros — es lo que hace admin.html después del login.
drop policy if exists "lectura_solo_admins" on public.registros_vecinales;
create policy "lectura_solo_admins"
    on public.registros_vecinales
    for select
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('super_admin', 'admin', 'visor')
        )
    );

-- Solo admin y super_admin pueden VALIDAR/DESCARTAR registros (cambiar estado).
-- El rol "visor" puede ver el panel pero no moderar.
drop policy if exists "actualizacion_solo_admins" on public.registros_vecinales;
create policy "actualizacion_solo_admins"
    on public.registros_vecinales
    for update
    to authenticated
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('super_admin', 'admin')
        )
    );

-- Cada usuario puede ver su propio perfil (para que el login pueda consultar
-- su rol). Ver o cambiar el rol de OTROS usuarios solo lo puede hacer un
-- super_admin directamente desde el SQL Editor de Supabase, nunca desde la web.
drop policy if exists "ver_propio_perfil" on public.profiles;
create policy "ver_propio_perfil"
    on public.profiles
    for select
    to authenticated
    using (auth.uid() = id);


-- ============================================================================
-- 4) FUNCIÓN PARA LOS CONTADORES PÚBLICOS (index.html)
--    Devuelve totales agregados (sin datos personales) para que la portada
--    pueda mostrar "127 reclamos", etc. sin necesitar login ni exponer la
--    tabla completa al público.
-- ============================================================================
create or replace function public.get_public_stats()
returns json
language sql
security definer set search_path = public
as $$
    select json_build_object(
        'total_reclamos',      count(*) filter (where tipo_perfil = 'Vecino / Ciudadano' and estado = 'valid'),
        'total_jovenes',       count(*) filter (where tipo_perfil = 'Joven (16 a 30 años)' and estado = 'valid'),
        'total_comerciantes',  count(*) filter (where tipo_perfil = 'Comerciante / Dueño de Negocio' and estado = 'valid'),
        'total_propuestas',    count(*) filter (where tipo_perfil = 'Propuesta / Idea Vecinal' and estado = 'valid'),
        'total_positivos',     count(*) filter (where tipo_perfil = 'Aporte Positivo Vecinal' and estado = 'valid')
    )
    from public.registros_vecinales;
$$;

-- Cualquiera puede llamar a esta función (solo devuelve números agregados,
-- nunca nombres, teléfonos ni ubicaciones individuales).
grant execute on function public.get_public_stats() to anon, authenticated;


-- ============================================================================
-- 5) ALMACENAMIENTO DE ADJUNTOS (fotos, videos, PDF)
--    Crea el "bucket" (carpeta de almacenamiento) donde se guardan los
--    archivos que suben los vecinos desde index.html, con las mismas reglas
--    de seguridad que el resto: cualquiera puede subir, pero solo el panel
--    admin (usuarios con rol autorizado) puede verlos/descargarlos.
-- ============================================================================

-- Crea el bucket "adjuntos-vecinales" como privado (no público): los archivos
-- no son accesibles por URL directa, solo mediante un link temporal que genera
-- el panel admin al pedirlo (createSignedUrl), y solo si estás logueado.
insert into storage.buckets (id, name, public, file_size_limit)
values ('adjuntos-vecinales', 'adjuntos-vecinales', false, 15728640) -- 15MB máximo por archivo
on conflict (id) do nothing;

-- Cualquier persona (anónima) puede SUBIR un archivo a este bucket — es lo que
-- hace index.html al adjuntar una foto/video/PDF — pero no puede leer ni
-- listar lo que ya subieron otros.
drop policy if exists "subida_publica_adjuntos" on storage.objects;
create policy "subida_publica_adjuntos"
    on storage.objects
    for insert
    to anon
    with check (bucket_id = 'adjuntos-vecinales');

-- Solo usuarios logueados con rol autorizado pueden LEER/DESCARGAR los
-- adjuntos — es lo que hace admin.html al mostrar "Ver adjunto".
drop policy if exists "lectura_solo_admins_adjuntos" on storage.objects;
create policy "lectura_solo_admins_adjuntos"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'adjuntos-vecinales'
        and exists (
            select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role in ('super_admin', 'admin', 'visor')
        )
    );


-- ============================================================================
-- 6) CÓMO CREAR TU PRIMER USUARIO ADMIN (hacelo una sola vez)
-- ============================================================================
-- 1. En el panel de Supabase: Authentication > Users > "Add user" > "Create
--    new user". Cargá tu email y una contraseña segura. Confirmá el email
--    manualmente si Supabase te lo pide (botón "Confirm email" en esa pantalla).
--
-- 2. Volvé al SQL Editor y corré esto, reemplazando el email por el que usaste
--    (esto le da rol "super_admin", el máximo nivel):
--
--    update public.profiles
--    set role = 'super_admin'
--    where email = 'tu-email@ejemplo.com';
--
-- 3. Listo. Ya podés entrar a admin.html con ese email y esa contraseña.
--
-- Para dar de alta más usuarios admin más adelante: que esa persona se registre
-- una vez desde Authentication > Users > Add user (o armá una pantalla de
-- registro si preferís), y después vos le asignás el rol con el mismo UPDATE
-- de arriba (admin, visor, o super_admin según lo que necesite).
-- ============================================================================
