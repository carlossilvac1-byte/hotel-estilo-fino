/* =====================================================================
 * hospedes.js — CADASTRO DE HÓSPEDES (FNRH)
 * Ficha do hóspede (novo ou edição), lista com busca e paginação,
 * importação/exportação de planilha (CSV ; ou ,).
 * ===================================================================== */

const HOSPEDES = (function () {
  const { $, $$, esc, icone, opcoes } = APP;
  const st = { busca: '', pagina: 0, editando: null, filtro: 'todos' };
  const POR_PAGINA = 10;

  const CAMPOS_CSV = {
    nome: ['nome', 'nome completo', 'hospede', 'hóspede'], cpf: ['cpf'], documento: ['rg', 'documento', 'passaporte', 'rg / passaporte'],
    nascimento: ['nascimento', 'data de nascimento'], nacionalidade: ['nacionalidade'], telefone: ['telefone', 'whatsapp', 'celular', 'telefone / whatsapp'],
    email: ['email', 'e-mail'], cep: ['cep'], endereco: ['endereco', 'endereço', 'logradouro', 'logradouro e numero'], cidade: ['cidade'], uf: ['uf', 'estado'],
    empresa: ['empresa', 'cnpj', 'empresa / cnpj'], placa: ['placa', 'placa do veiculo'], motivo: ['motivo', 'motivo da viagem'],
    origem: ['origem', 'como conheceu', 'como conheceu o hotel'], observacoes: ['observacoes', 'observações', 'obs']
  };

  function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

  function estatisticas(d) {
    const porHosp = {};
    d.reservas.forEach(r => {
      if (!r.hospede_id || r.status === 'cancelada') return;
      const e = porHosp[r.hospede_id] = porHosp[r.hospede_id] || { estadias: 0, hospedado: false, reserva: false };
      if (r.status === 'hospedado' || r.status === 'finalizada') e.estadias++;
      if (r.status === 'hospedado') e.hospedado = true;
      if (r.status === 'reservada') e.reserva = true;
    });
    return porHosp;
  }

  function fichaHTML(h, edita) {
    h = h || {};
    const dis = edita ? '' : ' disabled';
    return '<form class="card estreita pilha-16" id="hp-form" aria-label="Ficha do hóspede" style="flex:1 1 480px" autocomplete="off">' +
      '<div class="linha-topo"><h2>Ficha do hóspede</h2><span class="badge ' + (h.id ? 'b-ocp">Editando cadastro' : 'b-res">Novo cadastro') + '</span></div>' +
      '<fieldset class="secao"' + dis + '><legend>Dados pessoais</legend>' +
      '<label class="fld">Nome completo<input name="nome" value="' + esc(h.nome) + '" placeholder="Nome e sobrenome" maxlength="120"></label>' +
      '<div class="grade-campos">' +
      '<label class="fld">CPF<input name="cpf" inputmode="numeric" data-mascara="cpf" value="' + esc(h.cpf) + '" placeholder="000.000.000-00"></label>' +
      '<label class="fld">RG / Passaporte<input name="documento" value="' + esc(h.documento) + '" placeholder="Número do documento"></label>' +
      '<label class="fld">Data de nascimento<input type="date" name="nascimento" value="' + esc(h.nascimento) + '"></label>' +
      '<label class="fld">Nacionalidade<select name="nacionalidade">' + opcoes(['Brasileira', 'Estrangeira'], h.nacionalidade || 'Brasileira') + '</select></label>' +
      '</div></fieldset>' +
      '<fieldset class="secao"' + dis + '><legend>Contato</legend><div class="grade-campos">' +
      '<label class="fld">Telefone / WhatsApp<input type="tel" name="telefone" data-mascara="tel" value="' + esc(h.telefone) + '" placeholder="(89) 90000-0000"></label>' +
      '<label class="fld">E-mail<input type="email" name="email" value="' + esc(h.email) + '" placeholder="nome@email.com"></label>' +
      '</div></fieldset>' +
      '<fieldset class="secao"' + dis + '><legend>Endereço</legend><div class="grade-campos" style="grid-template-columns:repeat(auto-fit,minmax(min(140px,100%),1fr))">' +
      '<label class="fld">CEP<input name="cep" inputmode="numeric" data-mascara="cep" value="' + esc(h.cep) + '" placeholder="00000-000"></label>' +
      '<label class="fld largo">Logradouro e número<input name="endereco" value="' + esc(h.endereco) + '" placeholder="Rua, número, complemento"></label>' +
      '<label class="fld">Cidade<input name="cidade" value="' + esc(h.cidade) + '" placeholder="Cidade"></label>' +
      '<label class="fld">UF<select name="uf">' + opcoes(CONFIG.ufs, h.uf || '', '—') + '</select></label>' +
      '</div></fieldset>' +
      '<fieldset class="secao"' + dis + '><legend>Hospedagem</legend><div class="grade-campos">' +
      '<label class="fld">Empresa / CNPJ (opcional)<input name="empresa" value="' + esc(h.empresa) + '" placeholder="Para faturamento corporativo"></label>' +
      '<label class="fld">Placa do veículo<input name="placa" value="' + esc(h.placa) + '" placeholder="ABC1D23" maxlength="8" style="text-transform:uppercase"></label>' +
      '<label class="fld">Motivo da viagem<select name="motivo">' + opcoes(CONFIG.motivosViagem, h.motivo || '', '—') + '</select></label>' +
      '<label class="fld">Como conheceu o hotel<select name="origem">' + opcoes(CONFIG.origensHospede, h.origem || '', '—') + '</select></label>' +
      '</div><label class="fld">Observações e preferências<textarea name="observacoes" placeholder="Ex.: alergias alimentares, andar preferido, horário de chegada">' + esc(h.observacoes) + '</textarea></label></fieldset>' +
      (edita ? '<div class="rodape-form">' +
        (h.id ? '<button type="button" class="btn btn-perigo" id="hp-excluir">Excluir</button>' : '') +
        '<button type="button" class="btn" id="hp-limpar">' + (h.id ? 'Novo cadastro' : 'Limpar') + '</button>' +
        (AUTH.podeEditar('movimento') ? '<button type="button" class="btn btn-suave" id="hp-salvar-checkin">Salvar e fazer check-in</button>' : '') +
        '<button type="submit" class="btn btn-escuro" id="hp-salvar">Salvar hóspede</button></div>' : '') +
      '</form>';
  }

  async function montar(params) {
    params = params || {};
    const d = await APP.dados();
    if (params.hospede) st.editando = params.hospede;
    if (params.novo) st.editando = null;
    const el = $('#tela-hospedes');
    const edita = AUTH.podeEditar('hospedes');
    const h = st.editando ? d.hospedes.find(x => x.id === st.editando) : null;
    if (st.editando && !h) st.editando = null;

    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Cadastro de hóspedes</h1><p>Ficha Nacional de Registro de Hóspedes (FNRH) · ' + d.hospedes.length + ' hóspede(s) cadastrado(s)</p></div>' +
      '<div class="acoes">' + (edita ? '<button type="button" class="btn" id="hp-importar">Importar planilha</button>' : '') +
      '<button type="button" class="btn" id="hp-exportar">' + icone('baixar', 18, 1.8) + 'Excel</button>' +
      (edita ? '<button type="button" class="btn btn-escuro" id="hp-novo">' + icone('mais2', 18, 2) + 'Novo hóspede</button>' : '') +
      '<input type="file" id="hp-arquivo" accept=".csv,text/csv,.txt" hidden></div></header>' +
      '<div class="duas-colunas">' + fichaHTML(h || (params.nome ? { nome: params.nome } : null), edita) +
      '<section class="card pilha" style="flex:1.3 1 520px;min-width:0;gap:14px" id="hp-lista"></section></div>';

    APP.aplicarMascaras(el);
    desenharLista(d);

    const form = $('#hp-form');
    if (edita) {
      form.onsubmit = (e) => { e.preventDefault(); salvar(false); };
      $('#hp-limpar').onclick = () => { st.editando = null; montar({ novo: true }); };
      const sc = $('#hp-salvar-checkin'); if (sc) sc.onclick = () => salvar(true);
      const ex = $('#hp-excluir'); if (ex) ex.onclick = () => excluir(h, d);
      $('#hp-novo').onclick = () => { st.editando = null; montar({ novo: true }); $('[name="nome"]', $('#hp-form')).focus(); };
      $('#hp-importar').onclick = () => $('#hp-arquivo').click();
      $('#hp-arquivo').onchange = (e) => importar(e.target.files[0]);
    }
    $('#hp-exportar').onclick = () => exportar(d);
  }

  function desenharLista(d) {
    const est = estatisticas(d);
    const q = semAcento(st.busca);
    const qd = APP.soDigitos(st.busca);
    let lista = d.hospedes.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const cont = {
      agora: lista.filter(h => est[h.id] && est[h.id].hospedado).length,
      reserva: lista.filter(h => est[h.id] && est[h.id].reserva).length,
      freq: lista.filter(h => est[h.id] && est[h.id].estadias >= 3).length
    };
    if (st.filtro === 'agora') lista = lista.filter(h => est[h.id] && est[h.id].hospedado);
    if (st.filtro === 'reserva') lista = lista.filter(h => est[h.id] && est[h.id].reserva);
    if (st.filtro === 'freq') lista = lista.filter(h => est[h.id] && est[h.id].estadias >= 3);
    if (q) lista = lista.filter(h => semAcento(h.nome + ' ' + h.cidade + ' ' + h.email).indexOf(q) !== -1 || (qd.length >= 3 && APP.soDigitos(h.cpf + ' ' + h.telefone).indexOf(qd) !== -1));
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    if (st.pagina >= paginas) st.pagina = paginas - 1;
    const pag = lista.slice(st.pagina * POR_PAGINA, (st.pagina + 1) * POR_PAGINA);

    const linhas = pag.map(h => {
      const e = est[h.id] || { estadias: 0 };
      const sit = e.hospedado ? ['Hospedado', 'b-ocp'] : (e.reserva ? ['Reserva', 'b-res'] : ['Sem estadia ativa', 'b-neutro']);
      return '<tr class="clicavel" data-h="' + esc(h.id) + '"' + (h.id === st.editando ? ' style="background:#FAF6EC"' : '') + '><td><span style="display:flex;align-items:center;gap:10px"><span class="mini-avatar">' + esc(APP.iniciais(h.nome)) + '</span>' +
        '<span style="display:flex;flex-direction:column;gap:1px"><b>' + esc(h.nome) + '</b><small class="apoio">' + esc(h.email || h.documento || '') + '</small></span></span></td>' +
        '<td>' + esc(mascararCPF(h.cpf)) + '</td><td>' + esc(h.telefone || '—') + '</td><td>' + esc(h.cidade ? h.cidade + (h.uf ? '/' + h.uf : '') : '—') + '</td>' +
        '<td class="centro">' + e.estadias + '</td><td><span class="badge ' + sit[1] + '">' + sit[0] + '</span></td></tr>';
    }).join('');

    const filtros = [['todos', 'Todos · ' + d.hospedes.length], ['agora', 'Hospedados agora · ' + cont.agora], ['reserva', 'Com reserva · ' + cont.reserva], ['freq', 'Frequentes · ' + cont.freq]];
    const el = $('#hp-lista');
    el.innerHTML =
      '<div class="linha-topo"><h2>Hóspedes cadastrados</h2><label class="busca creme" style="flex:0 1 300px">' + icone('busca', 18, 1.8) +
      '<span class="sr">Buscar hóspede</span><input type="search" id="hp-busca" value="' + esc(st.busca) + '" placeholder="Nome, CPF ou cidade"></label></div>' +
      '<div class="chips" style="gap:8px">' + filtros.map(f => '<button type="button" class="badge ' + (st.filtro === f[0] ? 'b-ocp' : 'b-neutro') + '" style="border:0;cursor:pointer;min-height:32px" data-f="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
      (linhas ? '<div class="rolagem"><table><thead><tr><th>Hóspede</th><th>CPF</th><th>Telefone</th><th>Cidade</th><th>Estadias</th><th>Situação</th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
              : '<p class="vazio">' + (d.hospedes.length ? 'Nenhum hóspede encontrado para essa busca.' : 'Nenhum hóspede cadastrado ainda.') + '</p>') +
      '<div class="paginacao"><span>Mostrando ' + pag.length + ' de ' + lista.length + '</span><div style="display:flex;gap:6px">' +
      '<button type="button" class="btn btn-icone" id="hp-ant" aria-label="Página anterior"' + (st.pagina === 0 ? ' disabled' : '') + '>‹</button>' +
      '<button type="button" class="btn btn-icone" id="hp-prox" aria-label="Próxima página"' + (st.pagina >= paginas - 1 ? ' disabled' : '') + '>›</button></div></div>';

    const b = $('#hp-busca');
    b.oninput = () => { st.busca = b.value; st.pagina = 0; desenharLista(d); const nb = $('#hp-busca'); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); };
    $$('[data-f]', el).forEach(x => x.onclick = () => { st.filtro = x.dataset.f; st.pagina = 0; desenharLista(d); });
    $$('[data-h]', el).forEach(tr => tr.onclick = () => {
      st.editando = tr.dataset.h; montar();
      if (window.innerWidth < 1024) setTimeout(() => $('#hp-form').scrollIntoView({ behavior: 'smooth' }), 50);
    });
    $('#hp-ant').onclick = () => { st.pagina--; desenharLista(d); };
    $('#hp-prox').onclick = () => { st.pagina++; desenharLista(d); };
  }

  function mascararCPF(cpf) {
    const d = APP.soDigitos(cpf);
    if (d.length !== 11) return cpf || '—';
    return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**';
  }

  async function salvar(fazerCheckin) {
    const form = $('#hp-form');
    const v = APP.lerForm(form);
    $$('.fld', form).forEach(f => f.classList.remove('invalido'));
    const erros = [];
    const marca = (n) => { const i = $('[name="' + n + '"]', form); if (i) i.closest('.fld').classList.add('invalido'); };
    if (!v.nome || v.nome.length < 3) { erros.push('Informe o nome do hóspede.'); marca('nome'); }
    if (v.cpf && v.nacionalidade !== 'Estrangeira' && !APP.cpfValido(v.cpf)) { erros.push('CPF inválido.'); marca('cpf'); }
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { erros.push('E-mail inválido.'); marca('email'); }
    if (v.nascimento && v.nascimento > DB.hoje()) { erros.push('Data de nascimento no futuro.'); marca('nascimento'); }
    if (erros.length) { APP.aviso(erros.join(' '), 'erro', 7); return; }
    const d = await APP.dados();
    if (v.cpf) {
      const dup = d.hospedes.find(x => x.id !== st.editando && APP.soDigitos(x.cpf) === APP.soDigitos(v.cpf));
      if (dup) {
        const r = await APP.confirmar('CPF já cadastrado', 'Este CPF já pertence a ' + dup.nome + '. Abrir o cadastro existente?', { rotuloOk: 'Abrir cadastro' });
        if (r.ok) { st.editando = dup.id; montar(); }
        return;
      }
    }
    v.placa = (v.placa || '').toUpperCase();
    const atual = st.editando ? d.hospedes.find(x => x.id === st.editando) : {};
    const reg = await DB.salvar('hospedes', Object.assign({}, atual, v, { id: st.editando || undefined }));
    // Atualiza nome/contato nas reservas ainda abertas deste hóspede
    for (const r of d.reservas.filter(r => r.hospede_id === reg.id && (r.status === 'reservada' || r.status === 'hospedado'))) {
      if (r.hospede_nome !== reg.nome || r.telefone !== reg.telefone || r.email !== reg.email) {
        await DB.salvar('reservas', Object.assign({}, r, { hospede_nome: reg.nome, telefone: reg.telefone, email: reg.email, documento: r.documento || reg.cpf || reg.documento }));
      }
    }
    APP.aviso('Hóspede ' + reg.nome + ' salvo.', 'sucesso');
    if (fazerCheckin) { st.editando = null; APP.ir('tela-movimento', { walkin: true, hospede: reg.id }); return; }
    st.editando = reg.id;
    montar();
  }

  async function excluir(h, d) {
    if (d.reservas.some(r => r.hospede_id === h.id && (r.status === 'reservada' || r.status === 'hospedado'))) {
      APP.aviso('Não é possível excluir: o hóspede tem reserva ou estadia em aberto.', 'erro', 7); return;
    }
    const r = await APP.confirmar('Excluir hóspede', 'Excluir o cadastro de ' + h.nome + '? O histórico de estadias é mantido.', { rotuloOk: 'Excluir', perigo: true });
    if (!r.ok) return;
    await DB.excluir('hospedes', h.id);
    st.editando = null;
    APP.aviso('Cadastro excluído.', 'sucesso');
    montar({ novo: true });
  }

  function exportar(d) {
    const est = estatisticas(d);
    const cols = ['nome', 'cpf', 'documento', 'nascimento', 'nacionalidade', 'telefone', 'email', 'cep', 'endereco', 'cidade', 'uf', 'empresa', 'placa', 'motivo', 'origem', 'observacoes'];
    const linhas = [cols.map(c => c === 'endereco' ? 'Endereço' : c.charAt(0).toUpperCase() + c.slice(1)).concat(['Estadias'])];
    d.hospedes.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      .forEach(h => linhas.push(cols.map(c => c === 'nascimento' && h[c] ? APP.dataBR(h[c]) : (h[c] || '')).concat([(est[h.id] || {}).estadias || 0])));
    APP.baixarCSV('hospedes-' + DB.hoje() + '.csv', linhas);
  }

  function lerCSV(txt) {
    txt = txt.replace(/^﻿/, '');
    const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (aspas) { if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
      else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; linha.push(campo); campo = ''; if (linha.some(x => x.trim())) linhas.push(linha); linha = []; }
      else campo += c;
    }
    linha.push(campo); if (linha.some(x => x.trim())) linhas.push(linha);
    return linhas;
  }

  async function importar(arquivo) {
    if (!arquivo) return;
    try {
      const linhas = lerCSV(await arquivo.text());
      if (linhas.length < 2) throw new Error('A planilha precisa de uma linha de cabeçalho e ao menos um hóspede.');
      const cab = linhas[0].map(semAcento);
      const mapa = {};
      Object.keys(CAMPOS_CSV).forEach(k => { const i = cab.findIndex(c => CAMPOS_CSV[k].map(semAcento).indexOf(c) !== -1); if (i !== -1) mapa[k] = i; });
      if (mapa.nome === undefined) throw new Error('Coluna "Nome" não encontrada no cabeçalho.');
      const d = await APP.dados();
      const cpfs = new Set(d.hospedes.map(h => APP.soDigitos(h.cpf)).filter(Boolean));
      let novos = 0, ignorados = 0;
      for (const l of linhas.slice(1)) {
        const o = {};
        Object.keys(mapa).forEach(k => { o[k] = (l[mapa[k]] || '').trim(); });
        if (!o.nome) { ignorados++; continue; }
        if (o.cpf) { if (cpfs.has(APP.soDigitos(o.cpf))) { ignorados++; continue; } o.cpf = APP.mascaraCPF(o.cpf); cpfs.add(APP.soDigitos(o.cpf)); }
        if (o.nascimento && /^\d{2}\/\d{2}\/\d{4}$/.test(o.nascimento)) { const p = o.nascimento.split('/'); o.nascimento = p[2] + '-' + p[1] + '-' + p[0]; }
        if (o.nascimento && !/^\d{4}-\d{2}-\d{2}$/.test(o.nascimento)) o.nascimento = null;
        if (o.telefone) o.telefone = APP.mascaraTelefone(o.telefone);
        o.nacionalidade = o.nacionalidade || 'Brasileira';
        await DB.salvar('hospedes', o);
        novos++;
      }
      APP.aviso(novos + ' hóspede(s) importado(s)' + (ignorados ? ', ' + ignorados + ' ignorado(s) (sem nome ou CPF já cadastrado)' : '') + '.', 'sucesso', 8);
      montar();
    } catch (e) { APP.aviso('Importação: ' + e.message, 'erro', 8); }
    finally { const f = $('#hp-arquivo'); if (f) f.value = ''; }
  }

  return { montar: montar, mascararCPF: mascararCPF };
})();

window.HOSPEDES = HOSPEDES;
