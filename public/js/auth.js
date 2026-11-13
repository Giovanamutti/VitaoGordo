/* =========================================================================
   Livraria Multicultural - auth.js
   Sessão do usuário + integração com o carrinho por conta.
   ========================================================================= */

(function () {
  'use strict';

  const USUARIO_KEY = 'brasilidade_usuario';

  window.Auth = {
    salvarUsuario(usuario) {
      try {
        localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
      } catch (e) { console.warn('Falha ao salvar usuário:', e); }
    },

    obterUsuario() {
      try {
        const salvo = localStorage.getItem(USUARIO_KEY);
        return salvo ? JSON.parse(salvo) : null;
      } catch (e) { return null; }
    },

    estaLogado() {
      return !!this.obterUsuario();
    },

    logout() {
      // NÃO remove o carrinho — apenas a sessão
      localStorage.removeItem(USUARIO_KEY);

      // Limpa cache do carrinho (mas não os dados no servidor)
      if (typeof window.mesclarCarrinhoLocalNoServidor === 'function') {
        // nada — o cache está dentro do script.js; recarregar resolve
      }
      window.location.href = 'login.html';
    },

    exigirLogin(paginaRedirecionamento = 'login.html') {
      if (!this.estaLogado()) {
        window.location.href = paginaRedirecionamento;
        return false;
      }
      return true;
    },

    atualizarCabecalho() {
      const usuario = this.obterUsuario();
      const link = document.querySelector('a[href="login.html"][title="Área do Usuário"]') ||
                   document.querySelector('a[href="login.html"][title="Área do Usuário / Banco de Dados"]');

      if (!link) return;

      if (usuario) {
        const foto = usuario.foto_perfil
          ? 'uploads/' + usuario.foto_perfil
          : null;

        link.href = 'conta.html';
        link.title = 'Minha Conta';

        link.style.width = '40px';
        link.style.height = '40px';
        link.style.minWidth = '40px';
        link.style.minHeight = '40px';
        link.style.maxWidth = '40px';
        link.style.maxHeight = '40px';
        link.style.padding = '0';
        link.style.overflow = 'hidden';
        link.style.borderRadius = '9999px';
        link.style.display = 'inline-flex';
        link.style.alignItems = 'center';
        link.style.justifyContent = 'center';
        link.style.flexShrink = '0';

        if (foto) {
          link.innerHTML = `<img src="${foto}" alt="${usuario.nome_usuario}"
            style="width:100%;height:100%;object-fit:cover;display:block;border-radius:9999px;">`;
        } else {
          link.innerHTML = `<span style="font-weight:700;font-size:.8rem;color:#1B4D3E;line-height:1;">${usuario.nome_usuario.slice(0,2).toUpperCase()}</span>`;
        }
      }
    },

    // Chamada após login/registro com sucesso — mescla carrinho local
    // no carrinho da conta e atualiza o badge
    aoLogar() {
      if (typeof window.mesclarCarrinhoLocalNoServidor === 'function') {
        return window.mesclarCarrinhoLocalNoServidor();
      }
      return Promise.resolve();
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.Auth.atualizarCabecalho();
  });
})();