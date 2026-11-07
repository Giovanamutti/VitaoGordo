var path = require('path');
var { DatabaseSync } = require('node:sqlite');

var caminho = path.join(__dirname, 'banco.db');
var db = new DatabaseSync(caminho);

db.exec('PRAGMA foreign_keys = ON');

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

module.exports = db;