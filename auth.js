/* =====================================================================
 * auth.js — AUTENTICAÇÃO (Supabase Auth) COM SESSÃO OFFLINE
 * ---------------------------------------------------------------------
 * Fala com a API REST do Supabase diretamente (sem SDK, sem CDN).
 *  - Sessão gravada no IndexedDB, válida por 30 dias sem internet.
 *  - Offline, a senha é conferida contra um hash PBKDF2 gravado no
 *    último login bem-sucedido (a senha nunca é guardada).
 *  - Todo cadastro novo nasce PENDENTE: só entra depois que o
 *    administrador libera e define o acesso por módulo.
 * A autorização de verdade está na RLS do banco (banco/01-estrutura.sql).
 * ===================================================================== */

const AUTH = (function () {

  const CHAVE_SESSAO = 'sessao';
  const MARGEM_RENOVACAO = 120;

  let sessao = null;
  const ouvintes = [];

  function base() { return String((CONFIG.supabase || {}).url || '').replace(/\/+$/, ''); }
  function anon() { return (CONFIG.supabase || {}).anonKey || ''; }

  function configurado() {
    const s = (CONFIG.supabase || {});
    return !!s.url && String(s.url).indexOf('SEUPROJETO') === -1 &&
           !!s.anonKey && String(s.anonKey).indexOf('COLOQUE-AQUI') === -1;
  }
  function modoLocal() { return !configurado(); }

  async function fetchTimeout(url, opcoes, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 20000);
    try { return await fetch(url, Object.assign({}, opcoes || {}, { signal: ctrl.signal })); }
    finally { clearTimeout(t); }
  }
  function agora() { return Date.now(); }
  function notificar() { ouvintes.forEach(fn => { try { fn(estado()); } catch (e) {} }); }
  function aoMudar(fn) { ouvintes.push(fn); }

  /* ---------- Hash local da senha (PBKDF2-SHA256) ---------- */
  function paraHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function hashSenha(senha, salHex) {
    const sal = salHex
      ? Uint8Array.from(salHex.match(/.{2}/g).map(h => parseInt(h, 16)))
      : crypto.getRandomValues(new Uint8Array(16));
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: 150000, hash: 'SHA-256' }, chave, 256);
    return { sal: paraHex(sal.buffer || sal), hash: paraHex(bits) };
  }
  async function conferirSenhaLocal(senha, guardado) {
    if (!guardado || !guardado.sal || !guardado.hash) return false;
    const r = await hashSenha(senha, guardado.sal);
    if (r.hash.length !== guardado.hash.length) return false;
    let dif = 0;
    for (let i = 0; i < r.hash.length; i++) dif |= r.hash.charCodeAt(i) ^ guardado.hash.charCodeAt(i);
    return dif === 0;
  }

  /* ---------- Persistência da sessão ---------- */
  async function gravarSessao(s) { sessao = s; await DB.kvSet(CHAVE_SESSAO, s); notificar(); return s; }
  async function carregarSessao() { sessao = await DB.kvGet(CHAVE_SESSAO, null); return sessao; }
  async function limparSessao() {
    const a = sessao;
    const nova = a ? { email: a.email, credencial: a.credencial, perfil: a.perfil, usuarioId: a.usuarioId,
                       local: a.local, desconectado: true } : null;
    sessao = nova;
    await DB.kvSet(CHAVE_SESSAO, nova);
    notificar();
  }

  /* ---------- Estado consultado pelo app ---------- */
  function dentroDaValidadeOffline() {
    if (!sessao) return false;
    if (sessao.local) return true;
    return !!sessao.validadeOffline && agora() < sessao.validadeOffline;
  }
  function autenticado() {
    return !!(sessao && !sessao.desconectado && sessao.usuarioId && sessao.perfil && sessao.perfil.status === 'ativo');
  }
  function perfil() { return (sessao && sessao.perfil) ? sessao.perfil : null; }
  function usuarioId() { return sessao ? sessao.usuarioId : null; }
  function ehAdmin() { return !!(perfil() && perfil().perfil === 'admin'); }

  /** Nível do usuário no módulo: nenhum | ver | editar. */
  function nivel(modulo) {
    if (ehAdmin()) return 'editar';
    const p = perfil();
    const n = p && p.permissoes ? p.permissoes[modulo] : null;
    return CONFIG.niveis.indexOf(n) !== -1 ? n : 'nenhum';
  }
  function podeVer(modulo) { return nivel(modulo) !== 'nenhum'; }
  function podeEditar(modulo) { return nivel(modulo) === 'editar'; }

  function podeEnviar() {
    if (!sessao || sessao.desconectado || sessao.local) return false;
    return !!(sessao.refreshToken && dentroDaValidadeOffline());
  }

  function estado() {
    return {
      autenticado: autenticado(), usuarioId: usuarioId(), perfil: perfil(), ehAdmin: ehAdmin(),
      podeEnviar: podeEnviar(),
      sessaoVencida: !!(sessao && !sessao.desconectado && !sessao.local && !dentroDaValidadeOffline()),
      emailUltimaConta: sessao ? sessao.email : null,
      configurado: configurado(), modoLocal: modoLocal(), contaLocal: !!(sessao && sessao.local)
    };
  }

  /* ---------- Chamadas ao Supabase ---------- */
  function cabecalhosAnon(extra) {
    return Object.assign({ apikey: anon(), 'Content-Type': 'application/json' }, extra || {});
  }
  async function cabecalhosAutenticados(extra) {
    const token = await obterToken();
    return Object.assign({ apikey: anon(), Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, extra || {});
  }

  async function obterToken(forcar) {
    if (!sessao) throw new Error('SEM_SESSAO');
    const folga = MARGEM_RENOVACAO * 1000;
    if (!forcar && sessao.accessToken && sessao.expiraEm && sessao.expiraEm - folga > agora()) return sessao.accessToken;
    if (!sessao.refreshToken) throw new Error('SEM_SESSAO');
    const r = await fetchTimeout(base() + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: cabecalhosAnon(), body: JSON.stringify({ refresh_token: sessao.refreshToken })
    }, 20000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      sessao.accessToken = null; sessao.expiraEm = 0;
      await DB.kvSet(CHAVE_SESSAO, sessao);
      throw new Error('SESSAO_EXPIRADA');
    }
    await aplicarTokens(j);
    return sessao.accessToken;
  }
  async function aplicarTokens(j) {
    sessao.accessToken = j.access_token;
    sessao.refreshToken = j.refresh_token || sessao.refreshToken;
    sessao.expiraEm = agora() + ((j.expires_in || 3600) * 1000);
    sessao.validadeOffline = agora() + CONFIG.auth.diasSessaoOffline * 86400000;
    await DB.kvSet(CHAVE_SESSAO, sessao);
    notificar();
  }

  async function carregarPerfil(idUsuario, token) {
    const url = base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?id=eq.' + encodeURIComponent(idUsuario) + '&select=*';
    const r = await fetchTimeout(url, { headers: { apikey: anon(), Authorization: 'Bearer ' + token } }, 20000);
    const j = await r.json().catch(() => []);
    if (!r.ok) throw new Error('Não foi possível ler o cadastro: ' + (j.message || r.status));
    return (Array.isArray(j) && j[0]) ? j[0] : null;
  }

  /* ---------- Cadastro ---------- */
  function validarSenha(senha) {
    return !!senha && senha.length >= CONFIG.auth.minimoSenha && /[A-Za-zÀ-ÿ]/.test(senha) && /[0-9]/.test(senha);
  }
  function validarCadastro(d) {
    const e = [];
    if (!d.nome || d.nome.trim().split(/\s+/).length < 2) e.push('Informe nome e sobrenome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) e.push('E-mail inválido.');
    if (String(d.telefone || '').replace(/\D/g, '').length < 10) e.push('Informe o telefone com DDD.');
    if (!d.cargo) e.push('Selecione o cargo.');
    if (!validarSenha(d.senha)) e.push('A senha precisa de no mínimo ' + CONFIG.auth.minimoSenha + ' caracteres, com letra e número.');
    if (d.senha !== d.confirmacao) e.push('A confirmação de senha não confere.');
    return e;
  }

  async function cadastrar(dados) {
    const erros = validarCadastro(dados);
    if (erros.length) throw new Error(erros.join(' '));
    if (modoLocal()) return cadastrarLocal(dados);
    if (!navigator.onLine) throw new Error('Sem internet: o cadastro precisa de conexão.');
    const voltar = window.location.origin + window.location.pathname;
    const r = await fetchTimeout(base() + '/auth/v1/signup?redirect_to=' + encodeURIComponent(voltar), {
      method: 'POST', headers: cabecalhosAnon(),
      body: JSON.stringify({
        email: dados.email.trim().toLowerCase(), password: dados.senha,
        data: { nome: dados.nome.trim(), telefone: dados.telefone.trim(), cargo: dados.cargo }
      })
    }, 30000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.msg || j.error_description || j.message || '').toLowerCase();
      if (msg.indexOf('already') !== -1 || msg.indexOf('registered') !== -1) {
        throw new Error('Este e-mail já possui cadastro. Use "Esqueci minha senha".');
      }
      throw new Error('Falha no cadastro: ' + (j.msg || j.message || r.status));
    }
    return { ok: true, precisaConfirmarEmail: !j.access_token, pendente: true };
  }

  /** Modo local: a 1ª conta do aparelho é a administradora; as demais aguardam liberação. */
  async function cadastrarLocal(dados) {
    if (await DB.obterUsuarioLocalPorEmail(dados.email)) {
      throw new Error('Já existe uma conta com este e-mail neste aparelho. Use "Entrar".');
    }
    const primeira = (await DB.contarUsuariosLocais()) === 0;
    const credencial = await hashSenha(dados.senha);
    const u = await DB.criarUsuarioLocal({
      nome: dados.nome.trim(), email: dados.email, telefone: dados.telefone, cargo: dados.cargo,
      perfil: primeira ? 'admin' : 'usuario', status: primeira ? 'ativo' : 'pendente',
      permissoes: {}, credencial: credencial
    });
    if (primeira) { await abrirSessaoLocal(u); return { ok: true, local: true, admin: true, entrou: true }; }
    return { ok: true, local: true, pendente: true };
  }

  async function abrirSessaoLocal(u) {
    u.ultimo_acesso = new Date().toISOString();
    await DB.atualizarUsuarioLocal(u.id, { ultimo_acesso: u.ultimo_acesso });
    const perfilSemSenha = Object.assign({}, u); delete perfilSemSenha.credencial;
    await gravarSessao({
      email: u.email, usuarioId: u.id, local: true, accessToken: null, refreshToken: null, expiraEm: 0,
      validadeOffline: null, credencial: u.credencial, perfil: perfilSemSenha,
      entrouEm: new Date().toISOString(), desconectado: false
    });
    return estado();
  }

  async function entrarLocal(email, senha) {
    const u = await DB.obterUsuarioLocalPorEmail(email);
    if (!u) throw new Error('Não há conta com este e-mail neste aparelho. Toque em "Criar cadastro".');
    const ok = await conferirSenhaLocal(senha, u.credencial);
    if (!ok) throw new Error('Senha incorreta.');
    if (u.status === 'pendente') throw new Error('PENDENTE');
    if (u.status === 'recusado') throw new Error('Cadastro recusado pelo administrador.');
    if (u.status !== 'ativo') throw new Error('Acesso bloqueado. Fale com o administrador.');
    return abrirSessaoLocal(u);
  }

  /* ---------- Login online ---------- */
  async function entrar(email, senha) {
    email = String(email || '').trim().toLowerCase();
    if (modoLocal()) return entrarLocal(email, senha);
    const r = await fetchTimeout(base() + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: cabecalhosAnon(), body: JSON.stringify({ email: email, password: senha })
    }, 25000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      const msg = (j.error_description || j.msg || j.message || '').toLowerCase();
      if (msg.indexOf('invalid') !== -1 || msg.indexOf('credentials') !== -1) throw new Error('E-mail ou senha incorretos.');
      if (msg.indexOf('confirm') !== -1) throw new Error('Confirme o e-mail (link enviado na hora do cadastro) antes de entrar.');
      throw new Error('Não foi possível entrar: ' + (j.msg || j.message || r.status));
    }
    const idUsuario = j.user ? j.user.id : null;
    const linha = await carregarPerfil(idUsuario, j.access_token);
    if (!linha) throw new Error('Cadastro não localizado. Fale com o administrador.');
    if (linha.status === 'pendente') throw new Error('PENDENTE');
    if (linha.status === 'recusado') throw new Error('Cadastro recusado pelo administrador.');
    if (linha.status === 'bloqueado') throw new Error('Acesso bloqueado. Fale com o administrador.');

    const credencial = await hashSenha(senha);
    await gravarSessao({
      email: email, usuarioId: idUsuario, accessToken: j.access_token, refreshToken: j.refresh_token,
      expiraEm: agora() + ((j.expires_in || 3600) * 1000),
      validadeOffline: agora() + CONFIG.auth.diasSessaoOffline * 86400000,
      credencial: credencial, perfil: linha, entrouEm: new Date().toISOString(), desconectado: false
    });
    marcarUltimoAcesso();
    return estado();
  }

  /* ---------- Login offline (última conta do aparelho) ---------- */
  async function entrarOffline(email, senha) {
    const g = sessao || await carregarSessao();
    email = String(email || '').trim().toLowerCase();
    if (!g || !g.email) throw new Error('Nenhuma conta foi usada neste aparelho ainda. É preciso entrar uma vez com internet.');
    if (g.local || !g.refreshToken) throw new Error('Para usar a base central é preciso entrar uma vez com internet.');
    if (g.email !== email) throw new Error('Sem internet, só é possível entrar com a última conta usada neste aparelho (' + g.email + ').');
    if (!g.validadeOffline || agora() >= g.validadeOffline) {
      throw new Error('A sessão offline expirou (' + CONFIG.auth.diasSessaoOffline + ' dias). Conecte-se à internet para entrar.');
    }
    if (!(await conferirSenhaLocal(senha, g.credencial))) throw new Error('Senha incorreta.');
    g.desconectado = false;
    await gravarSessao(g);
    return estado();
  }

  async function entrarAuto(email, senha) {
    if (modoLocal()) return entrarLocal(email, senha);
    if (navigator.onLine) {
      try { return await entrar(email, senha); }
      catch (e) {
        const msg = String(e.message || '');
        if (msg === 'PENDENTE' || /incorret|recusado|bloqueado|confirme|cadastro n/i.test(msg)) throw e;
        try { return await entrarOffline(email, senha); } catch (e2) { throw e; }
      }
    }
    return entrarOffline(email, senha);
  }

  async function sair() {
    try {
      if (navigator.onLine && sessao && sessao.accessToken && !sessao.local) {
        await fetchTimeout(base() + '/auth/v1/logout', {
          method: 'POST', headers: { apikey: anon(), Authorization: 'Bearer ' + sessao.accessToken }
        }, 8000);
      }
    } catch (e) { /* sair é sempre possível */ }
    await limparSessao();
  }

  async function recuperarSenha(email) {
    if (modoLocal()) throw new Error('No modo local (sem base central) a senha não pode ser recuperada por e-mail. Peça ao administrador um novo cadastro.');
    if (!navigator.onLine) throw new Error('Sem internet.');
    const r = await fetchTimeout(base() + '/auth/v1/recover', {
      method: 'POST', headers: cabecalhosAnon(),
      body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), redirect_to: window.location.origin + window.location.pathname })
    }, 20000);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error('Falha ao enviar a recuperação: ' + (j.msg || j.message || r.status));
    }
    return true;
  }

  /** Renova token e relê o perfil (permissões e status podem ter mudado). */
  async function revalidar() {
    if (!sessao || sessao.desconectado) return false;
    if (sessao.local) {
      const u = await DB.obterUsuarioLocalPorEmail(sessao.email);
      if (u) {
        const p = Object.assign({}, u); delete p.credencial;
        sessao.perfil = p; await DB.kvSet(CHAVE_SESSAO, sessao); notificar();
        if (u.status !== 'ativo') return 'BLOQUEADO';
      }
      return true;
    }
    if (!sessao.refreshToken || !navigator.onLine || !configurado()) return false;
    try {
      const token = await obterToken(!dentroDaValidadeOffline());
      const linha = await carregarPerfil(sessao.usuarioId, token);
      if (linha) {
        sessao.perfil = linha;
        await DB.kvSet(CHAVE_SESSAO, sessao);
        notificar();
        if (linha.status !== 'ativo') return 'BLOQUEADO';
      }
      return true;
    } catch (e) { return false; }
  }

  async function marcarUltimoAcesso() {
    try {
      const cab = await cabecalhosAutenticados({ Prefer: 'return=minimal' });
      await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?id=eq.' + encodeURIComponent(sessao.usuarioId), {
        method: 'PATCH', headers: cab, body: JSON.stringify({ ultimo_acesso: new Date().toISOString(), dispositivo: DB.dispositivo() })
      }, 10000);
    } catch (e) { /* informativo */ }
  }
  async function informarSituacao(pendentes) {
    if (!sessao || sessao.local || modoLocal()) return;
    try {
      const cab = await cabecalhosAutenticados({ Prefer: 'return=minimal' });
      await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?id=eq.' + encodeURIComponent(sessao.usuarioId), {
        method: 'PATCH', headers: cab, body: JSON.stringify({ pendentes_envio: pendentes, ultimo_acesso: new Date().toISOString() })
      }, 10000);
    } catch (e) { /* informativo */ }
  }
  async function obterTokenAcesso() { try { return await obterToken(); } catch (e) { return null; } }

  /** Atualiza nome/telefone do próprio usuário. */
  async function atualizarMeusDados(campos) {
    if (sessao.local) {
      await DB.atualizarUsuarioLocal(sessao.usuarioId, campos);
    } else {
      const cab = await cabecalhosAutenticados({ Prefer: 'return=minimal' });
      const r = await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?id=eq.' + encodeURIComponent(sessao.usuarioId), {
        method: 'PATCH', headers: cab, body: JSON.stringify(campos)
      }, 15000);
      if (!r.ok) throw new Error('Não foi possível salvar (HTTP ' + r.status + ').');
    }
    Object.assign(sessao.perfil, campos);
    await DB.kvSet(CHAVE_SESSAO, sessao);
    notificar();
  }

  /* ===================================================================
   * ADMINISTRAÇÃO (somente admin — a RLS confirma no servidor)
   * =================================================================== */
  async function atualizarUsuario(id, campos) {
    const cab = await cabecalhosAutenticados({ Prefer: 'return=representation' });
    const r = await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: cab, body: JSON.stringify(campos)
    }, 20000);
    const t = await r.text();
    if (!r.ok) throw new Error('Falha ao atualizar: ' + t.slice(0, 180));
    let j = []; try { j = JSON.parse(t); } catch (e) {}
    if (Array.isArray(j) && !j.length) throw new Error('A base não aceitou a alteração (confira se você é administrador).');
    return j;
  }
  async function listarUsuarios() {
    const cab = await cabecalhosAutenticados();
    const r = await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?select=*&order=criado_em.desc', { headers: cab }, 20000);
    const j = await r.json().catch(() => []);
    if (!r.ok) throw new Error('Falha ao listar usuários: ' + (j.message || r.status));
    return j;
  }
  async function contarPendentesServidor() {
    if (!ehAdmin() || !navigator.onLine) return 0;
    try {
      const cab = await cabecalhosAutenticados();
      const r = await fetchTimeout(base() + '/rest/v1/' + CONFIG.supabase.tabelaUsuarios + '?status=eq.pendente&select=id', { headers: cab }, 15000);
      if (!r.ok) return 0;
      return (await r.json()).length;
    } catch (e) { return 0; }
  }

  function alvoAtualizar(id, campos) {
    if (modoLocal() || (sessao && sessao.local)) return DB.atualizarUsuarioLocal(id, campos);
    return atualizarUsuario(id, campos);
  }
  const admin = {
    listar: () => (modoLocal() || (sessao && sessao.local)) ? DB.listarUsuariosLocais() : listarUsuarios(),
    liberar: (id, permissoes) => alvoAtualizar(id, Object.assign({ status: 'ativo', permissoes: permissoes },
      (modoLocal() || (sessao && sessao.local)) ? { aprovado_em: new Date().toISOString() } : {})),
    definirPermissoes: (id, permissoes) => alvoAtualizar(id, { permissoes: permissoes }),
    recusar: (id) => alvoAtualizar(id, { status: 'recusado' }),
    bloquear: (id) => alvoAtualizar(id, { status: 'bloqueado' }),
    reativar: (id) => alvoAtualizar(id, { status: 'ativo' }),
    promover: (id) => alvoAtualizar(id, { perfil: 'admin' }),
    rebaixar: (id) => alvoAtualizar(id, { perfil: 'usuario' }),
    contarPendentes: async () => {
      if (!ehAdmin()) return 0;
      if (modoLocal() || (sessao && sessao.local)) return (await DB.listarUsuariosLocais()).filter(u => u.status === 'pendente').length;
      return contarPendentesServidor();
    }
  };

  async function iniciar() {
    await carregarSessao();
    // Base central ligada: sessão do modo local não vale mais.
    if (configurado() && sessao && !sessao.desconectado && sessao.local) {
      sessao.desconectado = true;
      await DB.kvSet(CHAVE_SESSAO, sessao);
    }
    if (typeof window !== 'undefined' && window.document) {
      setTimeout(() => { revalidar(); }, 1500);
      window.addEventListener('online', () => { revalidar(); });
    }
    return estado();
  }

  return {
    iniciar, estado, aoMudar, configurado, modoLocal,
    cadastrar, validarSenha, validarCadastro, entrar, entrarOffline, entrarAuto, sair, recuperarSenha, revalidar,
    autenticado, podeEnviar, usuarioId, perfil, ehAdmin, nivel, podeVer, podeEditar,
    obterToken, cabecalhosAutenticados, obterTokenAcesso, informarSituacao, atualizarMeusDados, admin
  };
})();

window.AUTH = AUTH;
