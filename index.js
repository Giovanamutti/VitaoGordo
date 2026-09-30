var http = require('http');
var fs = require('fs');
var path = require('path');
var db = require('./db');

var PORTA = 7600;

function responderJson(res, status, conteudo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(conteudo));
}

var TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8'
};

function servirArquivo(res, caminhoRelativo) {
  var caminho = path.join(__dirname, 'public', caminhoRelativo);

  if (!fs.existsSync(caminho)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo nao encontrado: ' + caminhoRelativo);
  }

  var tipo = TIPOS[path.extname(caminho)] || 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': tipo });
  res.end(fs.readFileSync(caminho));
}

var servidor = http.createServer(function (req, res) {
  var caminho = req.url.split('?')[0];

  // ---- API: Autenticação de Login ----
  if (req.method === 'POST' && caminho === '/api/login') {
    var texto = '';

    req.on('data', function (pedaco) {
      texto += pedaco;
    });

    req.on('end', function () {
      var credenciais;
      try {
        credenciais = JSON.parse(texto);
      } catch (erro) {
        return responderJson(res, 400, { erro: 'Dados inválidos.' });
      }

      if (!credenciais.cpf) {
        return responderJson(res, 400, { erro: 'O CPF é obrigatório para realizar o login.' });
      }

      // Consulta no banco de dados pelo CPF e Nome do cliente
      var sql = 'SELECT * FROM cliente WHERE cpf = ? AND nome = ?';
      db.get(sql, [credenciais.cpf, credenciais.nome], function (erro, cliente) {
        if (erro) {
          return responderJson(res, 500, { erro: erro.message });
        }
        if (!cliente) {
          return responderJson(res, 401, { erro: 'Cliente não encontrado. Verifique o Nome e o CPF informados.' });
        }

        // Retorna sucesso e os dados do cliente
        responderJson(res, 200, { mensagem: 'Login realizado com sucesso!', cliente: cliente });
      });
    });

    return;
  }

  // ---- API: listar clientes ----
  if (req.method === 'GET' && caminho === '/api/cliente') {
    db.all('SELECT * FROM cliente ORDER BY id DESC', [], function (erro, linhas) {
      if (erro) {
        return responderJson(res, 500, { erro: erro.message });
      }
      responderJson(res, 200, linhas);
    });
    return;
  }

  // ---- API: cadastrar cliente ----
  if (req.method === 'POST' && caminho === '/api/cliente') {
    var texto = '';

    req.on('data', function (pedaco) {
      texto += pedaco;
    });

    req.on('end', function () {
      var novo;
      try {
        novo = JSON.parse(texto);
      } catch (erro) {
        return responderJson(res, 400, { erro: 'Dados invalidos.' });
      }

      if (!novo.nome || !novo.cpf || !novo.cep) {
        return responderJson(res, 400, { erro: 'CEP, nome e CPF sao obrigatorios.' });
      }

      var sql = 'INSERT into cliente (nome, telefone, cpf, nascimento, cep) VALUES (?, ?, ?, ?, ?)';
      var valores = [novo.nome, novo.telefone, novo.cpf, novo.nascimento, novo.cep];

      db.run(sql, valores, function (erro) {
        if (erro) {
          return responderJson(res, 500, { erro: erro.message });
        }
        novo.id = this.lastID;
        console.log('Cadastrado no banco: id ' + novo.id + ' - ' + novo.nome);
        responderJson(res, 201, novo);
      });
    });

    return;
  }

  // ---- API: excluir cliente ----
  if (req.method === 'DELETE' && caminho.indexOf('/api/cliente/') === 0) {
    var id = caminho.split('/')[3];

    db.run('DELETE FROM cliente WHERE id = ?', [id], function (erro) {
      if (erro) {
        return responderJson(res, 500, { erro: erro.message });
      }
      if (this.changes === 0) {
        return responderJson(res, 404, { erro: 'Cliente nao encontrado.' });
      }
      console.log('Excluido do banco: id ' + id);
      responderJson(res, 200, { removido: Number(id) });
    });

    return;
  }

  // ---- Arquivos estáticos ----
  if (req.method === 'GET') {
    return servirArquivo(res, caminho === '/' ? 'index.html' : caminho);
  }

  responderJson(res, 404, { erro: 'Nao encontrado.' });
});

servidor.on('error', function (erro) {
  if (erro.code === 'EADDRINUSE') {
    console.log('\nA porta ' + PORTA + ' ja esta sendo usada.\nFeche a outra janela do terminal e tente de novo.\n');
    return;
  }
  console.log('Erro: ' + erro.message);
});

servidor.listen(PORTA, function () {
  console.log('\n  Pronto! Server rodando em http://localhost:' + PORTA + '\n');
});