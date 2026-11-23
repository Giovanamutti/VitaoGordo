/* =========================================================================
   Livraria Multicultural - script.js (v8)
   - Seleção de itens no carrinho
   - Frete via ViaCEP com nome da rua
   - CEP do perfil + último CEP usado (localStorage)
   - Parcelamento 1x-3x sem juros / 4x-6x com juros (3%, 5%, 7%)
   - Checkout simulado em 3s + confirmação "Compra aprovada!"
   - Upload de imagem de livro no add_livros.html (com preview)
   - DESCONTO CLUBE: 10% automático para membros (não acumula com cupom)
   ========================================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'brasilidade_carrinho';
  const USUARIO_KEY = 'brasilidade_usuario';
  const CEP_STORAGE_KEY = 'brasilidade_cep_ultimo';

  const CUPONS_VALIDOS = {
    'MULTICULTURAL10': 0.10,
    'BRASILIDADE10': 0.10
  };

  const DESCONTO_CLUBE = 0.10; // 10% para membros do clube

  const JUROS_PARCELAS = { 1: 0, 2: 0, 3: 0, 4: 3, 5: 5, 6: 7 };

  const PRODUTOS = {
    1: { nome: 'Dom Casmurro', autor: 'Machado de Assis', preco: 49.90, img: '', desc: 'Edição comemorativa.' },
    2: { nome: 'Macunaíma', autor: 'Mário de Andrade', preco: 39.90, img: '', desc: 'O herói sem nenhum caráter.' },
    3: { nome: 'Quarto de Despejo', autor: 'Carolina Maria de Jesus', preco: 54.90, img: '', desc: 'Diário de uma favelada.' },
    4: { nome: 'Vidas Secas', autor: 'Graciliano Ramos', preco: 44.90, img: '', desc: 'A jornada de Fabiano.' }
  };

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function formatarReais(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  // =======================================================================
  // CEP — helpers
  // =======================================================================
  function salvarCepUltimo(cepDigitos, endereco) {
    if (!cepDigitos || cepDigitos.length !== 8) return;
    try {
      localStorage.setItem(CEP_STORAGE_KEY, JSON.stringify({
        cep: cepDigitos, endereco: endereco || null, em: new Date().toISOString()
      }));
    } catch (e) {}
  }
  function lerCepUltimo() {
    try {
      const raw = localStorage.getItem(CEP_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.cep || obj.cep.length !== 8) return null;
      return obj;
    } catch (e) { return null; }
  }
  function formatarCep(cepDigitos) {
    return (cepDigitos || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  }

  // =======================================================================
  // MENU MOBILE
  // =======================================================================
  function initMenuMobile() {
    const btn = $('#menu-btn');
    const menu = $('#mobile-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => menu.classList.toggle('hidden'));
  }

  // =======================================================================
  // SESSÃO
  // =======================================================================
  function usuarioAtual() {
    try {
      const s = localStorage.getItem(USUARIO_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  // =======================================================================
  // ESTADO DO CARRINHO
  // =======================================================================
  const Carrinho = { dados: {}, pronto: false, carregando: null, listeners: [] };

  function notificar() {
    Carrinho.listeners.forEach(fn => { try { fn(Carrinho.dados); } catch (e) {} });
    atualizarBadgeGlobal();
  }
  function aoMudar(fn) {
    Carrinho.listeners.push(fn);
    if (Carrinho.pronto) fn(Carrinho.dados);
  }

  function lerCarrinhoLocal() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (!salvo) return {};
      const dados = JSON.parse(salvo);
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return {};
      const limpo = {};
      Object.keys(dados).forEach(id => {
        const it = dados[id];
        if (!it || typeof it !== 'object') return;
        const preco = Number(it.price);
        const qtd = Number(it.qty);
        if (!isFinite(preco) || preco <= 0) return;
        if (!isFinite(qtd) || qtd <= 0) return;
        limpo[id] = {
          price: preco, qty: Math.floor(qtd),
          nome: it.nome || '', autor: it.autor || '',
          img: it.img || '', genero: it.genero || '', origem: it.origem || ''
        };
      });
      return limpo;
    } catch (e) { return {}; }
  }
  function salvarCarrinhoLocal(dados) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dados)); } catch (e) {}
  }

  function servidorParaMapa(itens) {
    const mapa = {};
    (itens || []).forEach(it => {
      mapa[String(it.livro_id)] = {
        price: Number(it.price) || 0, qty: Number(it.qty) || 0,
        nome: it.nome || '', autor: it.autor || '',
        img: it.img || '', genero: it.genero || '', origem: it.origem || ''
      };
    });
    return mapa;
  }
  function mapaParaServidor(mapa) {
    return Object.keys(mapa).map(id => ({
      id: String(id), price: mapa[id].price, qty: mapa[id].qty,
      nome: mapa[id].nome, autor: mapa[id].autor, img: mapa[id].img,
      genero: mapa[id].genero, origem: mapa[id].origem
    }));
  }

  function carregarCarrinho() {
    if (Carrinho.pronto) return Promise.resolve(Carrinho.dados);
    if (Carrinho.carregando) return Carrinho.carregando;

    const usuario = usuarioAtual();
    if (!usuario) {
      Carrinho.dados = lerCarrinhoLocal();
      Carrinho.pronto = true;
      notificar();
      return Promise.resolve(Carrinho.dados);
    }

    Carrinho.carregando = fetch('/api/carrinho/' + usuario.id)
      .then(r => r.json())
      .then(itens => {
        Carrinho.dados = servidorParaMapa(itens);
        Carrinho.pronto = true;
        notificar();
        return Carrinho.dados;
      })
      .catch(err => {
        console.warn('Falha ao ler carrinho do servidor:', err);
        Carrinho.dados = {};
        Carrinho.pronto = true;
        notificar();
        return Carrinho.dados;
      })
      .finally(() => { Carrinho.carregando = null; });

    return Carrinho.carregando;
  }

  function persistirCarrinho() {
    const usuario = usuarioAtual();
    if (!usuario) {
      salvarCarrinhoLocal(Carrinho.dados);
      return Promise.resolve();
    }
    return fetch('/api/carrinho/' + usuario.id + '/sincronizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itens: mapaParaServidor(Carrinho.dados) })
    }).catch(err => console.warn('Falha ao sincronizar carrinho:', err));
  }

  function contarItens(dados) {
    return Object.values(dados).reduce((s, it) => s + (it.qty || 0), 0);
  }

  // =======================================================================
  // ADICIONAR AO CARRINHO
  // =======================================================================
  function adicionarAoCarrinho(id, preco, quantidade = 1, extras = {}) {

    // ===== BLOQUEIO: só permite adicionar se estiver logado =====

    const usuario = usuarioAtual();
    if (!usuario) {
      const paginaAtual = (location.pathname.split('/').pop() || 'index.html') + location.search;
      abrirModalLogin(paginaAtual);
      return Promise.reject(new Error('LOGIN_NECESSARIO'));
    }

    return carregarCarrinho().then(() => {
      const chave = String(id);
      if (Carrinho.dados[chave]) {
        Carrinho.dados[chave].qty += quantidade;
        Carrinho.dados[chave].price = preco;
        if (extras.nome) Carrinho.dados[chave].nome = extras.nome;
        if (extras.autor) Carrinho.dados[chave].autor = extras.autor;
        if (extras.img) Carrinho.dados[chave].img = extras.img;
        if (extras.genero) Carrinho.dados[chave].genero = extras.genero;
        if (extras.origem) Carrinho.dados[chave].origem = extras.origem;
      } else {
        Carrinho.dados[chave] = {
          price: preco, qty: quantidade,
          nome: extras.nome || '', autor: extras.autor || '',
          img: extras.img || '', genero: extras.genero || '', origem: extras.origem || ''
        };
      }
      notificar();
      return persistirCarrinho().then(() => Carrinho.dados);
    });
  }

  function atualizarBadgeGlobal() {
    const badge = $('#badge-count');
    if (!badge) return;
    badge.innerText = String(contarItens(Carrinho.dados));
  }

  // =======================================================================
  // MESCLAR LOCAL → SERVIDOR
  // =======================================================================
  function mesclarCarrinhoLocalNoServidor() {
    const usuario = usuarioAtual();
    if (!usuario) return Promise.resolve();
    const local = lerCarrinhoLocal();
    return fetch('/api/carrinho/' + usuario.id)
      .then(r => r.json())
      .then(itensServidor => {
        const mapa = servidorParaMapa(itensServidor);
        Object.keys(local).forEach(id => {
          if (mapa[id]) {
            mapa[id].qty += local[id].qty;
            if (!mapa[id].nome && local[id].nome) mapa[id].nome = local[id].nome;
            if (!mapa[id].autor && local[id].autor) mapa[id].autor = local[id].autor;
            if (!mapa[id].img && local[id].img) mapa[id].img = local[id].img;
            if (!mapa[id].genero && local[id].genero) mapa[id].genero = local[id].genero;
            if (!mapa[id].origem && local[id].origem) mapa[id].origem = local[id].origem;
          } else {
            mapa[id] = local[id];
          }
        });
        Carrinho.dados = mapa;
        Carrinho.pronto = true;
        return fetch('/api/carrinho/' + usuario.id + '/sincronizar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens: mapaParaServidor(mapa) })
        });
      })
      .then(() => {
        localStorage.removeItem(STORAGE_KEY);
        notificar();
      })
      .catch(err => console.warn('Falha ao mesclar carrinho:', err));
  }

  // =======================================================================
  // CATÁLOGO — botões "Comprar"
  // =======================================================================
  function delegateComprarBtn(container) {
    const alvo = container || document;
    if (alvo.__comprarDelegado) return;
    alvo.__comprarDelegado = true;

    alvo.addEventListener('click', (e) => {
      const btn = e.target.closest('.comprar-btn');
      if (!btn || btn.disabled) return;

      const id = btn.dataset.id;
      const preco = parseFloat(btn.dataset.preco);
      if (!id || !isFinite(preco)) return;

      // ===== BLOQUEIO: deslogado → modal "faça login" =====
      const usuario = usuarioAtual();
      if (!usuario) {
        const paginaAtual = (location.pathname.split('/').pop() || 'index.html') + location.search;
        abrirModalLogin(paginaAtual);
        return;
      }

      const extras = {
        nome: btn.dataset.nome || '', autor: btn.dataset.autor || '',
        img: btn.dataset.img || '', genero: btn.dataset.genero || '',
        origem: btn.dataset.origem || ''
      };

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Adicionado';
      btn.classList.add('bg-brasil-terracota', 'text-white');

      adicionarAoCarrinho(id, preco, 1, extras)
        .then(() => mostrarToast((extras.nome || 'Item') + ' adicionado ao carrinho!'))
        .catch(err => {
          if (err && err.message === 'LOGIN_NECESSARIO') {
            // O modal já foi aberto pelo adicionarAoCarrinho — só reseta o botão
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('bg-brasil-terracota', 'text-white');
            return;
          }
          console.warn('Erro ao adicionar:', err);
        })
        .finally(() => {
          setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('bg-brasil-terracota', 'text-white');
          }, 900);
        });
    });
  }

  function mostrarToast(mensagem) {
    let toast = document.getElementById('toast-multicultural');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-multicultural';
      toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1B4D3E; color: #F4D03F; padding: 12px 24px;
        border-radius: 12px; font-weight: 600; font-size: 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25); z-index: 9999;
        opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = mensagem;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2000);
  }

  // =======================================================================
  // PÁGINA: CARRINHO
  // =======================================================================
  const EstadoCarrinho = {
    frete: 0, descontoPct: 0, selecionados: new Set(), endereco: null,
    processando: false, parcelas: 1, jurosPct: 0
  };

  function jurosParaParcelas(n) { return JUROS_PARCELAS[Number(n)] || 0; }

  function initPaginaCarrinho() {
    const lista = $('#lista-itens');
    const subtotalEl = $('#subtotal-val');
    if (!lista || !subtotalEl) return;

    carregarCarrinho().then(() => {
      Object.keys(Carrinho.dados).forEach(id => EstadoCarrinho.selecionados.add(id));
      renderizarLista();
      atualizarTotais();
      verificarCarrinhoVazio();
    });

    aoMudar(() => {
      renderizarLista();
      atualizarTotais();
      verificarCarrinhoVazio();
    });

    const btnLimpar = $('#btn-limpar-carrinho');
    if (btnLimpar) btnLimpar.addEventListener('click', limparCarrinho);

    const btnFrete = $('#btn-calcular-frete');
    if (btnFrete) btnFrete.addEventListener('click', calcularFrete);

    const cepInput = $('#cep-input');
    if (cepInput) {
      cepInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); calcularFrete(); }
      });
      const ultimoCep = lerCepUltimo();
      if (ultimoCep && !cepInput.value) cepInput.value = formatarCep(ultimoCep.cep);
    }

    const btnCepPerfil = $('#btn-cep-perfil');
    if (btnCepPerfil) {
      const usuario = usuarioAtual();
      const cepPerfilDigitos = usuario && usuario.cep ? String(usuario.cep).replace(/\D/g, '') : '';
      if (cepPerfilDigitos.length === 8) {
        btnCepPerfil.classList.remove('hidden');
        btnCepPerfil.addEventListener('click', usarCepDoPerfil);
      }
    }

    // ===== SELO DO CLUBE =====
    const seloClube = $('#selo-clube');
    if (seloClube) {
      const usuario = usuarioAtual();
      if (usuario && Number(usuario.clube_ativo) === 1) {
        seloClube.classList.remove('hidden');
      } else {
        seloClube.classList.add('hidden');
      }
    }

    const btnCepUltimo = $('#btn-cep-ultimo');
    const avisoUltimo = $('#cep-ultimo-aviso');
    const ultimo = lerCepUltimo();
    if (btnCepUltimo && avisoUltimo && ultimo) {
      const usuario = usuarioAtual();
      const cepPerfilDigitos = usuario && usuario.cep ? String(usuario.cep).replace(/\D/g, '') : null;
      if (cepPerfilDigitos !== ultimo.cep) {
        btnCepUltimo.textContent = formatarCep(ultimo.cep);
        avisoUltimo.classList.remove('hidden');
        btnCepUltimo.addEventListener('click', (e) => {
          e.preventDefault();
          if (cepInput) cepInput.value = formatarCep(ultimo.cep);
          calcularFrete();
        });
      }
    }

    const btnCupom = $('#btn-aplicar-cupom');
    if (btnCupom) btnCupom.addEventListener('click', aplicarCupom);

    const parcelasSelect = $('#parcelas-select');
    if (parcelasSelect) {
      parcelasSelect.addEventListener('change', () => {
        EstadoCarrinho.parcelas = Number(parcelasSelect.value) || 1;
        EstadoCarrinho.jurosPct = jurosParaParcelas(EstadoCarrinho.parcelas);
        atualizarTotais();
      });
      EstadoCarrinho.parcelas = Number(parcelasSelect.value) || 1;
      EstadoCarrinho.jurosPct = jurosParaParcelas(EstadoCarrinho.parcelas);
    }

    const btnCheckout = $('#btn-finalizar');
    if (btnCheckout) btnCheckout.addEventListener('click', finalizarCompra);

    const btnToggle = $('#btn-toggle-todos');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        const total = Object.keys(Carrinho.dados).length;
        if (total === 0) return;
        if (EstadoCarrinho.selecionados.size === total) EstadoCarrinho.selecionados.clear();
        else Object.keys(Carrinho.dados).forEach(id => EstadoCarrinho.selecionados.add(id));
        renderizarLista();
        atualizarTotais();
      });
    }

    const btnModalClose = $('#btn-fechar-modal');
    if (btnModalClose) btnModalClose.addEventListener('click', fecharModal);

    const modal = $('#info-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal();
      });
    }
  }

  function renderizarLista() {
    const container = $('#lista-itens');
    const emptyMsg = $('#empty-cart-msg');
    if (!container) return;

    Array.from(EstadoCarrinho.selecionados).forEach(id => {
      if (!Carrinho.dados[id]) EstadoCarrinho.selecionados.delete(id);
    });

    container.innerHTML = '';
    const chaves = Object.keys(Carrinho.dados);

    if (chaves.length === 0) {
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      container.classList.add('hidden');
      atualizarResumoSelecao();
      return;
    }
    if (emptyMsg) emptyMsg.classList.add('hidden');
    container.classList.remove('hidden');

    chaves.forEach(id => {
      const item = Carrinho.dados[id];
      const prodFixo = PRODUTOS[id] || {};
      const prod = {
        nome: item.nome || prodFixo.nome || ('Item #' + id),
        autor: item.autor || prodFixo.autor || '',
        preco: Number(item.price) || prodFixo.preco || 0,
        img: item.img || prodFixo.img || '',
        desc: prodFixo.desc || ''
      };
      const marcado = EstadoCarrinho.selecionados.has(String(id));

      const card = document.createElement('div');
      card.id = `item-${id}`;
      card.className = 'bg-white rounded-2xl p-4 sm:p-6 shadow-md border border-brasil-areia flex flex-col sm:flex-row items-center gap-6 relative transition-all';
      card.innerHTML = `
        <label class="absolute top-3 left-3 z-10 cursor-pointer" title="Selecionar este item">
          <input type="checkbox" data-acao="selecionar" data-id="${id}"
                 class="peer sr-only" ${marcado ? 'checked' : ''}>
          <span class="w-6 h-6 rounded-md border-2 border-brasil-areia bg-white flex items-center justify-center
                       peer-checked:bg-brasil-verde peer-checked:border-brasil-verde transition-colors shadow-sm">
            <i class="fa-solid fa-check text-[11px] text-white opacity-0 peer-checked:opacity-100"></i>
          </span>
        </label>
        <div class="w-24 h-32 bg-brasil-areia rounded-xl overflow-hidden flex-shrink-0 shadow-inner">
          ${prod.img
            ? `<img src="${prod.img}" alt="${prod.nome}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-brasil-verde/40"><i class="fa-solid fa-book text-3xl"></i></div>`}
        </div>
        <div class="flex-1 text-center sm:text-left space-y-1 sm:pl-2">
          <span class="text-[10px] uppercase font-bold tracking-wider text-brasil-terracota">${prod.autor || ''}</span>
          <h3 class="font-serif font-bold text-xl text-brasil-verde">${prod.nome}</h3>
          ${prod.desc ? `<p class="text-xs text-brasil-escuro/60">${prod.desc}</p>` : ''}
          <div class="text-lg font-bold text-brasil-verde pt-2">${formatarReais(prod.preco)}</div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center border border-brasil-areia rounded-xl overflow-hidden bg-brasil-creme">
            <button data-acao="menos" data-id="${id}" class="px-3 py-1 text-brasil-escuro hover:bg-brasil-areia transition-colors font-bold">-</button>
            <span class="px-3 text-sm font-semibold">${item.qty}</span>
            <button data-acao="mais" data-id="${id}" class="px-3 py-1 text-brasil-escuro hover:bg-brasil-areia transition-colors font-bold">+</button>
          </div>
          <button data-acao="remover" data-id="${id}" class="p-2 text-brasil-terracota hover:bg-brasil-terracota/10 rounded-xl transition-colors" title="Remover item">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    $$('button[data-acao]', container).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const acao = btn.dataset.acao;
        if (acao === 'mais') alterarQuantidade(id, +1);
        else if (acao === 'menos') alterarQuantidade(id, -1);
        else if (acao === 'remover') removerItem(id);
      });
    });

    $$('input[data-acao="selecionar"]', container).forEach(chk => {
      chk.addEventListener('change', () => {
        const id = String(chk.dataset.id);
        if (chk.checked) EstadoCarrinho.selecionados.add(id);
        else EstadoCarrinho.selecionados.delete(id);
        atualizarResumoSelecao();
        atualizarTotais();
      });
    });

    atualizarResumoSelecao();
  }

  function atualizarResumoSelecao() {
    const total = Object.keys(Carrinho.dados).length;
    const marcados = Array.from(EstadoCarrinho.selecionados).filter(id => Carrinho.dados[id]).length;
    const el = $('#resumo-selecao');
    if (el) el.textContent = marcados + ' de ' + total + ' selecionados';
    const btn = $('#btn-toggle-todos');
    if (btn) btn.textContent = (total > 0 && marcados === total) ? 'Desmarcar todos' : 'Marcar todos';
  }

  function alterarQuantidade(id, delta) {
    const chave = String(id);
    if (!Carrinho.dados[chave]) return;
    const novaQty = Carrinho.dados[chave].qty + delta;
    if (novaQty < 1) return;
    Carrinho.dados[chave].qty = novaQty;
    notificar();
    persistirCarrinho();
  }

  function removerItem(id) {
    const chave = String(id);
    EstadoCarrinho.selecionados.delete(chave);
    const itemEl = document.getElementById(`item-${id}`);
    if (itemEl) {
      itemEl.style.opacity = '0';
      itemEl.style.transform = 'scale(0.95)';
    }
    setTimeout(() => {
      delete Carrinho.dados[chave];
      notificar();
      persistirCarrinho();
    }, 250);
  }

  function limparCarrinho() {
    if (Object.keys(Carrinho.dados).length === 0) return;
    if (!confirm('Deseja realmente esvaziar o carrinho?')) return;
    Carrinho.dados = {};
    EstadoCarrinho.frete = 0;
    EstadoCarrinho.descontoPct = 0;
    EstadoCarrinho.selecionados.clear();
    EstadoCarrinho.endereco = null;
    EstadoCarrinho.parcelas = 1;
    EstadoCarrinho.jurosPct = 0;

    const cepInput = $('#cep-input'); if (cepInput) cepInput.value = '';
    const couponInput = $('#coupon-input'); if (couponInput) couponInput.value = '';
    const fr = $('#freight-result'); if (fr) fr.classList.add('hidden');
    const cm = $('#coupon-msg'); if (cm) cm.classList.add('hidden');
    const dr = $('#discount-row'); if (dr) dr.classList.add('hidden');
    const enderecoInfo = $('#endereco-info'); if (enderecoInfo) enderecoInfo.classList.add('hidden');
    const enderecoRua = $('#endereco-rua'); if (enderecoRua) enderecoRua.textContent = '—';
    const enderecoBairro = $('#endereco-bairro-cidade'); if (enderecoBairro) enderecoBairro.textContent = '—';
    const parcelasSelect = $('#parcelas-select'); if (parcelasSelect) parcelasSelect.value = '1';
    const parcelamentoInfo = $('#parcelamento-info'); if (parcelamentoInfo) parcelamentoInfo.classList.add('hidden');
    const jurosLinha = $('#juros-aplicados'); if (jurosLinha) jurosLinha.classList.add('hidden');

    notificar();
    persistirCarrinho();
  }

  function verificarCarrinhoVazio() {
    const empty = $('#empty-cart-msg');
    if (!empty) return;
    empty.classList.toggle('hidden', Object.keys(Carrinho.dados).length > 0);
  }

  function usarCepDoPerfil() {
    const usuario = usuarioAtual();
    if (!usuario || !usuario.cep) {
      abrirModal('CEP não cadastrado',
        'Você ainda não cadastrou um CEP no seu perfil. Cadastre em "Minha Conta" ou digite manualmente.',
        'fa-solid fa-circle-info');
      return;
    }
    const cepDigitos = String(usuario.cep).replace(/\D/g, '');
    if (cepDigitos.length !== 8) {
      abrirModal('CEP do perfil inválido',
        'O CEP cadastrado no seu perfil não parece válido. Atualize em "Minha Conta".',
        'fa-solid fa-triangle-exclamation');
      return;
    }
    const cepInput = $('#cep-input');
    if (cepInput) cepInput.value = formatarCep(cepDigitos);
    calcularFrete();
  }

  function calcularFrete() {
    const input = $('#cep-input');
    if (!input) return;
    const cep = (input.value || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      abrirModal('CEP inválido', 'Digite um CEP válido com 8 dígitos.', 'fa-solid fa-triangle-exclamation');
      return;
    }
    input.value = cep.replace(/^(\d{5})(\d{3})$/, '$1-$2');

    if (EstadoCarrinho.selecionados.size === 0) {
      abrirModal('Selecione os livros',
        'Marque ao menos um livro no carrinho para calcular o frete.',
        'fa-solid fa-triangle-exclamation');
      return;
    }

    const enderecoInfo = $('#endereco-info');
    const enderecoRua = $('#endereco-rua');
    const enderecoBairro = $('#endereco-bairro-cidade');

    if (enderecoInfo) enderecoInfo.classList.remove('hidden');
    if (enderecoRua) enderecoRua.textContent = 'Buscando endereço...';
    if (enderecoBairro) enderecoBairro.textContent = '—';

    const btnFrete = $('#btn-calcular-frete');
    const originalBtn = btnFrete ? btnFrete.innerHTML : '';
    if (btnFrete) {
      btnFrete.disabled = true;
      btnFrete.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }

    fetch('https://viacep.com.br/ws/' + cep + '/json/')
      .then(r => r.json())
      .then(dados => {
        if (dados.erro) {
          if (enderecoRua) enderecoRua.textContent = 'CEP não encontrado';
          if (enderecoBairro) enderecoBairro.textContent = 'Verifique o número digitado.';
          return;
        }
        const rua = dados.logradouro || 'Rua não informada';
        const bairro = dados.bairro || '';
        const cidade = dados.localidade || '';
        const uf = dados.uf || '';

        if (enderecoRua) enderecoRua.textContent = rua;
        if (enderecoBairro) {
          const partes = [bairro, cidade + (uf ? '/' + uf : '')].filter(Boolean);
          enderecoBairro.textContent = partes.join(' • ');
        }

        EstadoCarrinho.endereco = { logradouro: rua, bairro, cidade, uf, cep };
        EstadoCarrinho.frete = 15.00;
        salvarCepUltimo(cep, { logradouro: rua, bairro, cidade, uf });

        const fr = $('#freight-result');
        if (fr) fr.classList.remove('hidden');
        atualizarTotais();
        atualizarAvisoUltimoCep();
      })
      .catch(() => {
        if (enderecoRua) enderecoRua.textContent = 'Não foi possível consultar o CEP';
        if (enderecoBairro) enderecoBairro.textContent = 'Verifique sua conexão.';
      })
      .finally(() => {
        if (btnFrete) {
          btnFrete.disabled = false;
          btnFrete.innerHTML = originalBtn || 'OK';
        }
      });
  }

  function atualizarAvisoUltimoCep() {
    const btnCepUltimo = $('#btn-cep-ultimo');
    const avisoUltimo = $('#cep-ultimo-aviso');
    if (!btnCepUltimo || !avisoUltimo) return;
    const ultimo = lerCepUltimo();
    const usuario = usuarioAtual();
    const cepPerfilDigitos = usuario && usuario.cep ? String(usuario.cep).replace(/\D/g, '') : null;
    if (ultimo && cepPerfilDigitos !== ultimo.cep) {
      btnCepUltimo.textContent = formatarCep(ultimo.cep);
      avisoUltimo.classList.remove('hidden');
    } else {
      avisoUltimo.classList.add('hidden');
    }
  }

  function aplicarCupom() {
    const input = $('#coupon-input');
    const msgEl = $('#coupon-msg');
    const discountRow = $('#discount-row');
    if (!input || !msgEl) return;
    const code = (input.value || '').trim().toUpperCase();
    const desconto = CUPONS_VALIDOS[code];
    if (desconto !== undefined) {
      EstadoCarrinho.descontoPct = desconto;
      msgEl.innerText = `Cupom aplicado com sucesso (-${Math.round(desconto * 100)}%)!`;
      msgEl.classList.remove('hidden', 'text-brasil-terracota');
      msgEl.classList.add('text-brasil-verde');
      if (discountRow) discountRow.classList.remove('hidden');
    } else {
      EstadoCarrinho.descontoPct = 0;
      msgEl.innerText = code ? 'Cupom inválido ou expirado.' : 'Digite um cupom. (Dica: MULTICULTURAL10)';
      msgEl.classList.remove('hidden', 'text-brasil-verde');
      msgEl.classList.add('text-brasil-terracota');
      if (discountRow) discountRow.classList.add('hidden');
    }
    atualizarTotais();
  }

  // =======================================================================
  // TOTAIS (só itens selecionados) + CUPOM + CLUBE
  // =======================================================================
  function atualizarTotais() {
    let subtotal = 0;
    EstadoCarrinho.selecionados.forEach(id => {
      const it = Carrinho.dados[id];
      if (it) subtotal += (it.price || 0) * (it.qty || 0);
    });

    // ===== DESCONTOS: cupom (manual) e clube (automático) =====
    const usuario = usuarioAtual();
    const ehMembro = usuario && Number(usuario.clube_ativo) === 1;

    const descontoCupom = subtotal * EstadoCarrinho.descontoPct;
    const descontoClube = ehMembro ? subtotal * DESCONTO_CLUBE : 0;

    // Aplica o MAIOR dos dois (não acumula)
    const desconto = Math.max(descontoCupom, descontoClube);

    const frete = EstadoCarrinho.selecionados.size > 0 ? EstadoCarrinho.frete : 0;
    const totalBase = subtotal - desconto + frete;
    const jurosPct = EstadoCarrinho.jurosPct || 0;
    const valorJuros = totalBase * (jurosPct / 100);
    const totalComJuros = totalBase + valorJuros;
    const parcelas = EstadoCarrinho.parcelas || 1;
    const valorParcela = parcelas > 0 ? totalComJuros / parcelas : totalComJuros;

    const setTxt = (sel, txt) => { const el = $(sel); if (el) el.innerText = txt; };
    setTxt('#subtotal-val', formatarReais(subtotal));
    setTxt('#discount-val', '- ' + formatarReais(desconto));
    setTxt('#freight-val', formatarReais(frete));
    setTxt('#total-val', formatarReais(totalComJuros));

    const discountRow = $('#discount-row');
    if (discountRow) {
      if (desconto > 0 && subtotal > 0) discountRow.classList.remove('hidden');
      else discountRow.classList.add('hidden');
    }

    // Avisa se o cupom não está sendo aplicado porque o clube é maior
    const msgCupom = $('#coupon-msg');
    if (msgCupom && !msgCupom.classList.contains('hidden')) {
      if (ehMembro && descontoClube > descontoCupom) {
        msgCupom.innerText = 'Cupom não aplicado: o desconto do Clube (10%) é maior.';
        msgCupom.classList.remove('text-brasil-verde');
        msgCupom.classList.add('text-brasil-terracota');
      }
    }

    atualizarOpcoesParcelas(totalBase);

    const parcelamentoInfo = $('#parcelamento-info');
    if (parcelamentoInfo) {
      if (subtotal > 0) parcelamentoInfo.classList.remove('hidden');
      else parcelamentoInfo.classList.add('hidden');
    }
    setTxt('#total-com-juros', formatarReais(totalComJuros));
    setTxt('#valor-parcela', formatarReais(valorParcela));

    const linhaJuros = $('#juros-aplicados');
    const spanJuros = $('#valor-juros');
    if (linhaJuros && spanJuros) {
      if (jurosPct > 0) {
        linhaJuros.classList.remove('hidden');
        linhaJuros.classList.add('flex');
        spanJuros.innerText = formatarReais(valorJuros);
      } else {
        linhaJuros.classList.add('hidden');
        linhaJuros.classList.remove('flex');
      }
    }
  }

  function atualizarOpcoesParcelas(totalBase) {
    const select = $('#parcelas-select');
    if (!select) return;
    const valorAtual = select.value;
    [1, 2, 3].forEach(n => {
      const opt = select.querySelector('option[value="' + n + '"]');
      if (!opt) return;
      opt.textContent = n + 'x de ' + formatarReais(totalBase / n) + ' (sem juros)';
    });
    [{ n: 4, juros: 3 }, { n: 5, juros: 5 }, { n: 6, juros: 7 }].forEach(({ n, juros }) => {
      const opt = select.querySelector('option[value="' + n + '"]');
      if (!opt) return;
      const totalComJuros = totalBase * (1 + juros / 100);
      opt.textContent = n + 'x de ' + formatarReais(totalComJuros / n) + ' (' + juros + '% de juros)';
    });
    select.value = valorAtual || String(EstadoCarrinho.parcelas) || '1';
  }

  // =======================================================================
  // FINALIZAR
  // =======================================================================
  function finalizarCompra() {
    if (EstadoCarrinho.processando) return;
    if (Object.keys(Carrinho.dados).length === 0) {
      abrirModal('Sacola vazia', 'Adicione itens ao carrinho antes de prosseguir.', 'fa-solid fa-triangle-exclamation');
      return;
    }
    if (EstadoCarrinho.selecionados.size === 0) {
      abrirModal('Nenhum item selecionado', 'Marque ao menos um livro para finalizar a compra.', 'fa-solid fa-triangle-exclamation');
      return;
    }
    if (EstadoCarrinho.frete === 0) {
      abrirModal('Calcule o frete', 'Informe seu CEP e clique em "OK" antes de finalizar.', 'fa-solid fa-truck-fast');
      return;
    }

    let subtotal = 0;
    EstadoCarrinho.selecionados.forEach(id => {
      const it = Carrinho.dados[id];
      if (it) subtotal += (it.price || 0) * (it.qty || 0);
    });

    // ===== MESMA LÓGICA DO CLUBE =====
    const usuario = usuarioAtual();
    const ehMembro = usuario && Number(usuario.clube_ativo) === 1;
    const descontoCupom = subtotal * EstadoCarrinho.descontoPct;
    const descontoClube = ehMembro ? subtotal * DESCONTO_CLUBE : 0;
    const desconto = Math.max(descontoCupom, descontoClube);

    const frete = EstadoCarrinho.frete;
    const totalBase = subtotal - desconto + frete;
    const parcelas = EstadoCarrinho.parcelas || 1;
    const jurosPct = EstadoCarrinho.jurosPct || 0;
    const totalComJuros = totalBase * (1 + jurosPct / 100);
    const valorParcela = parcelas > 0 ? totalComJuros / parcelas : totalComJuros;

    const end = EstadoCarrinho.endereco;
    const linhaEndereco = end
      ? `<br><span class="text-xs">Entrega em: <strong>${end.logradouro}</strong> — ${end.bairro || ''} ${end.cidade}/${end.uf}</span>`
      : '';
    const linhaParcelas = parcelas > 1
      ? `<br><span class="text-xs">Pagamento: <strong>${parcelas}x de ${formatarReais(valorParcela)}</strong>${jurosPct > 0 ? ' (com ' + jurosPct + '% de juros)' : ' (sem juros)'}</span>`
      : `<br><span class="text-xs">Pagamento: <strong>à vista</strong></span>`;

    EstadoCarrinho.processando = true;

    abrirModal(
      'Checkout seguro (MFS)',
      `Total a pagar: <strong>${formatarReais(totalComJuros)}</strong>.${linhaParcelas}${linhaEndereco}
       <br><br>
       <span class="inline-flex items-center gap-2">
         <i class="fa-solid fa-spinner fa-spin text-brasil-terracota"></i>
         Redirecionando para o ambiente seguro de pagamento...
       </span>`,
      'fa-solid fa-shield-halved'
    );

    const modalEl = $('#info-modal');
    const btnFechar = $('#btn-fechar-modal');
    const btnConfirmarOriginal = modalEl ? modalEl.querySelector('button[onclick]') : null;
    if (btnFechar) btnFechar.style.display = 'none';
    if (btnConfirmarOriginal) btnConfirmarOriginal.style.display = 'none';

    setTimeout(() => {
      EstadoCarrinho.selecionados.forEach(id => { delete Carrinho.dados[id]; });
      EstadoCarrinho.selecionados.clear();
      EstadoCarrinho.frete = 0;
      EstadoCarrinho.descontoPct = 0;
      EstadoCarrinho.endereco = null;
      EstadoCarrinho.parcelas = 1;
      EstadoCarrinho.jurosPct = 0;
      EstadoCarrinho.processando = false;

      notificar();
      persistirCarrinho();

      const icon = $('#modal-icon');
      const title = $('#modal-title');
      const desc = $('#modal-desc');
      if (icon) {
        icon.className = 'w-12 h-12 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center text-xl';
        icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
      }
      if (title) title.innerText = 'Compra aprovada! 🎉';
      if (desc) {
        desc.innerHTML = `
          Seu pedido foi confirmado com sucesso.<br>
          <span class="block mt-2 text-base font-bold text-brasil-verde">Total pago: ${formatarReais(totalComJuros)}</span>
          ${parcelas > 1 ? `<span class="block mt-1 text-xs text-brasil-escuro/70">Pagamento: <strong>${parcelas}x de ${formatarReais(valorParcela)}</strong>${jurosPct > 0 ? ' (com ' + jurosPct + '% de juros)' : ' (sem juros)'}</span>` : ''}
          ${end ? `<span class="block mt-1 text-xs text-brasil-escuro/70">Entrega em: <strong>${end.logradouro}</strong> — ${end.bairro || ''} ${end.cidade}/${end.uf}</span>` : ''}
          <span class="block mt-3 text-xs text-brasil-escuro/60">Você receberá um e-mail com os detalhes da entrega.</span>
        `;
      }

      if (btnFechar) btnFechar.style.display = '';
      if (btnConfirmarOriginal && btnConfirmarOriginal.parentNode) {
        const novoBotao = document.createElement('button');
        novoBotao.className = btnConfirmarOriginal.className;
        novoBotao.textContent = 'Voltar ao início';
        novoBotao.addEventListener('click', () => {
          window.location.href = 'index.html';
        });
        btnConfirmarOriginal.parentNode.replaceChild(novoBotao, btnConfirmarOriginal);
        novoBotao.style.display = '';
      }

      renderizarLista();
      atualizarTotais();
      verificarCarrinhoVazio();
    }, 3000);
  }

  function abrirModal(titulo, descricao, icone = 'fa-solid fa-circle-check') {
    const modal = $('#info-modal');
    if (!modal) return;
    const t = $('#modal-title'); const d = $('#modal-desc'); const i = $('#modal-icon');
    if (t) t.innerText = titulo;
    if (d) d.innerHTML = descricao;
    if (i) i.innerHTML = `<i class="${icone}"></i>`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  // Abre o modal padrão do site com CTA pra fazer login
  function abrirModalLogin(paginaRetorno) {
    const urlLogin = 'login.html?redirect=' + encodeURIComponent(paginaRetorno);

    const modal = $('#info-modal');
    if (!modal) {
      // Fallback: se o modal não existir, redireciona direto
      window.location.href = urlLogin;
      return;
    }

    const icon = $('#modal-icon');
    const title = $('#modal-title');
    const desc = $('#modal-desc');

    if (icon) {
      icon.className = 'w-12 h-12 rounded-2xl bg-brasil-amarelo text-brasil-verde flex items-center justify-center text-xl';
      icon.innerHTML = '<i class="fa-solid fa-lock"></i>';
    }
    if (title) title.innerText = 'Entre para comprar';
    if (desc) {
      desc.innerHTML = `
        Para adicionar livros ao carrinho, você precisa estar logado na sua conta.
        <br><br>
        <a href="${urlLogin}"
          class="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-brasil-verde text-brasil-amarelo font-bold rounded-xl text-sm hover:bg-brasil-terracota hover:text-white transition-colors">
          <i class="fa-solid fa-right-to-bracket"></i>
          Entrar na minha conta
        </a>
      `;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function fecharModal() {
    const modal = $('#info-modal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }

  // =======================================================================
  // PÁGINA: CADASTRO DE LIVROS (add_livros.html)
  // =======================================================================
  function initCadastroLivros() {
    const form = $('#formLivro');
    const aviso = $('#avisoLivro');
    const corpoTabela = $('#corpoTabelaLivros');
    if (!form && !corpoTabela) return;

    function mostrarAviso(texto, ehErro) {
      if (!aviso) return;
      aviso.textContent = texto;
      aviso.className = ehErro ? 'erro' : '';
    }
    function formatarPreco(v) {
      const n = Number(v);
      if (!isFinite(n)) return 'R$ 0,00';
      return 'R$ ' + n.toFixed(2).replace('.', ',');
    }
    function renderEstrelas(nota) {
      const n = Number(nota) || 0;
      if (n <= 0) return '<span style="color:#aaa; font-size:.8rem;">—</span>';
      let html = '<div style="display:inline-flex; align-items:center; gap:2px;">';
      for (let i = 1; i <= 5; i++) {
        if (n >= i) html += '<i class="fa-solid fa-star" style="color:#F4D03F;"></i>';
        else if (n >= i - 0.5) html += '<i class="fa-solid fa-star-half-stroke" style="color:#F4D03F;"></i>';
        else html += '<i class="fa-regular fa-star" style="color:#ccc;"></i>';
      }
      html += `<span style="margin-left:6px; font-weight:700; color:#8b4513; font-size:.8rem;">${n.toFixed(1)}</span></div>`;
      return html;
    }

        function desenharTabelaLivros(lista) {
      if (!corpoTabela) return;
      corpoTabela.innerHTML = '';

      if (!Array.isArray(lista) || lista.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 15;
        td.textContent = 'Nenhum livro cadastrado ainda.';
        td.style.textAlign = 'center';
        td.style.padding = '2rem';
        td.style.color = '#888';
        tr.appendChild(td);
        corpoTabela.appendChild(tr);
        return;
      }

      lista.forEach(livro => {
        const tr = document.createElement('tr');

        // 1. ID
        const tdId = document.createElement('td');
        tdId.textContent = livro.id;
        tr.appendChild(tdId);

        // 2. Capa
        const tdImg = document.createElement('td');
        if (livro.imagem) {
          const img = document.createElement('img');
          img.src = 'imagens/' + livro.imagem;
          img.alt = livro.titulo;
          img.style.cssText = 'width:40px; height:56px; object-fit:cover; border-radius:4px; border:1px solid #e2d7cd;';
          img.onerror = () => { img.style.display = 'none'; tdImg.textContent = '—'; };
          tdImg.appendChild(img);
        } else {
          tdImg.textContent = '—';
        }
        tr.appendChild(tdImg);

        // 3. Título
        const tdTitulo = document.createElement('td');
        tdTitulo.textContent = livro.titulo;
        tr.appendChild(tdTitulo);

        // 4. Categoria  ← ANTES DO AUTOR
        const tdCategoria = document.createElement('td');
        const badgeCat = document.createElement('span');
        const nomesCat = { hq: 'HQ', livro: 'Livro', manga: 'Mangá', kit: 'Kit' };
        badgeCat.textContent = nomesCat[livro.categoria] || 'Livro';
        const coresCat = {
          hq:     'background:#C0392B; color:#fff;',
          livro:  'background:#1B4D3E; color:#F4D03F;',
          manga:  'background:#8D5524; color:#fff;',
          kit:    'background:#F4D03F; color:#1A1818;'
        };
        badgeCat.style.cssText =
          'display:inline-block; padding:.2rem .5rem; border-radius:4px; font-size:.7rem; font-weight:700; text-transform:uppercase;' +
          (coresCat[livro.categoria] || coresCat.livro);
        tdCategoria.appendChild(badgeCat);
        tr.appendChild(tdCategoria);

        // 5. Autor
        const tdAutor = document.createElement('td');
        tdAutor.textContent = livro.autor;
        tr.appendChild(tdAutor);

        // 6. Editora
        const tdEditora = document.createElement('td');
        tdEditora.textContent = livro.editora || '—';
        tr.appendChild(tdEditora);

        // 7. Páginas
        const tdPaginas = document.createElement('td');
        tdPaginas.textContent = livro.paginas || '—';
        tr.appendChild(tdPaginas);

        // 8. Origem
        const tdOrigem = document.createElement('td');
        const badge = document.createElement('span');
        badge.textContent = livro.origem || 'Nacional';
        badge.style.cssText =
          'display:inline-block; padding:.2rem .5rem; border-radius:4px; font-size:.7rem; font-weight:700; text-transform:uppercase;' +
          (livro.origem === 'Internacional'
            ? 'background:#80c0d8; color:#1A1818;'
            : 'background:#1B4D3E; color:#F4D03F;');
        tdOrigem.appendChild(badge);
        tr.appendChild(tdOrigem);

        // 9. Gênero
        const tdGenero = document.createElement('td');
        tdGenero.textContent = livro.genero || '—';
        tr.appendChild(tdGenero);

        // 10. Preço
        const tdPreco = document.createElement('td');
        tdPreco.textContent = formatarPreco(livro.preco);
        tr.appendChild(tdPreco);

        // 11. Estoque
        const tdEstoque = document.createElement('td');
        tdEstoque.textContent = livro.estoque;
        tr.appendChild(tdEstoque);

        // 12. ISBN
        const tdIsbn = document.createElement('td');
        tdIsbn.textContent = livro.isbn || '—';
        tr.appendChild(tdIsbn);

        // 13. Avaliação
        const tdAval = document.createElement('td');
        tdAval.innerHTML = renderEstrelas(livro.avaliacao);
        tr.appendChild(tdAval);

        // 14. Ações — Excluir
        const tdBotao = document.createElement('td');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = 'Excluir';
        botao.addEventListener('click', () => excluirLivro(livro.id));
        tdBotao.appendChild(botao);
        tr.appendChild(tdBotao);

        // 15. Editar
        const tdEditar = document.createElement('td');
        const botaoEditar = document.createElement('button');
        botaoEditar.type = 'button';
        botaoEditar.textContent = 'Editar';
        botaoEditar.style.cssText = 'background:#8b4513; color:#fff; border:none; padding:.35rem .7rem; border-radius:4px; font-weight:600; cursor:pointer;';
        botaoEditar.addEventListener('click', () => abrirEdicaoLivro(livro.id));
        tdEditar.appendChild(botaoEditar);
        tr.appendChild(tdEditar);

        // Adiciona a linha à tabela
        corpoTabela.appendChild(tr);
      });
    }

    function carregarLivros() {
      if (!corpoTabela) return;
      fetch('/api/livro')
        .then(r => r.json())
        .then(lista => desenharTabelaLivros(lista))
        .catch(erro => mostrarAviso('Falha ao carregar livros: ' + erro.message, true));
    }

    function excluirLivro(id) {
      if (!confirm('Excluir o livro #' + id + '?')) return;
      fetch('/api/livro/' + id, { method: 'DELETE' })
        .then(r => {
          if (!r.ok) throw new Error('Falha ao remover.');
          mostrarAviso('Livro ' + id + ' removido.', false);
          carregarLivros();
        })
        .catch(erro => mostrarAviso('Falha ao remover: ' + erro.message, true));
    }
        // ============ EDIÇÃO DE LIVROS ============
    const modalEdicao = document.getElementById('modalEdicao');
    const formEdicao = document.getElementById('formEdicao');
    const editInputImagem = document.getElementById('editInputImagem');
    const editPreviewWrap = document.getElementById('editPreviewWrap');
    const editPreview = document.getElementById('editPreview');
    let livroEmEdicao = null;
    let imagemNovaSelecionada = null;

    function abrirModalEdicao(livro) {
      livroEmEdicao = livro;
      imagemNovaSelecionada = null;

      document.getElementById('editId').textContent = '(ID ' + livro.id + ')';
      document.getElementById('editTitulo').value = livro.titulo || '';
      document.getElementById('editAutor').value = livro.autor || '';
      document.getElementById('editIsbn').value = livro.isbn || '';
      document.getElementById('editGenero').value = livro.genero || '';
      document.getElementById('editPreco').value = livro.preco || '';
      document.getElementById('editEstoque').value = livro.estoque || 0;
      document.getElementById('editEditora').value = livro.editora || '';
      document.getElementById('editPaginas').value = livro.paginas || '';
      document.getElementById('editCategoria').value = livro.categoria || 'livro';
      document.getElementById('editOrigem').value = livro.origem || 'Nacional';

      const range = document.getElementById('editAvaliacaoRange');
      const txt = document.getElementById('editAvaliacaoTexto');
      range.value = livro.avaliacao || 0;
      txt.textContent = (livro.avaliacao > 0) ? Number(livro.avaliacao).toFixed(1) + ' ★' : 'Sem avaliação';

      // Preview da imagem atual
      if (livro.imagem) {
        editPreview.src = 'imagens/' + livro.imagem;
        editPreviewWrap.style.display = 'block';
      } else {
        editPreview.src = '';
        editPreviewWrap.style.display = 'none';
      }
      editInputImagem.value = '';
      document.getElementById('avisoEdicao').textContent = '';

      modalEdicao.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }

    function fecharModalEdicao() {
      modalEdicao.style.display = 'none';
      document.body.style.overflow = '';
      livroEmEdicao = null;
      imagemNovaSelecionada = null;
    }

    function abrirEdicaoLivro(id) {
      fetch('/api/livro/' + id)
        .then(r => r.json())
        .then(livro => abrirModalEdicao(livro))
        .catch(erro => alert('Falha ao carregar livro: ' + erro.message));
    }

    // Expor para o escopo da tabela
    window.abrirEdicaoLivro = abrirEdicaoLivro;

    // Preview ao selecionar nova imagem
    if (editInputImagem) {
      editInputImagem.addEventListener('change', () => {
        const arq = editInputImagem.files[0];
        if (!arq) {
          imagemNovaSelecionada = null;
          editPreviewWrap.style.display = livroEmEdicao && livroEmEdicao.imagem ? 'block' : 'none';
          if (livroEmEdicao && livroEmEdicao.imagem) editPreview.src = 'imagens/' + livroEmEdicao.imagem;
          return;
        }
        if (arq.size > 5 * 1024 * 1024) {
          document.getElementById('avisoEdicao').textContent = 'Imagem muito grande (máx 5 MB).';
          document.getElementById('avisoEdicao').style.color = '#c0392b';
          editInputImagem.value = '';
          return;
        }
        imagemNovaSelecionada = arq;
        const url = URL.createObjectURL(arq);
        editPreview.src = url;
        editPreviewWrap.style.display = 'block';
      });
    }

    // Fechar modal
    const btnFecharEdicao = document.getElementById('btnFecharEdicao');
    if (btnFecharEdicao) btnFecharEdicao.addEventListener('click', fecharModalEdicao);

    const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
    if (btnCancelarEdicao) btnCancelarEdicao.addEventListener('click', fecharModalEdicao);

    if (modalEdicao) {
      modalEdicao.addEventListener('click', (e) => {
        if (e.target === modalEdicao) fecharModalEdicao();
      });
    }

    // Submit da edição
    if (formEdicao) {
      formEdicao.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!livroEmEdicao) return;

        const aviso = document.getElementById('avisoEdicao');
        aviso.textContent = 'Salvando...';
        aviso.style.color = '#8b4513';

        const dados = {
          titulo: document.getElementById('editTitulo').value.trim(),
          autor: document.getElementById('editAutor').value.trim(),
          isbn: document.getElementById('editIsbn').value.trim(),
          genero: document.getElementById('editGenero').value.trim(),
          preco: document.getElementById('editPreco').value,
          estoque: document.getElementById('editEstoque').value,
          editora: document.getElementById('editEditora').value.trim(),
          paginas: document.getElementById('editPaginas').value,
          categoria: document.getElementById('editCategoria').value,
          origem: document.getElementById('editOrigem').value,
          avaliacao: document.getElementById('editAvaliacaoRange').value
        };

        // Se tem imagem nova, faz upload primeiro
        function enviarEdicao(nomeImagem) {
          if (nomeImagem !== undefined) dados.imagem = nomeImagem;

          fetch('/api/livro/' + livroEmEdicao.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
          })
            .then(r => r.json().then(c => ({ ok: r.ok, c })))
            .then(({ ok, c }) => {
              if (!ok) {
                aviso.textContent = c.erro || 'Erro ao salvar.';
                aviso.style.color = '#c0392b';
                return;
              }
              aviso.textContent = 'Livro atualizado com sucesso!';
              aviso.style.color = '#2f855a';
              carregarLivros();
              setTimeout(fecharModalEdicao, 900);
            })
            .catch(erro => {
              aviso.textContent = 'Erro de comunicação: ' + erro.message;
              aviso.style.color = '#c0392b';
            });
        }

        if (imagemNovaSelecionada) {
          const fd = new FormData();
          fd.append('imagem', imagemNovaSelecionada);
          fetch('/api/livro/upload', { method: 'POST', body: fd })
            .then(r => r.json().then(c => ({ ok: r.ok, c })))
            .then(({ ok, c }) => {
              if (!ok) {
                aviso.textContent = c.erro || 'Falha no upload da imagem.';
                aviso.style.color = '#c0392b';
                return;
              }
              enviarEdicao(c.imagem);
            })
            .catch(erro => {
              aviso.textContent = 'Erro no upload: ' + erro.message;
              aviso.style.color = '#c0392b';
            });
        } else {
          enviarEdicao(undefined);
        }
      });
    }

    if (form) {
      const inputImagem = document.getElementById('inputImagem');
      const previewWrap = document.getElementById('previewImagemWrap');
      const previewImg = document.getElementById('previewImagem');
      const previewNome = document.getElementById('previewNome');

      if (previewWrap) previewWrap.style.display = 'none';

      if (inputImagem) {
        inputImagem.addEventListener('change', () => {
          const arquivo = inputImagem.files[0];
          if (!arquivo) {
            if (previewWrap) previewWrap.style.display = 'none';
            return;
          }
          if (arquivo.size > 5 * 1024 * 1024) {
            mostrarAviso('Imagem muito grande (máx 5 MB).', true);
            inputImagem.value = '';
            if (previewWrap) previewWrap.style.display = 'none';
            return;
          }
          if (!/^image\//.test(arquivo.type)) {
            mostrarAviso('O arquivo precisa ser uma imagem.', true);
            inputImagem.value = '';
            if (previewWrap) previewWrap.style.display = 'none';
            return;
          }
          const url = URL.createObjectURL(arquivo);
          if (previewImg) {
            previewImg.src = url;
            previewImg.onload = () => URL.revokeObjectURL(url);
          }
          if (previewNome) previewNome.textContent = arquivo.name;
          if (previewWrap) previewWrap.style.display = 'block';
        });
      }

      form.addEventListener('submit', function (evento) {
        evento.preventDefault();

        const dados = {};
        new FormData(form).forEach((valor, chave) => {
          if (chave !== 'imagem') dados[chave] = valor;
        });

        function enviarLivro(nomeImagem) {
          dados.imagem = nomeImagem || '';
          fetch('/api/livro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
          })
            .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
            .then(({ ok, corpo }) => {
              if (!ok) { mostrarAviso(corpo.erro || 'Erro ao salvar.', true); return; }
              mostrarAviso('Livro "' + corpo.titulo + '" salvo (ID ' + corpo.id + ').', false);
              form.reset();
              if (previewWrap) previewWrap.style.display = 'none';

              const range = document.getElementById('avaliacaoRange');
              const txt = document.getElementById('avaliacaoTexto');
              if (range) range.value = 0;
              if (txt) txt.textContent = 'Sem avaliação';

              carregarLivros();
            })
            .catch(erro => mostrarAviso('Falha na comunicação: ' + erro.message, true));
        }

        const arquivo = inputImagem ? inputImagem.files[0] : null;
        if (!arquivo) {
          return enviarLivro(null);
        }

        mostrarAviso('Enviando imagem...', false);
        const fd = new FormData();
        fd.append('imagem', arquivo);

        fetch('/api/livro/upload', { method: 'POST', body: fd })
          .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
          .then(({ ok, corpo }) => {
            if (!ok) {
              mostrarAviso(corpo.erro || 'Falha no upload da imagem.', true);
              return;
            }
            enviarLivro(corpo.imagem);
          })
          .catch(erro => mostrarAviso('Erro de comunicação no upload: ' + erro.message, true));
      });
    }

    carregarLivros();
  }

  // =======================================================================
  // BOOTSTRAP
  // =======================================================================
  document.addEventListener('DOMContentLoaded', function () {
    initMenuMobile();
    carregarCarrinho();
    atualizarBadgeGlobal();
    delegateComprarBtn();
    initPaginaCarrinho();
    initCadastroLivros();
  });

  window.adicionarAoCarrinhoGlobal = adicionarAoCarrinho;
  window.atualizarBadgeGlobal = atualizarBadgeGlobal;
  window.mesclarCarrinhoLocalNoServidor = mesclarCarrinhoLocalNoServidor;
  window.lerCarrinhoGlobal = carregarCarrinho;
  window.obterCarrinhoGlobal = () => Carrinho.dados;
  window.abrirModalLoginGlobal = abrirModalLogin;
   
  
})();