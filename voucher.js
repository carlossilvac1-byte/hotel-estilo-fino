/* =====================================================================
 * voucher.js — RESERVAS E EMISSÃO DE VOUCHER
 * Formulário da reserva com pré-visualização ao vivo do voucher,
 * validação de período e de conflito de quarto, PDF, impressão e envio
 * por e-mail / WhatsApp. Lista dos vouchers recentes.
 * ===================================================================== */

const VOUCHER = (function () {
  const { $, $$, esc, brl, icone, opcoes, dataBR } = APP;
  const st = { id: null, quartoInicial: null, hospedeInicial: null, busca: '' };

  function vazio(d) {
    const hoje = DB.hoje();
    return {
      id: null, codigo: null, hospede_id: null, hospede_nome: '', documento: '', telefone: '', email: '', empresa: '',
      quarto_id: st.quartoInicial || '', entrada: hoje, saida: DB.somarDias(hoje, 1), adultos: 2, criancas: 0,
      regime: CONFIG.regimes[0], pagamento: CONFIG.pagamentosReserva[0], diaria: '', observacoes: '', status: 'reservada',
      voucher_status: 'aguardando', contratante_id: 'direto'
    };
  }

  function diariaDoQuarto(d, quartoId, contratanteId) {
    return DB.tarifa(d, contratanteId || 'direto', quartoId);
  }

  /** Valores atuais do formulário, já tipados. */
  function lerFormulario() {
    const f = APP.lerForm($('#vc-form'));
    f.adultos = parseInt(f.adultos, 10) || 0;
    f.criancas = parseInt(f.criancas, 10) || 0;
    f.diaria = APP.lerValor(f.diaria);
    return f;
  }

  function dadosPreview(d, f, reg) {
    const q = d.quartoPorId[f.quarto_id];
    const c = q && d.catPorId[q.categoria_id];
    const n = Math.max(0, DB.diasEntre(f.entrada, f.saida));
    const a = f.adultos, cr = f.criancas;
    return {
      codigo: (reg && reg.codigo) || 'Novo (gerado ao salvar)',
      emitido: reg && reg.criado_em ? dataBR(APP.dataLocalDeTs(reg.criado_em)) : dataBR(DB.hoje()),
      nome: f.hospede_nome || 'Nome do hóspede', doc: f.documento || '—',
      quarto: q ? q.numero : '—', tipo: c ? c.nome : 'Categoria a definir',
      entrada: f.entrada, saida: f.saida, noites: n,
      pessoas: a + (a === 1 ? ' adulto' : ' adultos') + (cr ? ' + ' + cr + (cr === 1 ? ' criança' : ' crianças') : ''),
      regime: f.regime, diaria: f.diaria, total: f.diaria * n, obs: f.observacoes,
      pagamento: f.pagamento + (f.contratante_id && f.contratante_id !== 'direto' && d.contratantePorId[f.contratante_id] ? ' · via ' + d.contratantePorId[f.contratante_id].nome : ''),
      status: reg ? reg.status : 'reservada', hotel: d.hotel
    };
  }

  function qrSVG(texto, tam) {
    try {
      const qr = qrcode(0, 'M'); qr.addData(unescape(encodeURIComponent(texto))); qr.make();
      const n = qr.getModuleCount(); let p = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) p += 'M' + x + ' ' + y + 'h1v1h-1z';
      return '<svg viewBox="0 0 ' + n + ' ' + n + '" width="' + (tam || 96) + '" height="' + (tam || 96) + '" shape-rendering="crispEdges" aria-label="QR code de validação"><path d="' + p + '" fill="#231F20"/></svg>';
    } catch (e) { return ''; }
  }
  function textoQR(p) {
    return p.hotel.nome + ' | Voucher ' + p.codigo + ' | ' + p.nome + ' | Quarto ' + p.quarto + ' | ' + dataBR(p.entrada) + ' a ' + dataBR(p.saida) + ' | ' + p.noites + ' noite(s)';
  }

  function previewHTML(p) {
    const h = p.hotel;
    const stLabel = { reservada: ['Reserva confirmada', 'b-liv'], hospedado: ['Hóspede na casa', 'b-ocp'], finalizada: ['Estadia concluída', 'b-neutro'], cancelada: ['Reserva cancelada', 'b-mnt'] }[p.status] || ['Reserva confirmada', 'b-liv'];
    const end = [h.endereco, [h.cidade, h.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '[Endereço do hotel] · [Cidade/UF]';
    const cont = [h.telefone, h.email, h.cnpj ? 'CNPJ ' + h.cnpj : ''].filter(Boolean).join(' · ') || '[Telefone / WhatsApp] · [E-mail] · CNPJ';
    return '<article class="voucher imprimir" id="vc-voucher">' +
      '<div class="v-cab"><img src="assets/logo.png" alt="' + esc(h.nome) + '"><div class="v-tit"><b>Voucher de hospedagem</b><span>Nº ' + esc(p.codigo) + ' · emitido em ' + esc(p.emitido) + '</span></div></div>' +
      '<div class="v-faixa"></div><div class="v-corpo">' +
      '<div class="linha-topo" style="align-items:flex-start"><div style="display:flex;flex-direction:column;gap:4px"><span class="vk">Hóspede</span><span style="font-size:22px;font-weight:800">' + esc(p.nome) + '</span>' +
      '<span class="kpi-sub">Documento: ' + esc(p.doc) + '</span></div><span class="badge ' + stLabel[1] + '" style="font-size:13px;padding:6px 12px">' + stLabel[0] + '</span></div>' +
      '<div class="v-periodo"><div><span class="vk">Entrada</span><span class="vv">' + dataBR(p.entrada) + '</span><span class="kpi-sub" style="font-size:12px">a partir das ' + esc(h.horaCheckin || '14:00') + '</span></div>' +
      '<div><span class="vk">Saída</span><span class="vv">' + dataBR(p.saida) + '</span><span class="kpi-sub" style="font-size:12px">até as ' + esc(h.horaCheckout || '12:00') + '</span></div>' +
      '<div><span class="vk">Noites</span><span class="vv">' + p.noites + '</span><span class="kpi-sub" style="font-size:12px">' + esc(p.pessoas) + '</span></div></div>' +
      '<div class="grade-campos" style="gap:16px">' +
      '<div class="pilha" style="gap:4px"><span class="vk">Acomodação</span><span class="vv">Quarto ' + esc(p.quarto) + ' · ' + esc(p.tipo) + '</span></div>' +
      '<div class="pilha" style="gap:4px"><span class="vk">Regime</span><span class="vv">' + esc(p.regime) + '</span></div>' +
      '<div class="pilha" style="gap:4px"><span class="vk">Pagamento</span><span class="vv">' + esc(p.pagamento) + '</span></div></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:stretch">' +
      '<div class="v-valores"><div class="l"><span>Diária (' + esc(p.tipo) + ')</span><b>' + brl(p.diaria) + '</b></div>' +
      '<div class="l"><span>' + p.noites + ' noite(s)</span><b>' + brl(p.total) + '</b></div>' +
      '<div class="l apoio"><span>Taxas e ISS</span><span>inclusos</span></div>' +
      '<div class="t"><b>Total da reserva</b><b style="font-size:24px">' + brl(p.total) + '</b></div></div>' +
      '<div class="v-qr">' + qrSVG(textoQR(p)) + '<span style="font-size:11px;color:#5E5750">QR code de validação</span></div></div>' +
      '<div class="pilha" style="gap:6px;font-size:13px;color:#3B3532;line-height:1.5"><span class="vk">Observações</span>' +
      (p.obs ? '<span>' + esc(p.obs) + '</span>' : '') + '<span>' + esc(h.politica || '') + '</span></div></div>' +
      '<div class="v-rodape"><span>' + esc(end) + '</span><span>' + esc(cont) + '</span></div></article>';
  }

  async function montar(params) {
    params = params || {};
    const d = await APP.dados();
    if (params.novo) { st.id = null; st.quartoInicial = params.quarto || null; st.hospedeInicial = params.hospede || null; }
    if (params.reserva) st.id = params.reserva;
    const reg = st.id ? d.reservas.find(r => r.id === st.id) : null;
    if (st.id && !reg) st.id = null;
    const f = Object.assign(vazio(d), reg || {});
    if (!reg && st.hospedeInicial) {
      const h = d.hospedes.find(x => x.id === st.hospedeInicial);
      if (h) Object.assign(f, { hospede_id: h.id, hospede_nome: h.nome, documento: h.cpf || h.documento || '', telefone: h.telefone || '', email: h.email || '', empresa: h.empresa || '' });
    }
    if (!reg && f.quarto_id && !f.diaria) f.diaria = diariaDoQuarto(d, f.quarto_id, f.contratante_id);
    const ctOps = d.contratantes.filter(c => c.ativo !== false || c.id === f.contratante_id)
      .map(c => ({ v: c.id, t: c.nome + (c.tipo !== 'direto' ? ' · ' + (CONFIG.tiposContratante[c.tipo] || '') : '') }));
    const editavel = AUTH.podeEditar('voucher') && (!reg || reg.status === 'reservada');
    const dis = editavel ? '' : ' disabled';

    const quartos = d.quartos.filter(q => q.ativo !== false);
    const el = $('#tela-voucher');
    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Emissão de voucher</h1><p>Preencha a reserva — a pré-visualização ao lado atualiza na hora</p></div>' +
      '<div class="acoes">' + (AUTH.podeEditar('voucher') ? '<button type="button" class="btn" id="vc-nova">' + icone('mais2', 18, 2) + 'Nova reserva</button>' : '') +
      '<span class="badge b-res" style="font-size:13px;padding:8px 14px">Voucher nº ' + esc(reg ? reg.codigo : 'novo') + '</span></div></header>' +
      (!d.categorias.length ? '<div class="faixa"><span><b>Tarifas ainda não cadastradas:</b> informe a diária manualmente na reserva ou cadastre as categorias em Configurações.</span></div>' : '') +
      '<div class="duas-colunas">' +
      '<form class="card pilha" id="vc-form" aria-label="Dados da reserva" style="flex:1 1 420px;min-width:0;gap:14px" autocomplete="off">' +
      '<div class="linha-topo"><h2>Dados da reserva</h2>' + (reg && reg.status !== 'reservada' ? '<span class="badge b-neutro">' + esc({ hospedado: 'Hóspede na casa', finalizada: 'Estadia concluída', cancelada: 'Cancelada' }[reg.status] || reg.status) + '</span>' : '') + '</div>' +
      '<input type="hidden" name="hospede_id" value="' + esc(f.hospede_id || '') + '">' +
      '<label class="fld">Hóspede principal<input name="hospede_nome" value="' + esc(f.hospede_nome) + '" placeholder="Busque por CPF, nome ou celular — ou digite um novo nome"' + dis + '>' +
      '<span class="dica" id="vc-dica-hosp"></span></label>' +
      '<div class="grade-campos" style="grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))">' +
      '<label class="fld">Documento (CPF / RG)<input name="documento" value="' + esc(f.documento) + '"' + dis + '></label>' +
      '<label class="fld">Telefone / WhatsApp<input name="telefone" type="tel" data-mascara="tel" value="' + esc(f.telefone) + '"' + dis + '></label>' +
      '<label class="fld">E-mail<input name="email" type="email" value="' + esc(f.email) + '"' + dis + '></label>' +
      '<label class="fld">Quarto<select name="quarto_id" id="vc-quarto"' + dis + '></select></label>' +
      '<label class="fld">Entrada<input type="date" name="entrada" value="' + esc(f.entrada) + '"' + dis + '></label>' +
      '<label class="fld">Saída<input type="date" name="saida" value="' + esc(f.saida) + '"' + dis + '></label>' +
      '<label class="fld">Adultos<input type="number" name="adultos" min="1" max="10" value="' + esc(f.adultos) + '"' + dis + '></label>' +
      '<label class="fld">Crianças<input type="number" name="criancas" min="0" max="10" value="' + esc(f.criancas) + '"' + dis + '></label>' +
      '</div>' +
      '<div class="grade-campos"><label class="fld">Contratação<select name="contratante_id"' + dis + '>' + opcoes(ctOps, f.contratante_id || 'direto') + '</select><span class="dica" id="vc-dica-ct"></span></label>' +
      '<label class="fld">Diária (R$)<input name="diaria" inputmode="decimal" data-dinheiro value="' + (f.diaria !== '' ? esc(APP.numBR(f.diaria, 2)) : '') + '" placeholder="0,00"' + dis + '></label>' +
      '<label class="fld">Regime<select name="regime"' + dis + '>' + opcoes(CONFIG.regimes, f.regime) + '</select></label></div>' +
      '<label class="fld">Pagamento<select name="pagamento"' + dis + '>' + opcoes(CONFIG.pagamentosReserva, f.pagamento) + '</select></label>' +
      '<label class="fld">Observações no voucher<textarea name="observacoes" maxlength="400"' + dis + '>' + esc(f.observacoes) + '</textarea></label>' +
      (editavel ? '<button type="submit" class="btn btn-escuro btn-bloco">' + (reg ? 'Salvar alterações' : 'Salvar reserva') + '</button>' : '') +
      '<div class="grade-botoes">' +
      '<button type="button" class="btn btn-escuro" id="vc-pdf">Gerar PDF</button>' +
      '<button type="button" class="btn" id="vc-imprimir">Imprimir</button>' +
      '<button type="button" class="btn" id="vc-email">Enviar por e-mail</button>' +
      '<button type="button" class="btn btn-suave" id="vc-whats">Enviar por WhatsApp</button></div>' +
      (reg && reg.status === 'reservada' && AUTH.podeEditar('movimento') ? '<button type="button" class="btn" id="vc-checkin">' + icone('entrar', 18) + 'Fazer check-in desta reserva</button>' : '') +
      (reg && (podeCancelar(reg) || podeExcluir(d, reg)) ? '<div class="grade-botoes">' +
        (podeCancelar(reg) ? '<button type="button" class="btn btn-perigo" id="vc-cancelar">Cancelar voucher</button>' : '') +
        (podeExcluir(d, reg) ? '<button type="button" class="btn btn-perigo" id="vc-excluir">Excluir voucher</button>' : '') + '</div>' : '') +
      '</form>' +
      '<section aria-label="Pré-visualização do voucher" style="flex:1.2 1 520px;min-width:0;display:flex;flex-direction:column;gap:10px">' +
      '<span class="kl">Pré-visualização</span><div id="vc-preview"></div>' +
      '<section class="card pilha" style="gap:10px;margin-top:6px" id="vc-recentes"></section></section></div>';

    APP.aplicarMascaras(el);
    const selQ = $('#vc-quarto');
    const desenharQuartos = () => {
      const v = lerFormulario();
      const ok = v.entrada && v.saida && v.saida > v.entrada;
      selQ.innerHTML = '<option value="">Selecione</option>' + quartos.map(q => {
        const c = d.catPorId[q.categoria_id];
        const conf = ok ? DB.conflitos(d, q.id, v.entrada, v.saida, st.id).length : 0;
        const bloq = q.status_manual === 'mnt';
        return '<option value="' + esc(q.id) + '"' + (q.id === v.quarto_id ? ' selected' : '') + ((conf || bloq) && q.id !== v.quarto_id ? ' disabled' : '') + '>' +
          esc(q.numero) + ' · ' + esc(c ? c.nome : 'Sem categoria') + (conf ? ' (ocupado no período)' : (bloq ? ' (manutenção)' : '')) + '</option>';
      }).join('');
    };
    selQ.innerHTML = '<option value="' + esc(f.quarto_id) + '"></option>';
    selQ.value = f.quarto_id;
    desenharQuartos();

    const atualizar = () => { $('#vc-preview').innerHTML = previewHTML(dadosPreview(d, lerFormulario(), reg)); };
    atualizar();
    const form = $('#vc-form');
    form.addEventListener('input', atualizar);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'entrada' || e.target.name === 'saida') {
        const e1 = $('[name="entrada"]', form), s1 = $('[name="saida"]', form);
        if (e1.value && (!s1.value || s1.value <= e1.value)) s1.value = DB.somarDias(e1.value, 1);
        desenharQuartos();
      }
      if (e.target.name === 'quarto_id' || e.target.name === 'contratante_id') {
        const dia = diariaDoQuarto(d, $('[name="quarto_id"]', form).value, $('[name="contratante_id"]', form).value);
        if (dia) $('[name="diaria"]', form).value = APP.numBR(dia, 2);
      }
      if (e.target.name === 'contratante_id') {
        const ct = d.contratantePorId[e.target.value];
        const pg = $('[name="pagamento"]', form);
        if (ct && (ct.tipo === 'empresa' || ct.tipo === 'agencia') && /Faturar/.test(ct.forma_padrao || 'Faturar')) pg.value = 'Faturado à empresa';
        dicaContratante();
      }
      atualizar();
    });
    const dicaContratante = () => {
      const ct = d.contratantePorId[$('[name="contratante_id"]', form).value];
      $('#vc-dica-ct').textContent = ct && ct.tipo !== 'direto' ? 'Prazo ' + DB.num(ct.prazo_dias) + ' dia(s)' + (DB.num(ct.comissao_pct) ? ' · comissão ' + APP.numBR(ct.comissao_pct, 1) + '%' : '') : 'Tarifa de balcão';
    };
    dicaContratante();
    // Hóspede: ao escolher da lista, preenche documento e contatos
    const nomeInp = $('[name="hospede_nome"]', form);
    if (editavel) LANCAR.ligarBuscaHospede(d, nomeInp, (h) => {
      nomeInp.value = h.nome;
      $('[name="hospede_id"]', form).value = h.id;
      const set = (n, v) => { const i = $('[name="' + n + '"]', form); if (i) i.value = v || ''; };
      set('documento', h.cpf || h.documento); set('telefone', h.telefone); set('email', h.email);
      $('#vc-dica-hosp').textContent = 'Hóspede cadastrado' + (h.cidade ? ' · ' + h.cidade : '');
      atualizar();
    });
    const ligarHospede = () => {
      const atualId = $('[name="hospede_id"]', form).value;
      const h = (atualId && d.hospedes.find(x => x.id === atualId && String(x.nome).toLowerCase() === nomeInp.value.trim().toLowerCase())) ||
        d.hospedes.find(x => String(x.nome).toLowerCase() === nomeInp.value.trim().toLowerCase());
      $('[name="hospede_id"]', form).value = h ? h.id : '';
      $('#vc-dica-hosp').textContent = nomeInp.value.trim() ? (h ? 'Hóspede cadastrado' + (h.cidade ? ' · ' + h.cidade : '') : 'Novo hóspede: será cadastrado ao salvar a reserva.') : '';
      if (h) {
        const set = (n, v) => { const i = $('[name="' + n + '"]', form); if (i && !i.value && v) i.value = v; };
        set('documento', h.cpf || h.documento); set('telefone', h.telefone); set('email', h.email);
      }
      atualizar();
    };
    nomeInp.addEventListener('change', ligarHospede);
    nomeInp.addEventListener('blur', ligarHospede);
    if (f.hospede_nome) $('#vc-dica-hosp').textContent = f.hospede_id ? 'Hóspede cadastrado' : '';

    form.onsubmit = async (e) => { e.preventDefault(); const r = await salvar(d, reg); if (r) { st.id = r.id; montar(); } };
    const go = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    go('#vc-nova', () => { st.id = null; st.quartoInicial = null; st.hospedeInicial = null; montar(); });
    go('#vc-pdf', () => acao(d, reg, 'pdf'));
    go('#vc-imprimir', () => acao(d, reg, 'imprimir'));
    go('#vc-email', () => acao(d, reg, 'email'));
    go('#vc-whats', () => acao(d, reg, 'whats'));
    go('#vc-cancelar', () => cancelar(d, reg));
    go('#vc-excluir', () => excluir(d, reg));
    go('#vc-checkin', () => APP.ir('tela-movimento', { reserva: reg.id, fazerCheckin: true }));
    desenharRecentes(d);
  }

  function desenharRecentes(d) {
    const q = String(st.busca || '').toLowerCase();
    let l = d.reservas.slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    if (q) l = l.filter(r => (r.codigo + ' ' + r.hospede_nome).toLowerCase().indexOf(q) !== -1);
    l = l.slice(0, 10);
    const tag = (r) => r.status === 'cancelada' ? ['Cancelada', 'b-mnt'] : r.status === 'hospedado' ? ['Hospedado', 'b-ocp'] :
      r.status === 'finalizada' ? ['Finalizada', 'b-neutro'] : r.voucher_status === 'enviado' ? ['Enviado', 'b-liv'] : ['Aguardando envio', 'b-res'];
    const el = $('#vc-recentes');
    el.innerHTML = '<div class="linha-topo"><h2 style="font-size:15px">Vouchers recentes</h2><label class="busca creme" style="flex:0 1 240px;height:40px">' + icone('busca', 16, 1.8) +
      '<input type="search" id="vc-busca" placeholder="Código ou hóspede" value="' + esc(st.busca) + '"></label></div>' +
      (l.length ? '<div class="lista-linhas">' + l.map(r => {
        const qq = d.quartoPorId[r.quarto_id]; const t = tag(r);
        return '<div style="cursor:pointer" data-r="' + esc(r.id) + '"><span><strong>' + esc(r.codigo) + '</strong> · ' + esc(r.hospede_nome) + ' · ' + esc(qq ? qq.numero : '—') +
          '<br><small class="apoio">' + APP.dataCurta(r.entrada) + ' a ' + APP.dataCurta(r.saida) + '</small></span><span class="badge ' + t[1] + '">' + t[0] + '</span></div>';
      }).join('') + '</div>' : '<p class="vazio">Nenhum voucher emitido ainda.</p>');
    $$('[data-r]', el).forEach(x => x.onclick = () => { st.id = x.dataset.r; montar(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const b = $('#vc-busca');
    b.oninput = () => { st.busca = b.value; desenharRecentes(d); const nb = $('#vc-busca'); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); };
  }

  /** Valida e grava a reserva (cria o hóspede se for novo). Retorna o registro. */
  async function salvar(d, reg) {
    const f = lerFormulario();
    const erros = [];
    if (!f.hospede_nome || f.hospede_nome.length < 3) erros.push('Informe o hóspede principal.');
    if (!f.quarto_id) erros.push('Selecione o quarto.');
    if (!f.entrada || !f.saida) erros.push('Informe entrada e saída.');
    else if (f.saida <= f.entrada) erros.push('A saída precisa ser depois da entrada.');
    if (f.adultos < 1) erros.push('Informe ao menos 1 adulto.');
    if (f.diaria < 0) erros.push('Diária inválida.');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) erros.push('E-mail inválido.');
    if (erros.length) { APP.aviso(erros.join(' '), 'erro', 7); return null; }
    if (!reg && f.entrada < DB.hoje()) {
      const r = await APP.confirmar('Entrada no passado', 'A data de entrada (' + dataBR(f.entrada) + ') já passou. Gravar mesmo assim?', { rotuloOk: 'Gravar' });
      if (!r.ok) return null;
    }
    const conf = DB.conflitos(d, f.quarto_id, f.entrada, f.saida, reg && reg.id);
    if (conf.length) {
      const c = conf[0];
      APP.aviso('Quarto indisponível no período: ' + c.hospede_nome + ' (' + c.codigo + ') de ' + APP.dataCurta(c.entrada) + ' a ' + APP.dataCurta(c.saida) + '.', 'erro', 8);
      return null;
    }
    const q = d.quartoPorId[f.quarto_id]; const cat = q && d.catPorId[q.categoria_id];
    if (cat && cat.capacidade && f.adultos + f.criancas > cat.capacidade) {
      const r = await APP.confirmar('Acima da capacidade', 'O quarto ' + q.numero + ' (' + cat.nome + ') comporta ' + cat.capacidade + ' pessoa(s). Confirmar ' + (f.adultos + f.criancas) + '?', { rotuloOk: 'Confirmar' });
      if (!r.ok) return null;
    }
    if (!f.diaria) {
      const r = await APP.confirmar('Diária zerada', 'A reserva está sem valor de diária. Gravar assim (cortesia ou tarifa a definir)?', { rotuloOk: 'Gravar' });
      if (!r.ok) return null;
    }
    // Hóspede: liga ao cadastro existente ou cria um novo
    let hid = f.hospede_id;
    let h = hid ? d.hospedes.find(x => x.id === hid) : d.hospedes.find(x => String(x.nome).toLowerCase() === f.hospede_nome.toLowerCase());
    if (!h && AUTH.podeEditar('voucher')) {
      const docDig = APP.soDigitos(f.documento);
      h = await DB.salvar('hospedes', {
        nome: f.hospede_nome, cpf: docDig.length === 11 && APP.cpfValido(docDig) ? APP.mascaraCPF(docDig) : null,
        documento: docDig.length === 11 && APP.cpfValido(docDig) ? null : (f.documento || null),
        telefone: f.telefone || null, email: f.email || null, nacionalidade: 'Brasileira'
      });
    } else if (h) {
      const extra = {};
      if (!h.telefone && f.telefone) extra.telefone = f.telefone;
      if (!h.email && f.email) extra.email = f.email;
      if (Object.keys(extra).length) h = await DB.salvar('hospedes', Object.assign({}, h, extra));
    }
    const novo = Object.assign({}, reg || {}, {
      hospede_id: h ? h.id : null, hospede_nome: f.hospede_nome, documento: f.documento, telefone: f.telefone, email: f.email,
      empresa: (h && h.empresa) || (reg && reg.empresa) || null,
      quarto_id: f.quarto_id, entrada: f.entrada, saida: f.saida, adultos: f.adultos, criancas: f.criancas,
      regime: f.regime, pagamento: f.pagamento, diaria: f.diaria, observacoes: f.observacoes
    }, DB.dadosContratante(d, f.contratante_id));
    if (!reg) { novo.codigo = DB.codigoVoucher(); novo.status = 'reservada'; novo.voucher_status = 'aguardando'; }
    const salvo = await DB.salvar('reservas', novo);
    APP.aviso('Reserva ' + salvo.codigo + ' gravada.', 'sucesso');
    return salvo;
  }

  /** Garante a reserva gravada (com o que está na tela) antes de gerar/enviar. */
  async function garantirSalvo(d, reg) {
    if (!AUTH.podeEditar('voucher') || (reg && reg.status !== 'reservada')) return reg;
    const f = lerFormulario();
    const mudou = !reg || ['hospede_nome', 'documento', 'telefone', 'email', 'quarto_id', 'entrada', 'saida', 'regime', 'pagamento', 'observacoes', 'contratante_id']
      .some(k => String(reg[k] || '') !== String(f[k] || '')) || DB.num(reg.adultos) !== f.adultos || DB.num(reg.criancas) !== f.criancas || DB.num(reg.diaria) !== f.diaria;
    if (!mudou) return reg;
    const r = await salvar(d, reg);
    if (r) st.id = r.id;
    return r;
  }

  function mensagem(p) {
    const h = p.hotel;
    return 'Olá, ' + String(p.nome).split(' ')[0] + '! Segue a confirmação da sua reserva no ' + h.nome + '.\n\n' +
      'Voucher: ' + p.codigo + '\nQuarto: ' + p.quarto + ' · ' + p.tipo + '\n' +
      'Entrada: ' + dataBR(p.entrada) + ' a partir das ' + (h.horaCheckin || '14:00') + '\n' +
      'Saída: ' + dataBR(p.saida) + ' até as ' + (h.horaCheckout || '12:00') + '\n' +
      'Noites: ' + p.noites + ' · ' + p.pessoas + '\nRegime: ' + p.regime + '\n' +
      'Total: ' + brl(p.total) + ' (' + p.pagamento + ')\n' + (p.obs ? '\nObservações: ' + p.obs + '\n' : '') +
      '\n' + (h.politica || '') + (h.telefone ? '\n\nDúvidas: ' + h.telefone : '');
  }

  async function marcarEnviado(reg) {
    if (!reg || reg.voucher_status === 'enviado' || !AUTH.podeEditar('voucher')) return;
    await DB.salvar('reservas', Object.assign({}, reg, { voucher_status: 'enviado', voucher_enviado_em: DB.agoraISO() }));
  }

  async function acao(d, reg, tipo) {
    reg = await garantirSalvo(d, reg);
    if (!reg) {
      if (!AUTH.podeEditar('voucher')) APP.aviso('Selecione um voucher salvo.', 'alerta');
      return;
    }
    const d2 = await APP.dados();
    reg = d2.reservas.find(r => r.id === reg.id) || reg;
    const p = dadosPreview(d2, Object.assign({}, reg, { adultos: DB.num(reg.adultos), criancas: DB.num(reg.criancas), diaria: DB.num(reg.diaria) }), reg);
    if (tipo === 'imprimir') { await montar({ reserva: reg.id }); setTimeout(() => window.print(), 300); return; }
    if (tipo === 'pdf') {
      APP.carregando(true, 'Montando o PDF…');
      try { const blob = await PDFGEN.voucher(p, textoQR(p)); await APP.entregarArquivo(blob, 'Voucher-' + reg.codigo + '.pdf', 'application/pdf'); }
      catch (e) { APP.aviso('Falha ao gerar o PDF: ' + e.message, 'erro', 8); }
      finally { APP.carregando(false); }
      montar({ reserva: reg.id });
      return;
    }
    if (tipo === 'whats') {
      if (APP.soDigitos(reg.telefone).length < 10) { APP.aviso('Informe o telefone/WhatsApp do hóspede na reserva.', 'erro'); return; }
      window.open(APP.whatsLink(reg.telefone, mensagem(p)), '_blank', 'noopener');
      await marcarEnviado(reg);
      montar({ reserva: reg.id });
      return;
    }
    if (tipo === 'email') {
      const assunto = 'Voucher de hospedagem ' + reg.codigo + ' — ' + p.hotel.nome;
      // No celular: compartilha o PDF (o e-mail aparece na folha); no computador: abre o e-mail e baixa o PDF para anexar.
      APP.carregando(true, 'Preparando…');
      let blob = null;
      try { blob = await PDFGEN.voucher(p, textoQR(p)); } catch (e) {}
      APP.carregando(false);
      const arquivo = blob ? new File([blob], 'Voucher-' + reg.codigo + '.pdf', { type: 'application/pdf' }) : null;
      let compartilhou = false;
      if (APP.EH_MOVEL && arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await new Promise(res => APP.janela({
          titulo: 'Enviar voucher', html: '<p style="margin:0">Toque em <b>Compartilhar</b> e escolha o aplicativo de e-mail.</p>',
          aoFechar: res,
          botoes: [{ rotulo: 'Compartilhar', classe: 'btn-escuro', acao: async () => {
            try { await navigator.share({ files: [arquivo], title: assunto, text: mensagem(p) }); compartilhou = true; } catch (e) { if (e && e.name === 'AbortError') return false; }
          } }]
        }));
      }
      if (!compartilhou) {
        if (!reg.email) { APP.aviso('Sem e-mail na reserva: o e-mail abrirá sem destinatário.', 'alerta'); }
        window.location.href = 'mailto:' + encodeURIComponent(reg.email || '') + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(mensagem(p) + '\n\n(O voucher em PDF segue anexo.)');
        if (blob && !APP.EH_MOVEL) { setTimeout(() => APP.entregarArquivo(blob, 'Voucher-' + reg.codigo + '.pdf', 'application/pdf'), 600); APP.aviso('O PDF foi baixado: anexe-o ao e-mail.', 'alerta', 8); }
      }
      await marcarEnviado(reg);
      montar({ reserva: reg.id });
    }
  }

  /* ---------- Cancelar e excluir ---------- */
  const vinculos = (d, reg) => ({
    consumos: d.consumos.filter(c => c.reserva_id === reg.id),
    lancamentos: d.lancamentos.filter(l => l.reserva_id === reg.id)
  });

  /** Reserva confirmada: quem edita vouchers. Hóspede já na casa (check-in por engano): quem edita a movimentação. */
  function podeCancelar(reg) {
    if (reg.status === 'reservada') return AUTH.podeEditar('voucher') || AUTH.podeEditar('movimento');
    if (reg.status === 'hospedado') return AUTH.podeEditar('movimento');
    return false;
  }

  /** Administrador exclui qualquer voucher (com os lançamentos ligados).
   *  Demais usuários: só reserva confirmada ou cancelada, sem consumo nem lançamento financeiro. */
  function podeExcluir(d, reg) {
    if (AUTH.ehAdmin()) return true;
    if (!AUTH.podeEditar('voucher') || (reg.status !== 'reservada' && reg.status !== 'cancelada')) return false;
    const v = vinculos(d, reg);
    return !v.consumos.length && !v.lancamentos.length;
  }

  async function cancelar(d, reg) {
    const hosp = reg.status === 'hospedado';
    const v = vinculos(d, reg);
    const txt = 'Cancelar o voucher ' + reg.codigo + ' de ' + reg.hospede_nome + '? O quarto fica livre para o período.' +
      (hosp ? ' O hóspede já fez check-in: a estadia será anulada' + (v.consumos.length ? ' e os ' + v.consumos.length + ' consumo(s) lançados no quarto serão estornados' : '') +
        '.' + (v.lancamentos.length ? ' Recebimentos já lançados continuam no Financeiro para conferência.' : '') : '');
    const r = await APP.confirmar('Cancelar voucher', txt, { rotuloOk: 'Cancelar voucher', perigo: true, campo: 'Motivo (opcional)' });
    if (!r.ok) return;
    if (hosp) for (const c of v.consumos) await DB.excluir('consumos', c.id);
    await DB.salvar('reservas', Object.assign({}, reg, { status: 'cancelada', observacoes: (reg.observacoes ? reg.observacoes + ' | ' : '') + 'Cancelada em ' + dataBR(DB.hoje()) + (r.valor ? ': ' + r.valor : '') }));
    APP.aviso('Voucher ' + reg.codigo + ' cancelado.', 'sucesso');
    montar({ reserva: reg.id });
  }

  async function excluir(d, reg) {
    const v = vinculos(d, reg);
    const extra = [];
    if (v.consumos.length) extra.push(v.consumos.length + ' consumo(s)');
    if (v.lancamentos.length) extra.push(v.lancamentos.length + ' lançamento(s) financeiro(s)');
    const r = await APP.confirmar('Excluir voucher',
      'Excluir definitivamente o voucher ' + reg.codigo + ' de ' + reg.hospede_nome + '?' +
      (extra.length ? ' Também serão excluídos ' + extra.join(' e ') + ' ligados a ele.' : '') +
      ' Esta ação não pode ser desfeita. O cadastro do hóspede é mantido.',
      { rotuloOk: 'Excluir voucher', perigo: true });
    if (!r.ok) return;
    for (const c of v.consumos) await DB.excluir('consumos', c.id);
    for (const l of v.lancamentos) await DB.excluir('lancamentos', l.id);
    await DB.excluir('reservas', reg.id);
    APP.aviso('Voucher ' + reg.codigo + ' excluído.', 'sucesso');
    st.id = null;
    montar();
  }

  return { montar: montar, previewHTML: previewHTML, dadosPreview: dadosPreview, textoQR: textoQR };
})();

window.VOUCHER = VOUCHER;
