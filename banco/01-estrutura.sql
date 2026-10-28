-- =====================================================================
-- banco/01-estrutura.sql — BASE CENTRAL DO HOTEL ESTILO FINO (v1.0.0)
-- ---------------------------------------------------------------------
-- Cria no Supabase:
--   • usuarios        — quem usa o sistema (todo cadastro nasce PENDENTE)
--   • administradores — e-mails que entram já como administrador
--                       (preenchida pelo arquivo 02-administrador.sql)
--   • categorias, quartos, hospedes, reservas, consumos,
--     lancamentos, parametros — dados do hotel
--   • regras de acesso (RLS) por módulo: nenhum / ver / editar
--   • tempo real nas tabelas do hotel
--   • 20 quartos iniciais (numeração e categoria ajustáveis no app)
--
-- COMO EXECUTAR: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode ser executado de novo sem quebrar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. USUÁRIOS E ADMINISTRADORES
-- ---------------------------------------------------------------------
create table if not exists public.administradores (
  email text primary key,
  constraint administradores_email_minusculo check (email = lower(email))
);

create table if not exists public.usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null,
  email           text not null unique,
  telefone        text,
  cargo           text not null default 'Outro',
  perfil          text not null default 'usuario',
  status          text not null default 'pendente',
  permissoes      jsonb not null default '{}'::jsonb,
  criado_em       timestamptz not null default now(),
  aprovado_em     timestamptz,
  aprovado_por    uuid,
  ultimo_acesso   timestamptz,
  dispositivo     text,
  pendentes_envio integer not null default 0
);
alter table public.usuarios drop constraint if exists usuarios_perfil_valido;
alter table public.usuarios add  constraint usuarios_perfil_valido check (perfil in ('usuario', 'admin'));
alter table public.usuarios drop constraint if exists usuarios_status_valido;
alter table public.usuarios add  constraint usuarios_status_valido check (status in ('pendente', 'ativo', 'bloqueado', 'recusado'));
create index if not exists idx_usuarios_status on public.usuarios (status);

-- ---------------------------------------------------------------------
-- 2. TABELAS DO HOTEL
--    Colunas comuns: id (gerado no aparelho), criado_em, atualizado_em,
--    criado_por, atualizado_por, excluido (exclusão lógica), recebido_em
--    (carimbo do servidor, usado como cursor de recebimento).
-- ---------------------------------------------------------------------
create table if not exists public.categorias (
  id text primary key,
  nome text not null,
  diaria numeric(12,2) not null default 0,
  capacidade integer not null default 2,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);

