const form = document.getElementById('formCliente');
const aviso = document.getElementById('aviso');
const corpoTabela = document.getElementById('corpoTabela');

function lerFormulario(formulario) {
  const dados = {};
  const campos = new FormData(formulario);
  campos.forEach(function (valor, chave) {
    dados[chave] = valor;
  });
  return dados;
}

function mostrarAviso(texto, ehErro) {
  aviso.textContent = texto;
  aviso.className = ehErro ? 'erro' : '';
}

form.addEventListener('submit', function (evento) {
  evento.preventDefault();

  const dados = lerFormulario(form);

  fetch('/api/cliente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  })
    .then(function (resposta) {
      return resposta.json().then(function (corpo) {
        return { ok: resposta.ok, corpo: corpo };
      });
    })
    .then(function (resultado) {
      if (!resultado.ok) {
        mostrarAviso(resultado.corpo.erro, true);
        return;
      }
      mostrarAviso('Cliente ' + resultado.corpo.id + ' salvo.', false);
      form.reset();
      carregarClientes();
    })
    .catch(function (erro) {
      mostrarAviso('Falha na comunicação: ' + erro.message, true);
    });
});

function carregarClientes() {
  fetch('/api/cliente')
    .then(function (resposta) {
      return resposta.json();
    })
    .then(function (lista) {
      desenharTabela(lista);
    })
    .catch(function (erro) {
      mostrarAviso('Falha ao carregar a lista: ' + erro.message, true);
    });
}

function desenharTabela(lista) {
  corpoTabela.innerHTML = '';

  if (lista.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Nenhum cliente cadastrado ainda.';
    tr.appendChild(td);
    corpoTabela.appendChild(tr);
    return;
  }

  lista.forEach(function (cliente) {
    const tr = document.createElement('tr');

    const colunas = [
      cliente.id,
      cliente.cep,
      cliente.nome,
      cliente.telefone,
      cliente.cpf,
      cliente.nascimento
    ];

    colunas.forEach(function (valor) {
      const td = document.createElement('td');
      td.textContent = (valor === null ? '' : valor);
      tr.appendChild(td);
    });

    const tdBotao = document.createElement('td');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = 'Excluir';
    botao.addEventListener('click', function () {
      excluirCliente(cliente.id);
    });
    tdBotao.appendChild(botao);
    tr.appendChild(tdBotao);

    corpoTabela.appendChild(tr);
  });
}

function excluirCliente(id) {
  fetch('/api/cliente/' + id, { method: 'DELETE' })
    .then(function () {
      mostrarAviso('Cliente ' + id + ' removido.', false);
      carregarClientes();
    })
    .catch(function (erro) {
      mostrarAviso('Falha ao remover: ' + erro.message, true);
    });
}

carregarClientes();
