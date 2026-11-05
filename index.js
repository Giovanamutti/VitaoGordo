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
    caminho = path.join(__dirname, caminhoRelativo);
  }

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

  // ---- API: listar ----
  if (req.method === 'GET' && caminho === '/api/cliente') {
    db.all('SELECT * FROM cliente ORDER BY id DESC', [], function (erro, linhas) {
      if (erro) {
        return responderJson(res, 500, { erro: erro.message });
      }
      responderJson(res, 200, linhas);
    });
    return;
  }

  // ---- API: cadastrar ----
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

      var sql = 'INSERT INTO cliente (nome, telefone, cpf, nascimento, cep) VALUES (?, ?, ?, ?, ?)';
      var valores = [
        novo.nome,
        novo.telefone || '',
        novo.cpf,
        novo.nascimento || '',
        novo.cep
      ];

      db.run(sql, valores, function (erro) {
        if (erro) {
          if (erro.message.indexOf('UNIQUE') !== -1) {
            return responderJson(res, 400, { erro: 'CPF ja cadastrado no sistema.' });
          }
          return responderJson(res, 500, { erro: erro.message });
        }
        novo.id = this.lastID;
        console.log('Cadastrado no banco: id ' + novo.id + ' - ' + novo.nome);
        responderJson(res, 201, novo);
      });
    });

    return;
  }

  // ---- API: excluir ----
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

  // ---- Arquivos estáticos (Entregando login.html como padrão) ----
  if (req.method === 'GET') {
    return servirArquivo(res, caminho === '/' ? 'index.html' : caminho);
  }

  responderJson(res, 404, { erro: 'Nao encontrado.' });
});

servidor.listen(PORTA, function () {
  console.log('Pronto! Servidor rodando em http://localhost:' + PORTA);
});