/* =========================================================================
   Livraria Multicultural - script.js (v2 — carrinho estável)
   ========================================================================= */

(function () {
  'use strict';

  const STORAGE_KEY = 'brasilidade_carrinho';
  const USUARIO_KEY = 'brasilidade_usuario';

  const CUPONS_VALIDOS = {
    'MULTICULTURAL10': 0.10,
    'BRASILIDADE10': 0.10
  };

  // Mantido para compatibilidade com produtos em destaque que não têm nome
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
  // ESTADO DO CARRINHO (cache em memória + carregamento controlado)
  // =======================================================================
  const Carrinho = {
    dados: {},        // mapa { id: {price, qty, nome, autor, img, genero, origem} }
    pronto: false,    // true quando já temos a versão correta carregada
    carregando: null, // Promise em andamento (evita requisições duplicadas)
    listeners: []     // funções que querem saber quando muda
  };

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
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 0,
        nome: it.nome || '', autor: it.autor || '',
        img: it.img || '', genero: it.genero || '', origem: it.origem || ''
      };
    });
    return mapa;
  }

  function mapaParaServidor(mapa) {
    return Object.keys(mapa).map(id => ({
      id: String(id),
      price: mapa[id].price,
      qty: mapa[id].qty,
      nome: mapa[id].nome,
      autor: mapa[id].autor,
      img: mapa[id].img,
      genero: mapa[id].genero,
      origem: mapa[id].origem
    }));
  }

  /**
   * Garante que Carrinho.dados reflita o estado real (local ou servidor).
   * Retorna Promise que resolve quando estiver pronto.
   */
  function carregarCarrinho() {
    if (Carrinho.pronto) return Promise.resolve(Carrinho.dados);
    if (Carrinho.carregando) return Carrinho.carregando;

    const usuario = usuarioAtual();

    if (!usuario) {
      // Visitante
      Carrinho.dados = lerCarrinhoLocal();
      Carrinho.pronto = true;
      notificar();
      return Promise.resolve(Carrinho.dados);
    }

    // Logado — busca do servidor
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

  /**
   * Persiste o estado atual. Se logado, sincroniza no servidor.
   */
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

  function calcularSubtotal(dados) {
    return Object.values(dados).reduce((s, it) => s + (it.price || 0) * (it.qty || 0), 0);
  }

  // =======================================================================
  // ADICIONAR AO CARRINHO (público)
  // =======================================================================
  function adicionarAoCarrinho(id, preco, quantidade = 1, extras = {}) {
    // Sempre carrega antes de somar — evita sobrescrever carrinho do servidor
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
          price: preco,
          qty: quantidade,
          nome: extras.nome || '',
          autor: extras.autor || '',
          img: extras.img || '',
          genero: extras.genero || '',
          origem: extras.origem || ''
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
  // MESCLAR LOCAL → SERVIDOR (ao logar)
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
  // PÁGINA: CATÁLOGO (index/produtos/livro) — botões "Comprar"
  // =======================================================================
  function delegateComprarBtn(container) {
    // Usa delegação de evento: funciona mesmo se cards forem recriados
    const alvo = container || document;
    if (alvo.__comprarDelegado) return;
    alvo.__comprarDelegado = true;

    alvo.addEventListener('click', (e) => {
      const btn = e.target.closest('.comprar-btn');
      if (!btn || btn.disabled) return;

      const id = btn.dataset.id;
      const preco = parseFloat(btn.dataset.preco);
      if (!id || !isFinite(preco)) return;

      const extras = {
        nome: btn.dataset.nome || '',
        autor: btn.dataset.autor || '',
        img: btn.dataset.img || '',
        genero: btn.dataset.genero || '',
        origem: btn.dataset.origem || ''
      };

      // Marca imediatamente para evitar duplo clique
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Adicionado';
      btn.classList.add('bg-brasil-terracota', 'text-white');

      adicionarAoCarrinho(id, preco, 1, extras)
        .then(() => {
          mostrarToast((extras.nome || 'Item') + ' adicionado ao carrinho!');
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
  const EstadoCarrinho = { frete: 0, descontoPct: 0 };

  function initPaginaCarrinho() {
    const lista = $('#lista-itens');
    const subtotalEl = $('#subtotal-val');
    if (!lista || !subtotalEl) return;

    // Carrega o carrinho e depois renderiza
    carregarCarrinho().then(() => {
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

    const btnCupom = $('#btn-aplicar-cupom');
    if (btnCupom) btnCupom.addEventListener('click', aplicarCupom);

    const btnCheckout = $('#btn-finalizar');
    if (btnCheckout) btnCheckout.addEventListener('click', finalizarCompra);

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

    container.innerHTML = '';
    const chaves = Object.keys(Carrinho.dados);

    if (chaves.length === 0) {
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      container.classList.add('hidden');
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

      const card = document.createElement('div');
      card.id = `item-${id}`;
      card.className = 'bg-white rounded-2xl p-4 sm:p-6 shadow-md border border-brasil-areia flex flex-col sm:flex-row items-center gap-6 relative transition-all';
      card.innerHTML = `
        <div class="w-24 h-32 bg-brasil-areia rounded-xl overflow-hidden flex-shrink-0 shadow-inner">
          ${prod.img
            ? `<img src="${prod.img}" alt="${prod.nome}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-brasil-verde/40"><i class="fa-solid fa-book text-3xl"></i></div>`}
        </div>
        <div class="flex-1 text-center sm:text-left space-y-1">
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

    const cepInput = $('#cep-input'); if (cepInput) cepInput.value = '';
    const couponInput = $('#coupon-input'); if (couponInput) couponInput.value = '';
    const fr = $('#freight-result'); if (fr) fr.classList.add('hidden');
    const cm = $('#coupon-msg'); if (cm) cm.classList.add('hidden');
    const dr = $('#discount-row'); if (dr) dr.classList.add('hidden');

    notificar();
    persistirCarrinho();
  }

  function verificarCarrinhoVazio() {
    const empty = $('#empty-cart-msg');
    if (!empty) return;
    empty.classList.toggle('hidden', Object.keys(Carrinho.dados).length > 0);
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
    EstadoCarrinho.frete = 15.00;
    const fr = $('#freight-result'); if (fr) fr.classList.remove('hidden');
    atualizarTotais();
    abrirModal('Frete calculado', 'CEP localizado! Frete fixo de R$ 15,00 (5 dias úteis).', 'fa-solid fa-truck-fast');
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

  function atualizarTotais() {
    const subtotal = calcularSubtotal(Carrinho.dados);
    const desconto = subtotal * EstadoCarrinho.descontoPct;
    const total = subtotal - desconto + EstadoCarrinho.frete;

    const setTxt = (sel, txt) => { const el = $(sel); if (el) el.innerText = txt; };
    setTxt('#subtotal-val', formatarReais(subtotal));
    setTxt('#discount-val', '- ' + formatarReais(desconto));
    setTxt('#freight-val', formatarReais(EstadoCarrinho.frete));
    setTxt('#total-val', formatarReais(total));

    const discountRow = $('#discount-row');
    if (discountRow) {
      if (EstadoCarrinho.descontoPct > 0) discountRow.classList.remove('hidden');
      else discountRow.classList.add('hidden');
    }
  }

  function finalizarCompra() {
    if (Object.keys(Carrinho.dados).length === 0) {
      abrirModal('Sacola vazia', 'Adicione itens ao carrinho antes de prosseguir.', 'fa-solid fa-triangle-exclamation');
      return;
    }
    if (EstadoCarrinho.frete === 0) {
      abrirModal('Calcule o frete', 'Informe seu CEP e clique em "OK" antes de finalizar.', 'fa-solid fa-truck-fast');
      return;
    }
    const subtotal = calcularSubtotal(Carrinho.dados);
    const total = subtotal - subtotal * EstadoCarrinho.descontoPct + EstadoCarrinho.frete;
    abrirModal('Checkout seguro (MFS)',
      `Total a pagar: ${formatarReais(total)}. Redirecionando para o ambiente seguro de pagamento...`,
      'fa-solid fa-shield-halved');
  }

  function abrirModal(titulo, descricao, icone = 'fa-solid fa-circle-check') {
    const modal = $('#info-modal');
    if (!modal) return;
    const t = $('#modal-title'); const d = $('#modal-desc'); const i = $('#modal-icon');
    if (t) t.innerText = titulo;
    if (d) d.innerText = descricao;
    if (i) i.innerHTML = `<i class="${icone}"></i>`;
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
        td.colSpan = 13;
        td.textContent = 'Nenhum livro cadastrado ainda.';
        tr.appendChild(td);
        corpoTabela.appendChild(tr);
        return;
      }
      lista.forEach(livro => {
        const tr = document.createElement('tr');
        const tdId = document.createElement('td'); tdId.textContent = livro.id; tr.appendChild(tdId);

        const tdImg = document.createElement('td');
        if (livro.imagem) {
          const img = document.createElement('img');
          img.src = 'imagens/' + livro.imagem;
          img.alt = livro.titulo;
          img.style.cssText = 'width:40px; height:56px; object-fit:cover; border-radius:4px; border:1px solid #e2d7cd;';
          img.onerror = () => { img.style.display = 'none'; tdImg.textContent = '—'; };
          tdImg.appendChild(img);
        } else tdImg.textContent = '—';
        tr.appendChild(tdImg);

        const tdTitulo = document.createElement('td'); tdTitulo.textContent = livro.titulo; tr.appendChild(tdTitulo);
        const tdAutor = document.createElement('td'); tdAutor.textContent = livro.autor; tr.appendChild(tdAutor);
        const tdEditora = document.createElement('td'); tdEditora.textContent = livro.editora || '—'; tr.appendChild(tdEditora);
        const tdPaginas = document.createElement('td'); tdPaginas.textContent = livro.paginas || '—'; tr.appendChild(tdPaginas);

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

        const tdGenero = document.createElement('td'); tdGenero.textContent = livro.genero || '—'; tr.appendChild(tdGenero);
        const tdPreco = document.createElement('td'); tdPreco.textContent = formatarPreco(livro.preco); tr.appendChild(tdPreco);
        const tdEstoque = document.createElement('td'); tdEstoque.textContent = livro.estoque; tr.appendChild(tdEstoque);
        const tdIsbn = document.createElement('td'); tdIsbn.textContent = livro.isbn || '—'; tr.appendChild(tdIsbn);

        const tdAval = document.createElement('td'); tdAval.innerHTML = renderEstrelas(livro.avaliacao); tr.appendChild(tdAval);

        const tdBotao = document.createElement('td');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = 'Excluir';
        botao.addEventListener('click', () => excluirLivro(livro.id));
        tdBotao.appendChild(botao);
        tr.appendChild(tdBotao);

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

    if (form) {
      form.addEventListener('submit', function (evento) {
        evento.preventDefault();
        const dados = {};
        new FormData(form).forEach((valor, chave) => { dados[chave] = valor; });

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
            const range = document.getElementById('avaliacaoRange');
            const txt = document.getElementById('avaliacaoTexto');
            if (range) range.value = 0;
            if (txt) txt.textContent = 'Sem avaliação';
            carregarLivros();
          })
          .catch(erro => mostrarAviso('Falha na comunicação: ' + erro.message, true));
      });
    }

    carregarLivros();
  }

  // =======================================================================
  // BOOTSTRAP
  // =======================================================================
  document.addEventListener('DOMContentLoaded', function () {
    initMenuMobile();
    carregarCarrinho();        // dispara o carregamento inicial
    atualizarBadgeGlobal();
    delegateComprarBtn();      // delega para QUALQUER página
    initPaginaCarrinho();
    initCadastroLivros();
  });

  // Expor globais
  window.adicionarAoCarrinhoGlobal = adicionarAoCarrinho;
  window.atualizarBadgeGlobal = atualizarBadgeGlobal;
  window.mesclarCarrinhoLocalNoServidor = mesclarCarrinhoLocalNoServidor;
  window.lerCarrinhoGlobal = carregarCarrinho;
  window.obterCarrinhoGlobal = () => Carrinho.dados;
})();