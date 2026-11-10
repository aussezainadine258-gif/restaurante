# Restaurante SLEY — pedidos na mesa

Sistema de pedidos para restaurante, pensado para telemóvel e para internet lenta.
O cliente entra com o **número da mesa**, confirma o **código de 4 dígitos** e pede
diretamente do seu telefone. A equipa acompanha tudo no painel e na cozinha.

Interface em português de Moçambique, preços em **MZN** e identidade visual
**laranja `#FF6B00`**, **preto `#111111`** e **branco `#FFFFFF`**.

## Funcionalidades

### Cliente (`/menu?mesa=N`)

Barra fixa em baixo com três separadores:

- **Feed** — abre por defeito. Fotografia (ou vídeo mudo em ciclo) de cada prato
  em ecrã inteiro, com scroll vertical com snap (um prato de cada vez). Nome,
  preço em laranja, tempo de preparo, etiquetas e botão **Adicionar ao pedido**.
  Coração com contador de gostos (um gosto por sessão de mesa). Pratos esgotados
  aparecem com selo **Esgotado** e sem botão de adicionar. Ordem: mais gostados e
  mais recentes primeiro, com uma pequena componente aleatória. Nos vídeos há um
  botão de som (começam mudos, como exigido pelos navegadores móveis).
- **Menu** — categorias em separadores horizontais e grelha de cartões a duas
  colunas no telemóvel. Os cartões com vídeo mostram uma pré-visualização muda.
  Tocar num cartão abre o detalhe em folha inferior, com fotografia ou vídeo,
  descrição, observação ("sem cebola"), quantidade e botão **Adicionar**.
- **Minha mesa** — carrinho editável (quantidades, remover, observações),
  observação geral, **Confirmar pedido**, pedidos da sessão com estado em tempo
  real (Recebido, Em preparo, Pronto, Entregue), total acumulado,
  **Chamar empregado** e **Pedir a conta**.

O estado dos pedidos e das chamadas é atualizado por **Socket.IO** e, em
alternativa, por consulta periódica a cada 15 segundos.

> **Vídeos.** Cada prato pode ter fotografia e/ou vídeo. O vídeo é opcional,
> limitado a **5 MB** e **15 segundos**, e é validado no browser e no servidor.
> Em ligações com `saveData`/2G ou com movimento reduzido, o vídeo não arranca
> automaticamente: mostra a fotografia e o utilizador pode reproduzi-lo.

### Painel da gerência (`/admin`)

- Pedidos em tempo real, transições de estado e fecho de conta.
- Gestão de pratos e categorias, com upload de **foto** e **vídeo** diretamente
  do dispositivo (galeria ou câmara), pré-visualização, compressão da imagem no
  browser, barra de progresso e remoção/substituição de ficheiros.
- Gestão de mesas: ativar (gera código de 4 dígitos), fechar e imprimir QR codes.
- Definições do restaurante e gestão de utilizadores.
- Relatórios com gráficos (Chart.js servido localmente).

### Cozinha (`/cozinha`)

Ecrã dedicado com os pedidos ativos e transições **Recebido → Em preparo → Pronto**.

## Requisitos

- **Node.js 18 ou superior** (testado com Node 24)
- Windows, Linux ou macOS
- **PostgreSQL** (Supabase ou instância local) através de `DATABASE_URL`
- **Supabase Storage é opcional**: sem credenciais, os ficheiros ficam em
  `public/uploads` e o sistema funciona normalmente em demonstração

## Instalação

```bash
npm install
```

Copie `.env.example` para `.env` e ajuste os valores:

```env
PORT=3000
SESSION_SECRET=troque-este-segredo-por-uma-frase-longa-e-aleatoria
RESTAURANT_NAME=Restaurante SLEY
BASE_URL=http://localhost:3000
CODIGO_MESA_ATIVO=true
TZ=Africa/Maputo
UPLOAD_MAX_MB=5
VIDEO_MAX_MB=5
VIDEO_MAX_SEGUNDOS=15
# PostgreSQL / Supabase (obrigatório)
DATABASE_URL=postgresql://UTILIZADOR:PALAVRA_PASSE@HOST:5432/BASE_DE_DADOS
DATABASE_SSL=true
# Opcional: guardar ficheiros no Supabase Storage
# SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

## Arrancar

```bash
npm start        # servidor normal
npm run dev      # servidor com reinício automático
```

Abrir `http://localhost:3000`. Como não há mesa no link, aparece o formulário
**"Qual é a sua mesa?"**. Introduza o número e confirme o código de 4 dígitos.