create table if not exists public.quartos (
  id text primary key,
  numero text not null,
  andar text,
  categoria_id text,
  status_manual text not null default 'liv',
  observacao text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
alter table public.quartos drop constraint if exists quartos_status_valido;
alter table public.quartos add  constraint quartos_status_valido check (status_manual in ('liv', 'lmp', 'mnt'));

create table if not exists public.hospedes (
  id text primary key,
  nome text not null,
  cpf text, documento text, nascimento date, nacionalidade text,
  telefone text, email text, cep text, endereco text, cidade text, uf text,
  empresa text, placa text, motivo text, origem text, observacoes text,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
create index if not exists idx_hospedes_cpf on public.hospedes (cpf);

create table if not exists public.reservas (
  id text primary key,
  codigo text not null,
  hospede_id text, hospede_nome text not null, documento text, telefone text, email text, empresa text,
  quarto_id text not null,
  entrada date not null,
  saida date not null,
  adultos integer not null default 1,
  criancas integer not null default 0,
  regime text, pagamento text,
  diaria numeric(12,2) not null default 0,
  observacoes text,
  status text not null default 'reservada',
  checkin_em timestamptz, checkout_em timestamptz,
  voucher_status text not null default 'aguardando',
  voucher_enviado_em timestamptz,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
alter table public.reservas drop constraint if exists reservas_status_valido;
alter table public.reservas add  constraint reservas_status_valido check (status in ('reservada', 'hospedado', 'finalizada', 'cancelada'));
alter table public.reservas drop constraint if exists reservas_periodo_valido;
alter table public.reservas add  constraint reservas_periodo_valido check (saida > entrada);
create index if not exists idx_reservas_quarto on public.reservas (quarto_id);
create index if not exists idx_reservas_periodo on public.reservas (entrada, saida);

create table if not exists public.consumos (
  id text primary key,
  reserva_id text not null,
  data date not null,
  descricao text not null,
  quantidade numeric(10,2) not null default 1,
  valor numeric(12,2) not null default 0,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
create index if not exists idx_consumos_reserva on public.consumos (reserva_id);

create table if not exists public.lancamentos (
  id text primary key,
  data date not null,
  tipo text not null,
  descricao text not null,
  categoria text, forma text,
  valor numeric(12,2) not null default 0,
  status text not null,
  vencimento date,
  reserva_id text, quarto text, pessoa text,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
alter table public.lancamentos drop constraint if exists lancamentos_tipo_valido;
alter table public.lancamentos add  constraint lancamentos_tipo_valido check (tipo in ('receita', 'despesa'));
alter table public.lancamentos drop constraint if exists lancamentos_status_valido;
alter table public.lancamentos add  constraint lancamentos_status_valido check (status in ('recebido', 'pago', 'a_receber', 'agendado'));
alter table public.lancamentos drop constraint if exists lancamentos_valor_positivo;
alter table public.lancamentos add  constraint lancamentos_valor_positivo check (valor >= 0);
create index if not exists idx_lancamentos_data on public.lancamentos (data);

create table if not exists public.parametros (
  id text primary key,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);

create index if not exists idx_categorias_recebido  on public.categorias  (recebido_em);
create index if not exists idx_quartos_recebido     on public.quartos     (recebido_em);
create index if not exists idx_hospedes_recebido    on public.hospedes    (recebido_em);
create index if not exists idx_reservas_recebido    on public.reservas    (recebido_em);
create index if not exists idx_consumos_recebido    on public.consumos    (recebido_em);
create index if not exists idx_lancamentos_recebido on public.lancamentos (recebido_em);
create index if not exists idx_parametros_recebido  on public.parametros  (recebido_em);

-- ---------------------------------------------------------------------
-- 3. FUNÇÕES DE AUTORIZAÇÃO (security definer: leem usuarios sem RLS)
-- ---------------------------------------------------------------------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u
                  where u.id = auth.uid() and u.perfil = 'admin' and u.status = 'ativo');
$$;

create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.status = 'ativo');
$$;

/* Pode, no módulo informado, ao menos o nível pedido ('ver' ou 'editar')? */
create or replace function public.pode(p_modulo text, p_nivel text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists (
    select 1 from public.usuarios u
     where u.id = auth.uid() and u.status = 'ativo'
       and case p_nivel
             when 'ver' then coalesce(u.permissoes->>p_modulo, 'nenhum') in ('ver', 'editar')
             else coalesce(u.permissoes->>p_modulo, 'nenhum') = 'editar'
           end);
$$;

/* Pode editar em ao menos um dos módulos? */
create or replace function public.pode_editar_algum(p_modulos text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_admin() or exists (
    select 1 from unnest(p_modulos) m where public.pode(m, 'editar'));
$$;

/* Campos de acesso gravados (o próprio usuário não pode alterá-los). */
create or replace function public.meu_status() returns text
language sql stable security definer set search_path = public as $$
  select u.status from public.usuarios u where u.id = auth.uid();
$$;
create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select u.perfil from public.usuarios u where u.id = auth.uid();
$$;
create or replace function public.minhas_permissoes() returns jsonb
language sql stable security definer set search_path = public as $$
  select u.permissoes from public.usuarios u where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 4. GATILHOS
-- ---------------------------------------------------------------------

/* 4.1 Toda conta criada no Auth ganha a linha em usuarios, PENDENTE.
       E-mails da tabela administradores entram como admin ativo. */
create or replace function public.fn_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  md jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  adm boolean := exists (select 1 from public.administradores a where a.email = lower(new.email));
begin
  insert into public.usuarios (id, nome, email, telefone, cargo, perfil, status, aprovado_em)
  values (
    new.id,
    coalesce(nullif(md->>'nome', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    nullif(md->>'telefone', ''),
    coalesce(nullif(md->>'cargo', ''), 'Outro'),
    case when adm then 'admin' else 'usuario' end,
    case when adm then 'ativo' else 'pendente' end,
    case when adm then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario after insert on auth.users
  for each row execute function public.fn_novo_usuario();

/* 4.2 Carimbo de quem liberou e quando. */
create or replace function public.fn_usuario_aprovacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ativo' and old.status is distinct from 'ativo' then
    new.aprovado_em  := now();
    new.aprovado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_usuario_aprovacao on public.usuarios;
create trigger trg_usuario_aprovacao before update on public.usuarios
  for each row execute function public.fn_usuario_aprovacao();

/* 4.3 Inserção: autor = quem está logado; carimbo do servidor. */
create or replace function public.fn_registro_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.criado_por     := auth.uid();
  new.atualizado_por := auth.uid();
  new.criado_em      := coalesce(new.criado_em, now());
  new.atualizado_em  := coalesce(new.atualizado_em, now());
  new.recebido_em    := clock_timestamp();
  return new;
end;
$$;

/* 4.4 Atualização: versão mais antiga (aparelho atrasado) não
       sobrescreve a mais nova; autor original nunca muda. */
create or replace function public.fn_registro_atualizar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.atualizado_em < old.atualizado_em then
    return old;
  end if;
  new.criado_por     := old.criado_por;
  new.criado_em      := coalesce(old.criado_em, new.criado_em);
  new.atualizado_por := auth.uid();
  new.recebido_em    := clock_timestamp();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['categorias','quartos','hospedes','reservas','consumos','lancamentos','parametros'] loop
    execute format('drop trigger if exists trg_%s_inserir on public.%I', t, t);
    execute format('create trigger trg_%s_inserir before insert on public.%I for each row execute function public.fn_registro_inserir()', t, t);
    execute format('drop trigger if exists trg_%s_atualizar on public.%I', t, t);
    execute format('create trigger trg_%s_atualizar before update on public.%I for each row execute function public.fn_registro_atualizar()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. REGRAS DE ACESSO (ROW LEVEL SECURITY)
-- ---------------------------------------------------------------------
alter table public.usuarios        enable row level security;
alter table public.administradores enable row level security;
alter table public.categorias      enable row level security;
alter table public.quartos         enable row level security;
alter table public.hospedes        enable row level security;
alter table public.reservas        enable row level security;
alter table public.consumos        enable row level security;
alter table public.lancamentos     enable row level security;
alter table public.parametros      enable row level security;

-- 5.1 usuarios: cada um lê o próprio; o administrador lê e altera todos.
drop policy if exists "usuario le o proprio cadastro" on public.usuarios;
create policy "usuario le o proprio cadastro" on public.usuarios for select to authenticated
  using (id = auth.uid() or public.eh_admin());

drop policy if exists "usuario atualiza dados proprios" on public.usuarios;
create policy "usuario atualiza dados proprios" on public.usuarios for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and status     = public.meu_status()
    and perfil     = public.meu_perfil()
    and permissoes = public.minhas_permissoes()
  );

drop policy if exists "admin administra usuarios" on public.usuarios;
create policy "admin administra usuarios" on public.usuarios for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- 5.2 administradores: somente o administrador consulta.
drop policy if exists "admin le administradores" on public.administradores;
create policy "admin le administradores" on public.administradores for select to authenticated
  using (public.eh_admin());

-- 5.3 Tabelas do hotel.
--     Leitura: qualquer usuário ATIVO lê o cadastro operacional (quartos,
--     categorias, hóspedes, reservas, consumos, parâmetros), pois as telas
--     se cruzam. Lançamentos financeiros exigem acesso ao Financeiro ou
--     aos Relatórios; os ligados a uma estadia também aparecem para quem
--     opera Entradas e saídas (fechamento de conta).
--     Gravação: exige "editar" no módulo dono do dado.
--     Sem DELETE: a exclusão é lógica (excluido = true).
do $$
declare
  t text;
  regras jsonb := '{
    "categorias":  ["configuracoes"],
    "parametros":  ["configuracoes"],
    "quartos":     ["quartos","movimento","configuracoes"],
    "hospedes":    ["hospedes","voucher","movimento"],
    "reservas":    ["voucher","movimento"],
    "consumos":    ["movimento"]
  }'::jsonb;
  mods text[];
begin
  for t in select jsonb_object_keys(regras) loop
    select array_agg(x) into mods from jsonb_array_elements_text(regras->t) x;
    execute format('drop policy if exists "le %s" on public.%I', t, t);
    execute format('create policy "le %s" on public.%I for select to authenticated using (public.usuario_ativo())', t, t);
    execute format('drop policy if exists "insere %s" on public.%I', t, t);
    execute format('create policy "insere %s" on public.%I for insert to authenticated with check (public.pode_editar_algum(%L::text[]))', t, t, mods);
    execute format('drop policy if exists "altera %s" on public.%I', t, t);
    execute format('create policy "altera %s" on public.%I for update to authenticated using (public.pode_editar_algum(%L::text[])) with check (public.pode_editar_algum(%L::text[]))', t, t, mods, mods);
  end loop;
end $$;

drop policy if exists "le lancamentos" on public.lancamentos;
create policy "le lancamentos" on public.lancamentos for select to authenticated
  using (public.pode('financeiro', 'ver') or public.pode('relatorios', 'ver')
         or (reserva_id is not null and public.pode('movimento', 'ver')));

drop policy if exists "insere lancamentos" on public.lancamentos;
create policy "insere lancamentos" on public.lancamentos for insert to authenticated
  with check (public.pode('financeiro', 'editar')
              or (reserva_id is not null and public.pode('movimento', 'editar')));

drop policy if exists "altera lancamentos" on public.lancamentos;
create policy "altera lancamentos" on public.lancamentos for update to authenticated
  using (public.pode('financeiro', 'editar')
         or (reserva_id is not null and public.pode('movimento', 'editar')))
  with check (public.pode('financeiro', 'editar')
              or (reserva_id is not null and public.pode('movimento', 'editar')));

-- ---------------------------------------------------------------------
-- 6. TEMPO REAL (o app busca na hora quando outro aparelho grava)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['categorias','quartos','hospedes','reservas','consumos','lancamentos','parametros','usuarios'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. CARGA INICIAL — 20 quartos (01 a 20) e dados do hotel
--    Numeração, andar e categoria são ajustados em Configurações.
--    Não sobrescreve nada que já exista.
-- ---------------------------------------------------------------------
insert into public.quartos (id, numero, andar, status_manual, ativo, ordem, criado_em, atualizado_em)
select 'q' || lpad(n::text, 2, '0'), lpad(n::text, 2, '0'), null, 'liv', true, n,
       '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  from generate_series(1, 20) n
on conflict (id) do nothing;

insert into public.parametros (id, dados, criado_em, atualizado_em)
values ('hotel', jsonb_build_object(
          'nome', 'Hotel Estilo Fino', 'endereco', '', 'cidade', 'Ribeiro Gonçalves', 'uf', 'PI',
          'telefone', '', 'email', '', 'cnpj', '', 'horaCheckin', '14:00', 'horaCheckout', '12:00',
          'politica', 'Apresente este voucher e um documento com foto no check-in. Cancelamento sem custo até 48h antes da entrada.'),
        '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8. VISÕES PARA CONSULTA / POWER BI (respeitam as regras de quem consulta)
-- ---------------------------------------------------------------------
create or replace view public.vw_reservas with (security_invoker = true) as
select r.codigo, r.hospede_nome, q.numero as quarto, c.nome as categoria,
       r.entrada, r.saida, (r.saida - r.entrada) as noites, r.adultos, r.criancas,
       r.diaria, r.diaria * (r.saida - r.entrada) as valor_hospedagem,
       r.regime, r.pagamento, r.status, r.checkin_em, r.checkout_em, r.voucher_status
  from public.reservas r
  left join public.quartos q on q.id = r.quarto_id
  left join public.categorias c on c.id = q.categoria_id
 where r.excluido = false;

create or replace view public.vw_lancamentos with (security_invoker = true) as
select l.data, date_trunc('month', l.data)::date as competencia, l.tipo, l.descricao,
       l.categoria, l.forma, l.valor, l.status, l.vencimento, l.quarto, l.pessoa
  from public.lancamentos l
 where l.excluido = false;

-- =====================================================================
-- Conferência rápida:
--   select nome, email, perfil, status, permissoes from public.usuarios order by criado_em;
--   select numero, andar, categoria_id from public.quartos order by ordem;
-- =====================================================================
