import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : '3000';
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://docs.opencv.org https://cdnjs.cloudflare.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' data: blob: https:; worker-src 'self' blob:;");
    next();
  });

  // Explicit route for self-hosted MediaPipe WASM & TFLite models (must run before Vite middleware)
  app.get(['/mediapipe/wasm/:filename', '/mediapipe/models/:filename'], (req, res) => {
    const subDir = req.path.includes('/wasm/') ? 'wasm' : 'models';
    const filename = path.basename(req.params.filename);
    const docsFile = path.resolve(__dirname, 'docs/mediapipe', subDir, filename);
    const distFile = path.resolve(__dirname, 'dist/mediapipe', subDir, filename);
    const publicFile = path.resolve(__dirname, 'public/mediapipe', subDir, filename);
    const targetPath = fs.existsSync(docsFile) ? docsFile : (fs.existsSync(distFile) ? distFile : (fs.existsSync(publicFile) ? publicFile : null));
    if (targetPath) {
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.wasm'
        ? 'application/wasm'
        : ext === '.js'
          ? 'application/javascript; charset=utf-8'
          : 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(targetPath);
    }
    res.status(404).send('MediaPipe asset not found');
  });

  // Mount Vite middleware in development mode
  if (!isProduction) {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom'
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('[Server] Unable to attach Vite middlewares, falling back to static server:', e);
    }
  }

  // Explicit route for favicons, touch icons & WhatsApp OG preview image (no redirects, direct 200 response)
  app.get([
    '/favicon.ico',
    '/favicon.png',
    '/favicon-48x48.png',
    '/favicon-96x96.png',
    '/favicon-144x144.png',
    '/apple-touch-icon.png',
    '/og-preview.jpg'
  ], (req, res) => {
    const filename = path.basename(req.path);
    const docsFavicon = path.resolve(__dirname, 'docs', filename);
    const distFavicon = path.resolve(__dirname, 'dist', filename);
    const publicFavicon = path.resolve(__dirname, 'public', filename);
    const rootFavicon = path.resolve(__dirname, filename);
    const targetPath = fs.existsSync(docsFavicon) ? docsFavicon :
                       fs.existsSync(distFavicon) ? distFavicon :
                       fs.existsSync(publicFavicon) ? publicFavicon :
                       fs.existsSync(rootFavicon) ? rootFavicon : null;
    if (targetPath) {
      const mimeType = filename.endsWith('.ico') ? 'image/x-icon' : filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(targetPath);
    }
    res.status(404).send('Asset not found');
  });

  // Explicit route for sw.js to prevent redirect issues
  app.get('/sw.js', (req, res) => {
    const docsSwPath = path.resolve(__dirname, 'docs/sw.js');
    if (fs.existsSync(docsSwPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      return res.sendFile(docsSwPath);
    }
    const swPath = path.resolve(__dirname, 'dist/sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      return res.sendFile(swPath);
    }
    const publicSwPath = path.resolve(__dirname, 'public/sw.js');
    if (fs.existsSync(publicSwPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      return res.sendFile(publicSwPath);
    }
    res.status(404).send('Service worker file not found');
  });

  // Explicit route for workbox files
  app.get('/workbox-*.js', (req, res) => {
    const fileName = path.basename(req.path);
    const docsWbPath = path.resolve(__dirname, 'docs', fileName);
    const wbPath = path.resolve(__dirname, 'dist', fileName);
    const target = fs.existsSync(docsWbPath) ? docsWbPath : wbPath;
    if (fs.existsSync(target)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      return res.sendFile(target);
    }
    res.status(404).send('Workbox script not found');
  });

  // Explicit route for social preview banner assets (WhatsApp, Facebook, Twitter)
  app.get(['/assets/aistudio/:filename', '/public/assets/aistudio/:filename'], (req, res) => {
    const filename = req.params.filename;
    const docsAssetPath = path.resolve(__dirname, 'docs/assets/aistudio', filename);
    const publicAssetPath = path.resolve(__dirname, 'public/assets/aistudio', filename);
    const rootAssetPath = path.resolve(__dirname, 'assets/aistudio', filename);
    const distAssetPath = path.resolve(__dirname, 'dist/assets/aistudio', filename);

    const targetPath = fs.existsSync(docsAssetPath) ? docsAssetPath :
                       fs.existsSync(publicAssetPath) ? publicAssetPath :
                       fs.existsSync(rootAssetPath) ? rootAssetPath :
                       fs.existsSync(distAssetPath) ? distAssetPath : null;

    if (targetPath) {
      const ext = path.extname(targetPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 
                       (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 
                       ext === '.js' ? 'application/javascript; charset=utf-8' : 
                       ext === '.wasm' ? 'application/wasm' :
                       'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(targetPath);
    }
    res.status(404).send('Asset image not found');
  });

  // Explicit route for tutorial videos & posters (supports HTTP Range 206 streaming & proper 404)
  app.get('/videos/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const docsVideoPath = path.resolve(__dirname, 'docs/videos', filename);
    const distVideoPath = path.resolve(__dirname, 'dist/videos', filename);
    const publicVideoPath = path.resolve(__dirname, 'public/videos', filename);
    const targetPath = fs.existsSync(docsVideoPath) ? docsVideoPath :
                       fs.existsSync(distVideoPath) ? distVideoPath :
                       fs.existsSync(publicVideoPath) ? publicVideoPath : null;

    if (targetPath) {
      return res.sendFile(targetPath);
    }
    res.status(404).send('Tutorial video not found');
  });

  // Serve static assets from built docs (or dist fallback) if present
  const docsPath = path.resolve(__dirname, 'docs');
  if (fs.existsSync(docsPath)) {
    app.use(express.static(docsPath, {
      index: false,
      redirect: false
    }));
  }
  const distPath = path.resolve(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      index: false,
      redirect: false
    }));
  }

  // Serve static assets from public if present
  const publicPath = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath, {
      index: false,
      redirect: false
    }));
  }

  // Explicit routes for all individual tool pages, legacy aliases, and info/legal routes (no redirects)
  const CLEAN_HTML_ROUTES = [
    '/document-enhance',
    '/image-to-pdf',
    '/pdf-compress',
    '/document-studio',
    '/id-card-print',
    '/id-card-studio',
    '/image-compress',
    '/photo-resize',
    '/image-crop',
    '/image-convert',
    '/image-adjust',
    '/pdf-watermark',
    '/image-pdf-editor',
    '/passport-photo-maker',
    '/about',
    '/about-us',
    '/contact',
    '/contact-us',
    '/privacy-policy',
    '/terms-and-conditions',
    '/copyright-policy',
    '/disclaimer'
  ];

  app.get(['/', '/index.html'], (req, res) => {
    const docsIndex = path.resolve(__dirname, 'docs/index.html');
    const distIndex = path.resolve(__dirname, 'dist/index.html');
    const rootIndex = path.resolve(__dirname, 'index.html');
    const target = fs.existsSync(docsIndex) ? docsIndex : (fs.existsSync(distIndex) ? distIndex : rootIndex);
    if (fs.existsSync(target)) {
      return res.sendFile(target);
    }
    res.status(404).send('Index page not found. Please build the application.');
  });

  app.get(CLEAN_HTML_ROUTES, (req, res) => {
    const cleanSlug = req.path.replace(/^\/+|\/+$/g, '');
    const docsRouteFile = path.resolve(__dirname, 'docs', cleanSlug, 'index.html');
    const docsIndex = path.resolve(__dirname, 'docs/index.html');
    const distRouteFile = path.resolve(__dirname, 'dist', cleanSlug, 'index.html');
    const distIndex = path.resolve(__dirname, 'dist/index.html');
    const rootIndex = path.resolve(__dirname, 'index.html');
    const target = fs.existsSync(docsRouteFile)
      ? docsRouteFile
      : fs.existsSync(distRouteFile)
        ? distRouteFile
        : fs.existsSync(docsIndex)
          ? docsIndex
          : fs.existsSync(distIndex)
            ? distIndex
            : rootIndex;
    if (fs.existsSync(target)) {
      return res.sendFile(target);
    }
    res.status(404).send('Page not found.');
  });

  // Fallback 404 handler for unknown URLs
  app.get('*', (req, res) => {
    const docs404 = path.resolve(__dirname, 'docs/404.html');
    if (fs.existsSync(docs404)) {
      return res.status(404).sendFile(docs404);
    }
    const dist404 = path.resolve(__dirname, 'dist/404.html');
    if (fs.existsSync(dist404)) {
      return res.status(404).sendFile(dist404);
    }
    res.status(404).send('<!DOCTYPE html><html><head><title>404 – Page Not Found | SMART VLE TOOL</title></head><body><h1>404 – Page Not Found</h1></body></html>');
  });

  const server = app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SMART VLE TOOL Server] Running on port ${PORT}`);
  });

  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      process.exit(1);
    } else {
      throw e;
    }
  });
}

startServer();
