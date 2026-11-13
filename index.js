var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
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

// Pasta para uploads de fotos de perfil
var PASTA_UPLOADS = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(PASTA_UPLOADS)) {
  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
}

function responderJson(res, status, conteudo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(conteudo));
}

// ---------------------------------------------------------------
// Servir arquivo estático (com fallback case-insensitive em imagens)
// ---------------------------------------------------------------
function servirArquivo(res, caminhoRelativo) {
  var alvo = caminhoRelativo.replace(/^\/+/, '');
  var caminhoPublic = path.join(__dirname, 'public', alvo);
  var caminhoRaiz = path.join(__dirname, alvo);

  var caminho = null;

  if (fs.existsSync(caminhoPublic) && fs.statSync(caminhoPublic).isFile()) {
    caminho = caminhoPublic;
  } else if (fs.existsSync(caminhoRaiz) && fs.statSync(caminhoRaiz).isFile()) {
    caminho = caminhoRaiz;
  }

  if (!caminho && alvo.indexOf('imagens/') === 0) {
    var pastaImagens = path.join(__dirname, 'public', 'imagens');
    var nomeBusca = path.basename(alvo).toLowerCase();

    if (fs.existsSync(pastaImagens)) {
      var arquivos = fs.readdirSync(pastaImagens);
      var encontrado = null;
      for (var i = 0; i < arquivos.length; i++) {
        if (arquivos[i].toLowerCase() === nomeBusca) {
          encontrado = arquivos[i];
          break;
        }
      }
      if (encontrado) {
        caminho = path.join(pastaImagens, encontrado);
      }
    }
  }

  if (!caminho) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo nao encontrado: ' + caminhoRelativo);
  }

  var tipo = TIPOS[path.extname(caminho).toLowerCase()] || 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': tipo });
  res.end(fs.readFileSync(caminho));
}

// ---------------------------------------------------------------
// Ler corpo JSON
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// Hash de senha com salt (SHA-256 + salt aleatório)
// ---------------------------------------------------------------
function gerarHashSenha(senha) {
  var salt = crypto.randomBytes(16).toString('hex');
  var hash = crypto.createHash('sha256').update(salt + senha).digest('hex');
  return salt + ':' + hash;
}

function verificarSenha(senha, hashArmazenado) {
  var partes = hashArmazenado.split(':');
  if (partes.length !== 2) return false;
  var salt = partes[0];
  var hashEsperado = partes[1];
  var hashCalculado = crypto.createHash('sha256').update(salt + senha).digest('hex');
  return hashCalculado === hashEsperado;
}

// ---------------------------------------------------------------
// Upload multipart simples (para foto de perfil)
// ---------------------------------------------------------------
function lerUploadMultipart(req, callback) {
  var chunks = [];
  var tamanhoTotal = 0;
  var LIMITE = 5 * 1024 * 1024; // 5 MB

  req.on('data', function (pedaco) {
    tamanhoTotal += pedaco.length;
    if (tamanhoTotal > LIMITE) {
      req.destroy();
      return callback(new Error('Arquivo muito grande (max 5MB).'));
    }
    chunks.push(pedaco);
  });

  req.on('end', function () {
    try {
      var buffer = Buffer.concat(chunks);
      var contentType = req.headers['content-type'] || '';
      var boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) return callback(new Error('Content-Type invalido.'));

      var boundary = boundaryMatch[1].replace(/^"|"$/g, '');
      var boundaryBuffer = Buffer.from('--' + boundary);

      var partes = [];
      var inicio = buffer.indexOf(boundaryBuffer);

      while (inicio !== -1) {
        var proximo = buffer.indexOf(boundaryBuffer, inicio + boundaryBuffer.length);
        if (proximo === -1) break;

        var parte = buffer.slice(inicio + boundaryBuffer.length + 2, proximo - 2);
        var separador = parte.indexOf(Buffer.from('\r\n\r\n'));
        if (separador !== -1) {
          var cabecalhos = parte.slice(0, separador).toString('utf-8');
          var corpo = parte.slice(separador + 4);

          var nameMatch = cabecalhos.match(/name="([^"]*)"/);
          var filenameMatch = cabecalhos.match(/filename="([^"]*)"/);
          var ctMatch = cabecalhos.match(/Content-Type:\s*([^\r\n]+)/i);

          partes.push({
            name: nameMatch ? nameMatch[1] : null,
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: ctMatch ? ctMatch[1].trim() : null,
            data: corpo
          });
        }

        inicio = proximo;
      }

      callback(null, partes);
    } catch (e) {
      callback(e);
    }
  });

  req.on('error', function () { callback(new Error('Falha no upload.')); });
}

