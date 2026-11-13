var path = require('path');
var Database = require('better-sqlite3');

var caminho = path.join(__dirname, 'banco.db');
var db = new Database(caminho);

db.pragma('foreign_keys = ON');

// ---- Tabela de clientes ----
db.exec(`
  CREATE TABLE IF NOT EXISTS cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    nascimento TEXT NOT NULL,
    cep TEXT NOT NULL
  )
`);

// ---- Tabela de livros ----
db.exec(`
  CREATE TABLE IF NOT EXISTS livro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    autor TEXT NOT NULL,
    preco REAL NOT NULL,
    genero TEXT,
    estoque INTEGER NOT NULL DEFAULT 0,
    isbn TEXT UNIQUE,
    imagem TEXT,
    origem TEXT NOT NULL DEFAULT 'Nacional',
    avaliacao REAL NOT NULL DEFAULT 0,
    editora TEXT,
    paginas INTEGER
  )
`);

// ---- Tabela de usuários ----
db.exec(`
  CREATE TABLE IF NOT EXISTS usuario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    nome_completo TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    cpf TEXT,
    data_nascimento TEXT,
    cep TEXT,
    foto_perfil TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// ---- Migração segura para bancos antigos ----
(function migrar() {
  var cols = db.prepare("PRAGMA table_info(livro)").all().map(function (c) { return c.name; });

  if (cols.indexOf('isbn') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN isbn TEXT");
    console.log('✔ coluna "isbn" adicionada');
  }
  if (cols.indexOf('imagem') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN imagem TEXT");
    console.log('✔ coluna "imagem" adicionada');
  }
  if (cols.indexOf('origem') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN origem TEXT NOT NULL DEFAULT 'Nacional'");
    console.log('✔ coluna "origem" adicionada');
  }
  if (cols.indexOf('avaliacao') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN avaliacao REAL NOT NULL DEFAULT 0");
    console.log('✔ coluna "avaliacao" adicionada');
  }
  if (cols.indexOf('editora') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN editora TEXT");
    console.log('✔ coluna "editora" adicionada');
  }
  if (cols.indexOf('paginas') === -1) {
    db.exec("ALTER TABLE livro ADD COLUMN paginas INTEGER");
    console.log('✔ coluna "paginas" adicionada');
  }
})();

// ---- Tabela de itens do carrinho (por usuário) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS carrinho_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    livro_id TEXT NOT NULL,
    nome TEXT,
    autor TEXT,
    img TEXT,
    genero TEXT,
    origem TEXT,
    price REAL NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(usuario_id, livro_id),
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
  )
`);
module.exports = db;