/* =========================================================================
   Livraria Multicultural - destaques.js
   Lógica exclusiva da home (index.html):
     - Busca os livros via GET /api/livro
     - Embaralha e pega 4 aleatórios
     - Renderiza na #grade-livros
     - Re-bind dos botões "Comprar" com o carrinho global (script.js)
   ========================================================================= */

(function () {
  'use strict';

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

  // Fisher-Yates
  function embaralhar(arr) {
    const copia = arr.slice();
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function criarCardLivro(livro) {
    const origem = livro.origem || 'Nacional';
    const badgeOrigemClasses = origem === 'Internacional'
      ? 'bg-[#80c0d8] text-brasil-escuro'
      : 'bg-brasil-verde text-brasil-amarelo';

    const imagemSrc = livro.imagem ? 'imagens/' + livro.imagem : '';
    const temImagem = !!imagemSrc;
    const precoNum = Number(livro.preco) || 0;
    const semEstoque = livro.estoque !== undefined && Number(livro.estoque) <= 0;

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
          ${semEstoque ? 'disabled title="Sem estoque"' : ''}
        >
          <i class="fa-solid fa-cart-plus mr-1"></i>
          ${semEstoque ? 'Esgotado' : 'Comprar'}
        </button>
      </div>
    `;

    return card;
  }

  function bindBotoesCompra(container) {
    container.querySelectorAll('.comprar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
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

        if (typeof window.adicionarAoCarrinhoGlobal === 'function') {
          window.adicionarAoCarrinhoGlobal(id, preco, 1, extras);
        } else {
          // fallback direto no localStorage
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

  function renderizarDestaques(livros) {
    const grade = $('#grade-livros');
    if (!grade) return;

    if (!livros.length) {
      grade.innerHTML = `
        <div class="col-span-full bg-white rounded-2xl p-12 text-center space-y-4 border border-brasil-areia shadow-sm">
          <div class="w-16 h-16 rounded-full bg-brasil-areia text-brasil-verde flex items-center justify-center mx-auto text-2xl">
            <i class="fa-solid fa-book-skull"></i>
          </div>
          <h3 class="font-serif font-bold text-2xl text-brasil-verde">Nenhum livro cadastrado ainda</h3>
          <p class="text-brasil-escuro/70 text-sm max-w-sm mx-auto">
            Cadastre livros no painel administrativo para vê-los aqui.
          </p>
          <a href="add_livros.html" class="inline-block px-6 py-3 bg-brasil-verde text-brasil-amarelo font-bold rounded-xl text-xs hover:bg-brasil-terracota hover:text-white transition-colors">
            Cadastrar Livros
          </a>
        </div>
      `;
      return;
    }

    grade.innerHTML = '';
    livros.forEach(livro => grade.appendChild(criarCardLivro(livro)));
    bindBotoesCompra(grade);
  }

  function carregarDestaques() {
    fetch('/api/livro')
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(lista => {
        const todos = Array.isArray(lista) ? lista : [];
        const sorteio = embaralhar(todos).slice(0, 4);
        renderizarDestaques(sorteio);
      })
      .catch(erro => {
        console.error('Falha ao carregar destaques:', erro);
        const grade = $('#grade-livros');
        if (grade) {
          grade.innerHTML = `
            <div class="col-span-full bg-white rounded-2xl p-12 text-center space-y-4 border border-brasil-areia shadow-sm">
              <div class="w-16 h-16 rounded-full bg-brasil-terracota/10 text-brasil-terracota flex items-center justify-center mx-auto text-2xl">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h3 class="font-serif font-bold text-2xl text-brasil-verde">Não foi possível carregar os destaques</h3>
              <p class="text-brasil-escuro/70 text-sm">${erro.message}</p>
            </div>
          `;
        }
      });
  }

  document.addEventListener('DOMContentLoaded', carregarDestaques);
})();