import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// All individual tool, studio, and informational route slugs matching vite.config.ts STATIC_ROUTE_META
const ROUTE_SLUGS = [
  'document-enhance',
  'image-to-pdf',
  'pdf-compress',
  'document-studio',
  'id-card-print',
  'id-card-studio',
  'image-compress',
  'photo-resize',
  'image-crop',
  'image-convert',
  'image-adjust',
  'pdf-watermark',
  'image-pdf-editor',
  'passport-photo-maker',
  'about',
  'about-us',
  'contact',
  'contact-us',
  'privacy-policy',
  'terms-and-conditions',
  'copyright-policy',
  'disclaimer',
];

function copyDirRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      const shouldCopy =
        !fs.existsSync(destPath) ||
        fs.readFileSync(srcPath).compare(fs.readFileSync(destPath)) !== 0;
      if (shouldCopy) {
        fs.copyFileSync(srcPath, destPath);
        count++;
      }
    }
  }
  return count;
}

if (!fs.existsSync(DIST_DIR)) {
  console.error('[sync-gh-pages-root] Error: dist/ directory not found. Run vite build first.');
  process.exit(1);
}

let syncedRoutes = 0;
for (const slug of ROUTE_SLUGS) {
  const srcIndex = path.join(DIST_DIR, slug, 'index.html');
  const srcFlat = path.join(DIST_DIR, `${slug}.html`);
  if (!fs.existsSync(srcIndex)) {
    throw new Error(`Missing built route file: ${srcIndex}`);
  }
  const destDir = path.join(ROOT_DIR, slug);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcIndex, path.join(destDir, 'index.html'));
  if (fs.existsSync(srcFlat)) {
    fs.copyFileSync(srcFlat, path.join(ROOT_DIR, `${slug}.html`));
  }
  syncedRoutes++;
}

// Sync 404.html and .nojekyll to repository root for GitHub Pages branch publishing (main / root)
const dist404 = path.join(DIST_DIR, '404.html');
if (!fs.existsSync(dist404)) {
  throw new Error('Missing built dist/404.html');
}
fs.copyFileSync(dist404, path.join(ROOT_DIR, '404.html'));
fs.writeFileSync(path.join(ROOT_DIR, '.nojekyll'), '', 'utf-8');

// Preserve or restore CNAME for custom domain smartvletool.in
const rootCname = path.join(ROOT_DIR, 'CNAME');
if (!fs.existsSync(rootCname) || !fs.readFileSync(rootCname, 'utf-8').includes('smartvletool.in')) {
  fs.writeFileSync(rootCname, 'smartvletool.in\n', 'utf-8');
}

// Keep static assets referenced from root HTML paths up to date on GitHub Pages root
const staticRootFiles = [
  'style.css',
  'pwa-controller.js',
  'manifest.webmanifest',
  'sitemap.xml',
  'robots.txt',
  'ads.txt',
  'site-config.js',
  'site-router.js',
  'script.js',
  'editor.js',
  'passport-maker.js',
  'context-menu.js',
  'smart-optimizer.js',
  'browser-image-compression.js',
  'trim-canvas.js',
  'videos-config.js',
  'tutorial-videos.js',
];

let syncedAssets = 0;
for (const relFile of staticRootFiles) {
  const pubPath = path.join(PUBLIC_DIR, relFile);
  const rootPath = path.join(ROOT_DIR, relFile);
  if (fs.existsSync(pubPath)) {
    const needsUpdate =
      !fs.existsSync(rootPath) ||
      fs.readFileSync(pubPath).compare(fs.readFileSync(rootPath)) !== 0;
    if (needsUpdate) {
      fs.copyFileSync(pubPath, rootPath);
      syncedAssets++;
    }
  }
}

syncedAssets += copyDirRecursive(path.join(PUBLIC_DIR, 'mediapipe'), path.join(ROOT_DIR, 'mediapipe'));
syncedAssets += copyDirRecursive(path.join(PUBLIC_DIR, 'assets'), path.join(ROOT_DIR, 'assets'));
syncedAssets += copyDirRecursive(path.join(PUBLIC_DIR, 'videos'), path.join(ROOT_DIR, 'videos'));

console.log(
  `[sync-gh-pages-root] Synced ${syncedRoutes} route folders + .html entries, 404.html, .nojekyll, CNAME, and ${syncedAssets} updated root static asset(s) to repository root.`
);
