/* =====================================================================
 * ajustes.js — CONFIGURAÇÕES
 * Categorias de quarto e tarifas (suítes e valores), cadastro dos
 * quartos (número, andar, categoria), dados do hotel (voucher e PDFs)
 * e cópia de segurança (backup) dos dados do aparelho.
 * ===================================================================== */

const AJUSTES = (function () {
  const { $, $$, esc, brl, icone, opcoes } = APP;
  const st = { aba: 'categorias' };

  async function montar(params) {
    params = params || {};
    if (params.aba) st.aba = params.aba;
    const d = await APP.dados();
    const edita = AUTH.podeEditar('configuracoes');
    const el = $('#tela-config');
    const abas = [['categorias', 'Categorias e tarifas'], ['quartos', 'Quartos'], ['hotel', 'Dados do hotel'], ['backup', 'Cópia de segurança']];
    el.innerHTML = '<header class="cab-pagina"><div><h1>Configurações</h1><p>Categorias, tarifas, quartos e dados do hotel' + (edita ? '' : ' · somente consulta') + '</p></div></header>' +
      '<div class="segmento" role="tablist">' + abas.map(a => '<button type="button" role="tab" data-aba="' + a[0] + '" aria-selected="' + (st.aba === a[0]) + '">' + a[1] + '</button>').join('') + '</div>' +
      '<div id="cf-conteudo"></div>';
    $$('[data-aba]', el).forEach(b => b.onclick = () => { st.aba = b.dataset.aba; montar(); });
    ({ categorias: categorias, quartos: quartos, hotel: hotel, backup: backup })[st.aba](d, edita);
  }

  /* ---------------- Categorias e tarifas ---------------- */
  function categorias(d, edita) {
    const box = $('#cf-conteudo');
    const uso = {}; d.quartos.forEach(q => { if (q.categoria_id && q.ativo !== false) uso[q.categoria_id] = (uso[q.categoria_id] || 0) + 1; });
    box.innerHTML = '<div class="linha-topo"><p class="apoio" style="margin:0">Cadastre os modelos de quarto (ex.: Standard, Luxo, Suíte) com a diária e a capacidade. A diária vira o valor padrão da reserva (pode ser ajustada em cada reserva).</p>' +
      (edita ? '<button type="button" class="btn btn-escuro" id="cf-nova-cat">' + icone('mais2', 18, 2) + 'Nova categoria</button>' : '') + '</div>' +
      (d.categorias.length ? '<div class="grade-kpis" style="grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))">' + d.categorias.map(c =>
        '<div class="card pilha" style="gap:8px' + (c.ativo === false ? ';opacity:.6' : '') + '"><div class="linha-topo"><b style="font-size:17px">' + esc(c.nome) + '</b>' + (c.ativo === false ? '<span class="badge b-neutro">Inativa</span>' : '') + '</div>' +
        '<span class="kpi-valor" style="font-size:26px">' + brl(c.diaria) + '<small class="kpi-sub" style="font-weight:600"> / diária</small></span>' +
        '<span class="kpi-sub">Capacidade: ' + c.capacidade + ' pessoa(s) · ' + (uso[c.id] || 0) + ' quarto(s)</span>' +
        (c.descricao ? '<span style="font-size:13px">' + esc(c.descricao) + '</span>' : '') +
        (edita ? '<div class="acoes"><button type="button" class="btn btn-peq" data-cat="' + esc(c.id) + '">Editar</button></div>' : '') + '</div>').join('') + '</div>'
        : '<div class="card"><p class="vazio">Nenhuma categoria cadastrada. ' + (edita ? 'Toque em "Nova categoria" para incluir suítes e valores.' : '') + '</p></div>');
    const n = $('#cf-nova-cat'); if (n) n.onclick = () => editarCategoria(d, {});
    $$('[data-cat]', box).forEach(b => b.onclick = () => editarCategoria(d, d.categorias.find(c => c.id === b.dataset.cat)));
  }

  function editarCategoria(d, c) {
    const novo = !c.id;
    const botoes = [{ rotulo: 'Cancelar' }];
    if (!novo) botoes.unshift({ rotulo: 'Excluir', classe: 'btn-perigo', acao: async () => {
      const usados = d.quartos.filter(q => q.categoria_id === c.id && q.ativo !== false).length;
      if (usados) throw new Error('Há ' + usados + ' quarto(s) nesta categoria. Troque a categoria deles antes (aba Quartos) ou marque a categoria como inativa.');
      const r = await APP.confirmar('Excluir categoria', 'Excluir a categoria ' + c.nome + '?', { rotuloOk: 'Excluir', perigo: true });
      if (!r.ok) return false;
      await DB.excluir('categorias', c.id); montar();
    } });
    botoes.push({ rotulo: novo ? 'Incluir' : 'Salvar', classe: 'btn-escuro', acao: async (k) => {
      const v = APP.lerForm(k);
      if (!v.nome) throw new Error('Informe o nome da categoria.');
      if (d.categorias.some(x => x.id !== c.id && String(x.nome).toLowerCase() === v.nome.toLowerCase())) throw new Error('Já existe uma categoria com este nome.');
      const diaria = APP.lerValor(v.diaria);
      const cap = parseInt(v.capacidade, 10);
      if (!(cap >= 1)) throw new Error('Capacidade inválida.');
      await DB.salvar('categorias', Object.assign({}, c, { nome: v.nome, diaria: diaria, capacidade: cap, descricao: v.descricao, ativo: v.ativo,
        ordem: c.ordem || (d.categorias.length + 1) }));
      APP.aviso('Categoria ' + v.nome + ' salva.', 'sucesso');
      montar();
    } });
    APP.janela({
      titulo: novo ? 'Nova categoria' : 'Editar categoria', botoes: botoes,
      html: '<label class="fld">Nome<input name="nome" maxlength="40" value="' + esc(c.nome || '') + '" placeholder="Ex.: Suíte Master"></label>' +
        '<div class="grade-campos"><label class="fld">Diária (R$)<input name="diaria" data-dinheiro inputmode="decimal" value="' + (c.diaria !== undefined ? APP.numBR(c.diaria, 2) : '') + '" placeholder="0,00"></label>' +
        '<label class="fld">Capacidade (pessoas)<input type="number" name="capacidade" min="1" max="12" value="' + (c.capacidade || 2) + '"></label></div>' +
        '<label class="fld">Descrição (opcional)<textarea name="descricao" maxlength="300" placeholder="Ex.: cama queen, ar-condicionado, frigobar, TV">' + esc(c.descricao || '') + '</textarea></label>' +
        '<label class="check"><input type="checkbox" name="ativo"' + (c.ativo === false ? '' : ' checked') + '> Categoria ativa</label>'
    });
  }

  /* ---------------- Quartos ---------------- */
  function quartos(d, edita) {
    const box = $('#cf-conteudo');
    const todos = d.quartos.slice().sort(DB.ordenarQuartos);
    const catOp = d.categorias.map(c => ({ v: c.id, t: c.nome + ' · ' + brl(c.diaria) }));
    const dis = edita ? '' : ' disabled';
    box.innerHTML = '<section class="card pilha" style="gap:14px"><div class="linha-topo"><div><h2>Quartos (' + todos.filter(q => q.ativo !== false).length + ' ativos)</h2>' +
      '<p class="apoio" style="margin:4px 0 0">Ajuste o número, o andar e a categoria de cada quarto. O andar agrupa os quartos nas telas.</p></div>' +
      (edita ? '<div class="acoes"><button type="button" class="btn" id="cf-novo-q">' + icone('mais2', 18, 2) + 'Novo quarto</button><button type="button" class="btn btn-escuro" id="cf-salvar-q">Salvar alterações</button></div>' : '') + '</div>' +
      (edita && d.categorias.length ? '<div class="faixa" style="background:#FAF6EC"><span>Aplicar a categoria</span><select id="cf-lote-cat" style="height:40px;border-radius:9px;border:1px solid #D9CDB4;padding:0 8px">' + opcoes(catOp, '', 'Selecione') + '</select>' +
        '<span>aos quartos marcados</span><button type="button" class="btn btn-peq" id="cf-lote-aplicar">Aplicar</button></div>' : '') +
      '<div class="rolagem"><table><thead><tr>' + (edita ? '<th><input type="checkbox" id="cf-marcar-todos" aria-label="Marcar todos"></th>' : '') + '<th>Número</th><th>Andar</th><th>Categoria</th><th>Ordem</th><th>Ativo</th></tr></thead><tbody>' +
      todos.map(q => '<tr data-q="' + esc(q.id) + '">' + (edita ? '<td><input type="checkbox" class="cf-marca"></td>' : '') +
        '<td><input name="numero" value="' + esc(q.numero) + '" maxlength="8" style="width:90px;height:38px;border-radius:9px;border:1px solid #D9CDB4;padding:0 8px"' + dis + '></td>' +
        '<td><input name="andar" value="' + esc(q.andar || '') + '" maxlength="20" placeholder="Ex.: 1º andar" style="width:130px;height:38px;border-radius:9px;border:1px solid #D9CDB4;padding:0 8px"' + dis + '></td>' +
        '<td><select name="categoria_id" style="height:38px;border-radius:9px;border:1px solid #D9CDB4;padding:0 8px;max-width:240px"' + dis + '>' + opcoes(catOp, q.categoria_id || '', 'Sem categoria') + '</select></td>' +
        '<td><input type="number" name="ordem" value="' + (q.ordem || 0) + '" style="width:70px;height:38px;border-radius:9px;border:1px solid #D9CDB4;padding:0 8px"' + dis + '></td>' +
        '<td><input type="checkbox" name="ativo"' + (q.ativo === false ? '' : ' checked') + dis + ' style="width:18px;height:18px"></td></tr>').join('') +
      '</tbody></table></div></section>';
    if (!edita) return;
    const mt = $('#cf-marcar-todos'); if (mt) mt.onchange = () => $$('.cf-marca', box).forEach(c => { c.checked = mt.checked; });
    const la = $('#cf-lote-aplicar');
    if (la) la.onclick = () => {
      const v = $('#cf-lote-cat').value;
      if (!v) { APP.aviso('Escolha a categoria.', 'alerta'); return; }
      const marcados = $$('.cf-marca', box).filter(c => c.checked);
      if (!marcados.length) { APP.aviso('Marque os quartos na primeira coluna.', 'alerta'); return; }
      marcados.forEach(c => { $('[name="categoria_id"]', c.closest('tr')).value = v; });
      APP.aviso('Categoria aplicada a ' + marcados.length + ' quarto(s). Toque em "Salvar alterações".', 'alerta');
    };
    $('#cf-novo-q').onclick = async () => {
      const nums = d.quartos.map(q => parseInt(q.numero, 10)).filter(n => !isNaN(n));
      const prox = String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
      await DB.salvar('quartos', { numero: prox, andar: null, categoria_id: null, status_manual: 'liv', ativo: true, ordem: d.quartos.length + 1 });
      APP.aviso('Quarto ' + prox + ' incluído.', 'sucesso');
      montar();
    };
    $('#cf-salvar-q').onclick = async () => {
      const linhas = $$('tr[data-q]', box);
      const vistos = {};
      for (const tr of linhas) {
        const n = $('[name="numero"]', tr).value.trim();
        if (!n) { APP.aviso('Há quarto sem número.', 'erro'); return; }
        if ($('[name="ativo"]', tr).checked) {
          if (vistos[n.toLowerCase()]) { APP.aviso('Número repetido: ' + n + '.', 'erro'); return; }
          vistos[n.toLowerCase()] = 1;
        }
      }
      let alterados = 0;
      for (const tr of linhas) {
        const q = d.quartoPorId[tr.dataset.q];
        const novo = { numero: $('[name="numero"]', tr).value.trim(), andar: $('[name="andar"]', tr).value.trim() || null,
          categoria_id: $('[name="categoria_id"]', tr).value || null, ordem: parseInt($('[name="ordem"]', tr).value, 10) || 0, ativo: $('[name="ativo"]', tr).checked };
        if (!novo.ativo && q.ativo !== false && DB.estadiaAtiva(d, q.id)) { APP.aviso('O quarto ' + q.numero + ' tem hóspede: não pode ser desativado agora.', 'erro'); continue; }
        if (Object.keys(novo).some(k => String(novo[k] === null ? '' : novo[k]) !== String(q[k] === null || q[k] === undefined ? (k === 'ativo' ? true : '') : q[k]))) {
          await DB.salvar('quartos', Object.assign({}, q, novo)); alterados++;
        }
      }
      APP.aviso(alterados ? alterados + ' quarto(s) atualizado(s).' : 'Nenhuma alteração.', alterados ? 'sucesso' : '');
      montar();
    };
  }

  /* ---------------- Dados do hotel ---------------- */
  function hotel(d, edita) {
    const h = d.hotel;
    const dis = edita ? '' : ' disabled';
    const box = $('#cf-conteudo');
    box.innerHTML = '<form class="card pilha" id="cf-hotel" style="gap:14px;max-width:880px"><h2>Dados do hotel</h2><p class="apoio" style="margin:0">Aparecem no voucher, nos extratos e nos relatórios.</p>' +
      '<div class="grade-campos">' +
      '<label class="fld largo">Nome<input name="nome" value="' + esc(h.nome) + '"' + dis + '></label>' +
      '<label class="fld">CNPJ<input name="cnpj" value="' + esc(h.cnpj) + '" placeholder="00.000.000/0000-00"' + dis + '></label>' +
      '<label class="fld largo">Endereço<input name="endereco" value="' + esc(h.endereco) + '" placeholder="Rua, número, bairro"' + dis + '></label>' +
      '<label class="fld">Cidade<input name="cidade" value="' + esc(h.cidade) + '"' + dis + '></label>' +
      '<label class="fld">UF<select name="uf"' + dis + '>' + opcoes(CONFIG.ufs, h.uf || 'PI') + '</select></label>' +
      '<label class="fld">Telefone / WhatsApp<input name="telefone" data-mascara="tel" value="' + esc(h.telefone) + '"' + dis + '></label>' +
      '<label class="fld">E-mail<input name="email" type="email" value="' + esc(h.email) + '"' + dis + '></label>' +
      '<label class="fld">Horário de check-in<input type="time" name="horaCheckin" value="' + esc(h.horaCheckin) + '"' + dis + '></label>' +
      '<label class="fld">Horário de check-out<input type="time" name="horaCheckout" value="' + esc(h.horaCheckout) + '"' + dis + '></label></div>' +
      '<label class="fld">Política exibida no voucher<textarea name="politica" maxlength="600"' + dis + '>' + esc(h.politica) + '</textarea></label>' +
      (edita ? '<div class="rodape-form"><button type="submit" class="btn btn-escuro">Salvar dados do hotel</button></div>' : '') + '</form>';
    APP.aplicarMascaras(box);
    $('#cf-hotel').onsubmit = async (e) => {
      e.preventDefault();
      const v = APP.lerForm($('#cf-hotel'));
      if (!v.nome) { APP.aviso('Informe o nome do hotel.', 'erro'); return; }
      const atual = await DB.obter('parametros', 'hotel');
      await DB.salvar('parametros', Object.assign({}, atual || { id: 'hotel' }, { id: 'hotel', dados: Object.assign({}, h, v) }));
      APP.aviso('Dados do hotel salvos.', 'sucesso');
    };
  }

  /* ---------------- Backup ---------------- */
  async function backup(d, edita) {
    const box = $('#cf-conteudo');
    const pend = await DB.contarPendentes();
    box.innerHTML = '<div class="grade-2"><section class="card pilha"><h2>Exportar cópia de segurança</h2>' +
      '<p class="apoio" style="margin:0">Gera um arquivo com todos os dados do hotel guardados neste aparelho (quartos, hóspedes, reservas, contas e financeiro). ' +
      (AUTH.modoLocal() ? '<b>No modo local, faça isso com frequência: os dados existem só aqui.</b>' : 'Com a base central ligada, os dados também ficam no Supabase.') + '</p>' +
      '<div class="par"><span>Registros aguardando envio</span><span>' + pend + '</span></div>' +
      '<button type="button" class="btn btn-escuro" id="cf-exportar">' + icone('baixar', 18, 1.8) + 'Exportar backup (.json)</button></section>' +
      (AUTH.ehAdmin() ? '<section class="card pilha"><h2>Restaurar cópia</h2><p class="apoio" style="margin:0">Importa um arquivo de backup. Só entram registros mais novos que os do aparelho; ' +
        'com a base central ligada, eles são enviados na próxima sincronização.</p>' +
        '<button type="button" class="btn" id="cf-importar">Escolher arquivo de backup</button><input type="file" id="cf-arquivo" accept=".json,application/json" hidden></section>' : '') + '</div>';
    $('#cf-exportar').onclick = async () => {
      const dados = await DB.exportarTudo();
      APP.entregarArquivo(new Blob([JSON.stringify(dados)], { type: 'application/json' }), 'backup-hotel-estilo-fino-' + DB.hoje() + '.json', 'application/json');
    };
    const imp = $('#cf-importar');
    if (imp) {
      imp.onclick = () => $('#cf-arquivo').click();
      $('#cf-arquivo').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const obj = JSON.parse(await f.text());
          const r = await APP.confirmar('Restaurar backup', 'Importar o arquivo "' + f.name + '" (gerado em ' + APP.dataHoraBR(obj.gerado_em) + ')?', { rotuloOk: 'Importar' });
          if (!r.ok) return;
          const n = await DB.importarTudo(obj);
          APP.aviso(n + ' registro(s) restaurado(s).', 'sucesso');
        } catch (er) { APP.aviso('Arquivo inválido: ' + er.message, 'erro'); }
        finally { e.target.value = ''; }
      };
    }
  }

  return { montar: montar };
})();

window.AJUSTES = AJUSTES;
