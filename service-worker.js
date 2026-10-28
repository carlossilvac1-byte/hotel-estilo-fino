/* =====================================================================
 * service-worker.js — CACHE OFFLINE E ENVIO EM SEGUNDO PLANO
 * ---------------------------------------------------------------------
 * Pré-cache de todos os arquivos na instalação (o app abre sem rede).
 * Arquivos: rede primeiro (3 s) e cache como reserva — alteração
 * publicada aparece no próximo carregamento.
 * AO PUBLICAR NOVA VERSÃO: altere VERSAO (junto com config.js).
 * ===================================================================== */

const VERSAO = 'v1.0.0';
const CACHE = 'hotel-estilo-fino-' + VERSAO;

const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './db.js',
  './auth.js',
  './sync.js',
  './pdf.js',
  './app.js',
  './inicio.js',
  './quartos.js',
  './hospedes.js',
  './voucher.js',
  './movimento.js',
  './financeiro.js',
  './relatorios.js',
  './acessos.js',
  './ajustes.js',
  './manifest.json',
  './vendor/dexie.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/qrcode.js',
  './fonts/manrope.woff2',
  './fonts/manrope-ext.woff2',
  './fonts/marcellus-sc.woff2',
  './assets/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ARQUIVOS.map(async (url) => {
      try {
        const resp = await fetch(url, { cache: 'reload' });
        if (resp && resp.ok) await cache.put(url, resp);
      } catch (e) { console.warn('[SW] não foi possível pré-carregar:', url, e); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter(k => k.startsWith('hotel-estilo-fino-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // Supabase e afins: direto à rede

  if (req.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        const rede = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', rede.clone());
        return rede;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
               new Response('Aplicativo indisponível offline.', { status: 503 });
      }
    })());
    return;
  }

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const rede = await Promise.race([
        fetch(req, { cache: 'no-store' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tempo')), 3000))
      ]);
      if (rede && rede.ok) { cache.put(req, rede.clone()); return rede; }
      throw new Error('resposta ' + (rede && rede.status));
    } catch (e) {
      const emCache = await cache.match(req, { ignoreSearch: true });
      return emCache || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/* Envio em segundo plano (Android / Chrome): o sinal voltou com o app
   fechado → envia a fila com o mesmo código do app. */
let moduloEnvio = false;
try {
  self.window = self;
  importScripts('./vendor/dexie.min.js', './config.js', './db.js', './auth.js', './sync.js');
  moduloEnvio = true;
} catch (e) { console.warn('[SW] envio em segundo plano indisponível:', e && e.message); }

async function enviarEmSegundoPlano() {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (janelas.length) { janelas.forEach(c => c.postMessage({ tipo: 'sincronizar' })); return; }
  if (!moduloEnvio || !self.AUTH || !self.SYNC) return;
  await AUTH.iniciar();
  if (!AUTH.autenticado() || AUTH.modoLocal()) return;
  const r = await SYNC.sincronizar(true);
  const restantes = await DB.contarPendentes();
  if (restantes && (r.offline || r.falhas || r.erro || r.pulado)) throw new Error('fila pendente — o navegador tenta de novo');
}

self.addEventListener('sync', (evento) => {
  if (evento.tag === 'enviar-hotel') evento.waitUntil(enviarEmSegundoPlano());
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'pular-espera') self.skipWaiting();
});