## Primeiro acesso e credenciais de demonstração

Depois de `npm run reset` e `node scripts/ativar-mesa.js 5`:

| O que | Valor |
| --- | --- |
| Painel | `http://localhost:3000/admin` |
| Utilizador admin | `admin` |
| Password admin | `admin123` |
| Ecrã da cozinha | `http://localhost:3000/cozinha` |
| Utilizador cozinha | `cozinha` |
| Password cozinha | `cozinha123` |
| Mesa de demonstração | Mesa 5 (o código é mostrado pelo script) |

No primeiro login, o sistema pede a alteração da password inicial.

### Ativar uma mesa

```bash
node scripts/ativar-mesa.js 5
```

O comando mostra o código de 4 dígitos e o link direto. Também é possível ativar
mesas no painel, em **Mesas**. O código é sempre fornecido pelo empregado.

### QR codes

A entrada principal do cliente é o **número da mesa**, mas o painel continua a
gerar QR codes para impressão:

- `/admin/qrcodes` — folha para imprimir
- `/admin/mesas/:id/qrcode.png` — imagem individual

Os QR codes apontam para `/menu?mesa=N`, por isso continuam a funcionar como
atalho quando o cliente os quiser usar.

## Base de dados e migrações

A aplicação usa **PostgreSQL** (Supabase ou local). A ligação é configurada por
`DATABASE_URL`; `DATABASE_SSL=false` desativa o SSL num Postgres local.

Os ficheiros em `supabase/migrations/` são a única fonte de verdade do esquema:

- `000_schema_inicial.sql` — tabelas, índices e tipos Postgres;
- `001_gostos_prato.sql` — contador `pratos.gostos` e tabela `gostos_prato`;
- `002_media_urls.sql` — `pratos.foto_url` e `pratos.video_url`;
- `003_row_level_security.sql` — RLS ativa (sem políticas públicas; o servidor
  liga-se com o papel proprietário);
- `004_seed.sql` — dados de demonstração.

Comandos:

```bash
npm run reset   # apaga e recria o esquema, e aplica o seed
npm run seed    # aplica o seed sem apagar dados existentes
```

O endpoint `POST /api/pratos/:id/gosto` valida a sessão, alterna o gosto e
devolve `{ gostou, gostos }`. A função `resumoSessao` inclui `pratos_gostados`,
para a interface saber quais os pratos já gostados.

## Supabase Storage (fotografias e vídeos)

1. Crie um projeto no Supabase.
2. No **SQL Editor**, execute `supabase/storage-policies.sql`. O ficheiro cria
   os buckets públicos `pratos` e `videos-pratos` (leitura pública; escrita,
   atualização e remoção apenas para o papel `admin`).
3. Copie para o `.env`:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
SUPABASE_BUCKET_FOTOS=pratos
SUPABASE_BUCKET_VIDEOS=videos-pratos
```

4. Reinicie o servidor. O painel passa a indicar que os ficheiros são guardados
   no Supabase Storage.

**Segurança:** a `service_role` key só é usada pelo servidor Express e nunca é
enviada para o browser. O acesso ao upload continua protegido pela sessão de
administrador do painel (`exigirAdmin`). As políticas de Storage são uma segunda
barreira para eventuais acessos diretos ao Supabase.

**Sem Supabase:** se `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` não estiverem
definidos, os ficheiros são guardados em `public/uploads/pratos` e
`public/uploads/videos`, com nomes UUID e o mesmo comportamento de substituição
e remoção.

### Regras de upload

- **Fotografia:** `image/jpeg`, `image/png`, `image/webp`, `image/gif` ou
  `image/avif`. É redimensionada no browser para no máximo **800 px** de largura
  e comprimida em JPEG com qualidade **0,8**. O servidor repete a normalização.
- **Vídeo:** `video/mp4`, `video/webm`, `video/quicktime` ou `video/ogg`, até
  **5 MB** e **15 segundos**. Acima disso é recusado com a mensagem
  **"Vídeo demasiado grande, comprime-o ou usa um mais curto"**.
- Os nomes são `UUID + extensão`; ao substituir ou remover, o ficheiro antigo é
  apagado do Storage.

## Estrutura do projeto

```
src/
  app.js                 aplicação Express
  server.js              HTTP + Socket.IO
  config.js              configuração a partir do .env
  controllers/           cliente, painel, cozinha e APIs
  routes/                rotas públicas e protegidas
  services/              mesas, pedidos, chamadas, gostos, armazenamento...
  db/
    index.js             pool Postgres, query() e transacao()
    seed.js              aplica supabase/migrations/004_seed.sql
    reset.js             apaga e recria o esquema Postgres
    schema.sql           referência histórica do esquema SQLite
  lib/                   utilidades, validação, imagens
