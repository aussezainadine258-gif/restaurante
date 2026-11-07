const fs = require('fs');
const js = fs.readFileSync('public/js/admin.js', 'utf8');
const ejs = fs.readFileSync('views/admin/painel.ejs', 'utf8');
const ids = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(ids)].filter((id) => !ejs.includes(`id="${id}"`));
console.log('IDs referenciados:', [...new Set(ids)].length);
console.log('Em falta:', missing);
