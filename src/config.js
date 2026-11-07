// Configuração central da aplicação.
// Os valores vêm do ficheiro .env (ver .env.example).
require('dotenv').config();

// O fuso horário tem de ser definido antes de qualquer uso de Date/Intl.
process.env.TZ = process.env.TZ || 'Africa/Maputo';

const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || 'segredo-de-desenvolvimento-alterar',
  restaurantName: process.env.RESTAURANT_NAME || 'Restaurante SLEY',
  baseUrl,
  codigoMesaAtivoDefault: String(process.env.CODIGO_MESA_ATIVO || 'true').toLowerCase() !== 'false',
  uploadMaxMb: Number(process.env.UPLOAD_MAX_MB || 5),
  videoMaxMb: Number(process.env.VIDEO_MAX_MB || 5),
  videoMaxSegundos: Number(process.env.VIDEO_MAX_SEGUNDOS || 15),
  isProduction: process.env.NODE_ENV === 'production',
  // Supabase Storage (opcional). Sem estas variáveis a aplicação guarda os
  // ficheiros localmente, para o projeto continuar a funcionar em demonstração.
  supabase: {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
    bucketFotos: process.env.SUPABASE_BUCKET_FOTOS || 'pratos',
    bucketVideos: process.env.SUPABASE_BUCKET_VIDEOS || 'videos-pratos',
    ativo: Boolean(supabaseUrl && supabaseServiceRoleKey)
  },
  paths: {
    data: path.join(rootDir, 'data'),
    public: path.join(rootDir, 'public'),
    uploads: path.join(rootDir, 'public', 'uploads', 'pratos'),
    videos: path.join(rootDir, 'public', 'uploads', 'videos'),
    qrcodes: path.join(rootDir, 'public', 'qrcodes'),
    views: path.join(rootDir, 'views'),
    db: path.join(rootDir, 'data', 'restaurante.db')
  }
};
