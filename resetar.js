// resetar.js
var path = require('path');
var fs = require('fs');
var Database = require('better-sqlite3');

var caminhoBanco = path.join(__dirname, 'banco.db');

if (!fs.existsSync(caminhoBanco)) {
  console.log('⚠️  banco.db nao existe — nada a resetar.');
  process.exit(0);
}

var db = new Database(caminhoBanco);

console.log('📋 Antes do reset:');
try {
  var clientes = db.prepare('SELECT COUNT(*) AS n FROM cliente').get();
  var livros = db.prepare('SELECT COUNT(*) AS n FROM livro').get();
  console.log('   Clientes: ' + clientes.n);
  console.log('   Livros:   ' + livros.n);
} catch (e) {
  console.log('   (tabelas ainda nao existem)');
}

db.exec('DELETE FROM cliente');
db.exec('DELETE FROM livro');
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('cliente','livro')");

console.log('');
console.log('✅ Tabelas resetadas (dados apagados, IDs reiniciados em 1).');

var clientesDepois = db.prepare('SELECT COUNT(*) AS n FROM cliente').get();
var livrosDepois = db.prepare('SELECT COUNT(*) AS n FROM livro').get();
console.log('   Clientes: ' + clientesDepois.n);
console.log('   Livros:   ' + livrosDepois.n);

db.close();