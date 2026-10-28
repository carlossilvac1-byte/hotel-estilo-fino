/* =====================================================================
 * relatorios.js — RELATÓRIOS
 * Catálogo de 6 relatórios com período, categoria e agrupamento.
 * Cada relatório gera indicadores + tabela, exportados em Excel (CSV)
 * e PDF (mesma estrutura).
 * ===================================================================== */

const RELATORIOS = (function () {
  const { $, $$, esc, brl, icone, opcoes, dataBR, dataCurta, numBR } = APP;

  const CAT = [
    ['oc', 'Ocupação', 'Taxa de ocupação, noites vendidas, ADR e RevPAR por categoria ou período', 'Relatório de ocupação'],
    ['fin', 'Financeiro (DRE)', 'Receitas, despesas e resultado do período', 'Relatório financeiro (DRE)'],
    ['hos', 'Hóspedes', 'Perfil, origem, frequência e motivo da viagem', 'Relatório de hóspedes'],
    ['mov', 'Entradas e saídas', 'Check-ins e check-outs realizados por dia', 'Relatório de entradas e saídas'],
    ['vou', 'Vouchers emitidos', 'Vouchers por status de envio e forma de pagamento', 'Relatório de vouchers'],
    ['fnrh', 'FNRH / Ministério do Turismo', 'Registro de hóspedes do período para conferência e envio oficial', 'FNRH — Registro de hóspedes']
  ];
  const st = { sel: 'oc', de: null, ate: null, categoria: '', agrupar: 'Categoria', ultimo: null };

  function iniMes() { return DB.hoje().slice(0, 8) + '01'; }
  function dias(de, ate) { const l = []; let d = de; while (d <= ate && l.length < 1000) { l.push(d); d = DB.somarDias(d, 1); } return l; }
  function chaveGrupo(dia, modo) {
    if (modo === 'Dia') return dia;
    if (modo === 'Mês') return dia.slice(0, 7);
    const dt = new Date(dia + 'T12:00:00'); const dw = (dt.getDay() + 6) % 7;
    return DB.somarDias(dia, -dw);
  }
  function rotuloGrupo(k, modo) {
    if (modo === 'Dia') return dataBR(k);
    if (modo === 'Mês') { const [a, m] = k.split('-').map(Number); return APP.MESES[m - 1].slice(0, 3) + '/' + a; }
    return dataCurta(k) + ' a ' + dataCurta(DB.somarDias(k, 6));
  }
  function pctTxt(v) { return numBR(v * 100, 1) + '%'; }

  function quartosFiltrados(d) {
    return d.quartos.filter(q => q.ativo !== false && (!st.categoria || (st.categoria === '_sem' ? !q.categoria_id : q.categoria_id === st.categoria)));
  }

  /* ----------------------------- GERADORES ----------------------------- */
  function rOcupacao(d) {
    const qs = quartosFiltrados(d); const ids = new Set(qs.map(q => q.id));
    const ds = dias(st.de, st.ate);
    const est = DB.vendidas(d).filter(r => ids.has(r.quarto_id));
    const kp = { disp: qs.length * ds.length, vend: 0, rec: 0 };
    let colunas, linhas = [];
    if (st.agrupar === 'Categoria') {
      const grupos = {};
      qs.forEach(q => { const k = q.categoria_id || '_sem'; (grupos[k] = grupos[k] || { q: 0, vend: 0, rec: 0 }).q++; });
      est.forEach(r => { const q = d.quartoPorId[r.quarto_id]; const k = (q && q.categoria_id) || '_sem'; const n = DB.noitesNoPeriodo(r, st.de, st.ate);
        if (!grupos[k]) grupos[k] = { q: 0, vend: 0, rec: 0 }; grupos[k].vend += n; grupos[k].rec += n * DB.num(r.diaria); });
      colunas = [{ t: 'Categoria' }, { t: 'Quartos', d: 1 }, { t: 'Noites disponíveis', d: 1 }, { t: 'Noites vendidas', d: 1 }, { t: 'Ocupação', barra: 1 }, { t: 'Diária média', d: 1 }, { t: 'Receita de hospedagem', d: 1 }];
      Object.keys(grupos).sort((a, b) => (a === '_sem') - (b === '_sem') || String((d.catPorId[a] || {}).ordem || 0).localeCompare(String((d.catPorId[b] || {}).ordem || 0))).forEach(k => {
        const g = grupos[k]; const disp = g.q * ds.length;
        kp.vend += g.vend; kp.rec += g.rec;
        linhas.push([k === '_sem' ? 'Sem categoria' : (d.catPorId[k] || {}).nome || '—', g.q, disp, g.vend, disp ? g.vend / disp : 0, g.vend ? g.rec / g.vend : 0, g.rec]);
      });
    } else {
      const grupos = {};
      ds.forEach(dia => { const k = chaveGrupo(dia, st.agrupar); (grupos[k] = grupos[k] || { disp: 0, vend: 0, rec: 0 }).disp += qs.length; });
      est.forEach(r => ds.forEach(dia => { if (r.entrada <= dia && r.saida > dia) { const g = grupos[chaveGrupo(dia, st.agrupar)]; g.vend++; g.rec += DB.num(r.diaria); } }));
      colunas = [{ t: st.agrupar }, { t: 'Noites disponíveis', d: 1 }, { t: 'Noites vendidas', d: 1 }, { t: 'Ocupação', barra: 1 }, { t: 'Diária média', d: 1 }, { t: 'RevPAR', d: 1 }, { t: 'Receita de hospedagem', d: 1 }];
      Object.keys(grupos).sort().forEach(k => { const g = grupos[k]; kp.vend += g.vend; kp.rec += g.rec;
        linhas.push([rotuloGrupo(k, st.agrupar), g.disp, g.vend, g.disp ? g.vend / g.disp : 0, g.vend ? g.rec / g.vend : 0, g.disp ? g.rec / g.disp : 0, g.rec]); });
    }
    const adr = kp.vend ? kp.rec / kp.vend : 0;
    const total = st.agrupar === 'Categoria'
      ? ['Total', qs.length, kp.disp, kp.vend, kp.disp ? kp.vend / kp.disp : 0, adr, kp.rec]
      : ['Total', kp.disp, kp.vend, kp.disp ? kp.vend / kp.disp : 0, adr, kp.disp ? kp.rec / kp.disp : 0, kp.rec];
    return {
      kpis: [{ rot: 'Taxa de ocupação', val: pctTxt(kp.disp ? kp.vend / kp.disp : 0) }, { rot: 'Noites vendidas', val: numBR(kp.vend), sub: 'de ' + numBR(kp.disp) },
             { rot: 'Diária média (ADR)', val: brl(adr) }, { rot: 'RevPAR', val: brl(kp.disp ? kp.rec / kp.disp : 0) }],
      colunas: colunas, linhas: linhas, total: total,
      formatos: st.agrupar === 'Categoria' ? ['t', 'n', 'n', 'n', '%', 'r', 'r'] : ['t', 'n', 'n', '%', 'r', 'r', 'r'],
      nota: 'Considera estadias com check-in realizado (hospedadas e finalizadas). Receita de consumo e serviços extras aparece no relatório financeiro.'
    };
  }

  function rFinanceiro(d) {
    const ls = d.lancamentos.filter(l => l.data >= st.de && l.data <= st.ate);
    const rec = ls.filter(l => l.tipo === 'receita' && l.status === 'recebido');
    const desp = ls.filter(l => l.tipo === 'despesa');
    const aRec = ls.filter(l => l.tipo === 'receita' && l.status === 'a_receber');
    const tr = rec.reduce((s, l) => s + DB.num(l.valor), 0), td = desp.reduce((s, l) => s + DB.num(l.valor), 0);
    const ta = aRec.reduce((s, l) => s + DB.num(l.valor), 0);
    let colunas, linhas = [], total, formatos;
    if (st.agrupar === 'Categoria') {
      const g = (lista) => { const o = {}; lista.forEach(l => { const k = l.categoria || 'Sem categoria'; o[k] = o[k] || { n: 0, v: 0 }; o[k].n++; o[k].v += DB.num(l.valor); }); return o; };
      const gr = g(rec), gd = g(desp);
      colunas = [{ t: 'Tipo' }, { t: 'Categoria' }, { t: 'Lançamentos', d: 1 }, { t: 'Valor', d: 1 }, { t: '% do grupo', d: 1 }];
      Object.keys(gr).sort((a, b) => gr[b].v - gr[a].v).forEach(k => linhas.push(['Receita', k, gr[k].n, gr[k].v, tr ? gr[k].v / tr : 0]));
      Object.keys(gd).sort((a, b) => gd[b].v - gd[a].v).forEach(k => linhas.push(['Despesa', k, gd[k].n, -gd[k].v, td ? gd[k].v / td : 0]));
      total = ['Resultado', '', rec.length + desp.length, tr - td, ''];
      formatos = ['t', 't', 'n', 'r', '%'];
    } else {
      const o = {};
      dias(st.de, st.ate).forEach(dia => { o[chaveGrupo(dia, st.agrupar)] = { r: 0, d: 0 }; });
      rec.forEach(l => { const k = chaveGrupo(l.data, st.agrupar); if (o[k]) o[k].r += DB.num(l.valor); });
      desp.forEach(l => { const k = chaveGrupo(l.data, st.agrupar); if (o[k]) o[k].d += DB.num(l.valor); });
      colunas = [{ t: st.agrupar }, { t: 'Receitas', d: 1 }, { t: 'Despesas', d: 1 }, { t: 'Resultado', d: 1 }];
      Object.keys(o).sort().forEach(k => linhas.push([rotuloGrupo(k, st.agrupar), o[k].r, -o[k].d, o[k].r - o[k].d]));
      total = ['Total', tr, -td, tr - td];
      formatos = ['t', 'r', 'r', 'r'];
    }
    return {
      kpis: [{ rot: 'Receitas recebidas', val: brl(tr) }, { rot: 'Despesas', val: brl(td) }, { rot: 'Resultado', val: brl(tr - td), sub: tr ? 'margem ' + pctTxt((tr - td) / tr) : '' },
             { rot: 'Faturado a receber', val: brl(ta), sub: aRec.length + ' título(s)' }],
      colunas, linhas, total, formatos,
      nota: 'Regime de caixa: receitas pelo recebimento; despesas pagas e agendadas pela data do lançamento. Valores faturados a empresas aparecem em "Faturado a receber".'
    };
  }

  function estadiasNoPeriodo(d) {
    return DB.vendidas(d).filter(r => r.entrada <= st.ate && r.saida > st.de &&
      (!st.categoria || ((d.quartoPorId[r.quarto_id] || {}).categoria_id || '_sem') === st.categoria));
  }

  function rHospedes(d) {
    const est = estadiasNoPeriodo(d);
    const porH = {};
    est.forEach(r => {
      const k = r.hospede_id || r.hospede_nome;
      const h = d.hospedes.find(x => x.id === r.hospede_id) || {};
      const o = porH[k] = porH[k] || { nome: h.nome || r.hospede_nome, cidade: h.cidade ? h.cidade + (h.uf ? '/' + h.uf : '') : '—', motivo: h.motivo || '—', origem: h.origem || '—', est: 0, noites: 0, valor: 0, total: 0 };
      o.est++; o.noites += DB.noitesNoPeriodo(r, st.de, st.ate); o.valor += DB.noitesNoPeriodo(r, st.de, st.ate) * DB.num(r.diaria);
    });
    // Frequência total (todas as estadias da história)
    DB.vendidas(d).forEach(r => { const k = r.hospede_id || r.hospede_nome; if (porH[k]) porH[k].total++; });
    const lista = Object.values(porH).sort((a, b) => b.noites - a.noites);
    const conta = (campo) => { const o = {}; lista.forEach(x => { if (x[campo] && x[campo] !== '—') o[x[campo]] = (o[x[campo]] || 0) + 1; }); const k = Object.keys(o).sort((a, b) => o[b] - o[a])[0]; return k ? k + ' (' + o[k] + ')' : '—'; };
    return {
      kpis: [{ rot: 'Hóspedes no período', val: numBR(lista.length) }, { rot: 'Estadias', val: numBR(est.length) },
             { rot: 'Cidade principal', val: conta('cidade'), peq: 1 }, { rot: 'Motivo principal', val: conta('motivo'), peq: 1 }],
      colunas: [{ t: 'Hóspede' }, { t: 'Cidade' }, { t: 'Motivo' }, { t: 'Como conheceu' }, { t: 'Estadias', d: 1 }, { t: 'Noites', d: 1 }, { t: 'Hospedagem', d: 1 }, { t: 'Estadias (total)', d: 1 }],
      linhas: lista.map(x => [x.nome, x.cidade, x.motivo, x.origem, x.est, x.noites, x.valor, x.total]),
      total: ['Total', '', '', '', est.length, lista.reduce((s, x) => s + x.noites, 0), lista.reduce((s, x) => s + x.valor, 0), ''],
      formatos: ['t', 't', 't', 't', 'n', 'n', 'r', 'n'],
      nota: 'Hóspedes com estadia realizada que cruza o período. "Estadias (total)" mostra a frequência histórica do hóspede no hotel.'
    };
  }

  function rMovimento(d) {
    const o = {};
    dias(st.de, st.ate).forEach(dia => { o[chaveGrupo(dia, st.agrupar === 'Categoria' ? 'Dia' : st.agrupar)] = { ci: 0, co: 0, p: 0 }; });
    const modo = st.agrupar === 'Categoria' ? 'Dia' : st.agrupar;
    let perm = 0, nperm = 0;
    d.reservas.forEach(r => {
      if (st.categoria && ((d.quartoPorId[r.quarto_id] || {}).categoria_id || '_sem') !== st.categoria) return;
      const ci = APP.dataLocalDeTs(r.checkin_em), co = APP.dataLocalDeTs(r.checkout_em);
      if (ci && ci >= st.de && ci <= st.ate && r.status !== 'cancelada') { const g = o[chaveGrupo(ci, modo)]; if (g) { g.ci++; g.p += DB.num(r.adultos) + DB.num(r.criancas); } }
      if (co && co >= st.de && co <= st.ate && r.status === 'finalizada') { const g = o[chaveGrupo(co, modo)]; if (g) g.co++; perm += DB.noites(r); nperm++; }
    });
    const ks = Object.keys(o).sort();
    const tci = ks.reduce((s, k) => s + o[k].ci, 0), tco = ks.reduce((s, k) => s + o[k].co, 0), tp = ks.reduce((s, k) => s + o[k].p, 0);
    return {
      kpis: [{ rot: 'Check-ins', val: numBR(tci) }, { rot: 'Check-outs', val: numBR(tco) }, { rot: 'Média de check-ins/dia', val: numBR(tci / Math.max(1, dias(st.de, st.ate).length), 1) },
             { rot: 'Permanência média', val: numBR(nperm ? perm / nperm : 0, 1) + ' noites' }],
      colunas: [{ t: modo }, { t: 'Check-ins', d: 1 }, { t: 'Pessoas que entraram', d: 1 }, { t: 'Check-outs', d: 1 }],
      linhas: ks.map(k => [rotuloGrupo(k, modo), o[k].ci, o[k].p, o[k].co]),
      total: ['Total', tci, tp, tco], formatos: ['t', 'n', 'n', 'n'],
      nota: 'Pelo horário real registrado no check-in e no check-out.'
    };
  }

  function rVouchers(d) {
    const l = d.reservas.filter(r => { const c = APP.dataLocalDeTs(r.criado_em); return c && c >= st.de && c <= st.ate &&
      (!st.categoria || ((d.quartoPorId[r.quarto_id] || {}).categoria_id || '_sem') === st.categoria); })
      .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const situacao = (r) => r.status === 'cancelada' ? 'Cancelada' : (r.voucher_status === 'enviado' ? 'Enviado' : 'Aguardando envio');
    const tot = l.filter(r => r.status !== 'cancelada').reduce((s, r) => s + DB.noites(r) * DB.num(r.diaria), 0);
    return {
      kpis: [{ rot: 'Vouchers emitidos', val: numBR(l.length) }, { rot: 'Enviados', val: numBR(l.filter(r => r.voucher_status === 'enviado' && r.status !== 'cancelada').length) },
             { rot: 'Cancelados', val: numBR(l.filter(r => r.status === 'cancelada').length) }, { rot: 'Valor reservado', val: brl(tot) }],
      colunas: [{ t: 'Código' }, { t: 'Emissão' }, { t: 'Hóspede' }, { t: 'Quarto' }, { t: 'Entrada' }, { t: 'Saída' }, { t: 'Noites', d: 1 }, { t: 'Pagamento' }, { t: 'Total', d: 1 }, { t: 'Situação' }],
      linhas: l.map(r => [r.codigo, dataBR(APP.dataLocalDeTs(r.criado_em)), r.hospede_nome, (d.quartoPorId[r.quarto_id] || {}).numero || '—', dataBR(r.entrada), dataBR(r.saida),
        DB.noites(r), r.pagamento || '—', DB.noites(r) * DB.num(r.diaria), situacao(r)]),
      total: ['Total', '', l.length + ' voucher(s)', '', '', '', l.reduce((s, r) => s + DB.noites(r), 0), '', tot, ''],
      formatos: ['t', 't', 't', 't', 't', 't', 'n', 't', 'r', 't'],
      nota: 'Pela data de emissão do voucher. O total desconsidera reservas canceladas.'
    };
  }

  function rFNRH(d) {
    const est = estadiasNoPeriodo(d).sort((a, b) => a.entrada < b.entrada ? -1 : 1);
    const incompletos = est.filter(r => { const h = d.hospedes.find(x => x.id === r.hospede_id) || {}; return !(h.cpf || h.documento) || !h.nascimento || !h.cidade; }).length;
    return {
      kpis: [{ rot: 'Registros', val: numBR(est.length) }, { rot: 'Fichas incompletas', val: numBR(incompletos), sub: 'sem documento, nascimento ou cidade' },
             { rot: 'Estrangeiros', val: numBR(est.filter(r => ((d.hospedes.find(x => x.id === r.hospede_id) || {}).nacionalidade) === 'Estrangeira').length) },
             { rot: 'Período', val: dataCurta(st.de) + ' a ' + dataCurta(st.ate), peq: 1 }],
      colunas: [{ t: 'Hóspede' }, { t: 'CPF' }, { t: 'RG / Passaporte' }, { t: 'Nascimento' }, { t: 'Nacionalidade' }, { t: 'Cidade/UF' }, { t: 'Telefone' }, { t: 'Motivo' }, { t: 'Placa' }, { t: 'Quarto' }, { t: 'Entrada' }, { t: 'Saída' }],
      linhas: est.map(r => { const h = d.hospedes.find(x => x.id === r.hospede_id) || {};
        return [h.nome || r.hospede_nome, h.cpf || '', h.documento || '', h.nascimento ? dataBR(h.nascimento) : '', h.nacionalidade || '', h.cidade ? h.cidade + '/' + (h.uf || '') : '',
          h.telefone || r.telefone || '', h.motivo || '', h.placa || '', (d.quartoPorId[r.quarto_id] || {}).numero || '', dataBR(r.entrada), dataBR(r.saida)]; }),
      total: null, formatos: ['t', 't', 't', 't', 't', 't', 't', 't', 't', 't', 't', 't'],
      nota: 'Lista para conferência e lançamento no sistema oficial da FNRH (Ministério do Turismo). Complete as fichas incompletas em Cadastro de hóspedes.'
    };
  }

  const GERADORES = { oc: rOcupacao, fin: rFinanceiro, hos: rHospedes, mov: rMovimento, vou: rVouchers, fnrh: rFNRH };

  function fmt(v, f) {
    if (v === '' || v === null || v === undefined) return '';
    if (f === 'r') return brl(v);
    if (f === '%') return pctTxt(v);
    if (f === 'n') return numBR(v);
    return String(v);
  }

  async function gerar() {
    const d = await APP.dados();
    const c = CAT.find(x => x[0] === st.sel);
    const r = GERADORES[st.sel](d);
    r.titulo = c[3];
    const catNome = !st.categoria ? 'todas as categorias' : (st.categoria === '_sem' ? 'sem categoria' : ((d.catPorId[st.categoria] || {}).nome || ''));
    r.subtitulo = 'Período: ' + dataBR(st.de) + ' a ' + dataBR(st.ate) + ' · ' + catNome + ' · gerado em ' + dataBR(DB.hoje());
    r.hotel = d.hotel;
    st.ultimo = r;
    return r;
  }

  async function montar(params) {
    params = params || {};
    if (params.sel) st.sel = params.sel;
    if (params.de) st.de = params.de;
    if (params.ate) st.ate = params.ate;
    if (!st.de) st.de = iniMes();
    if (!st.ate) st.ate = DB.hoje();
    const d = await APP.dados();
    const el = $('#tela-relatorios');
    const cats = [{ v: '', t: 'Todas' }].concat(d.categorias.map(c => ({ v: c.id, t: c.nome }))).concat([{ v: '_sem', t: 'Sem categoria' }]);
    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Relatórios</h1><p>Escolha o relatório, defina o período e exporte em PDF ou Excel</p></div></header>' +
      '<form class="card" id="rl-filtros" aria-label="Filtros do relatório" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px;align-items:end">' +
      '<label class="fld">Período — de<input type="date" name="de" value="' + st.de + '"></label>' +
      '<label class="fld">até<input type="date" name="ate" value="' + st.ate + '"></label>' +
      '<label class="fld">Categoria de quarto<select name="categoria">' + opcoes(cats, st.categoria) + '</select></label>' +
      '<label class="fld">Agrupar por<select name="agrupar">' + opcoes(['Categoria', 'Dia', 'Semana', 'Mês'], st.agrupar) + '</select></label>' +
      '<button type="submit" class="btn btn-escuro">Gerar relatório</button></form>' +
      '<section aria-label="Catálogo de relatórios" class="catalogo">' + CAT.map(c =>
        '<button type="button" data-c="' + c[0] + '" aria-pressed="' + (st.sel === c[0]) + '"><b>' + c[1] + '</b><span>' + c[2] + '</span></button>').join('') + '</section>' +
      '<section class="card pilha-16" style="gap:20px;padding:24px" id="rl-saida"></section>';
    $('#rl-filtros').onsubmit = (e) => { e.preventDefault(); aplicarFiltros(); desenhar(); };
    $('#rl-filtros').onchange = () => { aplicarFiltros(); desenhar(); };
    $$('[data-c]', el).forEach(b => b.onclick = () => { st.sel = b.dataset.c; $$('[data-c]', el).forEach(x => x.setAttribute('aria-pressed', x === b)); desenhar(); });
    desenhar();
  }

  function aplicarFiltros() {
    const v = APP.lerForm($('#rl-filtros'));
    st.de = v.de || iniMes(); st.ate = v.ate || DB.hoje();
    if (st.ate < st.de) { const t = st.de; st.de = st.ate; st.ate = t; }
    if (DB.diasEntre(st.de, st.ate) > 731) { st.de = DB.somarDias(st.ate, -731); APP.aviso('Período limitado a 2 anos.', 'alerta'); }
    st.categoria = v.categoria; st.agrupar = v.agrupar;
  }

  async function desenhar() {
    const r = await gerar();
    const box = $('#rl-saida');
    const linhaHTML = (l, total) => '<tr' + (total ? ' class="total"' : '') + '>' + l.map((v, i) => {
      const col = r.colunas[i] || {}; const f = r.formatos[i];
      if (col.barra && !total) return '<td><span style="display:flex;align-items:center;gap:10px"><span class="trilho" style="width:120px;display:inline-block"><span style="width:' + Math.min(100, v * 100).toFixed(1) + '%"></span></span>' + fmt(v, f) + '</span></td>';
      return '<td' + (col.d ? ' class="dir"' : '') + (i === 0 && !total ? ' style="font-weight:700"' : '') + '>' + esc(fmt(v, f)) + '</td>';
    }).join('') + '</tr>';
    box.innerHTML =
      '<div class="linha-topo" style="align-items:flex-start;padding-bottom:16px;border-bottom:1px solid #E8E1D4">' +
      '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap"><div class="logo-quadro"><img src="assets/logo.png" alt="Hotel Estilo Fino"></div>' +
      '<div class="pilha" style="gap:2px"><h2 class="titulo-serif" style="font-size:24px;font-weight:400">' + esc(r.titulo) + '</h2><span class="kpi-sub">' + esc(r.subtitulo) + '</span></div></div>' +
      '<div class="acoes"><button type="button" class="btn" id="rl-excel">' + icone('baixar', 18, 1.8) + 'Excel</button>' +
      '<button type="button" class="btn btn-ouro" id="rl-pdf">' + icone('baixar', 18, 1.8) + 'PDF</button></div></div>' +
      '<div class="grade-kpis" style="grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:12px">' +
      r.kpis.map(k => '<div class="mini-kpi"><span class="kl">' + esc(k.rot) + '</span><b' + (k.peq ? ' style="font-size:17px"' : '') + '>' + esc(k.val) + (k.sub ? ' <small>' + esc(k.sub) + '</small>' : '') + '</b></div>').join('') + '</div>' +
      (r.linhas.length ? '<div class="rolagem"><table><thead><tr>' + r.colunas.map(c => '<th' + (c.d ? ' class="dir"' : '') + '>' + esc(c.t) + '</th>').join('') + '</tr></thead><tbody>' +
        r.linhas.map(l => linhaHTML(l)).join('') + (r.total ? linhaHTML(r.total, true) : '') + '</tbody></table></div>' : '<p class="vazio">Sem dados para o período e os filtros escolhidos.</p>') +
      '<p style="margin:0;font-size:12px;color:#5E5750">' + esc(r.nota) + '</p>';
    $('#rl-excel').onclick = () => {
      const linhas = [[r.titulo], [r.subtitulo], [], r.colunas.map(c => c.t)];
      r.linhas.concat(r.total ? [r.total] : []).forEach(l => linhas.push(l.map((v, i) => r.formatos[i] === '%' && v !== '' ? Math.round(v * 1000) / 10 + '%' : (typeof v === 'number' ? Math.round(v * 100) / 100 : v))));
      APP.baixarCSV('relatorio-' + st.sel + '-' + st.de + '-a-' + st.ate + '.csv', linhas);
    };
    $('#rl-pdf').onclick = async () => {
      APP.carregando(true, 'Montando o PDF…');
      try { const blob = await PDFGEN.relatorio(r, fmt); await APP.entregarArquivo(blob, 'Relatorio-' + st.sel + '-' + st.de + '-a-' + st.ate + '.pdf', 'application/pdf'); }
      catch (e) { APP.aviso('Falha ao gerar o PDF: ' + e.message, 'erro', 8); }
      finally { APP.carregando(false); }
    };
  }

  return { montar: montar, gerar: gerar, _st: st };
})();

window.RELATORIOS = RELATORIOS;
