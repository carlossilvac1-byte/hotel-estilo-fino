# Ativar a base central (Supabase) — Hotel Estilo Fino v1.0.0

Tempo estimado: 15 minutos. O plano gratuito do Supabase atende.
Enquanto este passo não for feito, o sistema funciona em **modo local** (dados só no aparelho).

## 1. Criar o projeto
1. Acesse https://supabase.com e entre.
2. **New project** → nome `hotel-estilo-fino`, região **South America (São Paulo)**,
   defina e guarde a senha do banco → **Create**.

## 2. Criar a estrutura e as regras de acesso
1. Menu **SQL Editor** → **New query** → cole TODO o `banco/01-estrutura.sql` → **Run** ("Success").
   Cria as tabelas, as regras de acesso por módulo, o tempo real e os **20 quartos** (01 a 20).
2. Nova query → cole `banco/02-administrador.sql` → **Run**.
   Define `ce142734@gmail.com` como administrador. **Este arquivo não vai para o GitHub.**

Os dois scripts podem ser executados de novo sem quebrar nada.

## 3. Configurar o login
**Authentication → URL Configuration**
- Site URL: `https://carlossilvac1-byte.github.io/hotel-estilo-fino/`
- Redirect URLs: a mesma URL.

**Authentication → Providers → Email**: deixe **Confirm email** ligado.

## 4. Ligar o app
**Project Settings → API**: copie **Project URL** e a chave **anon public**.
Em `config.js`, bloco `supabase`, troque `https://SEUPROJETO.supabase.co` e
`COLOQUE-AQUI-A-CHAVE-ANON` por esses valores. **Nunca** use a chave `service_role`.

## 5. Primeiro acesso
1. **Carlos se cadastra primeiro** com `ce142734@gmail.com`, confirma o e-mail e entra: já é administrador.
2. Em **Configurações**: cadastre as categorias (suítes) com diária e capacidade, atribua a categoria
   e o andar de cada quarto e preencha os dados do hotel (aparecem no voucher).
3. A equipe se cadastra pelo link do sistema e fica **pendente**.
4. Em **Acessos**: escolha o modelo (Recepção, Governança, Financeiro, Gerência), ajuste módulo a
   módulo (sem acesso / consulta / edição) e toque em **Liberar acesso**.

## Regras garantidas pelo banco
- Pendente, recusado ou bloqueado não lê nem grava nada.
- Só o administrador altera status, perfil e permissões.
- Cada gravação exige "edição" no módulo dono do dado (ex.: categorias e tarifas só por Configurações).
- Lançamentos financeiros só aparecem para quem tem Financeiro ou Relatórios; a recepção vê apenas
  os pagamentos das contas dos hóspedes.
- Não existe exclusão física: excluir é lógico; versão antiga de outro aparelho não sobrescreve a nova.
