var http = require('http');
var fs = require('fs');
var path = require('path');
var db = require('./db');

var PORTA = 7600;

var TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function responderJson(res, status, conteudo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(conteudo));
}

function servirArquivo(res, caminhoRelativo) {
  // Previne path traversal
  var alvo = caminhoRelativo.replace(/^\/+/, '');
  var caminhoPublic = path.join(__dirname, 'public', alvo);
  var caminhoRaiz = path.join(__dirname, alvo);

  var caminho = null;
  if (fs.existsSync(caminhoPublic) && fs.statSync(caminhoPublic).isFile()) {
    caminho = caminhoPublic;
  } else if (fs.existsSync(caminhoRaiz) && fs.statSync(caminhoRaiz).isFile()) {
    caminho = caminhoRaiz;
  }

  if (!caminho) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo nao encontrado: ' + caminhoRelativo);
  }

  var tipo = TIPOS[path.extname(caminho).toLowerCase()] || 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': tipo });
  res.end(fs.readFileSync(caminho));
}

function lerCorpoJson(req, callback) {
  var texto = '';
  req.on('data', function (pedaco) { texto += pedaco; });
  req.on('error', function () { callback(new Error('Falha ao ler requisicao.')); });
  req.on('end', function () {
    if (!texto) return callback(null, {});
    try {
      callback(null, JSON.parse(texto));
    } catch (e) {
      callback(new Error('Dados invalidos.'));
    }
  });
}

// Prepara as statements uma vez (recomendado com node:sqlite)
var stmtListar = db.prepare('SELECT * FROM cliente ORDER BY id DESC');
var stmtInserir = db.prepare(
  'INSERT INTO cliente (nome, telefone, cpf, nascimento, cep) VALUES (?, ?, ?, ?, ?)'
);
var stmtExcluir = db.prepare('DELETE FROM cliente WHERE id = ?');

var servidor = http.createServer(function (req, res) {
  var caminho = req.url.split('?')[0];

  // ---- API: listar ----
  if (req.method === 'GET' && caminho === '/api/cliente') {
    try {
      var linhas = stmtListar.all();
      return responderJson(res, 200, linhas);
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ---- API: cadastrar ----
  if (req.method === 'POST' && caminho === '/api/cliente') {
    lerCorpoJson(req, function (erro, novo) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      if (!novo.nome || !novo.cpf || !novo.cep) {
        return responderJson(res, 400, { erro: 'CEP, nome e CPF sao obrigatorios.' });
      }

      var valores = [
        novo.nome,
        novo.telefone || '',
        novo.cpf,
        novo.nascimento || '',
        novo.cep
      ];

      try {
        var resultado = stmtInserir.run(valores);
        novo.id = Number(resultado.lastInsertRowid);
        console.log('Cadastrado no banco: id ' + novo.id + ' - ' + novo.nome);
        return responderJson(res, 201, novo);
      } catch (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          return responderJson(res, 400, { erro: 'CPF ja cadastrado no sistema.' });
        }
        return responderJson(res, 500, { erro: err.message });
      }
    });
    return;
  }

  // ---- API: excluir ----
  if (req.method === 'DELETE' && caminho.indexOf('/api/cliente/') === 0) {
    var id = caminho.split('/')[3];

    if (!id || isNaN(Number(id))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }

    try {
      var resultado = stmtExcluir.run([id]);
      if (resultado.changes === 0) {
        return responderJson(res, 404, { erro: 'Cliente nao encontrado.' });
      }
      console.log('Excluido do banco: id ' + id);
      return responderJson(res, 200, { removido: Number(id) });
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ---- Arquivos estaticos ----
  if (req.method === 'GET') {
    return servirArquivo(res, caminho === '/' ? 'index.html' : caminho);
  }

  responderJson(res, 404, { erro: 'Nao encontrado.' });
});

servidor.listen(PORTA, function () {
  console.log('Pronto! Servidor rodando em http://localhost:' + PORTA);
});