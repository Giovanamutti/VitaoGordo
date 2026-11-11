/* =========================================================================
   Livraria Multicultural - script.js
   -------------------------------------------------------------------------
   Lógica JS unificada para todas as páginas:
     - Cadastro de clientes (login.html)
     - Cadastro de livros (add_livros.html)
     - Catálogo / botões "Comprar" (index.html)
     - Carrinho de compras (carrinho.html)
     - Badge do carrinho no header (todas as páginas)
     - Menu mobile (todas as páginas)
   Detecta a página pelos elementos presentes no DOM.
   ========================================================================= */

(function () {
  'use strict';

  // =======================================================================
  // CONFIGURAÇÃO GLOBAL
  // =======================================================================
  const STORAGE_KEY = 'brasilidade_carrinho';

  const CUPONS_VALIDOS = {
    'MULTICULTURAL10': 0.10,
    'BRASILIDADE10': 0.10
  };

  const PRODUTOS = {
    1: {
      nome: 'Dom Casmurro',
      autor: 'Machado de Assis',
      preco: 49.90,
      img: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
      desc: 'Edição comemorativa de capa dura e notas críticas.'
    },
    2: {
      nome: 'Macunaíma',
      autor: 'Mário de Andrade',
      preco: 39.90,
      img: 'https://images.unsplash.com/photo-1495640388908-05fa85288e61?auto=format&fit=crop&q=80&w=600',
      desc: 'O herói sem nenhum caráter em edição modernista.'
    },
    3: {
      nome: 'Quarto de Despejo',
      autor: 'Carolina Maria de Jesus',
      preco: 54.90,
      img: 'https://images.unsplash.com/photo-1524578271613-d550eacf6090?auto=format&fit=crop&q=80&w=600',
      desc: 'Diário de uma favelada. Edição especial crítica.'
    },
    4: {
      nome: 'Vidas Secas',
      autor: 'Graciliano Ramos',
      preco: 44.90,
      img: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600',
      desc: 'A dura jornada de Fabiano e sua família no sertão.'
    }
  };

  // =======================================================================
  // HELPERS
  // =======================================================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function formatarReais(valor) {
    return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
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
  // CARRINHO - localStorage
  // =======================================================================
    function lerCarrinho() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (!salvo) return {};
      const dados = JSON.parse(salvo);
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return {};

      // Sanitiza: garante price/qty válidos E preserva metadados
      const limpo = {};
      Object.keys(dados).forEach(id => {
        const it = dados[id];
        if (!it || typeof it !== 'object') return;
        const preco = Number(it.price);
        const qtd = Number(it.qty);
        if (!isFinite(preco) || preco <= 0) return;
        if (!isFinite(qtd) || qtd <= 0) return;
        limpo[id] = {
          price: preco,
          qty: Math.floor(qtd),
          nome: it.nome || '',
          autor: it.autor || '',
          img: it.img || '',
          genero: it.genero || '',
          origem: it.origem || ''
        };
      });
      return limpo;
    } catch (e) {
      console.warn('Falha ao ler carrinho:', e);
      return {};
    }
  }

  function salvarCarrinho(dados) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch (e) {
      console.warn('Falha ao salvar carrinho:', e);
    }
  }

  function contarItens(dados) {
    return Object.values(dados).reduce((s, it) => s + (it.qty || 0), 0);
  }

  function calcularSubtotal(dados) {
    return Object.values(dados).reduce((s, it) => s + (it.price || 0) * (it.qty || 0), 0);
  }

    function adicionarAoCarrinho(id, preco, quantidade = 1, extras = {}) {
    const dados = lerCarrinho();
    const chave = String(id);

    if (dados[chave]) {
      dados[chave].qty += quantidade;
      dados[chave].price = preco;
      if (extras.nome) dados[chave].nome = extras.nome;
      if (extras.autor) dados[chave].autor = extras.autor;
      if (extras.img) dados[chave].img = extras.img;
      if (extras.genero) dados[chave].genero = extras.genero;
      if (extras.origem) dados[chave].origem = extras.origem;
    } else {
      dados[chave] = {
        price: preco,
        qty: quantidade,
        nome: extras.nome || '',
        autor: extras.autor || '',
        img: extras.img || '',
        genero: extras.genero || '',
        origem: extras.origem || ''
      };
    }

    salvarCarrinho(dados);
    atualizarBadgeGlobal();
    return dados;
  }

  function atualizarBadgeGlobal() {
    const badge = $('#badge-count');
    if (!badge) return;
    const dados = lerCarrinho();
    badge.innerText = String(contarItens(dados));
  }

  // =======================================================================
  // CATÁLOGO (index.html)
  // =======================================================================
  function initCatalogo() {
    const botoes = $$('.comprar-btn');
    if (botoes.length === 0) return;

    botoes.forEach(btn => {
      btn.addEventListener('click', function () {
        const id = btn.dataset.id;
        const preco = parseFloat(btn.dataset.preco);
        const nome = btn.dataset.nome || '';

        if (!id || !isFinite(preco)) {
          console.warn('Botão comprar sem data-id/data-preco válidos.');
          return;
        }

        adicionarAoCarrinho(id, preco, 1);

        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Adicionado';
        btn.classList.add('bg-brasil-terracota', 'text-white');
        setTimeout(() => {
          btn.innerHTML = original;
          btn.disabled = false;
          btn.classList.remove('bg-brasil-terracota', 'text-white');
        }, 900);

        mostrarToast(`${nome || 'Item'} adicionado ao carrinho!`);
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
  // CARRINHO (carrinho.html)
  // =======================================================================
  const EstadoCarrinho = {
    dados: {},
    frete: 0,
    descontoPct: 0,
    inicializado: false
  };

  function initPaginaCarrinho() {
    const lista = $('#lista-itens');
    const subtotalEl = $('#subtotal-val');
    if (!lista || !subtotalEl) return;

    EstadoCarrinho.dados = lerCarrinho();
    EstadoCarrinho.frete = 0;
    EstadoCarrinho.descontoPct = 0;

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

    renderizarLista();
    atualizarTotais();
    verificarCarrinhoVazio();

    EstadoCarrinho.inicializado = true;
  }

  function renderizarLista() {
    const container = $('#lista-itens');
    const emptyMsg = $('#empty-cart-msg');
    if (!container) return;

    container.innerHTML = '';
    const chaves = Object.keys(EstadoCarrinho.dados);

    if (chaves.length === 0) {
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      container.classList.add('hidden');
      return;
    }
    if (emptyMsg) emptyMsg.classList.add('hidden');
    container.classList.remove('hidden');

    chaves.forEach(id => {
      const item = EstadoCarrinho.dados[id];
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
    if (!EstadoCarrinho.dados[chave]) return;
    const novaQty = EstadoCarrinho.dados[chave].qty + delta;
    if (novaQty < 1) return;

    EstadoCarrinho.dados[chave].qty = novaQty;
    salvarCarrinho(EstadoCarrinho.dados);
    renderizarLista();
    atualizarTotais();
    atualizarBadgeGlobal();
  }

  function removerItem(id) {
    const chave = String(id);
    const itemEl = document.getElementById(`item-${id}`);
    if (itemEl) {
      itemEl.style.opacity = '0';
      itemEl.style.transform = 'scale(0.95)';
    }
    setTimeout(() => {
      delete EstadoCarrinho.dados[chave];
      salvarCarrinho(EstadoCarrinho.dados);
      renderizarLista();
      atualizarTotais();
      verificarCarrinhoVazio();
      atualizarBadgeGlobal();
    }, 250);
  }

  function limparCarrinho() {
    if (Object.keys(EstadoCarrinho.dados).length === 0) return;
    if (!confirm('Deseja realmente esvaziar o carrinho?')) return;

    EstadoCarrinho.dados = {};
    EstadoCarrinho.frete = 0;
    EstadoCarrinho.descontoPct = 0;

    const cepInput = $('#cep-input');
    if (cepInput) cepInput.value = '';
    const couponInput = $('#coupon-input');
    if (couponInput) couponInput.value = '';

    const freightResult = $('#freight-result');
    if (freightResult) freightResult.classList.add('hidden');
    const couponMsg = $('#coupon-msg');
    if (couponMsg) couponMsg.classList.add('hidden');
    const discountRow = $('#discount-row');
    if (discountRow) discountRow.classList.add('hidden');

    salvarCarrinho(EstadoCarrinho.dados);
    renderizarLista();
    atualizarTotais();
    verificarCarrinhoVazio();
    atualizarBadgeGlobal();
  }

  function verificarCarrinhoVazio() {
    const empty = $('#empty-cart-msg');
    if (!empty) return;
    const vazio = Object.keys(EstadoCarrinho.dados).length === 0;
    empty.classList.toggle('hidden', !vazio);
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

    const fr = $('#freight-result');
    if (fr) fr.classList.remove('hidden');

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
      const pct = Math.round(desconto * 100);
      msgEl.innerText = `Cupom aplicado com sucesso (-${pct}%)!`;
      msgEl.classList.remove('hidden', 'text-brasil-terracota');
      msgEl.classList.add('text-brasil-verde');
      if (discountRow) discountRow.classList.remove('hidden');
    } else {
      EstadoCarrinho.descontoPct = 0;
      msgEl.innerText = code
        ? 'Cupom inválido ou expirado.'
        : 'Digite um cupom. (Dica: MULTICULTURAL10)';
      msgEl.classList.remove('hidden', 'text-brasil-verde');
      msgEl.classList.add('text-brasil-terracota');
      if (discountRow) discountRow.classList.add('hidden');
    }

    atualizarTotais();
  }

  function atualizarTotais() {
    const subtotal = calcularSubtotal(EstadoCarrinho.dados);
    const desconto = subtotal * EstadoCarrinho.descontoPct;
    const total = subtotal - desconto + EstadoCarrinho.frete;

    const setTxt = (sel, txt) => { const el = $(sel); if (el) el.innerText = txt; };

    setTxt('#subtotal-val', formatarReais(subtotal));
    setTxt('#discount-val', '- ' + formatarReais(desconto));
    setTxt('#freight-val', formatarReais(EstadoCarrinho.frete));
    setTxt('#total-val', formatarReais(total));

    const badge = $('#badge-count');
    if (badge) badge.innerText = String(contarItens(EstadoCarrinho.dados));

    const discountRow = $('#discount-row');
    if (discountRow) {
      if (EstadoCarrinho.descontoPct > 0) discountRow.classList.remove('hidden');
      else discountRow.classList.add('hidden');
    }
  }

  function finalizarCompra() {
    if (Object.keys(EstadoCarrinho.dados).length === 0) {
      abrirModal('Sacola vazia', 'Adicione itens ao carrinho antes de prosseguir.', 'fa-solid fa-triangle-exclamation');
      return;
    }
    if (EstadoCarrinho.frete === 0) {
      abrirModal('Calcule o frete', 'Informe seu CEP e clique em "OK" antes de finalizar.', 'fa-solid fa-truck-fast');
      return;
    }
    const subtotal = calcularSubtotal(EstadoCarrinho.dados);
    const total = subtotal - subtotal * EstadoCarrinho.descontoPct + EstadoCarrinho.frete;

    abrirModal(
      'Checkout seguro (MFS)',
      `Total a pagar: ${formatarReais(total)}. Redirecionando para o ambiente seguro de pagamento...`,
      'fa-solid fa-shield-halved'
    );
  }

  function abrirModal(titulo, descricao, icone = 'fa-solid fa-circle-check') {
    const modal = $('#info-modal');
    if (!modal) return;
    const t = $('#modal-title');
    const d = $('#modal-desc');
    const i = $('#modal-icon');
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
  // CADASTRO DE CLIENTES (login.html)
  // =======================================================================
  function initCadastroClientes() {
    const form = $('#formCliente');
    const aviso = $('#aviso');
    const corpoTabela = $('#corpoTabela');

    if (!form && !corpoTabela) return;

    function mostrarAviso(texto, ehErro) {
      if (!aviso) return;
      aviso.textContent = texto;
      aviso.className = ehErro ? 'erro' : '';
    }

    function lerFormulario(formulario) {
      const dados = {};
      new FormData(formulario).forEach((valor, chave) => { dados[chave] = valor; });
      return dados;
    }

    function desenharTabelaClientes(lista) {
      if (!corpoTabela) return;
      corpoTabela.innerHTML = '';

      if (!Array.isArray(lista) || lista.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = 'Nenhum cliente cadastrado ainda.';
        tr.appendChild(td);
        corpoTabela.appendChild(tr);
        return;
      }

      lista.forEach(cliente => {
        const tr = document.createElement('tr');
        [cliente.id, cliente.cep, cliente.nome, cliente.telefone, cliente.cpf, cliente.nascimento]
          .forEach(valor => {
            const td = document.createElement('td');
            td.textContent = (valor === null || valor === undefined) ? '' : valor;
            tr.appendChild(td);
          });

        const tdBotao = document.createElement('td');
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.textContent = 'Excluir';
        botao.addEventListener('click', () => excluirCliente(cliente.id));
        tdBotao.appendChild(botao);
        tr.appendChild(tdBotao);
        corpoTabela.appendChild(tr);
      });
    }

    function carregarClientes() {
      if (!corpoTabela) return;
      fetch('/api/cliente')
        .then(r => r.json())
        .then(lista => desenharTabelaClientes(lista))
        .catch(erro => mostrarAviso('Falha ao carregar lista: ' + erro.message, true));
    }

    function excluirCliente(id) {
      if (!confirm('Excluir o cliente #' + id + '?')) return;
      fetch('/api/cliente/' + id, { method: 'DELETE' })
        .then(r => {
          if (!r.ok) throw new Error('Falha ao remover.');
          mostrarAviso('Cliente ' + id + ' removido.', false);
          carregarClientes();
        })
        .catch(erro => mostrarAviso('Falha ao remover: ' + erro.message, true));
    }

    if (form) {
      form.addEventListener('submit', function (evento) {
        evento.preventDefault();
        const dados = lerFormulario(form);

        fetch('/api/cliente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados)
        })
          .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
          .then(({ ok, corpo }) => {
            if (!ok) {
              mostrarAviso(corpo.erro || 'Erro ao salvar.', true);
              return;
            }
            mostrarAviso('Cliente ' + corpo.id + ' salvo.', false);
            form.reset();
            carregarClientes();
          })
          .catch(erro => mostrarAviso('Falha na comunicação: ' + erro.message, true));
      });
    }

    carregarClientes();
  }

  // =======================================================================
  // CADASTRO DE LIVROS (add_livros.html)
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

    // Gera HTML de estrelas a partir de uma nota 0–5
    function renderEstrelas(nota) {
      const n = Number(nota) || 0;
      if (n <= 0) {
        return '<span style="color:#aaa; font-size:.8rem;">—</span>';
      }
      let html = '<div style="display:inline-flex; align-items:center; gap:2px;">';
      for (let i = 1; i <= 5; i++) {
        if (n >= i) {
          html += '<i class="fa-solid fa-star" style="color:#F4D03F;"></i>';
        } else if (n >= i - 0.5) {
          html += '<i class="fa-solid fa-star-half-stroke" style="color:#F4D03F;"></i>';
        } else {
          html += '<i class="fa-regular fa-star" style="color:#ccc;"></i>';
        }
      }
      html += `<span style="margin-left:6px; font-weight:700; color:#8b4513; font-size:.8rem;">${n.toFixed(1)}</span>`;
      html += '</div>';
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

        // ID
        const tdId = document.createElement('td');
        tdId.textContent = livro.id;
        tr.appendChild(tdId);

        // Capa
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

        // Título
        const tdTitulo = document.createElement('td');
        tdTitulo.textContent = livro.titulo;
        tr.appendChild(tdTitulo);

                // Autor
        const tdAutor = document.createElement('td');
        tdAutor.textContent = livro.autor;
        tr.appendChild(tdAutor);

        // Editora
        const tdEditora = document.createElement('td');
        tdEditora.textContent = livro.editora || '—';
        tr.appendChild(tdEditora);

        // Páginas
        const tdPaginas = document.createElement('td');
        tdPaginas.textContent = livro.paginas ? livro.paginas : '—';
        tr.appendChild(tdPaginas);
        

        // Origem (badge)
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

        // Gênero
        const tdGenero = document.createElement('td');
        tdGenero.textContent = livro.genero || '—';
        tr.appendChild(tdGenero);

        // Preço
        const tdPreco = document.createElement('td');
        tdPreco.textContent = formatarPreco(livro.preco);
        tr.appendChild(tdPreco);

        // Estoque
        const tdEstoque = document.createElement('td');
        tdEstoque.textContent = livro.estoque;
        tr.appendChild(tdEstoque);

        // ISBN
        const tdIsbn = document.createElement('td');
        tdIsbn.textContent = livro.isbn || '—';
        tr.appendChild(tdIsbn);

        // ⭐ Avaliação
        const tdAval = document.createElement('td');
        tdAval.innerHTML = renderEstrelas(livro.avaliacao);
        tr.appendChild(tdAval);

        // Ações
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
            if (!ok) {
              mostrarAviso(corpo.erro || 'Erro ao salvar.', true);
              return;
            }
            mostrarAviso('Livro "' + corpo.titulo + '" salvo (ID ' + corpo.id + ').', false);
            form.reset();
            // Reset do slider
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
    atualizarBadgeGlobal();
    initCatalogo();
    initPaginaCarrinho();
    initCadastroClientes();
    initCadastroLivros();
  });

    // Expor funções para integração com outras páginas (produtos.html)
  window.adicionarAoCarrinhoGlobal = adicionarAoCarrinho;
  window.atualizarBadgeGlobal = atualizarBadgeGlobal;
})();