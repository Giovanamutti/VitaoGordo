/* =========================================================================
   Livraria Multicultural - mascaras.js
   Máscaras automáticas para campos de CPF, telefone e CEP.
   Aplica em qualquer <input> que tenha name="cpf", name="telefone" ou
   name="cep". Funciona com digitação, colagem, autofill e deleção.

   Uso: <script src="mascaras.js"></script> (antes do script da página)
   ========================================================================= */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function apenasDigitos(str) {
    return (str || '').replace(/\D/g, '');
  }

  // ---------------------------------------------------------------------
  // Formatação CPF: 000.000.000-00
  // ---------------------------------------------------------------------
  function formatarCPF(valor) {
    var d = apenasDigitos(valor).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  // ---------------------------------------------------------------------
  // Formatação telefone: (00) 0000-0000  ou  (00) 00000-0000
  // Detecta automaticamente se é fixo (10 dígitos) ou celular (11 dígitos)
  // ---------------------------------------------------------------------
  function formatarTelefone(valor) {
    var d = apenasDigitos(valor).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) {
      // Fixo: (00) 0000-0000
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    }
    // Celular: (00) 00000-0000
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  // ---------------------------------------------------------------------
  // Formatação CEP: 00000-000
  // ---------------------------------------------------------------------
  function formatarCEP(valor) {
    var d = apenasDigitos(valor).slice(0, 8);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + '-' + d.slice(5);
  }

  // ---------------------------------------------------------------------
  // Mapa: name do input → { formatar, maxDigits }
  // ---------------------------------------------------------------------
  var REGRAS = {
    cpf: { formatar: formatarCPF, maxDigits: 11 },
    telefone: { formatar: formatarTelefone, maxDigits: 11 },
    cep: { formatar: formatarCEP, maxDigits: 8 }
  };

  // ---------------------------------------------------------------------
  // Aplica máscara em um input
  // ---------------------------------------------------------------------
  function aplicarMascara(input, regra) {
    // Evita reaplicar
    if (input.dataset.mascaraAplicada === 'true') return;
    input.dataset.mascaraAplicada = 'true';

    // Guarda a posição do cursor a partir do fim dos dígitos
    function aplicar(valorOriginal, posicaoOriginal) {
      // Conta quantos dígitos existem ANTES da posição do cursor
      var antes = (valorOriginal || '').slice(0, posicaoOriginal || 0);
      var digitosAntes = apenasDigitos(antes).length;

      var formatado = regra.formatar(valorOriginal);
      input.value = formatado;

      // Reposiciona o cursor após o mesmo número de dígitos
      var novaPos = formatado.length;
      var contados = 0;
      for (var i = 0; i < formatado.length; i++) {
        if (/\d/.test(formatado[i])) {
          contados++;
          if (contados === digitosAntes) {
            novaPos = i + 1;
            break;
          }
        }
      }
      // Se apagou tudo, cursor no início
      if (digitosAntes === 0) novaPos = 0;

      try {
        input.setSelectionRange(novaPos, novaPos);
      } catch (e) {}
    }

    // 'input' cobre digitação, colagem, autofill, arrastar
    input.addEventListener('input', function (e) {
      // Se o navegador suportar inputType, respeita deleção
      // (caso contrário aplica normalmente)
      aplicar(input.value, input.selectionStart);
    });

    // Impede letras de aparecerem (mesmo que rapidamente) no mobile
    input.addEventListener('keydown', function (e) {
      var teclasPermitidas = [
        'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Home', 'End'
      ];
      if (teclasPermitidas.indexOf(e.key) !== -1) return;
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z'].indexOf(e.key.toLowerCase()) !== -1) return;
      // Bloqueia qualquer caractere não-dígito
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Aplica valor inicial (caso o campo já venha preenchido)
    if (input.value) {
      var pos = input.value.length;
      aplicar(input.value, pos);
    }
  }

  // ---------------------------------------------------------------------
  // Encontra e aplica em todos os inputs relevantes
  // ---------------------------------------------------------------------
  function aplicarEmTodos(raiz) {
    raiz = raiz || document;
    Object.keys(REGRAS).forEach(function (nome) {
      var inputs = raiz.querySelectorAll('input[name="' + nome + '"]');
      inputs.forEach(function (input) {
        aplicarMascara(input, REGRAS[nome]);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { aplicarEmTodos(); });
  } else {
    aplicarEmTodos();
  }

  // Observa novos campos dinâmicos (ex: formulários criados via JS)
  if (window.MutationObserver) {
    var obs = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          aplicarEmTodos(node);
          // Verifica o próprio node
          if (node.matches && node.matches('input[name="cpf"], input[name="telefone"], input[name="cep"]')) {
            var regra = REGRAS[node.getAttribute('name')];
            if (regra) aplicarMascara(node, regra);
          }
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Expor formatadores (útil para exibir dados já salvos)
  window.Mascaras = {
    cpf: formatarCPF,
    telefone: formatarTelefone,
    cep: formatarCEP,
    apenasDigitos: apenasDigitos
  };
})();