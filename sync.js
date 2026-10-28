/* =====================================================================
 * sync.js — SINCRONIZAÇÃO COM A BASE CENTRAL (Supabase)
 * ---------------------------------------------------------------------
 * IDA   — todo registro salvo no aparelho entra na fila (sync =
 *         'pendente') e sobe assim que houver internet (upsert por id).
 * VOLTA — por cursor "recebido_em" de cada tabela, paginado. Nunca
 *         sobrescreve uma edição local pendente mais nova.
 * Ciclo: a cada 30 s, ao abrir, ao esconder a página, ao voltar a rede,
 * por Background Sync (Android) e na hora em que o tempo real avisa.
 * Tabela que ainda não existe na base (script não rodado) é detectada
 * (404 / PGRST205): o dado fica guardado no aparelho e sobe depois.
 * ===================================================================== */

const SYNC = (function () {

  let emExecucao = false;
  let timer = null;
  const ouvintes = [];
  const tabelasAusentes = new Set();

  const S = () => CONFIG.supabase || {};
  function base() { return String(S().url || '').replace(/\/+$/, ''); }
  function ativo() { return !!(window.AUTH && AUTH.configurado() && !AUTH.modoLocal()); }

  async function fetchTimeout(url, opcoes, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 20000);
    try { return await fetch(url, Object.assign({}, opcoes || {}, { signal: ctrl.signal })); }
    finally { clearTimeout(t); }
  }

  async function online() {
    if (!navigator.onLine || !ativo()) return false;
    try {
      const r = await fetchTimeout(base() + '/auth/v1/health', { headers: { apikey: S().anonKey }, cache: 'no-store' }, 6000);
      return !!r && r.status < 500;
    } catch (e) { return false; }
  }

  function aoMudar(fn) { ouvintes.push(fn); }
  function notificar(evento, dados) { ouvintes.forEach(fn => { try { fn(evento, dados); } catch (e) {} }); }

  function tabelaFaltando(status, texto) {
    return status === 404 || /PGRST205|Could not find the table|relation .* does not exist/i.test(texto || '');
  }

  /* ---------- IDA ---------- */
  async function enviarUm(tabela, reg) {
    const linha = DB.paraEnvio(tabela, reg);
    const cab = await AUTH.cabecalhosAutenticados({ Prefer: 'resolution=merge-duplicates,return=minimal' });
    const r = await fetchTimeout(base() + '/rest/v1/' + tabela + '?on_conflict=id', {
      method: 'POST', headers: cab, body: JSON.stringify(linha)
    }, 30000);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 401) throw new Error('SESSAO_EXPIRADA');
      if (tabelaFaltando(r.status, t)) { tabelasAusentes.add(tabela); throw new Error('TABELA_AUSENTE'); }
      if (r.status === 403 || /row-level security|violates/i.test(t)) {
        throw new Error('Gravação recusada pela base: seu acesso não permite alterar ' + tabela + '.');
      }
      throw new Error('Base respondeu ' + r.status + ': ' + t.slice(0, 160));
    }
  }

  async function enviarFila(manual) {
    let fila = await DB.listarPendentes();
    if (!manual) fila = fila.filter(x => (x.reg.tentativas || 0) < CONFIG.sync.maxTentativas);
    const resumo = { enviados: 0, falhas: 0, aguardandoTabela: 0 };
    // Ordem que respeita dependências (categoria antes de quarto, reserva antes de consumo)
    const ordem = DB.TABELAS;
    fila.sort((a, b) => ordem.indexOf(a.tabela) - ordem.indexOf(b.tabela));
    for (const item of fila) {
      if (tabelasAusentes.has(item.tabela)) { resumo.aguardandoTabela++; continue; }
      try {
        await enviarUm(item.tabela, item.reg);
        await DB.marcarEnviado(item.tabela, item.reg.id, item.reg.atualizado_em);
        resumo.enviados++;
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (msg === 'TABELA_AUSENTE') { resumo.aguardandoTabela++; continue; }
        await DB.marcarErro(item.tabela, item.reg.id, msg === 'SESSAO_EXPIRADA' ? 'Sessão expirada — entre novamente.' : msg);
        resumo.falhas++;
        if (msg === 'SESSAO_EXPIRADA') throw e;
      }
    }
    return resumo;
  }

  /* ---------- VOLTA ---------- */
  // Lançamentos: o que a base devolve depende do acesso (financeiro vê tudo,
  // recepção só os da conta do hóspede). Mudou o acesso, recomeça o cursor.
  function chaveCursor(t) {
    let k = 'cursor:' + t + ':' + AUTH.usuarioId();
    if (t === 'lancamentos') k += (AUTH.podeVer('financeiro') || AUTH.podeVer('relatorios')) ? ':todos' : ':contas';
    return k;
  }

  async function receberTabela(tabela) {
    let cursor = await DB.kvGet(chaveCursor(tabela), '1970-01-01T00:00:00Z');
    let total = 0;
    for (let pagina = 0; pagina < 50; pagina++) {
      const url = base() + '/rest/v1/' + tabela + '?select=*&recebido_em=gt.' + encodeURIComponent(cursor) +
                  '&order=recebido_em.asc&limit=500';
      const cab = await AUTH.cabecalhosAutenticados();
      const r = await fetchTimeout(url, { headers: cab }, 30000);
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (r.status === 401) throw new Error('SESSAO_EXPIRADA');
        if (tabelaFaltando(r.status, t)) { tabelasAusentes.add(tabela); return 0; }
        throw new Error('Falha ao receber ' + tabela + ' (HTTP ' + r.status + ').');
      }
      tabelasAusentes.delete(tabela);
      const linhas = await r.json();
      for (const l of linhas) {
        if (await DB.receber(tabela, l)) total++;
        cursor = l.recebido_em;
      }
      await DB.kvSet(chaveCursor(tabela), cursor);
      if (linhas.length < 500) break;
    }
    return total;
  }

  async function receber() {
    let total = 0;
    for (const t of DB.TABELAS) {
      // Lançamentos: só para quem pode ver algo financeiro (a RLS filtra o resto)
      if (t === 'lancamentos' && !(AUTH.podeVer('financeiro') || AUTH.podeVer('relatorios') || AUTH.podeVer('movimento'))) continue;
      try { total += await receberTabela(t); }
      catch (e) { if (String(e.message) === 'SESSAO_EXPIRADA') throw e; }
    }
    if (total) DB.notificar('*');
    return total;
  }

  /* ---------- CICLO ---------- */
  async function sincronizar(manual) {
    if (emExecucao || !ativo() || !AUTH.autenticado()) return { pulado: true };
    if (!AUTH.podeEnviar() && navigator.onLine) await AUTH.revalidar();
    if (!AUTH.podeEnviar()) return { pulado: true, sessaoExpirada: true };
    if (!(await online())) { notificar('rede', { online: false }); agendarSegundoPlano(); return { pulado: true, offline: true }; }

    emExecucao = true;
    if (manual) tabelasAusentes.clear();
    notificar('inicio');
    const resumo = { enviados: 0, falhas: 0, recebidos: 0 };
    try {
      const st = await AUTH.revalidar();
      if (st === 'BLOQUEADO') { resumo.bloqueado = true; return resumo; }
      Object.assign(resumo, await enviarFila(manual));
      resumo.recebidos = await receber();
      resumo.tabelasAusentes = Array.from(tabelasAusentes);
      await DB.kvSet('ultimaSincronizacao:' + AUTH.usuarioId(), new Date().toISOString());
      try { AUTH.informarSituacao(await DB.contarPendentes()); } catch (e) {}
    } catch (e) {
      resumo.erro = (e && e.message) || String(e);
    } finally {
      emExecucao = false;
      notificar('fim', resumo);
      if (resumo.falhas || resumo.erro) agendarSegundoPlano();
    }
    return resumo;
  }

  function agendarSegundoPlano() {
    try {
      if (!ativo() || typeof window === 'undefined' || !window.document) return;
      if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
      navigator.serviceWorker.ready.then(reg => reg.sync && reg.sync.register('enviar-hotel')).catch(() => {});
    } catch (e) {}
  }

  /* ---------- TEMPO REAL (Supabase Realtime / Phoenix) ---------- */
  const TOPICO = 'realtime:hotel-estilo-fino';
  const rt = { ws: null, ref: 0, batimento: null, espera: 5000, timerReconexao: null, timerBusca: null, conectado: false, tokenEnviado: null };
  function rtEnviar(msg) { if (rt.ws && rt.ws.readyState === 1) rt.ws.send(JSON.stringify(msg)); }
  function rtFechar() {
    clearInterval(rt.batimento); clearTimeout(rt.timerReconexao);
    if (rt.ws) { try { rt.ws.onclose = null; rt.ws.close(); } catch (e) {} }
    rt.ws = null; rt.conectado = false;
  }
  function rtAgendarReconexao() {
    clearTimeout(rt.timerReconexao);
    rt.timerReconexao = setTimeout(tempoReal, rt.espera);
    rt.espera = Math.min(rt.espera * 2, 120000);
  }
  async function tempoReal() {
    try {
      if (typeof WebSocket === 'undefined' || !ativo() || !AUTH.autenticado()) { rtFechar(); return; }
      if (rt.ws && (rt.ws.readyState === 0 || rt.ws.readyState === 1)) return;
      if (!navigator.onLine) { rtAgendarReconexao(); return; }
      const token = await AUTH.obterTokenAcesso();
      if (!token) { rtAgendarReconexao(); return; }
      const url = base().replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(S().anonKey) + '&vsn=1.0.0';
      const ws = new WebSocket(url);
      rt.ws = ws;
      ws.onopen = () => {
        rt.ref = 0;
        const ref = String(++rt.ref);
        rt.tokenEnviado = token;
        rtEnviar({
          topic: TOPICO, event: 'phx_join', ref: ref, join_ref: ref,
          payload: {
            config: {
              broadcast: { ack: false, self: false }, presence: { key: '' }, private: false,
              postgres_changes: DB.TABELAS.map(t => ({ event: '*', schema: 'public', table: t }))
            },
            access_token: token
          }
        });
        clearInterval(rt.batimento);
        rt.batimento = setInterval(async () => {
          rtEnviar({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++rt.ref) });
          try {
            const novo = await AUTH.obterTokenAcesso();
            if (novo && novo !== rt.tokenEnviado) {
              rt.tokenEnviado = novo;
              rtEnviar({ topic: TOPICO, event: 'access_token', payload: { access_token: novo }, ref: String(++rt.ref) });
            }
          } catch (e) {}
        }, 25000);
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event === 'phx_reply' && m.topic === TOPICO && m.payload && m.payload.status === 'ok') {
          rt.conectado = true; rt.espera = 5000; notificar('tempo-real', { conectado: true });
        }
        if (m.event === 'postgres_changes') {
          clearTimeout(rt.timerBusca);
          rt.timerBusca = setTimeout(() => sincronizar(false), 700);
        }
        if (m.event === 'phx_error' || (m.event === 'system' && m.payload && m.payload.status === 'error')) {
          rtFechar(); rtAgendarReconexao();
        }
      };
      ws.onclose = () => { rt.conectado = false; clearInterval(rt.batimento); notificar('tempo-real', { conectado: false }); rtAgendarReconexao(); };
      ws.onerror = () => {};
    } catch (e) { rtAgendarReconexao(); }
  }

  async function ultimaSincronizacao() {
    if (!AUTH.usuarioId()) return null;
    return DB.kvGet('ultimaSincronizacao:' + AUTH.usuarioId(), null);
  }

  let iniciado = false;
  function iniciar() {
    if (!ativo() || iniciado) return;
    iniciado = true;
    window.addEventListener('online', () => { notificar('rede', { online: true }); sincronizar(false); tempoReal(); });
    window.addEventListener('offline', () => { notificar('rede', { online: false }); agendarSegundoPlano(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { sincronizar(false); tempoReal(); }
      else { sincronizar(false); agendarSegundoPlano(); }
    });
    window.addEventListener('pagehide', () => { sincronizar(false); agendarSegundoPlano(); });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'sincronizar') sincronizar(false); });
    }
    // Gravou algo no aparelho: tenta enviar logo (agrupando rajadas)
    let timerLocal = null;
    DB.aoMudar((t) => { if (t === '*') return; clearTimeout(timerLocal); timerLocal = setTimeout(() => sincronizar(false), 1200); });
    setTimeout(tempoReal, 2500);
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') sincronizar(false); }, (CONFIG.sync.intervaloSegundos || 30) * 1000);
    setTimeout(() => sincronizar(false), 800);
  }

  return {
    iniciar, sincronizar, online, ativo, aoMudar, ultimaSincronizacao, agendarSegundoPlano, tempoReal,
    tempoRealAtivo: () => rt.conectado,
    tabelasAusentes: () => Array.from(tabelasAusentes)
  };
})();

window.SYNC = SYNC;
