/* =====================================================================
 * acessos.js — LIBERAÇÃO DE ACESSOS (somente administrador)
 * Cadastros pendentes primeiro; liberar com modelo de perfil e ajuste
 * por módulo (nenhum / ver / editar); recusar, bloquear, reativar,
 * promover a administrador. A RLS confirma tudo no servidor.
 * ===================================================================== */

const ACESSOS = (function () {
  const { $, $$, esc, opcoes, dataHoraBR } = APP;
  const st = { filtro: 'pendente', lista: [] };
  const STATUS = { pendente: ['Pendente', 'b-ag'], ativo: ['Ativo', 'b-ok'], bloqueado: ['Bloqueado', 'b-pd'], recusado: ['Recusado', 'b-neutro'] };
  const NIVEL = { nenhum: 'Sem acesso', ver: 'Consulta', editar: 'Edição' };

  async function montar() {
    const el = $('#tela-acessos');
    el.innerHTML = '<header class="cab-pagina"><div><h1>Acessos</h1><p>Liberação de cadastros e permissões por módulo</p></div>' +
      '<div class="acoes"><button type="button" class="btn" id="ac-atualizar">Atualizar lista</button></div></header>' +
      '<div class="card"><p class="vazio">Carregando cadastros…</p></div>';
    $('#ac-atualizar').onclick = montar;
    try {
      st.lista = await AUTH.admin.listar();
    } catch (e) {
      el.querySelector('.card').innerHTML = '<p class="vazio">' + esc(navigator.onLine ? e.message : 'Sem internet: a lista de cadastros precisa de conexão com a base central.') + '</p>';
      return;
    }
    desenhar();
  }

  function resumoPermissoes(u) {
    if (u.perfil === 'admin') return 'Administrador — acesso total';
    const p = u.permissoes || {};
    const l = CONFIG.modulos.filter(m => p[m.id] && p[m.id] !== 'nenhum').map(m => m.nome + (p[m.id] === 'ver' ? ' (consulta)' : ''));
    return l.length ? l.join(', ') : 'Nenhum módulo liberado';
  }

  function desenhar() {
    const el = $('#tela-acessos');
    const cont = { todos: st.lista.length };
    st.lista.forEach(u => { cont[u.status] = (cont[u.status] || 0) + 1; });
    if (st.filtro === 'pendente' && !cont.pendente) st.filtro = 'todos';
    const lista = st.lista.filter(u => st.filtro === 'todos' || u.status === st.filtro)
      .sort((a, b) => (a.status === 'pendente' ? 0 : 1) - (b.status === 'pendente' ? 0 : 1) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const eu = AUTH.usuarioId();
    const cartoes = lista.map(u => {
      const s = STATUS[u.status] || ['—', 'b-neutro'];
      const acoes = [];
      if (u.id !== eu) {
        if (u.status === 'pendente') { acoes.push('<button type="button" class="btn btn-escuro btn-peq" data-a="liberar">Liberar acesso</button>'); acoes.push('<button type="button" class="btn btn-perigo btn-peq" data-a="recusar">Recusar</button>'); }
        if (u.status === 'ativo') { acoes.push('<button type="button" class="btn btn-peq" data-a="permissoes">Editar acesso</button>'); acoes.push('<button type="button" class="btn btn-perigo btn-peq" data-a="bloquear">Bloquear</button>'); }
        if (u.status === 'bloqueado' || u.status === 'recusado') acoes.push('<button type="button" class="btn btn-peq" data-a="reativar">' + (u.status === 'recusado' ? 'Liberar' : 'Reativar') + '</button>');
        if (u.status === 'ativo') acoes.push('<button type="button" class="btn btn-texto" data-a="' + (u.perfil === 'admin' ? 'rebaixar">Remover administrador' : 'promover">Tornar administrador') + '</button>');
      }
      return '<div class="card pilha" data-u="' + esc(u.id) + '" style="gap:10px">' +
        '<div class="linha-topo" style="align-items:flex-start"><div style="display:flex;gap:12px;align-items:center"><span class="avatar">' + esc(APP.iniciais(u.nome)) + '</span>' +
        '<div><b style="font-size:15px">' + esc(u.nome) + (u.id === eu ? ' (você)' : '') + '</b><br><span class="apoio">' + esc(u.email) + '</span></div></div>' +
        '<span class="badge ' + s[1] + '">' + s[0] + (u.perfil === 'admin' ? ' · Admin' : '') + '</span></div>' +
        '<div class="grade-campos" style="gap:6px 16px;font-size:13px">' +
        '<span><span class="apoio">Cargo:</span> ' + esc(u.cargo || '—') + '</span>' +
        '<span><span class="apoio">Telefone:</span> ' + (u.telefone ? '<a href="' + APP.whatsLink(u.telefone, '') + '" target="_blank" rel="noopener">' + esc(u.telefone) + '</a>' : '—') + '</span>' +
        '<span><span class="apoio">Cadastro:</span> ' + dataHoraBR(u.criado_em) + '</span>' +
        '<span><span class="apoio">Último acesso:</span> ' + dataHoraBR(u.ultimo_acesso) + (u.dispositivo ? ' · ' + esc(u.dispositivo) : '') + '</span>' +
        (u.pendentes_envio ? '<span style="color:#8E2F25;font-weight:700">' + u.pendentes_envio + ' registro(s) não enviados no aparelho</span>' : '') + '</div>' +
        (u.status === 'ativo' ? '<p style="margin:0;font-size:13px"><span class="apoio">Acesso:</span> ' + esc(resumoPermissoes(u)) + '</p>' : '') +
        (acoes.length ? '<div class="acoes" style="gap:8px">' + acoes.join('') + '</div>' : '') + '</div>';
    }).join('');
    el.innerHTML = '<header class="cab-pagina"><div><h1>Acessos</h1><p>Liberação de cadastros e permissões por módulo' + (AUTH.modoLocal() ? ' · contas deste aparelho (modo local)' : '') + '</p></div>' +
      '<div class="acoes"><button type="button" class="btn" id="ac-atualizar">Atualizar lista</button></div></header>' +
      '<div class="chips">' + [['pendente', 'Pendentes'], ['ativo', 'Ativos'], ['bloqueado', 'Bloqueados'], ['recusado', 'Recusados'], ['todos', 'Todos']].map(f =>
        '<button type="button" class="chip" data-f="' + f[0] + '" aria-pressed="' + (st.filtro === f[0]) + '">' + f[1] + ' · ' + (cont[f[0]] || 0) + '</button>').join('') + '</div>' +
      (cartoes ? '<div class="grade-2">' + cartoes + '</div>' : '<div class="card"><p class="vazio">Nenhum cadastro neste filtro.</p></div>') +
      '<div class="card pilha"><h2>Como funciona</h2><p class="apoio" style="margin:0">Cada pessoa cria o próprio cadastro pela tela de login (com e-mail e senha) e fica <b>pendente</b>. ' +
      'Aqui você libera escolhendo um modelo (Recepção, Governança, Financeiro, Gerência) e ajusta, módulo a módulo, se a pessoa não acessa, só consulta ou pode editar. ' +
      'Bloquear tira o acesso na próxima sincronização do aparelho dela.</p></div>';
    $('#ac-atualizar').onclick = montar;
    $$('[data-f]', el).forEach(b => b.onclick = () => { st.filtro = b.dataset.f; desenhar(); });
    $$('[data-u]', el).forEach(card => {
      const u = st.lista.find(x => x.id === card.dataset.u);
      $$('[data-a]', card).forEach(b => b.onclick = () => agir(u, b.dataset.a));
    });
  }

  function matrizHTML(perm) {
    return '<div class="rolagem"><table class="matriz"><thead><tr><th>Módulo</th><th>Acesso</th></tr></thead><tbody>' +
      CONFIG.modulos.map(m => '<tr><td>' + esc(m.nome) + '</td><td><select data-mod="' + m.id + '">' +
        opcoes(CONFIG.niveis.map(n => ({ v: n, t: NIVEL[n] })), perm[m.id] || 'nenhum') + '</select></td></tr>').join('') + '</tbody></table></div>';
  }

  function janelaPermissoes(u, liberar) {
    const modeloInicial = CONFIG.perfisModelo[u.cargo] ? u.cargo : 'Recepção';
    const perm = Object.assign({}, (u.permissoes && Object.keys(u.permissoes).length && !liberar) ? u.permissoes : CONFIG.perfisModelo[modeloInicial]);
    const jan = APP.janela({
      titulo: liberar ? 'Liberar acesso' : 'Editar acesso', largo: true,
      html: '<p style="margin:0"><b>' + esc(u.nome) + '</b> · ' + esc(u.email) + '<br><span class="apoio">Cargo informado: ' + esc(u.cargo || '—') + '</span></p>' +
        '<label class="fld">Modelo de acesso<select id="ac-modelo">' + opcoes(Object.keys(CONFIG.perfisModelo).concat(['Personalizado']), liberar ? modeloInicial : 'Personalizado') + '</select></label>' +
        '<div id="ac-matriz">' + matrizHTML(perm) + '</div>',
      botoes: [{ rotulo: 'Cancelar' }, { rotulo: liberar ? 'Liberar acesso' : 'Salvar acesso', classe: 'btn-escuro', acao: async (c) => {
        const p = {};
        $$('[data-mod]', c).forEach(s => { p[s.dataset.mod] = s.value; });
        if (!Object.values(p).some(v => v !== 'nenhum')) throw new Error('Libere ao menos um módulo.');
        APP.carregando(true, 'Gravando…');
        try {
          if (liberar) await AUTH.admin.liberar(u.id, p); else await AUTH.admin.definirPermissoes(u.id, p);
          APP.aviso(liberar ? 'Acesso de ' + u.nome + ' liberado.' : 'Acesso atualizado.', 'sucesso');
          if (liberar && u.telefone) avisarLiberacao(u);
        } finally { APP.carregando(false); }
        montar();
      } }]
    });
    $('#ac-modelo', jan.corpo).onchange = (e) => {
      if (e.target.value === 'Personalizado') return;
      $('#ac-matriz', jan.corpo).innerHTML = matrizHTML(CONFIG.perfisModelo[e.target.value]);
      ligarMatriz();
    };
    const ligarMatriz = () => $$('[data-mod]', jan.corpo).forEach(s => s.onchange = () => { $('#ac-modelo', jan.corpo).value = 'Personalizado'; });
    ligarMatriz();
  }

  function avisarLiberacao(u) {
    APP.janela({
      titulo: 'Avisar a pessoa?',
      html: '<p style="margin:0">Enviar uma mensagem no WhatsApp para ' + esc(u.nome.split(' ')[0]) + ' avisando que o acesso foi liberado?</p>',
      botoes: [{ rotulo: 'Agora não' }, { rotulo: 'Abrir WhatsApp', classe: 'btn-suave', acao: () => {
        window.open(APP.whatsLink(u.telefone, 'Olá, ' + u.nome.split(' ')[0] + '! Seu acesso ao Sistema de Gestão do ' + CONFIG.app.hotel + ' foi liberado. Entre com o seu e-mail e senha: ' +
          window.location.origin + window.location.pathname), '_blank', 'noopener');
      } }]
    });
  }

  async function agir(u, a) {
    if (a === 'liberar') return janelaPermissoes(u, true);
    if (a === 'permissoes') return janelaPermissoes(u, false);
    const textos = {
      recusar: ['Recusar cadastro', 'Recusar o cadastro de ' + u.nome + '? A pessoa não conseguirá entrar.', 'Recusar', true],
      bloquear: ['Bloquear acesso', 'Bloquear o acesso de ' + u.nome + '? Os registros feitos por ela continuam no sistema.', 'Bloquear', true],
      reativar: ['Reativar acesso', 'Reativar o acesso de ' + u.nome + ' com as permissões anteriores?', 'Reativar', false],
      promover: ['Tornar administrador', u.nome + ' passará a ter acesso total, inclusive a esta tela de liberações. Confirmar?', 'Tornar administrador', false],
      rebaixar: ['Remover administrador', 'Remover o perfil de administrador de ' + u.nome + '? Ficam valendo as permissões por módulo.', 'Remover', true]
    }[a];
    if (a === 'reativar' && u.status === 'recusado') return janelaPermissoes(u, true);
    const r = await APP.confirmar(textos[0], textos[1], { rotuloOk: textos[2], perigo: textos[3] });
    if (!r.ok) return;
    APP.carregando(true, 'Gravando…');
    try { await AUTH.admin[a](u.id); APP.aviso('Feito.', 'sucesso'); }
    catch (e) { APP.aviso(e.message, 'erro', 8); }
    finally { APP.carregando(false); }
    montar();
  }

  return { montar: montar };
})();

window.ACESSOS = ACESSOS;
