var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var db = require('./db');

var PORTA = 7600;

var TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

var RAIZ_PUBLIC = path.join(__dirname, 'public');

// Pasta para uploads de fotos de perfil
var PASTA_UPLOADS = path.join(RAIZ_PUBLIC, 'uploads');
if (!fs.existsSync(PASTA_UPLOADS)) {
  fs.mkdirSync(PASTA_UPLOADS, { recursive: true });
}

// Pasta para imagens de livros
var PASTA_IMAGENS = path.join(RAIZ_PUBLIC, 'imagens');
if (!fs.existsSync(PASTA_IMAGENS)) {
  fs.mkdirSync(PASTA_IMAGENS, { recursive: true });
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function responderJson(res, status, conteudo) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(conteudo));
}

function estaDentroDe(raiz, alvo) {
  var rel = path.relative(raiz, alvo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function servirArquivo(res, caminhoRelativo) {
  var alvo = caminhoRelativo.replace(/^\/+/, '').split('?')[0].split('#')[0];
  if (!alvo) alvo = 'index.html';

  var candidatoPublic = path.resolve(RAIZ_PUBLIC, alvo);
  var candidatoRaiz = path.resolve(__dirname, alvo);
  var caminhoFinal = null;

  if (estaDentroDe(RAIZ_PUBLIC, candidatoPublic) &&
      fs.existsSync(candidatoPublic) &&
      fs.statSync(candidatoPublic).isFile()) {
    caminhoFinal = candidatoPublic;
  } else if (estaDentroDe(__dirname, candidatoRaiz) &&
             fs.existsSync(candidatoRaiz) &&
             fs.statSync(candidatoRaiz).isFile()) {
    caminhoFinal = candidatoRaiz;
  }

  // Fallback case-insensitive só para imagens
  if (!caminhoFinal && alvo.indexOf('imagens/') === 0) {
    var pastaImagens = path.join(RAIZ_PUBLIC, 'imagens');
    var nomeBusca = path.basename(alvo).toLowerCase();
    if (fs.existsSync(pastaImagens)) {
      var arquivos = fs.readdirSync(pastaImagens);
      for (var i = 0; i < arquivos.length; i++) {
        if (arquivos[i].toLowerCase() === nomeBusca) {
          caminhoFinal = path.join(pastaImagens, arquivos[i]);
          break;
        }
      }
    }
  }

  if (!caminhoFinal) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Arquivo nao encontrado: ' + caminhoRelativo);
  }

  var ext = path.extname(caminhoFinal).toLowerCase();
  var tipo = TIPOS[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': tipo,
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(fs.readFileSync(caminhoFinal));
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
  'INSERT INTO livro (titulo, autor, preco, genero, estoque, isbn, imagem, origem, avaliacao, editora, paginas, categoria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtExcluirLivro = db.prepare('DELETE FROM livro WHERE id = ?');
var stmtBuscarLivro = db.prepare('SELECT * FROM livro WHERE id = ?');

var stmtBuscarUsuarioPorNome = db.prepare('SELECT * FROM usuario WHERE nome_usuario = ?');
var stmtBuscarUsuarioPorId = db.prepare('SELECT * FROM usuario WHERE id = ?');
var stmtInserirUsuario = db.prepare(
  'INSERT INTO usuario (nome_usuario, senha_hash, nome_completo, email, telefone, cpf, data_nascimento, cep) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
var stmtAtualizarFoto = db.prepare('UPDATE usuario SET foto_perfil = ? WHERE id = ?');
var stmtAtualizarClube = db.prepare('UPDATE usuario SET clube_ativo = ? WHERE id = ?');
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
      return responderJson(res, 200, { removido: Number(idCli) });
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

  // ============ UPLOAD DE IMAGEM DE LIVRO (deve vir ANTES de /api/livro) ============

  if (req.method === 'POST' && caminho === '/api/livro/upload') {
    lerUploadMultipart(req, function (erro, partes) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var parteArquivo = partes.find(function (p) {
        return p.name === 'imagem' && p.filename && p.data && p.data.length > 0;
      });

      if (!parteArquivo) {
        return responderJson(res, 400, { erro: 'Nenhum arquivo enviado.' });
      }

      var ext = path.extname(parteArquivo.filename).toLowerCase();
      var extValidas = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
      if (extValidas.indexOf(ext) === -1) {
        return responderJson(res, 400, { erro: 'Formato invalido. Use PNG, JPG, JPEG, WEBP, GIF ou SVG.' });
      }

      var baseNome = path.basename(parteArquivo.filename, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      var nomeArquivo = 'livro_' + Date.now() + '_' + baseNome + ext;
      var caminhoFinal = path.join(PASTA_IMAGENS, nomeArquivo);

      try {
        fs.writeFileSync(caminhoFinal, parteArquivo.data);
        console.log('Imagem de livro salva: ' + nomeArquivo);
        return responderJson(res, 200, { imagem: nomeArquivo });
      } catch (e) {
        return responderJson(res, 500, { erro: 'Falha ao salvar imagem: ' + e.message });
      }
    });
    return;
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

      var CATEGORIAS_VALIDAS = ['hq', 'livro', 'manga', 'kit'];

      var categoria = String(novo.categoria || '').trim().toLowerCase();
      if (CATEGORIAS_VALIDAS.indexOf(categoria) === -1) {
        categoria = 'livro'; // padrão
      }
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
        paginasNum,
        categoria
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
        novo.categoria = categoria;
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
      return responderJson(res, 200, usuario);
    });
    return;
  }
  // GET /api/usuario — lista todos os usuários (SEM senha)
  if (req.method === 'GET' && caminho === '/api/usuario') {
    try {
      var lista = db.prepare('SELECT id, nome_usuario, nome_completo, email, telefone, cpf, data_nascimento, cep, foto_perfil, criado_em FROM usuario ORDER BY id DESC').all();
      return responderJson(res, 200, lista);
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }
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
        if (usuarioAlvo.foto_perfil) {
          var caminhoAntigo = path.join(PASTA_UPLOADS, usuarioAlvo.foto_perfil);
          if (fs.existsSync(caminhoAntigo)) {
            try { fs.unlinkSync(caminhoAntigo); } catch (e) {}
          }
        }
        stmtAtualizarFoto.run(nomeArquivo, Number(idFoto));
        var atualizado = stmtBuscarUsuarioPorId.get(Number(idFoto));
        delete atualizado.senha_hash;
        return responderJson(res, 200, atualizado);
      } catch (e) {
        return responderJson(res, 500, { erro: 'Falha ao salvar arquivo: ' + e.message });
      }
    });
    return;
  }

    // ============ API CLUBE ============

  // POST /api/usuario/:id/clube — ativa/desativa assinatura do clube
  if (req.method === 'POST' && /^\/api\/usuario\/\d+\/clube$/.test(caminho)) {
    var partesClube = caminho.split('/');
    var idClube = Number(partesClube[3]);
    if (!idClube || isNaN(idClube)) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }

    var usuarioClube = stmtBuscarUsuarioPorId.get(idClube);
    if (!usuarioClube) {
      return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });
    }

    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      var ativo = dados.ativo === true || dados.ativo === 1 || dados.ativo === '1';
      var valor = ativo ? 1 : 0;

      try {
        stmtAtualizarClube.run(valor, idClube);
        var atualizado = stmtBuscarUsuarioPorId.get(idClube);
        delete atualizado.senha_hash;
        console.log('Clube ' + (ativo ? 'ativado' : 'cancelado') + ' para usuario ' + idClube);
        return responderJson(res, 200, atualizado);
      } catch (e) {
        return responderJson(res, 500, { erro: e.message });
      }
    });
    return;
  }


  // ============ API CARRINHO ============

  if (req.method === 'GET' && /^\/api\/carrinho\/\d+$/.test(caminho)) {
    var idCarrinhoGet = Number(caminho.split('/')[3]);
    try {
      var itens = stmtListarCarrinho.all(idCarrinhoGet);
      return responderJson(res, 200, itens);
    } catch (erro) {
      return responderJson(res, 500, { erro: erro.message });
    }
  }

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
        return responderJson(res, 200, resultado);
      } catch (e) {
        return responderJson(res, 500, { erro: e.message });
      }
    });
    return;
  }

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
    // ============ PUT /api/livro/:id — edita um livro ============

  if (req.method === 'PUT' && /^\/api\/livro\/\d+$/.test(caminho)) {
    var idEdit = caminho.split('/')[3];
    if (!idEdit || isNaN(Number(idEdit))) {
      return responderJson(res, 400, { erro: 'ID invalido.' });
    }

    var livroExistente = stmtBuscarLivro.get(Number(idEdit));
    if (!livroExistente) {
      return responderJson(res, 404, { erro: 'Livro nao encontrado.' });
    }

    lerCorpoJson(req, function (erro, novo) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      // Mesma validação do POST, mas usando fallback para os valores antigos
      var titulo = (novo.titulo !== undefined ? novo.titulo : livroExistente.titulo);
      var autor = (novo.autor !== undefined ? novo.autor : livroExistente.autor);
      if (!titulo || !autor) {
        return responderJson(res, 400, { erro: 'Titulo e autor sao obrigatorios.' });
      }

      var precoNum = (novo.preco !== undefined && novo.preco !== '') ? Number(novo.preco) : livroExistente.preco;
      if (!isFinite(precoNum) || precoNum <= 0) {
        return responderJson(res, 400, { erro: 'Preco deve ser um numero positivo.' });
      }

      var estoqueNum = (novo.estoque !== undefined && novo.estoque !== '') ? Number(novo.estoque) : livroExistente.estoque;
      if (!isFinite(estoqueNum) || estoqueNum < 0) estoqueNum = 0;

      var origem = (novo.origem === 'Internacional' || novo.origem === 'Nacional')
        ? novo.origem
        : livroExistente.origem;

      var CATEGORIAS_VALIDAS_EDIT = ['hq', 'livro', 'manga', 'kit'];
      var categoria = (novo.categoria || livroExistente.categoria || 'livro').toLowerCase();
      if (CATEGORIAS_VALIDAS_EDIT.indexOf(categoria) === -1) categoria = 'livro';

      var imagem = (novo.imagem !== undefined ? novo.imagem : livroExistente.imagem);
      if (imagem && typeof imagem === 'string') {
        imagem = imagem.trim();
        if (imagem) {
          imagem = imagem.replace(/[\\/]/g, '').replace(/\.\./g, '').toLowerCase();
          if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(imagem)) {
            return responderJson(res, 400, { erro: 'Imagem deve terminar em .png, .jpg, .jpeg, .webp, .gif ou .svg' });
          }
        } else {
          imagem = null;
        }
      } else {
        imagem = livroExistente.imagem;
      }

      var avaliacaoNum;
      if (novo.avaliacao === undefined || novo.avaliacao === '' || novo.avaliacao === null) {
        avaliacaoNum = livroExistente.avaliacao;
      } else {
        avaliacaoNum = Number(novo.avaliacao);
        if (!isFinite(avaliacaoNum)) avaliacaoNum = 0;
        if (avaliacaoNum !== 0 && (avaliacaoNum < 0.1 || avaliacaoNum > 5)) {
          return responderJson(res, 400, { erro: 'Avaliacao deve estar entre 0.1 e 5.0 estrelas.' });
        }
        avaliacaoNum = Math.round(avaliacaoNum * 10) / 10;
      }

      var editora = (novo.editora !== undefined) ? (String(novo.editora).trim() || null) : livroExistente.editora;

      var paginasNum;
      if (novo.paginas !== undefined && novo.paginas !== '' && novo.paginas !== null) {
        paginasNum = Number(novo.paginas);
        if (!isFinite(paginasNum) || paginasNum < 1) {
          return responderJson(res, 400, { erro: 'Paginas deve ser um numero maior que zero.' });
        }
        paginasNum = Math.floor(paginasNum);
      } else {
        paginasNum = livroExistente.paginas;
      }

      var isbn = (novo.isbn !== undefined) ? (String(novo.isbn).trim() || null) : livroExistente.isbn;
      var genero = (novo.genero !== undefined) ? String(novo.genero) : livroExistente.genero;

      try {
        var stmtAtualizarLivro = db.prepare(`
          UPDATE livro SET
            titulo = ?, autor = ?, preco = ?, genero = ?, estoque = ?,
            isbn = ?, imagem = ?, origem = ?, avaliacao = ?, editora = ?,
            paginas = ?, categoria = ?
          WHERE id = ?
        `);
        stmtAtualizarLivro.run(
          titulo,
          autor,
          precoNum,
          genero || '',
          Math.floor(estoqueNum),
          isbn,
          imagem,
          origem,
          avaliacaoNum,
          editora,
          paginasNum,
          categoria,
          Number(idEdit)
        );

        var atualizado = stmtBuscarLivro.get(Number(idEdit));
        console.log('Livro editado: id ' + idEdit + ' — ' + titulo);
        return responderJson(res, 200, atualizado);
      } catch (err) {
        if (err.message && err.message.indexOf('UNIQUE') !== -1) {
          return responderJson(res, 400, { erro: 'ISBN ja cadastrado em outro livro.' });
        }
        return responderJson(res, 500, { erro: err.message });
      }
    });
    return;
  }


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

  if (req.method === 'DELETE' && /^\/api\/carrinho\/\d+$/.test(caminho)) {
    var idCarrinhoLimpar = Number(caminho.split('/')[3]);
    try {
      stmtLimparCarrinho.run(idCarrinhoLimpar);
      return responderJson(res, 200, { limpo: true });
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }
  // ============ API CARTÕES ============

// GET /api/cartao/:usuarioId — lista cartões salvos
if (req.method === 'GET' && /^\/api\/cartao\/\d+$/.test(caminho)) {
  const idUsr = Number(caminho.split('/')[3]);
  try {
    const cartoes = db.prepare(
      'SELECT id, apelido, bandeira, ultimos4, nome_titular, validade, padrao, criado_em FROM cartao WHERE usuario_id = ? ORDER BY padrao DESC, id DESC'
    ).all(idUsr);
    return responderJson(res, 200, cartoes);
  } catch (e) {
    return responderJson(res, 500, { erro: e.message });
  }
}

// POST /api/cartao/:usuarioId — cadastra cartão
if (req.method === 'POST' && /^\/api\/cartao\/\d+$/.test(caminho)) {
  const idUsr = Number(caminho.split('/')[3]);
  const usuarioAlvo = stmtBuscarUsuarioPorId.get(idUsr);
  if (!usuarioAlvo) return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });

  lerCorpoJson(req, function (erro, dados) {
    if (erro) return responderJson(res, 400, { erro: erro.message });

    const numero = String(dados.numero || '').replace(/\D/g, '');
    const nomeTitular = String(dados.nome_titular || '').trim();
    const validade = String(dados.validade || '').trim();
    const apelido = String(dados.apelido || '').trim() || null;
    const bandeira = String(dados.bandeira || '').trim().toLowerCase() || null;
    const padrao = dados.padrao === true || dados.padrao === 1 ? 1 : 0;

    if (numero.length < 13 || numero.length > 19) {
      return responderJson(res, 400, { erro: 'Numero do cartao invalido.' });
    }
    if (!nomeTitular) return responderJson(res, 400, { erro: 'Nome do titular obrigatorio.' });
    if (!/^\d{2}\/\d{2}$/.test(validade)) {
      return responderJson(res, 400, { erro: 'Validade deve estar no formato MM/AA.' });
    }

    // Validação de Luhn (cartão real)
       // (Luhn removido — aceita qualquer sequência de 13 a 19 dígitos)

    const ultimos4 = numero.slice(-4);
    const numeroHash = crypto.createHash('sha256').update(numero).digest('hex');

    const inserir = db.transaction(() => {
      if (padrao) {
        db.prepare('UPDATE cartao SET padrao = 0 WHERE usuario_id = ?').run(idUsr);
      }
      const r = db.prepare(`
        INSERT INTO cartao (usuario_id, apelido, bandeira, ultimos4, nome_titular, validade, numero_hash, padrao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(idUsr, apelido, bandeira, ultimos4, nomeTitular, validade, numeroHash, padrao);
      return Number(r.lastInsertRowid);
    });

    try {
      const novoId = inserir();
      const novo = db.prepare(
        'SELECT id, apelido, bandeira, ultimos4, nome_titular, validade, padrao, criado_em FROM cartao WHERE id = ?'
      ).get(novoId);
      return responderJson(res, 201, novo);
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  });
  return;
}

  // DELETE /api/cartao/:usuarioId/:cartaoId — remove cartão
  if (req.method === 'DELETE' && /^\/api\/cartao\/\d+\/\d+$/.test(caminho)) {
    const partes = caminho.split('/');
    const idUsr = Number(partes[3]);
    const idCartao = Number(partes[4]);
    try {
      const r = db.prepare('DELETE FROM cartao WHERE id = ? AND usuario_id = ?').run(idCartao, idUsr);
      if (r.changes === 0) return responderJson(res, 404, { erro: 'Cartao nao encontrado.' });
      return responderJson(res, 200, { removido: idCartao });
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }

  // POST /api/cartao/:usuarioId/:cartaoId/padrao — define como padrão
  if (req.method === 'POST' && /^\/api\/cartao\/\d+\/\d+\/padrao$/.test(caminho)) {
    const partes = caminho.split('/');
    const idUsr = Number(partes[3]);
    const idCartao = Number(partes[4]);
    try {
      const cartao = db.prepare('SELECT id FROM cartao WHERE id = ? AND usuario_id = ?').get(idCartao, idUsr);
      if (!cartao) return responderJson(res, 404, { erro: 'Cartao nao encontrado.' });
      db.transaction(() => {
        db.prepare('UPDATE cartao SET padrao = 0 WHERE usuario_id = ?').run(idUsr);
        db.prepare('UPDATE cartao SET padrao = 1 WHERE id = ?').run(idCartao);
      })();
      const lista = db.prepare(
        'SELECT id, apelido, bandeira, ultimos4, nome_titular, validade, padrao, criado_em FROM cartao WHERE usuario_id = ? ORDER BY padrao DESC, id DESC'
      ).all(idUsr);
      return responderJson(res, 200, lista);
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }

  // ============ API MÉTODOS ALTERNATIVOS (PIX / BOLETO) ============

  // GET /api/metodo/:usuarioId
  if (req.method === 'GET' && /^\/api\/metodo\/\d+$/.test(caminho)) {
    const idUsr = Number(caminho.split('/')[3]);
    try {
      const lista = db.prepare(
        'SELECT * FROM metodo_pagamento WHERE usuario_id = ? ORDER BY padrao DESC, id DESC'
      ).all(idUsr);
      return responderJson(res, 200, lista);
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }

  // POST /api/metodo/:usuarioId — cadastra pix/boleto fictício
  if (req.method === 'POST' && /^\/api\/metodo\/\d+$/.test(caminho)) {
    const idUsr = Number(caminho.split('/')[3]);
    const usuarioAlvo = stmtBuscarUsuarioPorId.get(idUsr);
    if (!usuarioAlvo) return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });

    lerCorpoJson(req, function (erro, dados) {
      if (erro) return responderJson(res, 400, { erro: erro.message });

      const tipo = String(dados.tipo || '').toLowerCase();
      if (['pix', 'boleto'].indexOf(tipo) === -1) {
        return responderJson(res, 400, { erro: 'Tipo deve ser "pix" ou "boleto".' });
      }

      // Gera dados fictícios se não vierem
      let chave = String(dados.chave || '').trim();
      let codigo = String(dados.codigo || '').trim();

      if (tipo === 'pix' && !chave) {
        chave = (usuarioAlvo.email || ('user' + idUsr + '@multicultural.com')).toLowerCase();
      }
      if (tipo === 'boleto' && !codigo) {
        // Gera linha digitável fictícia de 47 dígitos
        let d = '23793';
        while (d.length < 47) d += Math.floor(Math.random() * 10);
        codigo = d.replace(/^(\d{5})(\d{5})(\d{5})(\d{6})(\d{5})(\d{6})(\d{1})(\d{14})$/, '$1.$2 $3.$4 $5.$6 $7 $8');
      }

      try {
        const r = db.prepare(`
          INSERT INTO metodo_pagamento (usuario_id, tipo, chave, codigo, padrao)
          VALUES (?, ?, ?, ?, 0)
        `).run(idUsr, tipo, chave || null, codigo || null);
        const novo = db.prepare('SELECT * FROM metodo_pagamento WHERE id = ?').get(Number(r.lastInsertRowid));
        return responderJson(res, 201, novo);
      } catch (e) {
        return responderJson(res, 500, { erro: e.message });
      }
    });
    return;
  }

  // DELETE /api/metodo/:usuarioId/:metodoId
  if (req.method === 'DELETE' && /^\/api\/metodo\/\d+\/\d+$/.test(caminho)) {
    const partes = caminho.split('/');
    const idUsr = Number(partes[3]);
    const idMet = Number(partes[4]);
    try {
      const r = db.prepare('DELETE FROM metodo_pagamento WHERE id = ? AND usuario_id = ?').run(idMet, idUsr);
      if (r.changes === 0) return responderJson(res, 404, { erro: 'Metodo nao encontrado.' });
      return responderJson(res, 200, { removido: idMet });
    } catch (e) {
      return responderJson(res, 500, { erro: e.message });
    }
  }
  // ============ API CHECKOUT — métodos de pagamento do usuário ============

if (req.method === 'GET' && /^\/api\/checkout\/\d+$/.test(caminho)) {
  const idUsr = Number(caminho.split('/')[3]);
  const usuarioAlvo = stmtBuscarUsuarioPorId.get(idUsr);
  if (!usuarioAlvo) return responderJson(res, 404, { erro: 'Usuario nao encontrado.' });

  try {
    const cartoes = db.prepare(
      'SELECT id, apelido, bandeira, ultimos4, nome_titular, validade, padrao FROM cartao WHERE usuario_id = ? ORDER BY padrao DESC, id DESC'
    ).all(idUsr);
    const metodos = db.prepare(
      'SELECT id, tipo, chave, codigo, padrao FROM metodo_pagamento WHERE usuario_id = ? ORDER BY id DESC'
    ).all(idUsr);
    return responderJson(res, 200, {
      cartoes,
      pix: metodos.filter(m => m.tipo === 'pix'),
      boletos: metodos.filter(m => m.tipo === 'boleto')
    });
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
  console.log('   Web root: ' + RAIZ_PUBLIC);
  console.log('   Imagens:  ' + PASTA_IMAGENS);
});