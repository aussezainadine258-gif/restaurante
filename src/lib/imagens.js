// Gera imagens ilustrativas on-brand (laranja/preto) para os pratos do seed.
// Em produção, o restaurante substitui estas imagens pelo upload real.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function dividirLinhas(nome, maxCaracteres = 18) {
  const palavras = nome.split(' ');
  const linhas = [];
  let atual = '';
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (tentativa.length > maxCaracteres && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.slice(0, 3);
}

async function gerarPlaceholder({ nome, categoria, destino }) {
  const linhas = dividirLinhas(nome);
  const inicioY = 300 - (linhas.length - 1) * 34;
  const textoNome = linhas
    .map(
      (linha, i) =>
        `<text x="56" y="${inicioY + i * 70}" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700">${escaparXml(linha)}</text>`
    )
    .join('');

  const svg = `
    <svg width="800" height="560" viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111111"/>
          <stop offset="0.62" stop-color="#22140a"/>
          <stop offset="1" stop-color="#FF6B00"/>
        </linearGradient>
        <linearGradient id="circulo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FF6B00" stop-opacity="0.55"/>
          <stop offset="1" stop-color="#111111" stop-opacity="0.05"/>
        </linearGradient>
      </defs>
      <rect width="800" height="560" fill="url(#fundo)"/>
      <circle cx="690" cy="110" r="230" fill="#FFFFFF" opacity="0.06"/>
      <circle cx="700" cy="430" r="300" fill="#111111" opacity="0.22"/>
      <circle cx="675" cy="330" r="155" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="2"/>
      <circle cx="675" cy="330" r="115" fill="url(#circulo)"/>
      <circle cx="675" cy="330" r="70" fill="#111111" opacity="0.35"/>
      <text x="56" y="86" fill="#FF6B00" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="5">${escaparXml(
        categoria.toUpperCase()
      )}</text>
      ${textoNome}
      <rect x="56" y="454" width="76" height="6" rx="3" fill="#FF6B00"/>
      <text x="56" y="505" fill="#FFFFFF" fill-opacity="0.62" font-family="Arial, Helvetica, sans-serif" font-size="19" letter-spacing="1">Fotografia ilustrativa</text>
    </svg>`;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 72, mozjpeg: true, progressive: true }).toFile(destino);
}

module.exports = { gerarPlaceholder };