// ---------------------------------------------------------------
// Statements preparados
// ---------------------------------------------------------------
var stmtListarClientes = db.prepare('SELECT * FROM cliente ORDER BY id DESC');
var stmtInserirCliente = db.prepare(
  'INSERT INTO cliente (nome, telefone, cpf, nascimento, cep) VALUES (?, ?, ?, ?, ?)'
);
var stmtExcluirCliente = db.prepare('DELETE FROM cliente WHERE id = ?');

var stmtListarLivros = db.prepare('SELECT * FROM livro ORDER BY id DESC');
var stmtInserirLivro = db.prepare(
  'INSERT INTO livro (titulo, autor, preco, genero, estoque, isbn, imagem, origem, avaliacao, editora, paginas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtExcluirLivro = db.prepare('DELETE FROM livro WHERE id = ?');
var stmtBuscarLivro = db.prepare('SELECT * FROM livro WHERE id = ?');

var stmtBuscarUsuarioPorNome = db.prepare('SELECT * FROM usuario WHERE nome_usuario = ?');
var stmtBuscarUsuarioPorId = db.prepare('SELECT * FROM usuario WHERE id = ?');
var stmtInserirUsuario = db.prepare(
  'INSERT INTO usuario (nome_usuario, senha_hash, nome_completo, email, telefone, cpf, data_nascimento, cep) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtAtualizarFoto = db.prepare('UPDATE usuario SET foto_perfil = ? WHERE id = ?');
var stmtListarCarrinho = db.prepare('SELECT * FROM carrinho_item WHERE usuario_id = ? ORDER BY id ASC');
var stmtBuscarItemCarrinho = db.prepare('SELECT * FROM carrinho_item WHERE usuario_id = ? AND livro_id = ?');
var stmtInserirItemCarrinho = db.prepare(
  'INSERT INTO carrinho_item (usuario_id, livro_id, nome, autor, img, genero, origem, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtAtualizarItemCarrinho = db.prepare(
  'UPDATE carrinho_item SET qty = ?, price = ?, nome = ?, autor = ?, img = ?, genero = ?, origem = ?, atualizado_em = datetime(\'now\') WHERE usuario_id = ? AND livro_id = ?'
);
var stmtExcluirItemCarrinho = db.prepare('DELETE FROM carrinho_item WHERE usuario_id = ? AND livro_id = ?');
var stmtLimparCarrinho = db.prepare('DELETE FROM carrinho_item WHERE usuario_id = ?');
var stmtSubstituirCarrinho = db.prepare(
  'UPDATE carrinho_item SET qty = ? WHERE usuario_id = ? AND livro_id = ?'
);

// ---------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------
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

  if (req.method === 'GET' && caminho.indexOf('/api/livro/') === 0) {
    var idBusca = caminho.split('/')[3];
    if (!idBusca || isNaN(Number(idBusca))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }
    try {
      var livro = stmtBuscarLivro.get(Number(idBusca));
      if (!livro) {
        return responderJson(res, 404, { erro: 'Livro nao encontrado.' });
      }
      return responderJson(res, 200, livro);
    } catch (erro) {
      console.error('Erro em GET /api/livro/' + idBusca + ':', erro);
      return responderJson(res, 500, { erro: 'Erro interno do servidor.' });
    }
  }

  if (req.method === 'POST' && caminho === '/api/livro') {
    lerCorpoJson(req, function (erro, novo) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      if (!novo.titulo || !novo.autor || novo.preco === undefined || novo.preco === '') {
        return responderJson(res, 400, { erro: 'Titulo, autor e preco sao obrigatorios.' });
      }

      var precoNum = Number(novo.preco);
      if (!isFinite(precoNum) || precoNum <= 0) {
        return responderJson(res, 400, { erro: 'Preco deve ser um numero positivo.' });
      }

      var estoqueNum = Number(novo.estoque);
      if (!isFinite(estoqueNum) || estoqueNum < 0) estoqueNum = 0;

      var origem = (novo.origem === 'Internacional') ? 'Internacional' : 'Nacional';

      var imagem = (novo.imagem || '').trim();
      if (imagem) {
        imagem = imagem.replace(/[\\/]/g, '').replace(/\.\./g, '').toLowerCase();
        if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(imagem)) {
          return responderJson(res, 400, {
            erro: 'Imagem deve terminar em .png, .jpg, .jpeg, .webp, .gif ou .svg'
          });
        }
      } else {
        imagem = null;
      }

      var avaliacaoNum;
      if (novo.avaliacao === undefined || novo.avaliacao === '' || novo.avaliacao === null) {
        avaliacaoNum = 0;
      } else {
        avaliacaoNum = Number(novo.avaliacao);
        if (!isFinite(avaliacaoNum)) {
          return responderJson(res, 400, { erro: 'Avaliacao invalida.' });
        }
        if (avaliacaoNum !== 0 && (avaliacaoNum < 0.1 || avaliacaoNum > 5)) {
          return responderJson(res, 400, { erro: 'Avaliacao deve estar entre 0.1 e 5.0 estrelas.' });
        }
        avaliacaoNum = Math.round(avaliacaoNum * 10) / 10;
      }

      var editora = (novo.editora || '').trim() || null;

      var paginasNum = null;
      if (novo.paginas !== undefined && novo.paginas !== '' && novo.paginas !== null) {
        paginasNum = Number(novo.paginas);
        if (!isFinite(paginasNum) || paginasNum < 1) {
          return responderJson(res, 400, { erro: 'Paginas deve ser um numero inteiro maior que zero.' });
        }
        paginasNum = Math.floor(paginasNum);
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
        avaliacaoNum,
        editora,
        paginasNum
      ];

      try {
        var resultado = stmtInserirLivro.run(...valores);
        novo.id = Number(resultado.lastInsertRowid);
        novo.preco = precoNum;
        novo.estoque = Math.floor(estoqueNum);
        novo.imagem = imagem;
        novo.origem = origem;
        novo.avaliacao = avaliacaoNum;
        novo.editora = editora;
        novo.paginas = paginasNum;
        console.log('Livro cadastrado: id ' + novo.id + ' - ' + novo.titulo);
        return responderJson(res, 201, novo);
      } catch (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          return responderJson(res, 400, { erro: 'ISBN ja cadastrado no sistema.' });
        }
        return responderJson(res, 500, { erro: err.message });
      }
    });
    return;
  }

  if (req.method === 'DELETE' && caminho.indexOf('/api/livro/') === 0) {
    var idLivro = caminho.split('/')[3];
    if (!idLivro || isNaN(Number(idLivro))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }
    try {
      var resDelLivro = stmtExcluirLivro.run(idLivro);
      if (resDelLivro.changes === 0) {
        return responderJson(res, 404, { erro: 'Livro nao encontrado.' });
      }
      return responderJson(res, 200, { removido: Number(idLivro) });
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ============ API USUÁRIOS ============

  // POST /api/usuario/registrar
  if (req.method === 'POST' && caminho === '/api/usuario/registrar') {
    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var nomeUsuario = (dados.nome_usuario || '').trim();
      var senha = dados.senha || '';
      var nomeCompleto = (dados.nome_completo || '').trim();
      var email = (dados.email || '').trim().toLowerCase();

      if (!nomeUsuario || !senha || !nomeCompleto || !email) {
        return responderJson(res, 400, {
          erro: 'Nome de usuario, senha, nome completo e email sao obrigatorios.'
        });
      }

      if (nomeUsuario.length < 3) {
        return responderJson(res, 400, { erro: 'Nome de usuario deve ter pelo menos 3 caracteres.' });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(nomeUsuario)) {
        return responderJson(res, 400, { erro: 'Nome de usuario so pode conter letras, numeros e underscore.' });
      }

      if (senha.length < 6) {
        return responderJson(res, 400, { erro: 'Senha deve ter pelo menos 6 caracteres.' });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return responderJson(res, 400, { erro: 'Email invalido.' });
      }

      if (stmtBuscarUsuarioPorNome.get(nomeUsuario)) {
        return responderJson(res, 400, { erro: 'Nome de usuario ja existe.' });
      }

      var senhaHash = gerarHashSenha(senha);

      try {
        var resultado = stmtInserirUsuario.run(
          nomeUsuario,
          senhaHash,
          nomeCompleto,
          email,
          dados.telefone || null,
          dados.cpf || null,
          dados.data_nascimento || null,
          dados.cep || null
        );

        var usuario = stmtBuscarUsuarioPorId.get(Number(resultado.lastInsertRowid));
        delete usuario.senha_hash;

        console.log('Usuario registrado: ' + nomeUsuario + ' (id ' + usuario.id + ')');
        return responderJson(res, 201, usuario);
      } catch (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          if (err.message.indexOf('email') !== -1) {
            return responderJson(res, 400, { erro: 'Email ja cadastrado.' });
          }
          return responderJson(res, 400, { erro: 'Nome de usuario ou email ja cadastrado.' });
        }
        return responderJson(res, 500, { erro: err.message });
      }
    });
    return;
  }

  // POST /api/usuario/login
  if (req.method === 'POST' && caminho === '/api/usuario/login') {
    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var nomeUsuario = (dados.nome_usuario || '').trim();
      var senha = dados.senha || '';

      if (!nomeUsuario || !senha) {
        return responderJson(res, 400, { erro: 'Informe nome de usuario e senha.' });
      }

      var usuario = stmtBuscarUsuarioPorNome.get(nomeUsuario);
      if (!usuario || !verificarSenha(senha, usuario.senha_hash)) {
        return responderJson(res, 401, { erro: 'Nome de usuario ou senha incorretos.' });
      }

      delete usuario.senha_hash;
      console.log('Login: ' + nomeUsuario);
      return responderJson(res, 200, usuario);
    });
    return;
  }

  // GET /api/usuario/:id
  if (req.method === 'GET' && caminho.indexOf('/api/usuario/') === 0) {
    var idUsr = caminho.split('/')[3];
    if (!idUsr || isNaN(Number(idUsr))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }
    var usuario = stmtBuscarUsuarioPorId.get(Number(idUsr));
    if (!usuario) {
      return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });
    }
    delete usuario.senha_hash;
    return responderJson(res, 200, usuario);
  }

  // POST /api/usuario/:id/foto — upload multipart
  if (req.method === 'POST' && caminho.indexOf('/api/usuario/') === 0 && caminho.indexOf('/foto') !== -1) {
    var partesCaminho = caminho.split('/');
    var idFoto = partesCaminho[3];
    if (!idFoto || isNaN(Number(idFoto))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }

    var usuarioAlvo = stmtBuscarUsuarioPorId.get(Number(idFoto));
    if (!usuarioAlvo) {
      return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });
    }

    lerUploadMultipart(req, function (erro, partes) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var parteArquivo = partes.find(function (p) {
        return p.name === 'foto' && p.filename && p.data && p.data.length > 0;
      });

      if (!parteArquivo) {
        return responderJson(res, 400, { erro: 'Nenhum arquivo enviado.' });
      }

      var ext = path.extname(parteArquivo.filename).toLowerCase();
      var extValidas = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      if (extValidas.indexOf(ext) === -1) {
        return responderJson(res, 400, { erro: 'Formato invalido. Use PNG, JPG, JPEG, WEBP ou GIF.' });
      }

      var nomeArquivo = 'user_' + idFoto + '_' + Date.now() + ext;
      var caminhoFinal = path.join(PASTA_UPLOADS, nomeArquivo);

      try {
        fs.writeFileSync(caminhoFinal, parteArquivo.data);

        // Remove foto antiga
        if (usuarioAlvo.foto_perfil) {
          var caminhoAntigo = path.join(PASTA_UPLOADS, usuarioAlvo.foto_perfil);
          if (fs.existsSync(caminhoAntigo)) {
            try { fs.unlinkSync(caminhoAntigo); } catch (e) {}
          }
        }

        stmtAtualizarFoto.run(nomeArquivo, Number(idFoto));

        var atualizado = stmtBuscarUsuarioPorId.get(Number(idFoto));
        delete atualizado.senha_hash;

        console.log('Foto atualizada: usuario ' + idFoto + ' -> ' + nomeArquivo);
        return responderJson(res, 200, atualizado);
      } catch (e) {
        return responderJson(res, 500, { erro: 'Falha ao salvar arquivo: ' + e.message });
      }
    });
    return;
  }
    // ============ API CARRINHO (por usuário) ============

  // GET /api/carrinho/:usuarioId — lista itens
  if (req.method === 'GET' && /^\/api\/carrinho\/\d+$/.test(caminho)) {
    var idCarrinhoGet = Number(caminho.split('/')[3]);
    try {
      var itens = stmtListarCarrinho.all(idCarrinhoGet);
      return responderJson(res, 200, itens);
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // POST /api/carrinho/:usuarioId/sincronizar — substitui o carrinho inteiro
  // Body: { itens: [{id, price, qty, nome, autor, img, genero, origem}, ...] }
  if (req.method === 'POST' && /^\/api\/carrinho\/\d+\/sincronizar$/.test(caminho)) {
    var idCarrinhoSync = Number(caminho.split('/')[3]);

    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var usuarioAlvo = stmtBuscarUsuarioPorId.get(idCarrinhoSync);
      if (!usuarioAlvo) {
        return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });
      }

      var itensRecebidos = Array.isArray(dados.itens) ? dados.itens : [];

      var sincronizar = db.transaction(function () {
        stmtLimparCarrinho.run(idCarrinhoSync);
        itensRecebidos.forEach(function (it) {
          if (!it || !it.id) return;
          var precoNum = Number(it.price);
          var qtyNum = Number(it.qty);
          if (!isFinite(precoNum) || precoNum <= 0) return;
          if (!isFinite(qtyNum) || qtyNum <= 0) return;
          stmtInserirItemCarrinho.run(
            idCarrinhoSync,
            String(it.id),
            it.nome || null,
            it.autor || null,
            it.img || null,
            it.genero || null,
            it.origem || null,
            precoNum,
            Math.floor(qtyNum)
          );
        });
      });

      try {
        sincronizar();
        var resultado = stmtListarCarrinho.all(idCarrinhoSync);
        console.log('Carrinho sincronizado: usuario ' + idCarrinhoSync + ' -> ' + resultado.length + ' itens');
        return responderJson(res, 200, resultado);
      } catch (e) {
        return responderJson(res, 500, { erro: e.message });
      }
    });
    return;
  }

  // POST /api/carrinho/:usuarioId/item — adiciona/atualiza um item
  // Body: { livro_id, price, qty, nome, autor, img, genero, origem }
  if (req.method === 'POST' && /^\/api\/carrinho\/\d+\/item$/.test(caminho)) {
    var idCarrinhoItem = Number(caminho.split('/')[3]);

    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var usuarioAlvo = stmtBuscarUsuarioPorId.get(idCarrinhoItem);
      if (!usuarioAlvo) {
        return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });
      }

      var livroId = String(dados.livro_id || '');
      var precoNum = Number(dados.price);
      var qtyNum = Number(dados.qty);

      if (!livroId) return responderJson(res, 400, { erro: 'livro_id obrigatorio.' });
      if (!isFinite(precoNum) || precoNum <= 0) return responderJson(res, 400, { erro: 'price invalido.' });
      if (!isFinite(qtyNum) || qtyNum <= 0) return responderJson(res, 400, { erro: 'qty invalido.' });

      try {
        var existente = stmtBuscarItemCarrinho.get(idCarrinhoItem, livroId);

        if (existente) {
          var novaQty = existente.qty + Math.floor(qtyNum);
          stmtAtualizarItemCarrinho.run(
            novaQty, precoNum,
            dados.nome || existente.nome,
            dados.autor || existente.autor,
            dados.img || existente.img,
            dados.genero || existente.genero,
            dados.origem || existente.origem,
            idCarrinhoItem, livroId
          );
        } else {
          stmtInserirItemCarrinho.run(
            idCarrinhoItem, livroId,
            dados.nome || null,
            dados.autor || null,
            dados.img || null,
            dados.genero || null,
            dados.origem || null,
            precoNum,
            Math.floor(qtyNum)
          );
        }

        var itens = stmtListarCarrinho.all(idCarrinhoItem);
        return responderJson(res, 200, itens);
      } catch (e) {
        return responderJson(res, 500, { erro: e.message });
      }
    });
    return;
  }

  // DELETE /api/carrinho/:usuarioId/item/:livroId
  if (req.method === 'DELETE' && /^\/api\/carrinho\/\d+\/item\/.+$/.test(caminho)) {
    var partesCarrinhoDel = caminho.split('/');
    var idCarrinhoDel = Number(partesCarrinhoDel[3]);
    var livroIdDel = decodeURIComponent(partesCarrinhoDel[5] || '');

    try {
      stmtExcluirItemCarrinho.run(idCarrinhoDel, livroIdDel);
      var itensDel = stmtListarCarrinho.all(idCarrinhoDel);
      return responderJson(res, 200, itensDel);
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }

  // DELETE /api/carrinho/:usuarioId — limpa o carrinho
  if (req.method === 'DELETE' && /^\/api\/carrinho\/\d+$/.test(caminho)) {
    var idCarrinhoLimpar = Number(caminho.split('/')[3]);
    try {
      stmtLimparCarrinho.run(idCarrinhoLimpar);
      return responderJson(res, 200, { limpo: true });
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }

  // ============ ARQUIVOS ESTÁTICOS ============

  if (req.method === 'GET') {
    return servirArquivo(res, caminho === '/' ? 'index.html' : caminho);
  }

  responderJson(res, 404, { erro: 'Nao encontrado.' });
});

servidor.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('❌ A porta ' + PORTA + ' ja esta em uso.');
    console.error('   Rode: sudo kill -9 $(sudo lsof -t -i :' + PORTA + ')');
    console.error('');
    process.exit(1);
  }
  console.error('Erro no servidor:', err);
  process.exit(1);
});

servidor.listen(PORTA, function () {
  console.log('Pronto! Servidor rodando em http://localhost:' + PORTA);
});