views/                   EJS (cliente, admin, cozinha, estados)
public/
  css/estilos.css        identidade visual partilhada
  js/menu.js             interface social do cliente
  js/admin.js, cozinha.js, relatorios.js...
  uploads/pratos/        fotografias (quando não há Supabase)
  uploads/videos/        vídeos (quando não há Supabase)
  qrcodes/               QR codes gerados
supabase/
  migrations/            esquema Postgres e seed
  storage-policies.sql   buckets e políticas do Supabase Storage
scripts/                 ativar mesas e testes de integração
```

## API pública usada pelo cliente

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/mesa/verificar` | valida mesa + código de 4 dígitos |
| `GET` | `/api/mesa/:numero/estado` | estado público da mesa |
| `GET` | `/api/sessoes/:token` | resumo da sessão, pedidos e total |
| `POST` | `/api/pedidos` | cria um pedido |
| `POST` | `/api/chamadas` | chama empregado / pede a conta |
| `POST` | `/api/pratos/:id/gosto` | alterna o gosto de um prato |

## Testes

Com o servidor a correr:

```bash
# Fase 1 — menu, código, gostos, pedidos, chamadas e tempo real
set CODIGO_MESA=<código mostrado por "node scripts/ativar-mesa.js 5">
node scripts/teste-fase1.js

# Fase 2 — painel da gerência (inclui foto, vídeo, substituição e remoção)
node scripts/teste-fase2.js

# Fase 3 — ecrã da cozinha
node scripts/teste-fase3.js

# Fase 4 — relatórios
node scripts/teste-fase4.js
```

Em PowerShell, use `$env:CODIGO_MESA='4030'` em vez de `set`.
O teste da Fase 1 espera a **Mesa 5** ativa e o código respetivo. Os testes da
Fase 2 alteram temporariamente a password do admin; para voltar ao estado de
demonstração, execute `npm run reset` e reative a mesa.

## Recomeçar do zero

```bash
npm run reset
node scripts/ativar-mesa.js 5
```

`npm run reset` apaga a base de dados, recria o esquema, aplica as migrações e
volta a inserir os dados de demonstração. As fotografias de exemplo são geradas
localmente. Depois do reset, todos os códigos de mesa são novos.

## Notas para produção

- Defina um `SESSION_SECRET` longo e aleatório e `NODE_ENV=production`.
- Sirva o sistema por **HTTPS** e configure o `BASE_URL` público.
- Faça cópias de segurança de `data/`, de `public/uploads/pratos/` e de
  `public/uploads/videos/` (ou do projeto Supabase, quando configurado).
- O limite de upload de fotografias é `UPLOAD_MAX_MB` (5 MB por defeito).
- O limite dos vídeos é `VIDEO_MAX_MB` (5 MB) e `VIDEO_MAX_SEGUNDOS` (15 s).
- No Supabase, confirme que `supabase/storage-policies.sql` foi executado e que
  a `service_role` key fica apenas no servidor (nunca em JavaScript público).
- O sistema não usa CDNs: CSS, JavaScript e Chart.js são servidos localmente,
  o que ajuda em ligações lentas.
