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
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function responderJson(res, status, conteudo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(conteudo));
}


  varfunction servirArquivo(res, caminhoRelativo) { alvo = caminhoRelativo.replace(/^\/+/, '');
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

// ---- Statements de CLIENTES ----
var stmtListarClientes = db.prepare('SELECT * FROM cliente ORDER BY id DESC');
var stmtInserirCliente = db.prepare(
  'INSERT INTO cliente (nome, telefone, cpf, nascimento, cep) VALUES (?, ?, ?, ?, ?)'
);
var stmtExcluirCliente = db.prepare('DELETE FROM cliente WHERE id = ?');

// ---- Statements de LIVROS ----
var stmtListarLivros = db.prepare('SELECT * FROM livro ORDER BY id DESC');
var stmtInserirLivro = db.prepare(
  'INSERT INTO livro (titulo, autor, preco, genero, estoque, isbn, imagem, origem, avaliacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtExcluirLivro = db.prepare('DELETE FROM livro WHERE id = ?');

var servidor = http.createServer(function (req, res) {
  var caminho = req.url.split('?')[0];

  // ============ API CLIENTES ============
  if (req.method === 'GET' && caminho === '/api/cliente') {
    try {
      return responderJson(res, 200, stmtListarClientes.all());
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

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
        var resultado = stmtInserirCliente.run(...valores);
        novo.id = Number(resultado.lastInsertRowid);
        console.log('Cliente cadastrado: id ' + novo.id + ' - ' + novo.nome);
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

  if (req.method === 'DELETE' && caminho.indexOf('/api/cliente/') === 0) {
    var idCli = caminho.split('/')[3];
    if (!idCli || isNaN(Number(idCli))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }
    try {
      var resDelCli = stmtExcluirCliente.run(idCli);
      if (resDelCli.changes === 0) {
        return responderJson(res, 404, { erro: 'Cliente nao encontrado.' });
      }
      console.log('Cliente excluido: id ' + idCli);
      return responderJson(res, 200, { removido: Number(idCli) });
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ============ API LIVROS ============
  if (req.method === 'GET' && caminho === '/api/livro') {
    try {
      return responderJson(res, 200, stmtListarLivros.all());
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  if (req.method === 'POST' && caminho === '/api/livro') {
    lerCorpoJson(req, function (erro, novo) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      // Validações básicas
      if (!novo.titulo || !novo.autor || novo.preco === undefined || novo.preco === '') {
        return responderJson(res, 400, { erro: 'Título, autor e preço são obrigatórios.' });
      }

      var precoNum = Number(novo.preco);
      if (!isFinite(precoNum) || precoNum <= 0) {
        return responderJson(res, 400, { erro: 'Preço deve ser um número positivo.' });
      }

      var estoqueNum = Number(novo.estoque);
      if (!isFinite(estoqueNum) || estoqueNum < 0) estoqueNum = 0;

      var origem = (novo.origem === 'Internacional') ? 'Internacional' : 'Nacional';

      // Imagem
      var imagem = (novo.imagem || '').trim();
      if (imagem) {
        imagem = imagem.replace(/[\\/]/g, '').replace(/\.\./g, '');
        if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(imagem)) {
          return responderJson(res, 400, {
            erro: 'Imagem deve terminar em .png, .jpg, .jpeg, .webp, .gif ou .svg'
          });
        }
      } else {
        imagem = null;
      }

      // Avaliação (0 = sem nota; senão 0.1..5.0)
      var avaliacaoNum;
      if (novo.avaliacao === undefined || novo.avaliacao === '') {
        avaliacaoNum = 0;
      } else {
        avaliacaoNum = Number(novo.avaliacao);
        if (!isFinite(avaliacaoNum)) {
          return responderJson(res, 400, { erro: 'Avaliação inválida.' });
        }
        if (avaliacaoNum !== 0 && (avaliacaoNum < 0.1 || avaliacaoNum > 5)) {
          return responderJson(res, 400, { erro: 'Avaliação deve estar entre 0.1 e 5.0 estrelas.' });
        }
        avaliacaoNum = Math.round(avaliacaoNum * 10) / 10;
      }

      var valores = [
        novo.titulo,
        novo.autor,
        precoNum,
        novo.genero || '',
        Math.floor(estoqueNum),
        novo.isbn || null,
        imagem,
        origem,
        avaliacaoNum
      ];

      try {
        var resultado = stmtInserirLivro.run(...valores);
        novo.id = Number(resultado.lastInsertRowid);
        novo.preco = precoNum;
        novo.estoque = Math.floor(estoqueNum);
        novo.imagem = imagem;
        novo.origem = origem;
        novo.avaliacao = avaliacaoNum;
        console.log('Livro cadastrado: id ' + novo.id + ' - ' + novo.titulo + ' (' + avaliacaoNum + '★)');
        return responderJson(res, 201, novo);
      } catch (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          return responderJson(res, 400, { erro: 'ISBN já cadastrado no sistema.' });
        }
        return responderJson(res, 500, { erro: err.message });
      }
    });
    return;
  }

  if (req.method === 'DELETE' && caminho.indexOf('/api/livro/') === 0) {
    var idLivro = caminho.split('/')[3];
    if (!idLivro || isNaN(Number(idLivro))) {
      return responderJson(res, 400, { erro: 'ID inválido.' });
    }
    try {
      var resDelLivro = stmtExcluirLivro.run(idLivro);
      if (resDelLivro.changes === 0) {
        return responderJson(res, 404, { erro: 'Livro não encontrado.' });
      }
      console.log('Livro excluído: id ' + idLivro);
      return responderJson(res, 200, { removido: Number(idLivro) });
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ============ ARQUIVOS ESTÁTICOS ============
  if (req.method === 'GET') {
    return servirArquivo(res, caminho === '/' ? 'index.html' : caminho);
  }

  responderJson(res, 404, { erro: 'Nao encontrado.' });
});

servidor.listen(PORTA, function () {
  console.log('Pronto! Servidor rodando em http://localhost:' + PORTA);
});