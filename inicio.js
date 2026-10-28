/* =====================================================================
 * inicio.js — TELA "INÍCIO" (visão geral do dia)
 * Indicadores do dia, mapa de quartos, ocupação dos últimos 7 dias,
 * chegadas e saídas de hoje, avisos automáticos e busca global.
 * ===================================================================== */

const INICIO = (function () {
  const { $, $$, esc, brl, pct, icone, dataCurta, dataExtenso } = APP;

  function saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  }

  /** Ocupação de um dia: quartos com estadia cobrindo a noite / quartos ativos. */
  function ocupacaoDia(d, dia, totalQuartos) {
    const ocup = d.reservas.filter(r => (r.status === 'hospedado' || r.status === 'finalizada') && r.entrada <= dia && r.saida > dia).length;
    return totalQuartos ? Math.min(1, ocup / totalQuartos) : 0;
  }

  function avisosAutomaticos(d) {
    const hoje = DB.hoje();
    const l = [];
    d.quartos.filter(q => q.ativo !== false && q.status_manual === 'mnt').forEach(q =>
      l.push({ cls: 'b-mnt', tag: 'Manutenção', txt: 'Quarto ' + q.numero + ' bloqueado' + (q.observacao ? ' — ' + q.observacao : '') + '.' }));
    d.reservas.filter(r => r.status === 'hospedado' && r.saida < hoje).forEach(r => {
      const q = d.quartoPorId[r.quarto_id];
      l.push({ cls: 'b-pd', tag: 'Saída vencida', txt: (q ? 'Quarto ' + q.numero : 'Quarto') + ' · ' + r.hospede_nome + ' deveria ter saído em ' + dataCurta(r.saida) + '.' });
    });
    if (AUTH.podeVer('movimento')) {
      d.reservas.filter(r => r.status === 'hospedado' && r.saida === hoje).forEach(r => {
        const c = DB.conta(d, r);
        if (c.saldo > 0.009) {
          const q = d.quartoPorId[r.quarto_id];
          l.push({ cls: 'b-res', tag: 'Financeiro', txt: 'Conta do quarto ' + (q ? q.numero : '') + ' com saldo de ' + brl(c.saldo) + ' antes do check-out.' });
        }
      });
    }
    const aguard = d.reservas.filter(r => r.status === 'reservada' && r.voucher_status !== 'enviado').length;
    if (aguard) l.push({ cls: 'b-ocp', tag: 'Voucher', txt: aguard + (aguard === 1 ? ' voucher emitido aguardando envio ao hóspede.' : ' vouchers emitidos aguardando envio ao hóspede.') });
    if (!d.categorias.length) l.push({ cls: 'b-res', tag: 'Cadastro', txt: 'Categorias de quarto e tarifas ainda não cadastradas (Configurações).' });
    if (AUTH.podeVer('financeiro')) {
      const venc = d.lancamentos.filter(x => x.tipo === 'receita' && x.status === 'a_receber' && x.vencimento && x.vencimento < hoje);
      if (venc.length) l.push({ cls: 'b-pd', tag: 'A receber', txt: venc.length + ' título(s) vencido(s): ' + brl(venc.reduce((s, x) => s + DB.num(x.valor), 0)) + '.' });
    }
    return l;
  }

  async function montar() {
    const el = $('#tela-inicio');
    const d = await APP.dados();
    const hoje = DB.hoje();
    const p = AUTH.perfil() || {};
    const quartos = d.quartos.filter(q => q.ativo !== false);
    const total = quartos.length;
    const st = {}; quartos.forEach(q => { st[q.id] = DB.statusQuarto(d, q); });
    const cont = { ocp: 0, liv: 0, res: 0, lmp: 0, mnt: 0 };
    quartos.forEach(q => cont[st[q.id]]++);
    const ocupacao = total ? cont.ocp / total : 0;

    const chegadas = d.reservas.filter(r => (r.status === 'reservada' && r.entrada === hoje) ||
      (r.status !== 'cancelada' && r.checkin_em && APP.dataLocalDeTs(r.checkin_em) === hoje))
      .sort((a, b) => (a.status === 'reservada' ? 0 : 1) - (b.status === 'reservada' ? 0 : 1));
    const chegFeitas = chegadas.filter(r => r.status !== 'reservada').length;
    const saidas = d.reservas.filter(r => (r.status === 'hospedado' && r.saida <= hoje) ||
      (r.status === 'finalizada' && APP.dataLocalDeTs(r.checkout_em) === hoje));
    const saiFeitas = saidas.filter(r => r.status === 'finalizada').length;

    const verFin = AUTH.podeVer('financeiro');
    const receitasHoje = d.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'recebido' && l.data === hoje);
    const receitaDia = receitasHoje.reduce((s, l) => s + DB.num(l.valor), 0);
    const naCasa = d.reservas.filter(r => r.status === 'hospedado').reduce((s, r) => s + (DB.num(r.adultos) || 0) + (DB.num(r.criancas) || 0), 0);

    // Últimos 7 dias
    const dias = [];
    for (let i = 6; i >= 0; i--) dias.push(DB.somarDias(hoje, -i));
    const ocup7 = dias.map(dia => ocupacaoDia(d, dia, total));
    const media7 = ocup7.reduce((s, v) => s + v, 0) / 7;
    const de7 = dias[0];
    let noites7 = 0, receita7 = 0, estadias7 = 0, permanencia = 0;
    DB.vendidas(d).forEach(r => {
      const n = DB.noitesNoPeriodo(r, de7, hoje);
      if (n > 0) { noites7 += n; receita7 += n * DB.num(r.diaria); estadias7++; permanencia += DB.noites(r); }
    });
    const adr = noites7 ? receita7 / noites7 : 0;
    const revpar = total ? receita7 / (total * 7) : 0;
    const perm = estadias7 ? permanencia / estadias7 : 0;
    const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Mapa de quartos por andar
    const andares = {};
    quartos.forEach(q => { const a = q.andar || 'Quartos'; (andares[a] = andares[a] || []).push(q); });
    let mapa = '';
    Object.keys(andares).sort((a, b) => String(b).localeCompare(String(a), 'pt-BR', { numeric: true })).forEach(a => {
      mapa += '<span class="andar-rotulo">' + esc(a) + '</span><div class="grade-tiles">';
      andares[a].forEach(q => {
        const s = st[q.id];
        mapa += '<button type="button" class="tile t-' + s + '" data-quarto="' + esc(q.id) + '" title="Quarto ' + esc(q.numero) + ' — ' + CONFIG.statusQuarto[s].label + '">' +
          esc(q.numero) + '<small>' + CONFIG.statusQuarto[s].curto + '</small></button>';
      });
      mapa += '</div>';
    });

    const linhaCheg = chegadas.slice(0, 8).map(r => {
      const q = d.quartoPorId[r.quarto_id]; const c = q && d.catPorId[q.categoria_id];
      const feito = r.status !== 'reservada';
      return '<tr class="clicavel" data-mov="' + esc(r.id) + '"><td class="forte">' + esc(r.hospede_nome) + '</td><td>' + esc(q ? q.numero : '—') + (c ? ' · ' + esc(c.nome) : '') + '</td>' +
        '<td>' + (feito ? APP.horaBR(r.checkin_em) : esc(d.hotel.horaCheckin || '14:00')) + '</td><td>' + DB.noites(r) + '</td>' +
        '<td><span class="badge ' + (feito ? 'b-liv">Check-in feito' : 'b-res">Aguardando') + '</span></td></tr>';
    }).join('');

    const linhaSai = saidas.slice(0, 6).map(r => {
      const q = d.quartoPorId[r.quarto_id];
      const feito = r.status === 'finalizada';
      const saldo = feito ? 0 : DB.conta(d, r).saldo;
      const sub = feito ? 'saída ' + APP.horaBR(r.checkout_em) : (saldo > 0.009 ? brl(saldo) + ' em aberto' : 'conta quitada') + (r.saida < DB.hoje() ? ' · vencida' : '');
      return '<div class="clicavel" data-mov="' + esc(r.id) + '" style="cursor:pointer"><div><div class="tit">' + esc(r.hospede_nome) + '</div><div class="sub">Quarto ' + esc(q ? q.numero : '—') + ' · ' + sub + '</div></div>' +
        '<span class="badge ' + (feito ? 'b-liv">Concluído' : 'b-mnt">Pendente') + '</span></div>';
    }).join('');

    const avisos = avisosAutomaticos(d);

    el.innerHTML =
      '<header class="cab-pagina"><div><h1>' + saudacao() + ', ' + esc(String(p.nome || 'recepção').split(' ')[0]) + '</h1>' +
      '<p>' + dataExtenso(hoje) + ' · Visão geral do dia</p></div>' +
      '<div class="acoes" style="flex:1 1 420px;justify-content:flex-end">' +
      '<div class="busca-global"><label class="busca">' + icone('busca', 18, 1.8) + '<span class="sr">Buscar</span>' +
      '<input type="search" id="ini-busca" placeholder="Buscar hóspede, quarto ou voucher" autocomplete="off"></label><div class="resultados" id="ini-resultados" hidden></div></div>' +
      '<div style="position:relative"><button type="button" class="btn btn-icone" id="ini-sino" aria-label="Avisos">' + icone('sino', 20) +
      (avisos.length ? '<span class="contador">' + avisos.length + '</span>' : '') + '</button></div>' +
      (AUTH.podeEditar('movimento') ? '<button type="button" class="btn btn-escuro" id="ini-checkin">' + icone('mais2', 18, 2) + 'Novo check-in</button>' : '') +
      '</div></header>' +

      '<section class="grade-kpis" aria-label="Indicadores do dia">' +
      '<div class="card pilha" style="gap:10px"><span class="kl">Taxa de ocupação</span><span class="kpi-valor">' + pct(ocupacao) + '</span>' +
      '<div class="trilho"><span style="width:' + (ocupacao * 100).toFixed(1) + '%"></span></div><span class="kpi-sub">' + cont.ocp + ' de ' + total + ' quartos ocupados</span></div>' +
      '<div class="card pilha" style="gap:10px"><span class="kl">Check-ins hoje</span><span class="kpi-valor">' + chegadas.length + '</span><span class="kpi-sub">' + chegFeitas + ' realizados · ' + (chegadas.length - chegFeitas) + ' previstos</span></div>' +
      '<div class="card pilha" style="gap:10px"><span class="kl">Check-outs hoje</span><span class="kpi-valor">' + saidas.length + '</span><span class="kpi-sub">' + saiFeitas + ' realizados · ' + (saidas.length - saiFeitas) + ' pendente(s)</span></div>' +
      (verFin
        ? '<div class="card card-escuro pilha" style="gap:10px"><span class="kl">Receita do dia</span><span class="kpi-valor">' + brl(receitaDia) + '</span><span class="kpi-sub">Recebimentos · ' + receitasHoje.length + ' lançamento(s)</span></div>'
        : '<div class="card card-escuro pilha" style="gap:10px"><span class="kl">Hóspedes na casa</span><span class="kpi-valor">' + naCasa + '</span><span class="kpi-sub">' + cont.ocp + ' quarto(s) ocupado(s)</span></div>') +
      '</section>' +

      '<div class="grade-2">' +
      '<section class="card pilha-16"><div class="linha-topo"><h2>Mapa de quartos</h2>' + (AUTH.podeVer('quartos') ? '<a href="#" id="ini-abrir-quartos">Abrir controle de quartos</a>' : '') + '</div>' +
      '<div class="chips" style="gap:8px">' + ['ocp', 'liv', 'res', 'lmp', 'mnt'].map(s => '<span class="badge b-' + s + '">' + CONFIG.statusQuarto[s].label + ' · ' + cont[s] + '</span>').join('') + '</div>' +
      '<div class="pilha" style="gap:10px">' + (mapa || '<p class="vazio">Nenhum quarto ativo.</p>') + '</div></section>' +

      '<section class="card pilha-16"><div class="linha-topo"><h2>Ocupação dos últimos 7 dias</h2><span class="kpi-sub">Média ' + pct(media7) + '</span></div>' +
      '<div class="barras" style="grid-template-columns:repeat(7,minmax(0,1fr))" role="img" aria-label="Ocupação diária dos últimos 7 dias">' +
      ocup7.map((v, i) => '<div class="col' + (i === 6 ? ' atual' : '') + '"><span>' + pct(v) + '</span><i style="height:' + Math.max(1, v * 180).toFixed(0) + 'px"></i></div>').join('') + '</div>' +
      '<div class="eixo" style="grid-template-columns:repeat(7,minmax(0,1fr))">' + dias.map((dia, i) => '<span' + (i === 6 ? ' style="font-weight:800;color:#231F20"' : '') + '>' + (i === 6 ? 'Hoje' : NOMES_DIA[new Date(dia + 'T12:00:00').getDay()]) + '</span>').join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-top:4px">' +
      '<div><span class="kpi-sub">Diária média</span><br><b style="font-size:18px">' + brl(adr) + '</b></div>' +
      '<div><span class="kpi-sub">RevPAR</span><br><b style="font-size:18px">' + brl(revpar) + '</b></div>' +
      '<div><span class="kpi-sub">Permanência média</span><br><b style="font-size:18px">' + APP.numBR(perm, 1) + ' noites</b></div></div></section>' +
      '</div>' +

      '<div class="grade-2">' +
      '<section class="card pilha"><div class="linha-topo"><h2>Chegadas de hoje</h2>' + (AUTH.podeVer('movimento') ? '<a href="#" data-ir-mov="chegadas">Ver todas</a>' : '') + '</div>' +
      (linhaCheg ? '<div class="rolagem"><table><thead><tr><th>Hóspede</th><th>Quarto</th><th>Previsão</th><th>Diárias</th><th>Situação</th></tr></thead><tbody>' + linhaCheg + '</tbody></table></div>'
                 : '<p class="vazio">Nenhuma chegada prevista para hoje.</p>') + '</section>' +
      '<div class="pilha-16">' +
      '<section class="card pilha"><div class="linha-topo"><h2>Saídas de hoje</h2>' + (AUTH.podeVer('movimento') ? '<a href="#" data-ir-mov="saidas">Fechar contas</a>' : '') + '</div>' +
      (linhaSai ? '<div class="lista-linhas">' + linhaSai + '</div>' : '<p class="vazio">Nenhuma saída prevista para hoje.</p>') + '</section>' +
      '<section class="card pilha"><h2>Avisos</h2>' +
      (avisos.length ? avisos.map(a => '<div style="display:flex;gap:10px;align-items:flex-start;font-size:14px"><span class="badge ' + a.cls + '">' + esc(a.tag) + '</span><span>' + esc(a.txt) + '</span></div>').join('')
                     : '<p class="vazio">Nenhum aviso no momento.</p>') + '</section>' +
      '</div></div>';

    // Ações
    const q = $('#ini-abrir-quartos', el); if (q) q.onclick = (e) => { e.preventDefault(); APP.ir('tela-quartos'); };
    $$('[data-ir-mov]', el).forEach(a => a.onclick = (e) => { e.preventDefault(); APP.ir('tela-movimento', { aba: a.dataset.irMov }); });
    $$('[data-mov]', el).forEach(tr => tr.onclick = () => { if (AUTH.podeVer('movimento')) APP.ir('tela-movimento', { reserva: tr.dataset.mov }); });
    $$('[data-quarto]', el).forEach(b => b.onclick = () => { if (AUTH.podeVer('quartos')) APP.ir('tela-quartos', { sel: b.dataset.quarto }); });
    const ck = $('#ini-checkin', el); if (ck) ck.onclick = () => APP.ir('tela-movimento', { walkin: true });
    $('#ini-sino', el).onclick = () => {
      APP.janela({ titulo: 'Avisos', html: avisos.length
        ? avisos.map(a => '<div style="display:flex;gap:10px;align-items:flex-start"><span class="badge ' + a.cls + '">' + esc(a.tag) + '</span><span>' + esc(a.txt) + '</span></div>').join('')
        : '<p class="vazio">Nenhum aviso no momento.</p>' });
    };
    ligarBusca(d);
  }

  function ligarBusca(d) {
    const inp = $('#ini-busca'), res = $('#ini-resultados');
    const buscar = () => {
      const t = inp.value.trim().toLowerCase();
      if (t.length < 2) { res.hidden = true; return; }
      const itens = [];
      d.quartos.filter(q => String(q.numero).toLowerCase() === t || ('quarto ' + q.numero).toLowerCase().indexOf(t) === 0).slice(0, 3).forEach(q =>
        itens.push({ tit: 'Quarto ' + q.numero, sub: CONFIG.statusQuarto[DB.statusQuarto(d, q)].label, ir: () => APP.ir('tela-quartos', { sel: q.id }), pode: AUTH.podeVer('quartos') }));
      d.reservas.filter(r => String(r.codigo || '').toLowerCase().indexOf(t) !== -1 || String(r.hospede_nome || '').toLowerCase().indexOf(t) !== -1)
        .sort((a, b) => b.entrada < a.entrada ? -1 : 1).slice(0, 6).forEach(r => {
          const q = d.quartoPorId[r.quarto_id];
          itens.push({ tit: r.codigo + ' · ' + r.hospede_nome, sub: 'Quarto ' + (q ? q.numero : '—') + ' · ' + dataCurta(r.entrada) + ' a ' + dataCurta(r.saida) + ' · ' + r.status,
            ir: () => APP.ir(r.status === 'reservada' && AUTH.podeVer('voucher') ? 'tela-voucher' : 'tela-movimento', r.status === 'reservada' ? { reserva: r.id } : { reserva: r.id }),
            pode: AUTH.podeVer('voucher') || AUTH.podeVer('movimento') });
        });
      d.hospedes.filter(h => String(h.nome || '').toLowerCase().indexOf(t) !== -1 || APP.soDigitos(h.cpf).indexOf(APP.soDigitos(t) || '#') === 0)
        .slice(0, 6).forEach(h => itens.push({ tit: h.nome, sub: (h.cidade ? h.cidade + '/' + (h.uf || '') : 'Hóspede') + (h.telefone ? ' · ' + h.telefone : ''),
          ir: () => APP.ir('tela-hospedes', { hospede: h.id }), pode: AUTH.podeVer('hospedes') }));
      const ok = itens.filter(i => i.pode);
      res.innerHTML = ok.length ? ok.map((i, n) => '<button type="button" data-n="' + n + '"><span><b>' + esc(i.tit) + '</b><br><small>' + esc(i.sub) + '</small></span></button>').join('')
                                : '<p class="vazio">Nada encontrado.</p>';
      $$('button', res).forEach(b => b.onclick = () => ok[Number(b.dataset.n)].ir());
      res.hidden = false;
    };
    inp.addEventListener('input', buscar);
    inp.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 200));
    inp.addEventListener('focus', buscar);
  }

  return { montar: montar };
})();

window.INICIO = INICIO;
