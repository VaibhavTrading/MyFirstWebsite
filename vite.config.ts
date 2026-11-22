import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

interface StaticRouteMeta {
  slug: string;
  pageId: string;
  navPath: string;
  canonical?: string;
  title: string;
  description: string;
  keywords?: string;
  h1?: string;
  heroDesc?: string;
  breadcrumb?: string;
}

const STATIC_ROUTE_META: StaticRouteMeta[] = [
  {
    slug: '/document-enhance',
    pageId: 'page-doc-studio',
    navPath: '/document-enhance',
    title: 'Document Enhancer – Remove Shadows & Clean Scanned Docs | SMART VLE TOOL',
    description: 'Straighten tilted scans, remove dark mobile shadows, brighten backgrounds, and produce crisp A4 printouts locally in your browser.',
    keywords: 'document enhancer, remove shadow from document online, clean scanned document for print, whiten document background, mobile photo to scan print, vle document cleaner',
    h1: 'Document Studio – Document Enhancer',
    heroDesc: 'Straighten tilted mobile photos, remove dark shadows, adjust contrast and brightness, and export crisp A4 printouts or enhanced scans locally inside your browser.',
    breadcrumb: 'Document Enhancer',
  },
  {
    slug: '/image-to-pdf',
    pageId: 'page-doc-studio',
    navPath: '/document-enhance',
    title: 'Images to PDF – Combine Photos into a Multi-Page PDF | SMART VLE TOOL',
    description: 'Compile multiple scanned documents or images into one properly sized A4/Letter multi-page PDF with custom margins, rotation, and target file size.',
    keywords: 'image to pdf, jpg to pdf converter online, combine images into pdf, multi page pdf creator, vle pdf compiler',
    h1: 'Images to PDF – Multi-Page PDF Compiler',
    heroDesc: 'Combine multiple scanned pages or photos into one ordered PDF document with page rotation, custom margins, page numbers, and target KB/MB optimization.',
    breadcrumb: 'Images to PDF',
  },
  {
    slug: '/pdf-compress',
    pageId: 'page-doc-studio',
    navPath: '/document-enhance',
    title: 'PDF Optimizer – Organize, Rotate & Compress PDF Files | SMART VLE TOOL',
    description: 'Reorder, rotate, merge, compress, or boost PDF file sizes inside your browser for government portals, scholarship uploads, and document submissions.',
    keywords: 'pdf compressor, pdf optimizer, reduce pdf file size in kb, organize pdf pages, reorder delete pdf pages, compress pdf online',
    h1: 'PDF Optimizer – Organize & Compress PDF',
    heroDesc: 'Reorder, rotate, merge, remove pages, and compress multi-page PDF files toward exact KB/MB limits locally inside your browser.',
    breadcrumb: 'PDF Optimizer',
  },
  {
    slug: '/document-studio',
    pageId: 'page-doc-studio',
    navPath: '/document-enhance',
    canonical: '/document-enhance',
    title: 'Document Studio – Document Enhancer, Images to PDF & PDF Optimizer',
    description: 'Clean mobile-captured documents online. Straighten tilted scans, remove shadows, compile images to PDF, and compress PDF files locally in your browser.',
    keywords: 'document studio, document enhancer, remove shadow from document online, image to pdf, pdf optimizer',
    h1: 'Document Studio',
    breadcrumb: 'Document Studio',
  },
  {
    slug: '/id-card-print',
    pageId: 'page-id-studio',
    navPath: '/id-card-print',
    title: 'ID Card Studio – Print Front & Back ID Card on One A4 Page',
    description: 'Straighten, clean, and align front and back sides of Aadhaar, PAN, or Voter ID cards to standard card dimensions on a single A4 page for printing.',
    keywords: 'id card print, front and back id card print on one page, aadhaar card print layout a4, straighten tilted id card, pvc card size print on a4, csc id card print tool',
    h1: 'ID Card Studio – Dual-Slot Identity Card Framing & A4 Print Layout',
    heroDesc: 'Clean, crop, and align Front and Back ID card sides to exact CR80 card proportions on a single printable A4 layout sheet inside your browser.',
    breadcrumb: 'ID Card Studio',
  },
  {
    slug: '/id-card-studio',
    pageId: 'page-id-studio',
    navPath: '/id-card-print',
    canonical: '/id-card-print',
    title: 'ID Card Studio – Print Front & Back ID Card on One A4 Page',
    description: 'Straighten, clean, and align front and back sides of Aadhaar, PAN, or Voter ID cards to standard card dimensions on a single A4 page for printing.',
    keywords: 'id card studio, front and back id card print on one page, aadhaar card print layout a4, straighten tilted id card, pvc card size print on a4, csc id card print tool',
    h1: 'ID Card Studio – Dual-Slot Identity Card Framing & A4 Print Layout',
    breadcrumb: 'ID Card Studio',
  },
  {
    slug: '/image-compress',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'Compress or Increase Image Size in KB Online | SMART VLE TOOL',
    description: 'Compress or increase image file size to exact KB targets at 300 DPI for SSC, UPSC, PAN, and government job forms directly in your browser.',
    keywords: 'image compress in kb, reduce image size kb, increase image size in kb, 20kb 50kb photo compressor, 300 dpi photo compress',
    h1: 'Compress / Increase Image Size in KB',
    heroDesc: 'Compress or increase JPG, PNG, and WEBP images to exact target KB limits with optional 300 DPI metadata and visual clarity.',
    breadcrumb: 'Compress / Increase KB',
  },
  {
    slug: '/photo-resize',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'Photo & Signature Resizer in Pixels, CM, MM & Inches | SMART VLE TOOL',
    description: 'Resize passport photos, signatures, and application images to exact pixel, centimeter, millimeter, or inch dimensions locally in your browser.',
    keywords: 'photo resize, signature resizer, resize image in pixels cm mm inches, online form photo resizer',
    h1: 'Photo & Signature Resizer',
    heroDesc: 'Resize photos and signatures accurately across Pixels (px), Inches (in), Centimeters (cm), and Millimeters (mm) with aspect ratio locking.',
    breadcrumb: 'Photo & Signature Resizer',
  },
  {
    slug: '/image-crop',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'Crop, Flip & Rotate Image Online with Precision | SMART VLE TOOL',
    description: 'Crop photos to preset or custom dimensions, trim white margins automatically, flip horizontally/vertically, and rotate by any angle in your browser.',
    keywords: 'image crop online, rotate image custom angle, flip image horizontally vertically, passport size crop',
    h1: 'Crop, Flip & Rotate Image',
    heroDesc: 'Crop images cleanly using interactive handles or exact measurements, flip horizontally or vertically, and straighten tilted images.',
    breadcrumb: 'Crop, Flip & Rotate',
  },
  {
    slug: '/image-convert',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'Image Format Converter – JPG, PNG, WEBP, BMP & AVIF | SMART VLE TOOL',
    description: 'Convert images seamlessly between JPG, PNG, WEBP, BMP, TIFF, and AVIF formats with quality and target KB controls inside your browser.',
    keywords: 'image format converter, png to jpg, webp to jpg, convert image format online',
    h1: 'Image Format Converter',
    heroDesc: 'Convert photos and scanned documents between JPG, PNG, WEBP, BMP, TIFF, and AVIF formats with instant preview and target KB tuning.',
    breadcrumb: 'Format Converter',
  },
  {
    slug: '/image-adjust',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'Adjust Image Brightness, Contrast & RGB Color Balance | SMART VLE TOOL',
    description: 'Fine-tune photo brightness, contrast, saturation, hue, and Shadows/Midtones/Highlights RGB color balance directly in your web browser.',
    keywords: 'adjust brightness contrast online, image color balance, rgb adjustment photo tool',
    h1: 'Adjust Color & RGB Balance',
    heroDesc: 'Tune brightness, contrast, saturation, hue, and professional Shadows/Midtones/Highlights RGB balance in real time.',
    breadcrumb: 'Adjust Color & RGB',
  },
  {
    slug: '/pdf-watermark',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    title: 'PDF Watermark – Add Text or Logo Watermarks to PDF | SMART VLE TOOL',
    description: 'Stamp custom text or logo watermarks onto single or multiple PDF pages with tiled grid or anchor layouts and live browser preview.',
    keywords: 'pdf watermark online, add text watermark to pdf, add logo watermark pdf, confidential pdf stamp',
    h1: 'PDF Watermark Tool',
    heroDesc: 'Apply customizable text or logo watermarks in single-anchor or tiled grids across selected or all PDF pages locally in your browser.',
    breadcrumb: 'PDF Watermark',
  },
  {
    slug: '/image-pdf-editor',
    pageId: 'page-editor-studio',
    navPath: '/image-compress',
    canonical: '/image-compress',
    title: 'Image Editor – Compress to KB, Resize, Crop, Convert & PDF Watermark',
    description: 'Resize and compress images toward target KB limits at 300 DPI for online forms. Crop, adjust color, convert formats, and apply custom PDF watermarks online.',
    keywords: 'image editor, resize photo in kb, compress image 300 dpi, increase image size in kb, crop image online, convert image format, adjust image brightness contrast, pdf watermark',
    h1: 'Image Editor – Compress to KB, Resize, Crop & Convert',
    breadcrumb: 'Image Editor',
  },
  {
    slug: '/passport-photo-maker',
    pageId: 'page-passport-maker',
    navPath: '/passport-photo-maker',
    title: 'Passport Photo Maker – Remove Background & Print Photos Online',
    description: 'Remove photo backgrounds, change background color (white, light blue, cream), crop to passport size, and print photo sheets.',
    keywords: 'passport photo maker, remove background passport photo, passport size photo online, change passport background color',
    h1: 'Passport Photo Maker',
    breadcrumb: 'Passport Photo Maker',
  },
  {
    slug: '/about',
    pageId: 'page-about',
    navPath: '/about-us',
    canonical: '/about-us',
    title: 'About Us – SMART VLE TOOL Online Utility Platform',
    description: 'Learn about SMART VLE TOOL, an online platform offering practical document scanning, ID card printing, passport photo making and image editing tools.',
  },
  {
    slug: '/about-us',
    pageId: 'page-about',
    navPath: '/about-us',
    title: 'About Us – SMART VLE TOOL Online Utility Platform',
    description: 'Learn about SMART VLE TOOL, an online platform offering practical document scanning, ID card printing, passport photo making and image editing tools.',
  },
  {
    slug: '/contact',
    pageId: 'page-contact',
    navPath: '/contact-us',
    canonical: '/contact-us',
    title: 'Contact Us – SMART VLE TOOL Support & Feedback',
    description: 'Get in touch with the SMART VLE TOOL team for support, feature feedback, technical questions, or general inquiries regarding our utility suite.',
  },
  {
    slug: '/contact-us',
    pageId: 'page-contact',
    navPath: '/contact-us',
    title: 'Contact Us – SMART VLE TOOL Support & Feedback',
    description: 'Get in touch with the SMART VLE TOOL team for support, feature feedback, technical questions, or general inquiries regarding our utility suite.',
  },
  {
    slug: '/privacy-policy',
    pageId: 'page-privacy',
    navPath: '/privacy-policy',
    title: 'Privacy Policy – SMART VLE TOOL Data Protection Practices',
    description: 'Read our transparent privacy policy. Discover how SMART VLE TOOL processes supported files in-browser, local storage data management, and AdSense disclosures.',
  },
  {
    slug: '/terms-and-conditions',
    pageId: 'page-terms',
    navPath: '/terms-and-conditions',
    title: 'Terms and Conditions – SMART VLE TOOL',
    description: 'Review the terms and conditions for using SMART VLE TOOL online image editing, scanned document enhancement, and PDF tools.',
  },
  {
    slug: '/copyright-policy',
    pageId: 'page-copyright',
    navPath: '/copyright-policy',
    title: 'Copyright Policy – SMART VLE TOOL',
    description: 'Review our copyright policy, user ownership of uploaded files, DMCA notice procedures, and intellectual property guidelines.',
  },
  {
    slug: '/disclaimer',
    pageId: 'page-disclaimer',
    navPath: '/disclaimer',
    title: 'Disclaimer – SMART VLE TOOL',
    description: 'Important legal and utility disclaimer regarding document processing quality, non-affiliation with government entities, and user verification responsibilities.',
  },
];

function escapeHtmlAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function smartvleStaticRoutesPlugin(): Plugin {
  const knownSlugSet = new Set(STATIC_ROUTE_META.map(r => r.slug));

  return {
    name: 'smartvle-static-routes-generator',
    configurePreviewServer(server) {
      const docsDir = path.resolve(__dirname, 'docs');
      server.middlewares.use((req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) {
          return next();
        }
        const urlObj = new URL(req.url, 'http://localhost');
        let pathname = decodeURIComponent(urlObj.pathname || '/');
        if (pathname.length > 1 && pathname.endsWith('/')) {
          pathname = pathname.slice(0, -1);
        }

        if (pathname === '/' || pathname === '/index.html') {
          const idxFile = path.join(docsDir, 'index.html');
          if (fs.existsSync(idxFile)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            fs.createReadStream(idxFile).pipe(res);
            return;
          }
          return next();
        }

        if (knownSlugSet.has(pathname)) {
          const slug = pathname.replace(/^\/+/, '');
          const routeFile = path.join(docsDir, slug, 'index.html');
          if (fs.existsSync(routeFile)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            fs.createReadStream(routeFile).pipe(res);
            return;
          }
        }

        const candidateFile = path.join(docsDir, pathname.replace(/^\/+/, ''));
        if (fs.existsSync(candidateFile) && fs.statSync(candidateFile).isFile()) {
          return next();
        }

        const notFoundFile = path.join(docsDir, '404.html');
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (fs.existsSync(notFoundFile)) {
          fs.createReadStream(notFoundFile).pipe(res);
        } else {
          res.end('<!DOCTYPE html><html><head><title>404 – Page Not Found</title></head><body><h1>404 – Page Not Found</h1></body></html>');
        }
      });
    },
    closeBundle() {
      const docsDir = path.resolve(__dirname, 'docs');
      const baseHtmlPath = path.join(docsDir, 'index.html');
      if (!fs.existsSync(baseHtmlPath)) return;

      const baseHtml = fs.readFileSync(baseHtmlPath, 'utf-8');
      const baseOrigin = 'https://smartvletool.in';

      for (const route of STATIC_ROUTE_META) {
        const canonicalPath = route.canonical || route.slug;
        const canonicalUrl = `${baseOrigin}${canonicalPath}`;
        const safeTitle = escapeHtmlText(route.title);
        const safeDescAttr = escapeHtmlAttr(route.description);

        let html = baseHtml
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
          .replace(
            /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="description" content="${safeDescAttr}" />`
          )
          .replace(
            /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
            `<link rel="canonical" href="${canonicalUrl}" />`
          )
          .replace(
            /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:title" content="${escapeHtmlAttr(route.title)}" />`
          )
          .replace(
            /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:description" content="${safeDescAttr}" />`
          )
          .replace(
            /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
            `<meta property="og:url" content="${canonicalUrl}" />`
          )
          .replace(
            /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="twitter:title" content="${escapeHtmlAttr(route.title)}" />`
          )
          .replace(
            /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="twitter:description" content="${safeDescAttr}" />`
          );

        if (route.keywords) {
          html = html.replace(
            /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
            `<meta name="keywords" content="${escapeHtmlAttr(route.keywords)}" />`
          );
        }

        // Toggle visible <main> so SSR/static crawlers see the route's main section directly
        html = html.replace(
          '<main class="page-view" id="page-home">',
          '<main class="page-view hidden" id="page-home">'
        );
        html = html.replace(
          `<main class="page-view hidden" id="${route.pageId}">`,
          `<main class="page-view" id="${route.pageId}">`
        );

        // Update nav active links cleanly
        html = html.replace(
          /href="\/"\s+class="site-nav-link active"/g,
          'href="/" class="site-nav-link"'
        );
        if (route.navPath !== '/') {
          const escapedNav = route.navPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          html = html.replace(
            new RegExp(`href="${escapedNav}"\\s+class="site-nav-link"`, 'g'),
            `href="${route.navPath}" class="site-nav-link active"`
          );
        }

        // Update target page hero H1, description & breadcrumb inside its section block
        const startMarker = `<main class="page-view" id="${route.pageId}">`;
        const startIdx = html.indexOf(startMarker);
        if (startIdx !== -1) {
          const endIdx = html.indexOf('</main>', startIdx);
          if (endIdx !== -1) {
            let section = html.slice(startIdx, endIdx);
            if (route.h1) {
              if (section.includes('class="tool-intro-h1"')) {
                section = section.replace(
                  /<h1\s+class="tool-intro-h1">[\s\S]*?<\/h1>/,
                  `<h1 class="tool-intro-h1">${escapeHtmlText(route.h1)}</h1>`
                );
              } else {
                section = section.replace(
                  /<h1\s+class="section-title">[\s\S]*?<\/h1>/,
                  `<h1 class="section-title">${escapeHtmlText(route.h1)}</h1>`
                );
              }
            }
            if (route.heroDesc) {
              section = section.replace(
                /<p\s+class="tool-intro-desc">[\s\S]*?<\/p>/,
                `<p class="tool-intro-desc">${escapeHtmlText(route.heroDesc)}</p>`
              );
            }
            if (route.breadcrumb) {
              section = section.replace(
                /<span\s+class="breadcrumb-current">[\s\S]*?<\/span>/,
                `<span class="breadcrumb-current">${escapeHtmlText(route.breadcrumb)}</span>`
              );
            }
            html = html.slice(0, startIdx) + section + html.slice(endIdx);
          }
        }

        const cleanSlug = route.slug.replace(/^\/+/, '');
        const routeDir = path.join(docsDir, cleanSlug);
        fs.mkdirSync(routeDir, { recursive: true });
        fs.writeFileSync(path.join(routeDir, 'index.html'), html, 'utf-8');
        fs.writeFileSync(path.join(docsDir, `${cleanSlug}.html`), html, 'utf-8');
      }

      const knownPathsJson = JSON.stringify(STATIC_ROUTE_META.map(r => r.slug));

      // Static 404.html: only recovers known routes if a host skipped directory routing; displays genuine 404 for unknown URLs
      const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 – Page Not Found | SMART VLE TOOL</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; box-sizing: border-box; }
    .nf-card { max-width: 560px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 36px 28px; text-align: center; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
    .nf-code { font-size: 52px; font-weight: 800; color: #4338ca; line-height: 1; margin-bottom: 10px; }
    h1 { font-size: 24px; margin: 0 0 10px; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 22px; }
    .nf-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .nf-btn { display: inline-block; padding: 10px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; }
    .nf-btn.primary { background: #4338ca; color: #ffffff; border-color: #4338ca; }
  </style>
  <script>
    (function () {
      var known = ${knownPathsJson};
      var clean = (location.pathname || '/').replace(/\\/+$/, '') || '/';
      if (known.indexOf(clean) !== -1) {
        location.replace('/?p=' + encodeURIComponent(location.pathname + location.search) + (location.hash || ''));
      }
    })();
  </script>
</head>
<body>
  <main class="nf-card">
    <div class="nf-code">404</div>
    <h1>Page Not Found</h1>
    <p>The page or tool URL you requested could not be found on SMART VLE TOOL. Use one of the verified tool links below to continue.</p>
    <div class="nf-actions">
      <a class="nf-btn primary" href="/">Go to Homepage</a>
      <a class="nf-btn" href="/document-enhance">Document Enhancer</a>
      <a class="nf-btn" href="/image-compress">Image Compressor</a>
      <a class="nf-btn" href="/passport-photo-maker">Passport Photo Maker</a>
    </div>
  </main>
</body>
</html>
`;
      fs.writeFileSync(path.join(docsDir, '404.html'), notFoundHtml, 'utf-8');

      // Ensure .nojekyll exists in docs/ for GitHub Pages compatibility
      fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf-8');

      // Ensure CNAME exists in docs/ for custom domain smartvletool.in
      const cnameSrc = path.resolve(__dirname, 'CNAME');
      const docsCnamePath = path.join(docsDir, 'CNAME');
      if (fs.existsSync(cnameSrc)) {
        fs.copyFileSync(cnameSrc, docsCnamePath);
      } else {
        fs.writeFileSync(docsCnamePath, 'smartvletool.in\n', 'utf-8');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      smartvleStaticRoutesPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: [
          'favicon.ico',
          'favicon.png',
          'favicon-48x48.png',
          'favicon-96x96.png',
          'favicon-144x144.png',
          'og-preview.jpg',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'manifest.webmanifest',
          'site-config.js',
          'browser-image-compression.js',
          'trim-canvas.js',
          'smart-optimizer.js',
          'script.js',
          'editor.js',
          'site-router.js',
          'pwa-controller.js',
          'passport-maker.js',
          'videos-config.js',
          'tutorial-videos.js',
          'context-menu.js',
          'style.css'
        ],
        manifest: {
          id: '/',
          name: 'SMART VLE TOOL – Online Document & ID Studio',
          short_name: 'smartvletool',
          description: 'Browser-based Document Scanner, Perspective Correction, ID Card Layout Studio, Image Compressor, Passport Photo & PDF Tools.',
          theme_color: '#4338ca',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff,woff2,json}'],
          globIgnores: ['**/*.html', '!index.html', '!404.html'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/docs\.opencv\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'opencv-cdn-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdnjs-cdn-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'docs',
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      esbuild: {
        drop: ['console', 'debugger'],
      },
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: false,
      watch: null,
    },
  };
});
