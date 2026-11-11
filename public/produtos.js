/* =========================================================================
   Livraria Multicultural - produtos.js
   Lógica exclusiva da página produtos.html:
     - Carrega os livros via GET /api/livro
     - Filtra por busca (título, autor, gênero)
     - Filtra por origem (Nacional / Internacional)
     - Ordena por recentes, preço, avaliação ou título
     - Renderiza a grade com capa, autor, gênero, preço, origem e nota
     - Botão "Comprar" integrado com o carrinho do script.js
   ========================================================================= */

(function () {
  'use strict';

  // -------------------- Estado --------------------
  const Estado = {
    livros: [],          // lista completa vinda do servidor
    busca: '',           // texto digitado
    origem: '',          // '' | 'Nacional' | 'Internacional'
    ordenar: 'recentes'  // 'recentes' | 'preco-asc' | 'preco-desc' | 'avaliacao' | 'titulo'
  };

  // -------------------- Helpers --------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  function formatarPreco(v) {
    const n = Number(v);
    if (!isFinite(n)) return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function renderEstrelas(nota) {
    const n = Number(nota) || 0;
    if (n <= 0) {
      return '<span class="text-[10px] text-brasil-escuro/40 font-semibold">Sem avaliação</span>';
    }
    let html = '<div class="flex items-center gap-0.5">';
    for (let i = 1; i <= 5; i++) {
      if (n >= i) {
        html += '<i class="fa-solid fa-star text-[10px]" style="color:#F4D03F;"></i>';
      } else if (n >= i - 0.5) {
        html += '<i class="fa-solid fa-star-half-stroke text-[10px]" style="color:#F4D03F;"></i>';
      } else {
        html += '<i class="fa-regular fa-star text-[10px]" style="color:#ccc;"></i>';
      }
    }
    html += `<span class="ml-1 text-[10px] font-bold text-brasil-escuro/70">${n.toFixed(1)}</span></div>`;
    return html;
  }

  // -------------------- Filtro + Ordenação --------------------
  function livrosFiltrados() {
    const termo = Estado.busca.trim().toLowerCase();

    let lista = Estado.livros.filter(livro => {
      // Filtro origem
      if (Estado.origem && (livro.origem || 'Nacional') !== Estado.origem) return false;

      // Filtro busca
      if (!termo) return true;
      const campos = [
        livro.titulo || '',
        livro.autor || '',
        livro.genero || ''
      ].map(s => s.toLowerCase());
      return campos.some(c => c.indexOf(termo) !== -1);
    });

    // Ordenação
    switch (Estado.ordenar) {
      case 'preco-asc':
        lista.sort((a, b) => Number(a.preco) - Number(b.preco));
        break;
      case 'preco-desc':
        lista.sort((a, b) => Number(b.preco) - Number(a.preco));
        break;
      case 'avaliacao':
        lista.sort((a, b) => Number(b.avaliacao || 0) - Number(a.avaliacao || 0));
        break;
      case 'titulo':
        lista.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR'));
        break;
      case 'recentes':
      default:
        lista.sort((a, b) => Number(b.id) - Number(a.id));
        break;
    }

    return lista;
  }

  // -------------------- Renderização --------------------
  function criarCardLivro(livro) {
    const origem = livro.origem || 'Nacional';
    const badgeOrigemClasses = origem === 'Internacional'
      ? 'bg-mfs text-brasil-escuro'
      : 'bg-brasil-verde text-brasil-amarelo';

    const imagemSrc = livro.imagem ? 'imagens/' + livro.imagem : '';
    const temImagem = !!imagemSrc;

    const precoNum = Number(livro.preco) || 0;

    const card = document.createElement('div');
    card.className = 'bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 group flex flex-col justify-between border border-brasil-areia';

    card.innerHTML = `
      <div>
        <div class="relative overflow-hidden aspect-[3/4] bg-brasil-areia">
          ${temImagem
            ? `<img src="${imagemSrc}" alt="${livro.titulo}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div style="display:none;" class="absolute inset-0 items-center justify-center text-brasil-verde/30">
                 <i class="fa-solid fa-book text-5xl"></i>
               </div>`
            : `<div class="absolute inset-0 flex items-center justify-center text-brasil-verde/30">
                 <i class="fa-solid fa-book text-5xl"></i>
               </div>`}
          <div class="absolute top-3 left-3 ${badgeOrigemClasses} text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider shadow">
            ${origem}
          </div>
          ${livro.avaliacao > 0 ? `
          <div class="absolute top-3 right-3 bg-white/95 backdrop-blur text-brasil-escuro text-[10px] font-bold px-2 py-1 rounded-md shadow flex items-center gap-1">
            <i class="fa-solid fa-star" style="color:#F4D03F;"></i>
            ${Number(livro.avaliacao).toFixed(1)}
          </div>` : ''}
        </div>
        <div class="p-5 space-y-2">
          ${livro.genero ? `<span class="inline-block text-[10px] uppercase font-bold tracking-wider text-brasil-terracota">${livro.genero}</span>` : ''}
          <h3 class="text-lg font-serif font-bold text-brasil-verde group-hover:text-brasil-terracota transition-colors line-clamp-2 min-h-[3.5rem]">
            ${livro.titulo}
          </h3>
          <p class="text-xs text-brasil-escuro/60 font-medium">
            <i class="fa-solid fa-pen-nib mr-1 text-brasil-terracota/60"></i>
            ${livro.autor}
          </p>
          <div class="pt-1">${renderEstrelas(livro.avaliacao)}</div>
        </div>
      </div>
      <div class="p-5 pt-0 flex items-center justify-between border-t border-brasil-areia/40 mt-2">
        <span class="text-lg font-bold text-brasil-verde">${formatarPreco(precoNum)}</span>
             <button
          data-id="${livro.id}"
          data-nome="${(livro.titulo || '').replace(/"/g, '&quot;')}"
          data-autor="${(livro.autor || '').replace(/"/g, '&quot;')}"
          data-img="${livro.imagem ? 'imagens/' + livro.imagem : ''}"
          data-genero="${(livro.genero || '').replace(/"/g, '&quot;')}"
          data-origem="${livro.origem || 'Nacional'}"
          data-preco="${precoNum.toFixed(2)}"
          class="comprar-btn px-4 py-2 bg-brasil-verde text-brasil-amarelo rounded-xl text-xs font-bold hover:bg-brasil-terracota hover:text-white transition-colors inline-flex items-center"
          ${livro.estoque !== undefined && Number(livro.estoque) <= 0 ? 'disabled title="Sem estoque"' : ''}
        >
          <i class="fa-solid fa-cart-plus mr-1"></i>
          ${livro.estoque !== undefined && Number(livro.estoque) <= 0 ? 'Esgotado' : 'Comprar'}
        </button>
      </div>
    `;
    // Torna o card clicável (exceto nos botões)
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.location.href = 'livro.html?id=' + livro.id;
    });
    return card;
  }

  function renderizar() {
    const grade = $('#grade-livros');
    const loading = $('#loading');
    const vazio = $('#estado-vazio');
    const erro = $('#estado-erro');
    const contador = $('#contador');
    const contadorLabel = $('#contador-label');

    if (!grade) return;

    loading.classList.add('hidden');
    erro.classList.add('hidden');

    const lista = livrosFiltrados();

    if (contador) contador.textContent = String(lista.length);
    if (contadorLabel) {
      contadorLabel.textContent = lista.length === 1 ? 'livro encontrado' : 'livros encontrados';
    }

    if (lista.length === 0) {
      grade.innerHTML = '';
      grade.classList.add('hidden');
      vazio.classList.remove('hidden');
      return;
    }

    vazio.classList.add('hidden');
    grade.classList.remove('hidden');

    // Diferencia renderização completa (sem listeners antigos)
    grade.innerHTML = '';
    lista.forEach(livro => {
      grade.appendChild(criarCardLivro(livro));
    });

    // Rebind dos botões "Comprar" com o carrinho do script.js
    grade.querySelectorAll('.comprar-btn').forEach(btn => {
           btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const preco = parseFloat(btn.dataset.preco);
        const extras = {
          nome: btn.dataset.nome || '',
          autor: btn.dataset.autor || '',
          img: btn.dataset.img || '',
          genero: btn.dataset.genero || '',
          origem: btn.dataset.origem || ''
        };

        if (!id || !isFinite(preco)) return;

        // Chama a função global exposta pelo script.js (com extras!)
        if (typeof window.adicionarAoCarrinhoGlobal === 'function') {
          window.adicionarAoCarrinhoGlobal(id, preco, 1, extras);
                } else {
          try {
            const KEY = 'brasilidade_carrinho';
            const atual = JSON.parse(localStorage.getItem(KEY) || '{}');
            if (atual[id]) {
              atual[id].qty += 1;
              atual[id].price = preco;
              Object.assign(atual[id], extras);
            } else {
              atual[id] = Object.assign({ price: preco, qty: 1 }, extras);
            }
            localStorage.setItem(KEY, JSON.stringify(atual));
            if (typeof window.atualizarBadgeGlobal === 'function') {
              window.atualizarBadgeGlobal();
            }
          } catch (e) { console.warn('Falha ao adicionar:', e); }
        }

        // Feedback visual
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Adicionado';
        btn.classList.add('bg-brasil-terracota', 'text-white');
        setTimeout(() => {
          btn.innerHTML = original;
          btn.disabled = false;
          btn.classList.remove('bg-brasil-terracota', 'text-white');
        }, 900);
      });
    });
  }

  function mostrarErro(msg) {
    const loading = $('#loading');
    const erro = $('#estado-erro');
    const erroMsg = $('#erro-msg');
    if (loading) loading.classList.add('hidden');
    if (erro) erro.classList.remove('hidden');
    if (erroMsg) erroMsg.textContent = msg;
  }

  // -------------------- Carregamento --------------------
  function carregarLivros() {
    fetch('/api/livro')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(lista => {
        Estado.livros = Array.isArray(lista) ? lista : [];
        renderizar();
      })
      .catch(erro => {
        console.error(erro);
        mostrarErro('Falha ao carregar o acervo: ' + erro.message);
      });
  }

  // -------------------- Eventos --------------------
  function initEventos() {
    const busca = $('#busca');
    if (busca) {
      let debounceTimer = null;
      busca.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          Estado.busca = e.target.value || '';
          renderizar();
        }, 200);
      });
    }

    const filtroOrigem = $('#filtro-origem');
    if (filtroOrigem) {
      filtroOrigem.addEventListener('change', (e) => {
        Estado.origem = e.target.value || '';
        renderizar();
      });
    }

    const ordenar = $('#ordenar');
    if (ordenar) {
      ordenar.addEventListener('change', (e) => {
        Estado.ordenar = e.target.value || 'recentes';
        renderizar();
      });
    }

    const limpar = $('#btn-limpar-filtros');
    if (limpar) {
      limpar.addEventListener('click', () => {
        Estado.busca = '';
        Estado.origem = '';
        Estado.ordenar = 'recentes';
        if (busca) busca.value = '';
        if (filtroOrigem) filtroOrigem.value = '';
        if (ordenar) ordenar.value = 'recentes';
        renderizar();
      });
    }

    // Fecha o modal (botão X / botão "Entendido")
    const btnModal = $('#btn-fechar-modal');
    if (btnModal) {
      btnModal.addEventListener('click', () => {
        const modal = $('#info-modal');
        if (modal) { modal.classList.remove('flex'); modal.classList.add('hidden'); }
      });
    }
  }

  // -------------------- Bootstrap --------------------
  document.addEventListener('DOMContentLoaded', function () {
    initEventos();
    carregarLivros();
  });

})();