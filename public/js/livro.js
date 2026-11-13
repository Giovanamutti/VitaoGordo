/* =========================================================================
   Livraria Multicultural - livro.js
   Página livro.html:
     - Lê ?id= da URL
     - Busca em GET /api/livro/:id
     - Renderiza todos os campos
     - Botão "Adicionar ao Carrinho" usa a API global do script.js
       (o botão #btn-comprar NÃO é .comprar-btn, então tem listener próprio)
   ========================================================================= */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function formatarPreco(v) {
    const n = Number(v);
    if (!isFinite(n)) return 'R$ 0,00';
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }

  function renderEstrelas(nota) {
    const n = Number(nota) || 0;
    if (n <= 0) {
      return '<span class="text-xs text-brasil-escuro/50 font-semibold">Sem avaliação</span>';
    }
    let html = '<div class="flex items-center gap-1">';
    for (let i = 1; i <= 5; i++) {
      if (n >= i) {
        html += '<i class="fa-solid fa-star text-sm" style="color:#F4D03F;"></i>';
      } else if (n >= i - 0.5) {
        html += '<i class="fa-solid fa-star-half-stroke text-sm" style="color:#F4D03F;"></i>';
      } else {
        html += '<i class="fa-regular fa-star text-sm" style="color:#ccc;"></i>';
      }
    }
    html += `<span class="ml-2 text-sm font-bold text-brasil-escuro/70">${n.toFixed(1)}</span></div>`;
    return html;
  }

  function mostrarErro(msg) {
    $('#loading').classList.add('hidden');
    $('#conteudo').classList.add('hidden');
    $('#erro').classList.remove('hidden');
    const el = $('#erro-msg');
    if (el && msg) el.textContent = msg;
  }

  function renderizar(livro) {
    document.title = livro.titulo + ' | Livraria Multicultural';
    $('#breadcrumb-titulo').textContent = livro.titulo;

    // Capa
    const capaEl = $('#livro-capa');
    if (livro.imagem) {
      capaEl.innerHTML = `<img src="imagens/${livro.imagem}" alt="${livro.titulo}"
        class="w-full h-full object-cover"
        onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fa-solid fa-book text-6xl text-brasil-verde/20\\'></i>';">`;
    }

    // Badges
    const origemEl = $('#livro-origem');
    origemEl.textContent = livro.origem || 'Nacional';
    if (livro.origem === 'Internacional') {
      origemEl.className = 'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md bg-[#80c0d8] text-brasil-escuro';
    } else {
      origemEl.className = 'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md bg-brasil-verde text-brasil-amarelo';
    }

    if (livro.genero) {
      const gEl = $('#livro-genero');
      gEl.textContent = livro.genero;
      gEl.classList.remove('hidden');
    } else {
      $('#livro-genero').classList.add('hidden');
    }

    const estoqueBadge = $('#livro-estoque-badge');
    const estoque = Number(livro.estoque) || 0;
    if (estoque > 0) {
      estoqueBadge.className = 'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md bg-green-100 text-green-800';
      estoqueBadge.innerHTML = '<i class="fa-solid fa-check mr-1"></i> Em estoque';
    } else {
      estoqueBadge.className = 'text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-md bg-red-100 text-red-800';
      estoqueBadge.innerHTML = '<i class="fa-solid fa-xmark mr-1"></i> Esgotado';
    }

    // Textos
    $('#livro-titulo').textContent = livro.titulo;
    $('#livro-autor').textContent = livro.autor;
    $('#livro-preco').textContent = formatarPreco(livro.preco);
    $('#livro-avaliacao').innerHTML = renderEstrelas(livro.avaliacao);

    $('#livro-editora').textContent = livro.editora || '—';
    $('#livro-paginas').textContent = livro.paginas ? livro.paginas + ' págs.' : '—';
    $('#livro-isbn').textContent = livro.isbn || '—';
    $('#livro-estoque').textContent = estoque > 0 ? estoque + ' unidades' : 'Sem estoque';

    // Botão comprar (listener próprio — não é .comprar-btn)
    const btn = $('#btn-comprar');
    if (estoque <= 0) {
      btn.disabled = true;
      btn.className = 'flex-1 px-8 py-4 rounded-xl bg-gray-300 text-gray-600 font-bold cursor-not-allowed flex items-center justify-center gap-3';
      btn.innerHTML = '<i class="fa-solid fa-ban"></i><span>Indisponível</span>';
    } else {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        btn.disabled = true;

        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Adicionado!</span>';
        btn.classList.add('bg-brasil-terracota');

        const promessa = (typeof window.adicionarAoCarrinhoGlobal === 'function')
          ? window.adicionarAoCarrinhoGlobal(livro.id, Number(livro.preco), 1, {
              nome: livro.titulo,
              autor: livro.autor,
              img: livro.imagem ? 'imagens/' + livro.imagem : '',
              genero: livro.genero || '',
              origem: livro.origem || ''
            })
          : Promise.resolve();

        promessa.finally(() => {
          setTimeout(() => {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('bg-brasil-terracota');
          }, 1200);
        });
      });
    }

    $('#loading').classList.add('hidden');
    $('#conteudo').classList.remove('hidden');
  }

  function carregar() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');

    if (!id || isNaN(Number(id))) {
      return mostrarErro('ID do livro não informado ou inválido.');
    }

    fetch('/api/livro/' + id)
      .then(r => {
        if (r.status === 404) throw new Error('Livro não encontrado.');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(livro => renderizar(livro))
      .catch(err => mostrarErro(err.message));
  }

  document.addEventListener('DOMContentLoaded', carregar);
})();