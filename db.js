/* =====================================================================
 * db.js — BANCO LOCAL (IndexedDB via Dexie) E REGRAS DO HOTEL
 * ---------------------------------------------------------------------
 * Offline primeiro: tudo grava no aparelho com sync = 'pendente' e sobe
 * para a base central depois (sync.js). O que chega da base entra com
 * sync = 'sincronizado' e nunca sobrescreve uma edição local pendente.
 *
 * Também concentra as regras de negócio que várias telas usam:
 * status do quarto, noites, contas da estadia, conflitos de reserva.
 * ===================================================================== */

const DB = (function () {

  const db = new Dexie('hotel-estilo-fino');
  db.version(1).stores({
    kv: 'chave',
    usuariosLocais: 'id, email',
    categorias: 'id, sync',
    quartos: 'id, sync',
    hospedes: 'id, sync, nome, cpf',
    reservas: 'id, sync, quarto_id, hospede_id, status, entrada, saida',
    consumos: 'id, sync, reserva_id',
    lancamentos: 'id, sync, data, reserva_id',
    parametros: 'id, sync'
  });

  const TABELAS = Object.keys(CONFIG.tabelas);
  const LOCAIS = ['sync', 'erro_sync', 'tentativas'];

  /* ===================================================================
   * Utilidades
   * =================================================================== */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function agoraISO() { return new Date().toISOString(); }
  function hoje() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function somarDias(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function diasEntre(a, b) {
    if (!a || !b) return 0;
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function dispositivo() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'Mac';
    return 'Navegador';
  }

  /* ===================================================================
   * Chave-valor (sessão, cursores, preferências)
   * =================================================================== */
  async function kvGet(chave, padrao) {
    const r = await db.kv.get(chave);
    return r ? r.valor : (padrao === undefined ? null : padrao);
  }
  async function kvSet(chave, valor) { await db.kv.put({ chave: chave, valor: valor }); }

  /* ===================================================================
   * Contas locais (modo local, sem base central)
   * =================================================================== */
  async function obterUsuarioLocalPorEmail(email) {
    return db.usuariosLocais.where('email').equals(String(email || '').trim().toLowerCase()).first();
  }
  async function contarUsuariosLocais() { return db.usuariosLocais.count(); }
  async function criarUsuarioLocal(d) {
    const u = Object.assign({
      id: uuid(), status: 'ativo', permissoes: {}, criado_em: agoraISO()
    }, d, { email: String(d.email).trim().toLowerCase() });
    await db.usuariosLocais.put(u);
    return u;
  }
  async function atualizarUsuarioLocal(id, campos) {
    await db.usuariosLocais.update(id, campos);
    return db.usuariosLocais.get(id);
  }
  async function listarUsuariosLocais() {
    const l = await db.usuariosLocais.toArray();
    return l.map(u => { const c = Object.assign({}, u); delete c.credencial; return c; });
  }

  /* ===================================================================
   * CRUD genérico das tabelas do hotel
   * =================================================================== */
  const ouvintes = [];
  function aoMudar(fn) { ouvintes.push(fn); }
  function notificar(tabela) { ouvintes.forEach(fn => { try { fn(tabela); } catch (e) {} }); }

  /** Normaliza: vazio vira null; mantém só colunas conhecidas + locais. */
  function normalizar(tabela, obj) {
    const permitidas = CONFIG.colunasComuns.concat(CONFIG.tabelas[tabela], LOCAIS, ['criado_por', 'atualizado_por', 'recebido_em']);
    const o = {};
    permitidas.forEach(c => {
      if (obj[c] === undefined) return;
      o[c] = (obj[c] === '' ? null : obj[c]);
    });
    return o;
  }

  async function salvar(tabela, dados) {
    const atual = dados.id ? await db[tabela].get(dados.id) : null;
    const agora = agoraISO();
    const reg = normalizar(tabela, Object.assign({}, atual || {}, dados));
    reg.id = reg.id || uuid();
    reg.criado_em = reg.criado_em || agora;
    // Garante ordem crescente mesmo com relógio igual (duas gravações no mesmo ms)
    reg.atualizado_em = (atual && atual.atualizado_em >= agora)
      ? new Date(new Date(atual.atualizado_em).getTime() + 1).toISOString() : agora;
    reg.excluido = !!reg.excluido;
    reg.sync = 'pendente';
    reg.erro_sync = null;
    reg.tentativas = 0;
    await db[tabela].put(reg);
    notificar(tabela);
    return reg;
  }

  async function excluir(tabela, id) {
    const r = await db[tabela].get(id);
    if (!r) return null;
    return salvar(tabela, Object.assign({}, r, { excluido: true }));
  }

  async function obter(tabela, id) {
    if (!id) return null;
    const r = await db[tabela].get(id);
    return (r && !r.excluido) ? r : null;
  }

  async function listar(tabela) {
    const l = await db[tabela].toArray();
    return l.filter(r => !r.excluido);
  }

  /* ---------- Fila de envio ---------- */
  async function listarPendentes() {
    const out = [];
    for (const t of TABELAS) {
      const l = await db[t].where('sync').anyOf('pendente', 'erro').toArray();
      l.forEach(r => out.push({ tabela: t, reg: r }));
    }
    return out;
  }
  async function contarPendentes() { return (await listarPendentes()).length; }

  /** Linha pronta para a base: só as colunas da tabela. */
  function paraEnvio(tabela, reg) {
    const o = {};
    CONFIG.colunasComuns.concat(CONFIG.tabelas[tabela]).forEach(c => {
      let v = reg[c];
      if (v === undefined || v === '') v = null;
      o[c] = v;
    });
    if (o.excluido === null) o.excluido = false;
    return o;
  }

  async function marcarEnviado(tabela, id, atualizadoEm) {
    const r = await db[tabela].get(id);
    // Só marca se ninguém editou de novo enquanto o envio acontecia
    if (r && r.atualizado_em === atualizadoEm) {
      await db[tabela].update(id, { sync: 'sincronizado', erro_sync: null, tentativas: 0 });
    }
  }
  async function marcarErro(tabela, id, msg) {
    const r = await db[tabela].get(id);
    if (r) await db[tabela].update(id, { sync: 'erro', erro_sync: msg, tentativas: (r.tentativas || 0) + 1 });
  }

  /** Grava o que veio da base. Não pisa em edição local pendente mais nova. */
  async function receber(tabela, linha) {
    const local = await db[tabela].get(linha.id);
    if (local && local.sync !== 'sincronizado' && local.atualizado_em > linha.atualizado_em) return false;
    const reg = normalizar(tabela, linha);
    ['diaria', 'valor', 'quantidade'].forEach(c => { if (reg[c] !== undefined && reg[c] !== null) reg[c] = num(reg[c]); });
    reg.sync = 'sincronizado'; reg.erro_sync = null; reg.tentativas = 0;
    await db[tabela].put(reg);
    return true;
  }

  /* ===================================================================
   * Carga inicial (somente se o aparelho estiver vazio)
   * Os registros nascem "sincronizados" com data antiga: a base central
   * já tem os mesmos (01-estrutura.sql) e qualquer ajuste feito lá vence.
   * =================================================================== */
  async function cargaInicial() {
    const ANTIGO = '2026-01-01T00:00:00.000Z';
    if (!(await db.quartos.count())) {
      const l = [];
      for (let n = 1; n <= CONFIG.quartosIniciais; n++) {
        const num2 = String(n).padStart(2, '0');
        l.push({ id: 'q' + num2, numero: num2, andar: null, categoria_id: null, status_manual: 'liv',
                 observacao: null, ativo: true, ordem: n, criado_em: ANTIGO, atualizado_em: ANTIGO,
                 excluido: false, sync: 'sincronizado' });
      }
      await db.quartos.bulkPut(l);
    }
    if (!(await db.parametros.get('hotel'))) {
      await db.parametros.put({ id: 'hotel', dados: parametrosPadrao(), criado_em: ANTIGO, atualizado_em: ANTIGO,
                                excluido: false, sync: 'sincronizado' });
    }
  }
  function parametrosPadrao() {
    return {
      nome: 'Hotel Estilo Fino', endereco: '', cidade: 'Ribeiro Gonçalves', uf: 'PI', telefone: '', email: '',
      cnpj: '', horaCheckin: '14:00', horaCheckout: '12:00',
      politica: 'Apresente este voucher e um documento com foto no check-in. Cancelamento sem custo até 48h antes da entrada.'
    };
  }
  async function hotel() {
    const p = await db.parametros.get('hotel');
    return Object.assign(parametrosPadrao(), (p && p.dados) || {});
  }

  /* ===================================================================
   * REGRAS DO HOTEL
   * =================================================================== */

  /** Carrega tudo o que as telas costumam cruzar, de uma vez. */
  async function carregarTudo() {
    const [categorias, quartos, hospedes, reservas, consumos, lancamentos, h] = await Promise.all([
      listar('categorias'), listar('quartos'), listar('hospedes'), listar('reservas'),
      listar('consumos'), listar('lancamentos'), hotel()
    ]);
    categorias.sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    quartos.sort(ordenarQuartos);
    const catPorId = {}; categorias.forEach(c => { catPorId[c.id] = c; });
    const quartoPorId = {}; quartos.forEach(q => { quartoPorId[q.id] = q; });
    return { categorias, quartos, hospedes, reservas, consumos, lancamentos, hotel: h, catPorId, quartoPorId };
  }

  function ordenarQuartos(a, b) {
    return (a.ordem || 0) - (b.ordem || 0) ||
      String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true });
  }

  /** Reserva que ocupa o quarto agora (hóspede dentro). */
  function estadiaAtiva(dados, quartoId) {
    return dados.reservas.find(r => r.quarto_id === quartoId && r.status === 'hospedado') || null;
  }

  /** Próxima reserva confirmada do quarto que cobre a data (ou chega nela). */
  function reservaDoDia(dados, quartoId, dia) {
    dia = dia || hoje();
    return dados.reservas
      .filter(r => r.quarto_id === quartoId && r.status === 'reservada' && r.entrada <= dia && r.saida > dia)
      .sort((a, b) => a.entrada < b.entrada ? -1 : 1)[0] || null;
  }

  /**
   * Status exibido: ocupado e reservado vêm das estadias; limpeza e
   * manutenção são marcações manuais; o resto é livre.
   */
  function statusQuarto(dados, q) {
    if (estadiaAtiva(dados, q.id)) return 'ocp';
    if (q.status_manual === 'lmp' || q.status_manual === 'mnt') return q.status_manual;
    if (reservaDoDia(dados, q.id)) return 'res';
    return 'liv';
  }

  function noites(r) { return Math.max(0, diasEntre(r.entrada, r.saida)); }

  /** Reservas que disputam o mesmo quarto no período (exceto a própria). */
  function conflitos(dados, quartoId, entrada, saida, ignorarId) {
    return dados.reservas.filter(r =>
      r.id !== ignorarId && r.quarto_id === quartoId &&
      (r.status === 'reservada' || r.status === 'hospedado') &&
      r.entrada < saida && entrada < r.saida);
  }

  /** Conta da estadia: diárias + consumos − pagamentos. */
  function conta(dados, r) {
    const n = noites(r);
    const diarias = n * num(r.diaria);
    const cons = dados.consumos.filter(c => c.reserva_id === r.id);
    const totalConsumo = cons.reduce((s, c) => s + num(c.valor) * (num(c.quantidade) || 1), 0);
    const pags = dados.lancamentos.filter(l => l.reserva_id === r.id && l.tipo === 'receita');
    const pago = pags.reduce((s, l) => s + num(l.valor), 0);
    const total = diarias + totalConsumo;
    return { noites: n, diarias: diarias, consumos: cons, totalConsumo: totalConsumo, pagamentos: pags,
             pago: pago, total: total, saldo: Math.round((total - pago) * 100) / 100 };
  }

  /** Noites ocupadas de uma estadia dentro de [de, ate] (inclusive). */
  function noitesNoPeriodo(r, de, ate) {
    const ini = r.entrada > de ? r.entrada : de;
    const fimExc = r.saida < somarDias(ate, 1) ? r.saida : somarDias(ate, 1);
    return Math.max(0, diasEntre(ini, fimExc));
  }

  /** Estadias realizadas (hóspede entrou): base de ocupação e receita de hospedagem. */
  function vendidas(dados) {
    return dados.reservas.filter(r => r.status === 'hospedado' || r.status === 'finalizada');
  }

  function codigoVoucher() {
    const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const a = crypto.getRandomValues(new Uint8Array(5));
    for (let i = 0; i < 5; i++) s += letras[a[i] % letras.length];
    return CONFIG.app.prefixoVoucher + '-' + new Date().getFullYear() + '-' + s;
  }

  /* ===================================================================
   * Backup (exportar / importar tudo)
   * =================================================================== */
  async function exportarTudo() {
    const out = { app: CONFIG.app.nome, versao: CONFIG.app.versao, gerado_em: agoraISO(), tabelas: {} };
    for (const t of TABELAS) out.tabelas[t] = await db[t].toArray();
    return out;
  }
  async function importarTudo(obj) {
    if (!obj || !obj.tabelas) throw new Error('Arquivo de backup inválido.');
    let n = 0;
    for (const t of TABELAS) {
      const l = obj.tabelas[t] || [];
      for (const r of l) {
        const atual = await db[t].get(r.id);
        if (atual && atual.atualizado_em >= r.atualizado_em) continue;
        await db[t].put(Object.assign({}, r, { sync: 'pendente' }));
        n++;
      }
    }
    notificar('*');
    return n;
  }

  /** Apaga os dados do hotel neste aparelho (mantém sessão). */
  async function limparDadosHotel() {
    for (const t of TABELAS) await db[t].clear();
    const chaves = await db.kv.toArray();
    for (const k of chaves) if (/^cursor:/.test(k.chave)) await db.kv.delete(k.chave);
    await cargaInicial();
  }

  return {
    db: db, uuid: uuid, agoraISO: agoraISO, hoje: hoje, somarDias: somarDias, diasEntre: diasEntre, num: num,
    dispositivo: dispositivo, kvGet: kvGet, kvSet: kvSet,
    obterUsuarioLocalPorEmail, contarUsuariosLocais, criarUsuarioLocal, atualizarUsuarioLocal, listarUsuariosLocais,
    TABELAS: TABELAS, salvar, excluir, obter, listar, aoMudar, notificar,
    listarPendentes, contarPendentes, paraEnvio, marcarEnviado, marcarErro, receber,
    cargaInicial, hotel, parametrosPadrao, carregarTudo, ordenarQuartos,
    estadiaAtiva, reservaDoDia, statusQuarto, noites, conflitos, conta, noitesNoPeriodo, vendidas, codigoVoucher,
    exportarTudo, importarTudo, limparDadosHotel
  };
})();

window.DB = DB;
