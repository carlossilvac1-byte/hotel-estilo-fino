/* =====================================================================
 * financeiro.js — FINANCEIRO
 * Resumo do mês (receitas, despesas, resultado, a receber), fluxo de
 * caixa por semana, receitas por forma de pagamento, lançamentos
 * (novo, editar, baixar, excluir) e contas a receber.
 * Regime de caixa: receita conta quando recebida; a receber à parte.
 * ===================================================================== */

const FINANCEIRO = (function () {
  const { $, $$, esc, brl, icone, opcoes, dataCurta, dataBR } = APP;
  const st = { mes: null, filtro: 'todos' };
  const TOM = { recebido: ['Recebido', 'b-ok'], pago: ['Pago', 'b-neutro'], a_receber: ['A receber', 'b-ag'], agendado: ['Agendado', 'b-ocp'] };

  function mesAtual() { return DB.hoje().slice(0, 7); }
  function mesAnterior(m) { const [a, b] = m.split('-').map(Number); return b === 1 ? (a - 1) + '-12' : a + '-' + String(b - 1).padStart(2, '0'); }
  function ultimoDia(m) { const [a, b] = m.split('-').map(Number); return new Date(a, b, 0).getDate(); }
  function nomeMes(m) { const [a, b] = m.split('-').map(Number); return APP.MESES[b - 1].charAt(0).toUpperCase() + APP.MESES[b - 1].slice(1) + ' de ' + a; }

  /** Totais de um mês (regime de caixa). */
  function totais(d, m) {
    const doMes = d.lancamentos.filter(l => String(l.data).slice(0, 7) === m);
    const receitas = doMes.filter(l => l.tipo === 'receita' && l.status === 'recebido').reduce((s, l) => s + DB.num(l.valor), 0);
    const despesas = doMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + DB.num(l.valor), 0);
    return { receitas, despesas, resultado: receitas - despesas, lancs: doMes };
  }
  function variacao(a, b) {
    if (!b) return a ? '▲ novo no período' : 'sem movimento anterior';
    const v = (a - b) / b;
    return (v >= 0 ? '▲ ' : '▼ ') + APP.numBR(Math.abs(v) * 100, 1) + '% vs. mês anterior';
  }

  async function montar(params) {
    params = params || {};
    const d = await APP.dados();
    if (!st.mes) st.mes = mesAtual();
    const el = $('#tela-financeiro');
    const edita = AUTH.podeEditar('financeiro');
    const hoje = DB.hoje();
    const t = totais(d, st.mes);
    const ant = totais(d, mesAnterior(st.mes));
    const aReceber = d.lancamentos.filter(l => l.tipo === 'receita' && l.status === 'a_receber').sort((a, b) => String(a.vencimento || a.data).localeCompare(String(b.vencimento || b.data)));
    const totReceber = aReceber.reduce((s, l) => s + DB.num(l.valor), 0);
    const vencidos = aReceber.filter(l => (l.vencimento || l.data) < hoje).length;
    const aPagar = d.lancamentos.filter(l => l.tipo === 'despesa' && l.status === 'agendado');

    // Semanas do mês
    const ud = ultimoDia(st.mes);
    const semanas = [[1, 7], [8, 14], [15, 21], [22, ud]];
    const sem = semanas.map(s => {
      const ini = st.mes + '-' + String(s[0]).padStart(2, '0'), fim = st.mes + '-' + String(s[1]).padStart(2, '0');
      const ls = t.lancs.filter(l => l.data >= ini && l.data <= fim);
      return { rot: String(s[0]).padStart(2, '0') + '–' + String(s[1]).padStart(2, '0') + '/' + st.mes.slice(5),
        rec: ls.filter(l => l.tipo === 'receita' && l.status === 'recebido').reduce((a, l) => a + DB.num(l.valor), 0),
        desp: ls.filter(l => l.tipo === 'despesa').reduce((a, l) => a + DB.num(l.valor), 0) };
    });
    const maxSem = Math.max(1, ...sem.map(s => Math.max(s.rec, s.desp)));
    const k = (v) => v >= 1000 ? APP.numBR(v / 1000, 1) + 'k' : APP.numBR(v, 0);

    // Formas de pagamento (receitas recebidas no mês + faturadas do mês)
    const porForma = {};
    t.lancs.filter(l => l.tipo === 'receita').forEach(l => { const f = l.forma || 'Não informado'; porForma[f] = (porForma[f] || 0) + DB.num(l.valor); });
    const totForma = Object.values(porForma).reduce((a, b) => a + b, 0);
    const formas = Object.keys(porForma).sort((a, b) => porForma[b] - porForma[a]);

    let lancs = t.lancs.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.criado_em).localeCompare(String(a.criado_em)));
    if (st.filtro === 'rec') lancs = lancs.filter(l => l.tipo === 'receita');
    if (st.filtro === 'desp') lancs = lancs.filter(l => l.tipo === 'despesa');

    const margem = t.receitas ? t.resultado / t.receitas : 0;
    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Financeiro</h1><p>' + nomeMes(st.mes) + ' · receitas, despesas e contas a receber</p></div>' +
      '<div class="acoes"><label class="fld" style="flex-direction:row;align-items:center"><span class="sr">Mês</span><input type="month" id="fn-mes" value="' + st.mes + '" style="width:auto"></label>' +
      '<button type="button" class="btn" id="fn-excel">' + icone('baixar', 18, 1.8) + 'Excel</button>' +
      (edita ? '<button type="button" class="btn" id="fn-despesa">Nova despesa</button><button type="button" class="btn btn-escuro" id="fn-receita">' + icone('mais2', 18, 2) + 'Nova receita</button>' : '') +
      '</div></header>' +
      '<section class="grade-kpis" aria-label="Resumo do mês">' +
      '<div class="card pilha" style="gap:8px"><span class="kl">Receitas</span><span class="kpi-valor" style="font-size:28px">' + brl(t.receitas) + '</span><span class="kpi-sub forte" style="color:' + (t.receitas >= ant.receitas ? '#1F5E3F' : '#8E2F25') + '">' + variacao(t.receitas, ant.receitas) + '</span></div>' +
      '<div class="card pilha" style="gap:8px"><span class="kl">Despesas</span><span class="kpi-valor" style="font-size:28px">' + brl(t.despesas) + '</span><span class="kpi-sub forte" style="color:' + (t.despesas <= ant.despesas ? '#1F5E3F' : '#8E2F25') + '">' + variacao(t.despesas, ant.despesas) + '</span></div>' +
      '<div class="card card-escuro pilha" style="gap:8px"><span class="kl">Resultado</span><span class="kpi-valor" style="font-size:28px">' + brl(t.resultado) + '</span><span class="kpi-sub">Margem de ' + APP.numBR(margem * 100, 1) + '%</span></div>' +
      '<div class="card pilha" style="gap:8px"><span class="kl">A receber</span><span class="kpi-valor" style="font-size:28px">' + brl(totReceber) + '</span><span class="kpi-sub"' + (vencidos ? ' style="color:#8E2F25;font-weight:700"' : '') + '>' + aReceber.length + ' título(s) · ' + vencidos + ' vencido(s)</span></div>' +
      '</section>' +
      '<div class="grade-2">' +
      '<section class="card pilha" style="gap:14px"><div class="linha-topo"><h2>Fluxo de caixa por semana</h2><div class="legenda"><span><i style="background:#C9A04F"></i>Receitas</span><span><i style="background:#3B3532"></i>Despesas</span></div></div>' +
      '<div class="barras-duplas" style="grid-template-columns:repeat(4,minmax(0,1fr))" role="img" aria-label="Receitas e despesas por semana">' +
      sem.map(s => '<div class="grupo"><div><span>' + k(s.rec) + '</span><i style="height:' + Math.max(2, s.rec / maxSem * 190).toFixed(0) + 'px;background:#C9A04F"></i></div>' +
        '<div><span>' + k(s.desp) + '</span><i style="height:' + Math.max(2, s.desp / maxSem * 190).toFixed(0) + 'px;background:#3B3532"></i></div></div>').join('') + '</div>' +
      '<div class="eixo" style="grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:-6px">' + sem.map(s => '<span>' + s.rot + '</span>').join('') + '</div></section>' +
      '<section class="card pilha" style="gap:14px"><h2>Receitas por forma de pagamento</h2>' +
      (formas.length ? formas.map(f => '<div class="pilha" style="gap:6px"><div class="linha-topo" style="font-size:14px"><b>' + esc(f) + '</b><span>' + brl(porForma[f]) + ' · ' + APP.numBR(porForma[f] / totForma * 100, 0) + '%</span></div>' +
        '<div class="trilho grosso"><span style="width:' + (porForma[f] / totForma * 100).toFixed(1) + '%"></span></div></div>').join('') : '<p class="vazio">Sem receitas no mês.</p>') +
      '</section></div>' +
      '<div class="duas-colunas"><section class="card larga pilha" style="gap:14px"><div class="linha-topo"><h2>Lançamentos do mês</h2>' +
      '<div class="segmento" role="group" aria-label="Filtrar lançamentos">' + [['todos', 'Todos'], ['rec', 'Receitas'], ['desp', 'Despesas']].map(f =>
        '<button type="button" aria-pressed="' + (st.filtro === f[0]) + '" data-f="' + f[0] + '">' + f[1] + '</button>').join('') + '</div></div>' +
      (lancs.length ? '<div class="rolagem"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Forma</th><th class="dir">Valor</th><th>Status</th></tr></thead><tbody>' +
        lancs.map(l => { const tm = TOM[l.status] || ['—', 'b-neutro'];
          return '<tr class="clicavel" data-l="' + esc(l.id) + '"><td>' + dataCurta(l.data) + '</td><td class="forte quebra">' + esc(l.descricao) + '</td><td class="apoio">' + esc(l.categoria || '—') + '</td><td class="apoio">' + esc(l.forma || '—') + '</td>' +
            '<td class="dir forte" style="color:' + (l.tipo === 'despesa' ? '#8E2F25' : '#1F5E3F') + '">' + (l.tipo === 'despesa' ? '- ' : '+ ') + brl(l.valor) + '</td><td><span class="badge ' + tm[1] + '">' + tm[0] + '</span></td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="vazio">Nenhum lançamento neste mês.</p>') + '</section>' +
      '<section class="card estreita pilha"><h2>Contas a receber</h2>' +
      (aReceber.length ? '<div class="lista-linhas">' + aReceber.slice(0, 12).map(l => {
        const venc = l.vencimento || l.data; const atras = venc < hoje; const hj = venc === hoje;
        return '<div class="clicavel" data-l="' + esc(l.id) + '" style="cursor:pointer"><div><div class="tit">' + esc(l.pessoa || l.descricao) + (l.quarto ? ' · ' + esc(l.quarto) : '') + '</div>' +
          '<div class="sub"' + (atras || hj ? ' style="color:#8E2F25;font-weight:700"' : '') + '>' + (atras ? 'Vencido em ' + dataCurta(venc) : (hj ? 'Vence hoje' : 'Vence ' + dataCurta(venc))) + '</div></div>' +
          '<b style="font-size:14px">' + brl(l.valor) + '</b></div>'; }).join('') + '</div>' : '<p class="vazio">Nada a receber.</p>') +
      (aPagar.length ? '<h2 style="padding-top:8px">Despesas agendadas</h2><div class="lista-linhas">' + aPagar.sort((a, b) => String(a.vencimento || a.data).localeCompare(String(b.vencimento || b.data))).slice(0, 8).map(l =>
        '<div class="clicavel" data-l="' + esc(l.id) + '" style="cursor:pointer"><div><div class="tit">' + esc(l.descricao) + '</div><div class="sub">Vence ' + dataCurta(l.vencimento || l.data) + '</div></div><b style="font-size:14px;color:#8E2F25">' + brl(l.valor) + '</b></div>').join('') + '</div>' : '') +
      (AUTH.podeVer('relatorios') ? '<a href="#" id="fn-rel" style="padding-top:4px">Ver relatório financeiro completo</a>' : '') + '</section></div>';

    $('#fn-mes').onchange = (e) => { st.mes = e.target.value || mesAtual(); montar(); };
    $$('[data-f]', el).forEach(b => b.onclick = () => { st.filtro = b.dataset.f; montar(); });
    $$('[data-l]', el).forEach(b => b.onclick = () => editar(d, d.lancamentos.find(l => l.id === b.dataset.l)));
    const go = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    go('#fn-receita', () => editar(d, { tipo: 'receita' }));
    go('#fn-despesa', () => editar(d, { tipo: 'despesa' }));
    go('#fn-excel', () => exportar(t.lancs));
    go('#fn-rel', (e) => { e.preventDefault(); APP.ir('tela-relatorios', { sel: 'fin', de: st.mes + '-01', ate: st.mes + '-' + String(ud).padStart(2, '0') }); });
  }

  function editar(d, l) {
    const edita = AUTH.podeEditar('financeiro');
    const novo = !l.id;
    const tipo = l.tipo || 'receita';
    const cats = tipo === 'receita' ? CONFIG.categoriasReceita : CONFIG.categoriasDespesa;
    const status = tipo === 'receita' ? [{ v: 'recebido', t: 'Recebido' }, { v: 'a_receber', t: 'A receber' }] : [{ v: 'pago', t: 'Pago' }, { v: 'agendado', t: 'Agendado (a pagar)' }];
    const dis = edita ? '' : ' disabled';
    const html =
      '<label class="fld">Descrição<input name="descricao" maxlength="140" value="' + esc(l.descricao || '') + '"' + dis + '></label>' +
      '<div class="grade-campos">' +
      '<label class="fld">Data<input type="date" name="data" value="' + esc(l.data || DB.hoje()) + '"' + dis + '></label>' +
      '<label class="fld">Valor (R$)<input name="valor" data-dinheiro inputmode="decimal" value="' + (l.valor ? APP.numBR(l.valor, 2) : '') + '" placeholder="0,00"' + dis + '></label>' +
      '<label class="fld">Categoria<select name="categoria"' + dis + '>' + opcoes(cats.indexOf(l.categoria) === -1 && l.categoria ? cats.concat([l.categoria]) : cats, l.categoria || cats[0]) + '</select></label>' +
      '<label class="fld">Forma<select name="forma"' + dis + '>' + opcoes(CONFIG.formasPagamento, l.forma || 'Pix') + '</select></label>' +
      '<label class="fld">Status<select name="status"' + dis + '>' + opcoes(status, l.status || status[0].v) + '</select></label>' +
      '<label class="fld">Vencimento<input type="date" name="vencimento" value="' + esc(l.vencimento || '') + '"' + dis + '><span class="dica">Para "a receber" / "agendado"</span></label>' +
      '<label class="fld largo">' + (tipo === 'receita' ? 'Cliente / pagador' : 'Fornecedor') + ' (opcional)<input name="pessoa" value="' + esc(l.pessoa || '') + '"' + dis + '></label></div>' +
      (l.reserva_id ? '<p class="apoio" style="margin:0">Lançamento ligado à estadia (quarto ' + esc(l.quarto || '') + ').</p>' : '');
    const botoes = [{ rotulo: edita ? 'Cancelar' : 'Fechar' }];
    if (edita && !novo) botoes.unshift({ rotulo: 'Excluir', classe: 'btn-perigo', acao: async () => {
      const r = await APP.confirmar('Excluir lançamento', 'Excluir "' + l.descricao + '" (' + brl(l.valor) + ')?', { rotuloOk: 'Excluir', perigo: true });
      if (!r.ok) return false;
      await DB.excluir('lancamentos', l.id); APP.aviso('Lançamento excluído.', 'sucesso'); montar();
    } });
    if (edita && !novo && (l.status === 'a_receber' || l.status === 'agendado')) botoes.push({ rotulo: l.status === 'a_receber' ? 'Marcar como recebido' : 'Marcar como pago', classe: 'btn-ouro', acao: async () => {
      await DB.salvar('lancamentos', Object.assign({}, l, { status: l.status === 'a_receber' ? 'recebido' : 'pago', data: DB.hoje() }));
      APP.aviso('Baixa registrada.', 'sucesso'); montar();
    } });
    if (edita) botoes.push({ rotulo: novo ? 'Lançar' : 'Salvar', classe: 'btn-escuro', acao: async (c) => {
      const v = APP.lerForm(c);
      const valor = APP.lerValor(v.valor);
      if (!v.descricao) throw new Error('Informe a descrição.');
      if (valor <= 0) throw new Error('Informe o valor.');
      if (!v.data) throw new Error('Informe a data.');
      if ((v.status === 'a_receber' || v.status === 'agendado') && !v.vencimento) v.vencimento = v.data;
      await DB.salvar('lancamentos', Object.assign({}, l, v, { tipo: tipo, valor: valor }));
      APP.aviso(novo ? 'Lançamento incluído.' : 'Lançamento atualizado.', 'sucesso');
      if (String(v.data).slice(0, 7) !== st.mes && v.status !== 'a_receber') st.mes = String(v.data).slice(0, 7);
      montar();
    } });
    APP.janela({ titulo: (novo ? 'Nova ' : '') + (tipo === 'receita' ? 'receita' : 'despesa'), html: html, botoes: botoes, largo: true });
  }

  function exportar(lancs) {
    const l = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma', 'Valor', 'Status', 'Vencimento', 'Quarto', 'Cliente/Fornecedor']];
    lancs.slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).forEach(x => l.push([dataBR(x.data), x.tipo === 'receita' ? 'Receita' : 'Despesa', x.descricao, x.categoria || '', x.forma || '',
      (x.tipo === 'despesa' ? -1 : 1) * DB.num(x.valor), (TOM[x.status] || [''])[0], x.vencimento ? dataBR(x.vencimento) : '', x.quarto || '', x.pessoa || '']));
    APP.baixarCSV('financeiro-' + st.mes + '.csv', l);
  }

  return { montar: montar, totais: totais };
})();

window.FINANCEIRO = FINANCEIRO;
