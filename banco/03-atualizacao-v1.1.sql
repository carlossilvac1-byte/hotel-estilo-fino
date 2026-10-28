-- =====================================================================
-- banco/03-atualizacao-v1.1.sql — FRIGOBAR / PRODUTOS E TARIFAS POR CONTRATANTE
-- ---------------------------------------------------------------------
-- Para bases criadas com a versão 1.0 (01-estrutura.sql). Pode ser
-- executado de novo sem quebrar nada. Cria:
--   • contratantes — hóspede direto, empresas, agências e sites, cada um
--                    com tarifa por categoria, prazo de recebimento e comissão
--   • produtos     — frigobar, restaurante, bar, serviços (preço e estoque)
--   • colunas novas em reservas (contratante e condições) e consumos (produto)
-- =====================================================================

create table if not exists public.contratantes (
  id text primary key,
  nome text not null,
  tipo text not null default 'empresa',
  documento text, contato text, telefone text, email text,
  prazo_dias integer not null default 0,
  comissao_pct numeric(6,2) not null default 0,
  desconto_pct numeric(6,2) not null default 0,
  forma_padrao text,
  tarifas jsonb not null default '{}'::jsonb,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);
alter table public.contratantes drop constraint if exists contratantes_tipo_valido;
alter table public.contratantes add  constraint contratantes_tipo_valido check (tipo in ('direto', 'empresa', 'agencia', 'ota', 'outro'));

create table if not exists public.produtos (
  id text primary key,
  nome text not null,
  grupo text not null default 'Frigobar',
  codigo text,
  unidade text,
  preco numeric(12,2) not null default 0,
  custo numeric(12,2) not null default 0,
  controla_estoque boolean not null default true,
  estoque numeric(12,2) not null default 0,
  estoque_em timestamptz,
  estoque_minimo numeric(12,2) not null default 0,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz, atualizado_em timestamptz not null default now(),
  criado_por uuid, atualizado_por uuid,
  excluido boolean not null default false,
  recebido_em timestamptz not null default now()
);

alter table public.reservas add column if not exists contratante_id   text;
alter table public.reservas add column if not exists contratante_nome text;
alter table public.reservas add column if not exists contratante_tipo text;
alter table public.reservas add column if not exists prazo_dias       integer;
alter table public.reservas add column if not exists comissao_pct     numeric(6,2);

alter table public.consumos add column if not exists produto_id text;
alter table public.consumos add column if not exists grupo      text;
create index if not exists idx_consumos_produto on public.consumos (produto_id);

create index if not exists idx_contratantes_recebido on public.contratantes (recebido_em);
create index if not exists idx_produtos_recebido     on public.produtos     (recebido_em);

-- Gatilhos de autoria / versão (mesmas regras das demais tabelas)
do $$
declare t text;
begin
  foreach t in array array['contratantes','produtos'] loop
    execute format('drop trigger if exists trg_%s_inserir on public.%I', t, t);
    execute format('create trigger trg_%s_inserir before insert on public.%I for each row execute function public.fn_registro_inserir()', t, t);
    execute format('drop trigger if exists trg_%s_atualizar on public.%I', t, t);
    execute format('create trigger trg_%s_atualizar before update on public.%I for each row execute function public.fn_registro_atualizar()', t, t);
  end loop;
end $$;

-- Regras de acesso: todo usuário ativo lê (para lançar e reservar);
-- produtos são mantidos por Configurações; contratantes por Configurações ou Financeiro.
alter table public.contratantes enable row level security;
alter table public.produtos     enable row level security;

drop policy if exists "le contratantes" on public.contratantes;
create policy "le contratantes" on public.contratantes for select to authenticated using (public.usuario_ativo());
drop policy if exists "insere contratantes" on public.contratantes;
create policy "insere contratantes" on public.contratantes for insert to authenticated
  with check (public.pode_editar_algum(array['configuracoes','financeiro']));
drop policy if exists "altera contratantes" on public.contratantes;
create policy "altera contratantes" on public.contratantes for update to authenticated
  using (public.pode_editar_algum(array['configuracoes','financeiro']))
  with check (public.pode_editar_algum(array['configuracoes','financeiro']));

drop policy if exists "le produtos" on public.produtos;
create policy "le produtos" on public.produtos for select to authenticated using (public.usuario_ativo());
drop policy if exists "insere produtos" on public.produtos;
create policy "insere produtos" on public.produtos for insert to authenticated
  with check (public.pode_editar_algum(array['configuracoes']));
drop policy if exists "altera produtos" on public.produtos;
create policy "altera produtos" on public.produtos for update to authenticated
  using (public.pode_editar_algum(array['configuracoes']))
  with check (public.pode_editar_algum(array['configuracoes']));

grant select, insert, update on public.contratantes, public.produtos to authenticated;

-- Tempo real
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['contratantes','produtos'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- Contratante padrão: hóspede direto (balcão)
insert into public.contratantes (id, nome, tipo, prazo_dias, comissao_pct, desconto_pct, forma_padrao, tarifas, ativo, criado_em, atualizado_em)
values ('direto', 'Hóspede direto (balcão)', 'direto', 0, 0, 0, 'Pix', '{}'::jsonb, true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

-- Reservas antigas passam a constar como hóspede direto
update public.reservas set contratante_id = 'direto', contratante_nome = 'Hóspede direto (balcão)', contratante_tipo = 'direto', prazo_dias = 0, comissao_pct = 0
 where contratante_id is null;

-- Visão de consumo por produto (relatórios / Power BI)
create or replace view public.vw_consumos with (security_invoker = true) as
select c.data, coalesce(c.grupo, 'Outros') as grupo, c.descricao, c.quantidade, c.valor as valor_unitario,
       c.quantidade * c.valor as valor_total, q.numero as quarto, r.hospede_nome, r.codigo as reserva,
       r.contratante_nome
  from public.consumos c
  left join public.reservas r on r.id = c.reserva_id
  left join public.quartos q on q.id = r.quarto_id
 where c.excluido = false;
