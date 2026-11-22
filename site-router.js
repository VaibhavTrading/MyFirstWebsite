/**
 * SMART VLE TOOL - Client Router, Hash Navigation, SEO & Privacy Controller
 * Uses window.MONU_SITE_CONFIG for dynamic base URL resolution
 * Support Email: customer@smartvletool.in
 * Production Domain: https://smartvletool.in
 */

(function () {
    const config = window.MONU_SITE_CONFIG || {
        PRODUCTION_DOMAIN: 'https://smartvletool.in',
        SITE_NAME: 'SMART VLE TOOL',
        SUPPORT_EMAIL: 'customer@smartvletool.in',
        getBaseUrl: function () {
            if (this.PRODUCTION_DOMAIN && 
                this.PRODUCTION_DOMAIN !== 'YOUR_DOMAIN_HERE' && 
                !this.PRODUCTION_DOMAIN.includes('YOUR_DOMAIN')) {
                return this.PRODUCTION_DOMAIN.replace(/\/+$/, '');
            }
            if (typeof window !== 'undefined' && window.location && window.location.origin) {
                return window.location.origin;
            }
            return 'https://smartvletool.in';
        },
        getCanonicalUrl: function (path) {
            const base = this.getBaseUrl();
            const cleanPath = (path || '/').startsWith('/') ? path : '/' + path;
            return base + cleanPath;
        }
    };

    window.MONU_CONFIG = config;

    const SUPPORT_EMAIL = config.SUPPORT_EMAIL || 'customer@smartvletool.in';

    const ROUTES = {
        '/': {
            pageId: 'page-home',
            navPath: '/',
            title: 'SMART VLE TOOL – Free Online Image Editing & Document Tools',
            description: 'Browser-based image editing, document enhancement, and PDF tools. Core editing operations run locally inside your web browser.',
            path: '/'
        },
        '/document-enhance': {
            pageId: 'page-doc-studio',
            mode: 'DOC',
            subTool: 'scanner',
            navPath: '/document-enhance',
            title: 'Document Enhancer – Remove Shadows & Clean Scanned Docs | SMART VLE TOOL',
            description: 'Straighten tilted scans, remove dark mobile shadows, brighten backgrounds, and produce crisp A4 printouts locally in your browser.',
            keywords: 'document enhancer, remove shadow from document online, clean scanned document for print, whiten document background, mobile photo to scan print, vle document cleaner',
            h1: 'Document Studio – Document Enhancer',
            heroDesc: 'Straighten tilted mobile photos, remove dark shadows, adjust contrast and brightness, and export crisp A4 printouts or enhanced scans locally inside your browser.',
            breadcrumb: 'Document Enhancer',
            path: '/document-enhance'
        },
        '/image-to-pdf': {
            pageId: 'page-doc-studio',
            mode: 'DOC',
            subTool: 'img2pdf',
            navPath: '/document-enhance',
            title: 'Images to PDF – Combine Photos into a Multi-Page PDF | SMART VLE TOOL',
            description: 'Compile multiple scanned documents or images into one properly sized A4/Letter multi-page PDF with custom margins, rotation, and target file size.',
            keywords: 'image to pdf, jpg to pdf converter online, combine images into pdf, multi page pdf creator, vle pdf compiler',
            h1: 'Images to PDF – Multi-Page PDF Compiler',
            heroDesc: 'Combine multiple scanned pages or photos into one ordered PDF document with page rotation, custom margins, page numbers, and target KB/MB optimization.',
            breadcrumb: 'Images to PDF',
            path: '/image-to-pdf'
        },
        '/pdf-compress': {
            pageId: 'page-doc-studio',
            mode: 'DOC',
            subTool: 'pdfcompress',
            navPath: '/document-enhance',
            title: 'PDF Optimizer – Organize, Rotate & Compress PDF Files | SMART VLE TOOL',
            description: 'Reorder, rotate, merge, compress, or boost PDF file sizes inside your browser for government portals, scholarship uploads, and document submissions.',
            keywords: 'pdf compressor, pdf optimizer, reduce pdf file size in kb, organize pdf pages, reorder delete pdf pages, compress pdf online',
            h1: 'PDF Optimizer – Organize & Compress PDF',
            heroDesc: 'Reorder, rotate, merge, remove pages, and compress multi-page PDF files toward exact KB/MB limits locally inside your browser.',
            breadcrumb: 'PDF Optimizer',
            path: '/pdf-compress'
        },
        '/document-studio': {
            pageId: 'page-doc-studio',
            mode: 'DOC',
            subTool: 'scanner',
            navPath: '/document-enhance',
            canonical: '/document-enhance',
            title: 'Document Studio – Document Enhancer, Images to PDF & PDF Optimizer',
            description: 'Clean mobile-captured documents online. Straighten tilted scans, remove shadows, compile images to PDF, and compress PDF files locally in your browser.',
            keywords: 'document studio, document enhancer, remove shadow from document online, image to pdf, pdf optimizer',
            h1: 'Document Studio',
            heroDesc: 'Document Studio brings three everyday document workflows into one browser-based workspace: Document Enhancer for straightening and cleaning photographed papers, Images to PDF for compiling multiple photos into a multi-page PDF, and PDF Optimizer for organizing pages and compressing PDF files.',
            breadcrumb: 'Document Studio',
            path: '/document-enhance'
        },
        '/id-card-print': {
            pageId: 'page-id-studio',
            mode: 'ID',
            navPath: '/id-card-print',
            title: 'ID Card Studio – Print Front & Back ID Card on One A4 Page',
            description: 'Straighten, clean, and align front and back sides of Aadhaar, PAN, or Voter ID cards to standard card dimensions on a single A4 page for printing.',
            keywords: 'id card print, front and back id card print on one page, aadhaar card print layout a4, straighten tilted id card, pvc card size print on a4, csc id card print tool',
            h1: 'ID Card Studio – Dual-Slot Identity Card Framing & A4 Print Layout',
            heroDesc: 'Clean, crop, and align Front and Back ID card sides to exact CR80 card proportions on a single printable A4 layout sheet inside your browser.',
            breadcrumb: 'ID Card Studio',
            path: '/id-card-print'
        },
        '/id-card-studio': {
            pageId: 'page-id-studio',
            mode: 'ID',
            navPath: '/id-card-print',
            canonical: '/id-card-print',
            title: 'ID Card Studio – Print Front & Back ID Card on One A4 Page',
            description: 'Straighten, clean, and align front and back sides of Aadhaar, PAN, or Voter ID cards to standard card dimensions on a single A4 page for printing.',
            keywords: 'id card studio, front and back id card print on one page, aadhaar card print layout a4, straighten tilted id card, pvc card size print on a4, csc id card print tool',
            h1: 'ID Card Studio – Dual-Slot Identity Card Framing & A4 Print Layout',
            breadcrumb: 'ID Card Studio',
            path: '/id-card-print'
        },
        '/image-compress': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'compress',
            navPath: '/image-compress',
            title: 'Compress or Increase Image Size in KB Online | SMART VLE TOOL',
            description: 'Compress or increase image file size to exact KB targets at 300 DPI for SSC, UPSC, PAN, and government job forms directly in your browser.',
            keywords: 'image compress in kb, reduce image size kb, increase image size in kb, 20kb 50kb photo compressor, 300 dpi photo compress',
            h1: 'Compress / Increase Image Size in KB',
            heroDesc: 'Compress or increase JPG, PNG, and WEBP images to exact target KB limits with optional 300 DPI metadata and visual clarity.',
            breadcrumb: 'Compress / Increase KB',
            path: '/image-compress'
        },
        '/photo-resize': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'resize',
            navPath: '/image-compress',
            title: 'Photo & Signature Resizer in Pixels, CM, MM & Inches | SMART VLE TOOL',
            description: 'Resize passport photos, signatures, and application images to exact pixel, centimeter, millimeter, or inch dimensions locally in your browser.',
            keywords: 'photo resize, signature resizer, resize image in pixels cm mm inches, online form photo resizer',
            h1: 'Photo & Signature Resizer',
            heroDesc: 'Resize photos and signatures accurately across Pixels (px), Inches (in), Centimeters (cm), and Millimeters (mm) with aspect ratio locking.',
            breadcrumb: 'Photo & Signature Resizer',
            path: '/photo-resize'
        },
        '/image-crop': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'crop',
            navPath: '/image-compress',
            title: 'Crop, Flip & Rotate Image Online with Precision | SMART VLE TOOL',
            description: 'Crop photos to preset or custom dimensions, trim white margins automatically, flip horizontally/vertically, and rotate by any angle in your browser.',
            keywords: 'image crop online, rotate image custom angle, flip image horizontally vertically, passport size crop',
            h1: 'Crop, Flip & Rotate Image',
            heroDesc: 'Crop images cleanly using interactive handles or exact measurements, flip horizontally or vertically, and straighten tilted images.',
            breadcrumb: 'Crop, Flip & Rotate',
            path: '/image-crop'
        },
        '/image-convert': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'convert',
            navPath: '/image-compress',
            title: 'Image Format Converter – JPG, PNG, WEBP, BMP & AVIF | SMART VLE TOOL',
            description: 'Convert images seamlessly between JPG, PNG, WEBP, BMP, TIFF, and AVIF formats with quality and target KB controls inside your browser.',
            keywords: 'image format converter, png to jpg, webp to jpg, convert image format online',
            h1: 'Image Format Converter',
            heroDesc: 'Convert photos and scanned documents between JPG, PNG, WEBP, BMP, TIFF, and AVIF formats with instant preview and target KB tuning.',
            breadcrumb: 'Format Converter',
            path: '/image-convert'
        },
        '/image-adjust': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'brightness',
            navPath: '/image-compress',
            title: 'Adjust Image Brightness, Contrast & RGB Color Balance | SMART VLE TOOL',
            description: 'Fine-tune photo brightness, contrast, saturation, hue, and Shadows/Midtones/Highlights RGB color balance directly in your web browser.',
            keywords: 'adjust brightness contrast online, image color balance, rgb adjustment photo tool',
            h1: 'Adjust Color & RGB Balance',
            heroDesc: 'Tune brightness, contrast, saturation, hue, and professional Shadows/Midtones/Highlights RGB balance in real time.',
            breadcrumb: 'Adjust Color & RGB',
            path: '/image-adjust'
        },
        '/pdf-watermark': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'pdfwatermark',
            navPath: '/image-compress',
            title: 'PDF Watermark – Add Text or Logo Watermarks to PDF | SMART VLE TOOL',
            description: 'Stamp custom text or logo watermarks onto single or multiple PDF pages with tiled grid or anchor layouts and live browser preview.',
            keywords: 'pdf watermark online, add text watermark to pdf, add logo watermark pdf, confidential pdf stamp',
            h1: 'PDF Watermark Tool',
            heroDesc: 'Apply customizable text or logo watermarks in single-anchor or tiled grids across selected or all PDF pages locally in your browser.',
            breadcrumb: 'PDF Watermark',
            path: '/pdf-watermark'
        },
        '/image-pdf-editor': {
            pageId: 'page-editor-studio',
            mode: 'EDITOR',
            editorTool: 'compress',
            navPath: '/image-compress',
            canonical: '/image-compress',
            title: 'Image Editor – Compress to KB, Resize, Crop, Convert & PDF Watermark',
            description: 'Resize and compress images toward target KB limits at 300 DPI for online forms. Crop, adjust color, convert formats, and apply custom PDF watermarks online.',
            keywords: 'image editor, resize photo in kb, compress image 300 dpi, increase image size in kb, crop image online, convert image format, adjust image brightness contrast, pdf watermark',
            h1: 'Image Editor – Compress to KB, Resize, Crop & Convert',
            breadcrumb: 'Image Editor',
            path: '/image-compress'
        },
        '/passport-photo-maker': {
            pageId: 'page-passport-maker',
            mode: 'PASSPORT',
            navPath: '/passport-photo-maker',
            title: 'Passport Photo Maker – Remove Background & Print Photos Online',
            description: 'Remove photo backgrounds, change background color (white, light blue, cream), crop to passport size, and print photo sheets.',
            keywords: 'passport photo maker, remove background passport photo, passport size photo online, change passport background color',
            h1: 'Passport Photo Maker',
            breadcrumb: 'Passport Photo Maker',
            path: '/passport-photo-maker'
        },
        '/about': {
            pageId: 'page-about',
            navPath: '/about-us',
            title: 'About Us – SMART VLE TOOL Online Utility Platform',
            description: 'Learn about SMART VLE TOOL, an online platform offering practical document scanning, ID card printing, passport photo making and image editing tools.',
            path: '/about-us'
        },
        '/about-us': {
            pageId: 'page-about',
            navPath: '/about-us',
            title: 'About Us – SMART VLE TOOL Online Utility Platform',
            description: 'Learn about SMART VLE TOOL, an online platform offering practical document scanning, ID card printing, passport photo making and image editing tools.',
            path: '/about-us'
        },
        '/contact': {
            pageId: 'page-contact',
            navPath: '/contact-us',
            title: 'Contact Us – SMART VLE TOOL Support & Feedback',
            description: 'Get in touch with the SMART VLE TOOL team for support, feature feedback, technical questions, or general inquiries regarding our utility suite.',
            path: '/contact-us'
        },
        '/contact-us': {
            pageId: 'page-contact',
            navPath: '/contact-us',
            title: 'Contact Us – SMART VLE TOOL Support & Feedback',
            description: 'Get in touch with the SMART VLE TOOL team for support, feature feedback, technical questions, or general inquiries regarding our utility suite.',
            path: '/contact-us'
        },
        '/privacy-policy': {
            pageId: 'page-privacy',
            navPath: '/privacy-policy',
            title: 'Privacy Policy – SMART VLE TOOL Data Protection Practices',
            description: 'Read our transparent privacy policy. Discover how SMART VLE TOOL processes supported files in-browser, local storage data management, and AdSense disclosures.',
            path: '/privacy-policy'
        },
        '/terms-and-conditions': {
            pageId: 'page-terms',
            navPath: '/terms-and-conditions',
            title: 'Terms and Conditions – SMART VLE TOOL',
            description: 'Review the terms and conditions for using SMART VLE TOOL online image editing, scanned document enhancement, and PDF tools.',
            path: '/terms-and-conditions'
        },
        '/copyright-policy': {
            pageId: 'page-copyright',
            navPath: '/copyright-policy',
            title: 'Copyright Policy – SMART VLE TOOL',
            description: 'Review our copyright policy, user ownership of uploaded files, DMCA notice procedures, and intellectual property guidelines.',
            path: '/copyright-policy'
        },
        '/disclaimer': {
            pageId: 'page-disclaimer',
            navPath: '/disclaimer',
            title: 'Disclaimer – SMART VLE TOOL',
            description: 'Important legal and utility disclaimer regarding document processing quality, non-affiliation with government entities, and user verification responsibilities.',
            path: '/disclaimer'
        }
    };

    const DOC_SUBTOOL_URLS = {
        scanner: '/document-enhance',
        img2pdf: '/image-to-pdf',
        pdfcompress: '/pdf-compress'
    };

    const EDITOR_TOOL_URLS = {
        compress: '/image-compress',
        resize: '/photo-resize',
        crop: '/image-crop',
        convert: '/image-convert',
        brightness: '/image-adjust',
        pdfwatermark: '/pdf-watermark'
    };

    let currentRoutePath = '/';
    let _spaHistoryCount = 0;

    function normalizePath(pathname) {
        if (!pathname) return '/';
        let p = pathname.trim();
        if (p.length > 1 && p.endsWith('/')) {
            p = p.slice(0, -1);
        }
        return p || '/';
    }

    function parseUrl(rawUrl) {
        let urlStr = rawUrl || (window.location.pathname + window.location.search + window.location.hash);
        let [beforeHash, hashPart] = urlStr.split('#');
        let [pathPart, searchPart] = beforeHash.split('?');
        let pathname = normalizePath(pathPart || '/');
        let search = searchPart ? '?' + searchPart : '';
        let hash = hashPart ? '#' + hashPart : '';
        return { pathname, search, hash };
    }

    function resolveToolRoute(pathname, search) {
        const params = search ? new URLSearchParams(search) : null;
        const requestedTool = params ? (params.get('tool') || '') : '';

        if (pathname === '/document-studio') {
            if (requestedTool === 'img2pdf') return { route: ROUTES['/image-to-pdf'], resolvedPath: '/document-studio', canonicalPath: '/image-to-pdf' };
            if (requestedTool === 'pdfcompress') return { route: ROUTES['/pdf-compress'], resolvedPath: '/document-studio', canonicalPath: '/pdf-compress' };
            if (requestedTool === 'pdfwatermark') return { route: ROUTES['/pdf-watermark'], resolvedPath: '/pdf-watermark', canonicalPath: '/pdf-watermark', redirectUrl: '/pdf-watermark' };
            return { route: ROUTES['/document-studio'], resolvedPath: '/document-studio', canonicalPath: '/document-enhance' };
        }

        if (pathname === '/image-pdf-editor') {
            if (requestedTool === 'img2pdf') return { route: ROUTES['/image-to-pdf'], resolvedPath: '/image-to-pdf', canonicalPath: '/image-to-pdf', redirectUrl: '/image-to-pdf' };
            if (requestedTool === 'pdfcompress') return { route: ROUTES['/pdf-compress'], resolvedPath: '/pdf-compress', canonicalPath: '/pdf-compress', redirectUrl: '/pdf-compress' };
            const normalized = requestedTool === 'watermark' ? 'pdfwatermark' : requestedTool;
            if (normalized && EDITOR_TOOL_URLS[normalized]) {
                const targetSlug = EDITOR_TOOL_URLS[normalized];
                return { route: ROUTES[targetSlug], resolvedPath: '/image-pdf-editor', canonicalPath: targetSlug };
            }
            return { route: ROUTES['/image-pdf-editor'], resolvedPath: '/image-pdf-editor', canonicalPath: '/image-compress' };
        }

        const matched = ROUTES[pathname] || null;
        return {
            route: matched,
            resolvedPath: matched ? pathname : pathname,
            canonicalPath: matched ? (matched.canonical || matched.path || pathname) : pathname,
            isNotFound: !matched
        };
    }

    function setRobotsMeta(content) {
        let metaRobots = document.querySelector('meta[name="robots"]');
        if (!content) {
            if (metaRobots) metaRobots.remove();
            return;
        }
        if (!metaRobots) {
            metaRobots = document.createElement('meta');
            metaRobots.name = 'robots';
            document.head.appendChild(metaRobots);
        }
        metaRobots.content = content;
    }

    function renderNotFoundView(requestedPath) {
        const cleanReq = normalizePath(requestedPath || window.location.pathname || '/');
        document.querySelectorAll('.page-view').forEach(p => p.classList.add('hidden'));
        const sharedWs = document.getElementById('shared-studio-workspace') || document.getElementById('page-studio-workspace');
        if (sharedWs) {
            sharedWs.classList.add('hidden');
            sharedWs.style.display = 'none';
        }
        const nfPage = document.getElementById('page-not-found');
        if (nfPage) {
            nfPage.classList.remove('hidden');
            const pathCode = document.getElementById('not-found-path');
            if (pathCode) pathCode.textContent = cleanReq;
        }
        document.title = '404 – Page Not Found | SMART VLE TOOL';
        setRobotsMeta('noindex, nofollow');
        updateNavHighlights('');
        currentRoutePath = cleanReq;
    }

    function updatePageHeroDetails(pageEl, routeInfo) {
        if (!pageEl || !routeInfo) return;
        if (routeInfo.breadcrumb) {
            const bc = pageEl.querySelector('.breadcrumb-current');
            if (bc) bc.textContent = routeInfo.breadcrumb;
        }
        if (routeInfo.h1) {
            const h1 = pageEl.querySelector('.tool-intro-h1, h1');
            if (h1) h1.textContent = routeInfo.h1;
        }
        if (routeInfo.heroDesc) {
            const desc = pageEl.querySelector('.tool-intro-desc, .tool-hero-content .section-subtitle');
            if (desc) desc.textContent = routeInfo.heroDesc;
        }
    }

    function updateMetaTags(routeInfo, canonicalOverride) {
        document.title = routeInfo.title;

        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.name = 'description';
            document.head.appendChild(metaDesc);
        }
        metaDesc.content = routeInfo.description;

        if (routeInfo.keywords) {
            let metaKw = document.querySelector('meta[name="keywords"]');
            if (!metaKw) {
                metaKw = document.createElement('meta');
                metaKw.name = 'keywords';
                document.head.appendChild(metaKw);
            }
            metaKw.content = routeInfo.keywords;
        }

        const canonicalUrl = config.getCanonicalUrl(canonicalOverride || routeInfo.canonical || routeInfo.path || '/');

        let canonicalLink = document.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
            canonicalLink = document.createElement('link');
            canonicalLink.rel = 'canonical';
            document.head.appendChild(canonicalLink);
        }
        canonicalLink.href = canonicalUrl;

        // OpenGraph
        let ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = routeInfo.title;
        let ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = routeInfo.description;
        let ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.content = canonicalUrl;

        // Twitter
        let twTitle = document.querySelector('meta[name="twitter:title"]');
        if (twTitle) twTitle.content = routeInfo.title;
        let twDesc = document.querySelector('meta[name="twitter:description"]');
        if (twDesc) twDesc.content = routeInfo.description;
    }

    function updateNavHighlights(path) {
        const routeObj = ROUTES[path];
        const effectiveNav = (routeObj && routeObj.navPath) || path;
        const links = document.querySelectorAll('.site-nav-link');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            const linkPath = parseUrl(href).pathname;
            const linkRoute = ROUTES[linkPath];
            const linkNav = (linkRoute && linkRoute.navPath) || linkPath;
            const isMatch = (linkNav === effectiveNav);
            if (isMatch) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    function scrollToHash(hash) {
        if (!hash) return;
        const targetId = hash.replace(/^#/, '');
        setTimeout(() => {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                const detailsEl = targetEl.matches('details')
                    ? targetEl
                    : targetEl.querySelector('details.tutorial-collapse-card');
                if (detailsEl && !detailsEl.open) {
                    detailsEl.open = true;
                }
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 80);
    }

    function mountStudioTool(routeInfo) {
        const workspace = document.getElementById('shared-studio-workspace') || document.getElementById('page-studio-workspace');
        if (!workspace || !routeInfo || !routeInfo.mode) return;

        let targetMountId = null;
        if (routeInfo.mode === 'DOC') targetMountId = 'tool-stage-doc';
        else if (routeInfo.mode === 'ID') targetMountId = 'tool-stage-id';
        else if (routeInfo.mode === 'EDITOR') targetMountId = 'tool-stage-editor';

        if (!targetMountId) return;

        const mountEl = document.getElementById(targetMountId);
        if (mountEl && workspace.parentElement !== mountEl) {
            mountEl.appendChild(workspace);
        }
        workspace.classList.remove('hidden');
        workspace.style.display = 'block';

        window._monuSyncingRoute = true;
        try {
            if (typeof window.switchMode === 'function') {
                window.switchMode(routeInfo.mode);
            }

            if (routeInfo.mode === 'DOC') {
                const sub = (routeInfo.subTool === 'img2pdf' || routeInfo.subTool === 'pdfcompress') ? routeInfo.subTool : 'scanner';
                if (typeof window.switchDocStudioTool === 'function') {
                    window.switchDocStudioTool(sub, null, true);
                }
            } else if (routeInfo.mode === 'EDITOR' && typeof window.switchTool === 'function') {
                const validTools = ['compress', 'resize', 'crop', 'convert', 'brightness', 'pdfwatermark'];
                const targetTool = validTools.includes(routeInfo.editorTool) ? routeInfo.editorTool : 'compress';
                window.switchTool(targetTool, null, true);
            }
        } finally {
            window._monuSyncingRoute = false;
        }
    }

    function syncToolRoute(targetUrl) {
        if (window._monuSyncingRoute) return;
        const cleanTarget = normalizePath(targetUrl);
        const route = ROUTES[cleanTarget];
        if (!route) return;

        const targetPage = document.getElementById(route.pageId);
        if (targetPage) {
            updatePageHeroDetails(targetPage, route);
        }
        updateMetaTags(route, route.canonical || route.path || cleanTarget);
        updateNavHighlights(cleanTarget);

        if (currentRoutePath !== cleanTarget || window.location.pathname !== cleanTarget) {
            currentRoutePath = cleanTarget;
            window.history.pushState({ path: cleanTarget, search: '', hash: '' }, route.title, cleanTarget);
            _spaHistoryCount++;
        }
    }

    function initVisibleAds(rootEl) {
        const runInit = function () {
            const scope = rootEl || document;
            try {
                const pendingAds = scope.querySelectorAll('ins.adsbygoogle:not([data-adsbygoogle-status]):not([data-monu-ad-pushed])');
                pendingAds.forEach(ins => {
                    if (ins.closest('.hidden, .page-view.hidden')) return;
                    const parent = ins.parentElement;
                    const rectWidth = Math.floor((ins.getBoundingClientRect && ins.getBoundingClientRect().width) || 0);
                    const width = Math.max(ins.offsetWidth || 0, rectWidth);
                    const parentRectWidth = parent ? Math.floor((parent.getBoundingClientRect && parent.getBoundingClientRect().width) || 0) : 0;
                    const parentWidth = parent ? Math.max(parent.clientWidth || 0, parentRectWidth) : 0;
                    if (ins.offsetParent !== null && width > 0 && parentWidth > 0) {
                        ins.setAttribute('data-monu-ad-pushed', '1');
                        try {
                            (window.adsbygoogle = window.adsbygoogle || []).push({});
                        } catch (pushErr) {
                            console.warn('AdSense push skipped:', pushErr);
                        }
                    }
                });
            } catch (adErr) {
                console.warn('AdSense init skipped:', adErr);
            }
        };

        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(runInit);
        } else {
            setTimeout(runInit, 0);
        }
    }

    function navigateTo(url, push = true) {
        const { pathname, search, hash } = parseUrl(url);
        const resolution = resolveToolRoute(pathname, search);
        if (resolution.redirectUrl) {
            return navigateTo(resolution.redirectUrl + (hash || ''), push);
        }
        if (resolution.isNotFound || !resolution.route) {
            if (push && (window.location.pathname + window.location.search + window.location.hash) !== url) {
                window.history.pushState({ path: pathname, search: search, hash: hash }, '404 – Page Not Found | SMART VLE TOOL', url);
                _spaHistoryCount++;
            }
            renderNotFoundView(pathname);
            return;
        }

        setRobotsMeta(null);
        const route = resolution.route;
        const resolvedPath = resolution.resolvedPath;

        // Hide all page views
        const pages = document.querySelectorAll('.page-view');
        pages.forEach(p => p.classList.add('hidden'));

        // Show target page
        const targetPage = document.getElementById(route.pageId);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            updatePageHeroDetails(targetPage, route);
            initVisibleAds(targetPage);
        } else {
            window.location.href = url;
            return;
        }

        // Mount shared studio workspace or refresh Passport canvas
        if (route.mode === 'DOC' || route.mode === 'ID' || route.mode === 'EDITOR') {
            mountStudioTool(route);
        } else if (route.mode === 'PASSPORT') {
            if (typeof window.checkPendingPassportTransfer === 'function') {
                window.checkPendingPassportTransfer();
            }
            if (typeof window.renderPassportCanvas === 'function') {
                window.renderPassportCanvas();
            }
        }

        // Update URL & Meta
        currentRoutePath = resolvedPath;
        const cleanTargetHash = (hash === '#explore-our-tools') ? '' : (hash || '');
        const fullTargetUrl = resolvedPath + search + cleanTargetHash;
        if (push && (window.location.pathname + window.location.search + window.location.hash) !== fullTargetUrl) {
            window.history.pushState({ path: resolvedPath, search: search, hash: cleanTargetHash }, route.title, fullTargetUrl);
            _spaHistoryCount++;
        } else if (!push && (hash === '#explore-tools' || hash === '#explore-our-tools') && resolvedPath === '/') {
            window.history.replaceState({ path: '/', search: '', hash: '' }, route.title, '/');
        }

        updateMetaTags(route, resolution.canonicalPath);
        updateNavHighlights(resolvedPath);

        // Close mobile drawer if open
        const mobileDrawer = document.getElementById('mobileNavDrawer');
        if (mobileDrawer) mobileDrawer.classList.remove('open');

        // Scroll to hash target on explicit navigation, otherwise scroll to top on load/reload
        if (hash && (push || (hash !== '#explore-tools' && hash !== '#explore-our-tools'))) {
            scrollToHash(hash === '#explore-tools' ? '#explore-our-tools' : hash);
        } else {
            window.scrollTo({ top: 0, behavior: push ? 'smooth' : 'auto' });
        }

        // If navigating to privacy policy, refresh storage statistics
        if (resolvedPath === '/privacy-policy') {
            setTimeout(refreshPrivacyStorageStats, 100);
        }
    }

    function openStudioWorkspace(mode) {
        const activeRoute = ROUTES[currentRoutePath];
        const alreadyOnSameStudio = !!(activeRoute && activeRoute.mode === mode);
        const targetUrl = alreadyOnSameStudio
            ? currentRoutePath
            : ((mode === 'ID') ? '/id-card-print'
                : (mode === 'EDITOR' ? '/image-compress'
                : (mode === 'PASSPORT' ? '/passport-photo-maker' : '/document-enhance')));
        const needsNav = !alreadyOnSameStudio;
        if (needsNav) {
            navigateTo(targetUrl, true);
        }
        setTimeout(() => {
            const toolEl = (mode === 'PASSPORT')
                ? (document.getElementById('passport-main-workspace') || document.getElementById('passportWorkspace'))
                : (document.getElementById('shared-studio-workspace') || document.querySelector('.page-view:not(.hidden) .tool-live-section') || document.querySelector('.tool-embed-wrapper'));
            if (toolEl) {
                toolEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, needsNav ? 120 : 30);
    }

    function closeStudioWorkspace(shouldNavigate = true) {
        if (shouldNavigate) {
            navigateTo('/', true);
        }
    }

    function updateWorkspaceTopGuide(mode) {
        return;
    }

    // ═══ HONEST CONTACT FORM HANDLER ═══
    function initContactForm() {
        const form = document.getElementById('monuContactForm');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            const name = (document.getElementById('cf-name')?.value || '').trim();
            const email = (document.getElementById('cf-email')?.value || '').trim();
            const subject = (document.getElementById('cf-subject')?.value || '').trim();
            const message = (document.getElementById('cf-message')?.value || '').trim();
            const honeypot = (document.getElementById('cf-honeypot')?.value || '').trim();
            const statusEl = document.getElementById('cf-status-msg');

            if (!statusEl) return;

            // Anti-spam honeypot detection
            if (honeypot.length > 0) {
                statusEl.innerHTML = '<div style="color:#ef4444; font-weight:700; padding:10px; background:#fef2f2; border-radius:8px;">Spam detected. Please retry.</div>';
                return;
            }

            if (!name || !email || !message) {
                statusEl.innerHTML = '<div style="color:#ef4444; font-weight:700; padding:10px; background:#fef2f2; border-radius:8px;">Please fill in your name, email address, and message.</div>';
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                statusEl.innerHTML = '<div style="color:#ef4444; font-weight:700; padding:10px; background:#fef2f2; border-radius:8px;">Please enter a valid email address.</div>';
                return;
            }

            const basePlatformUrl = config.getBaseUrl() || 'https://smartvletool.in';
            const emailSubject = subject ? `[SMART VLE TOOL Inquiry] ${subject}` : `[SMART VLE TOOL Inquiry] from ${name}`;
            const emailBody = `Hello SMART VLE TOOL Support Team,\n\nFrom: ${name} (${email})\nSubject: ${subject || 'General Assistance'}\n\nMessage:\n${message}\n\n---\nSent via SMART VLE TOOL Web Platform (${basePlatformUrl})`;

            const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

            try {
                window.location.href = mailtoUrl;
            } catch (err) {
                console.warn('Mailto launch:', err);
            }

            window._lastContactMessage = `To: ${SUPPORT_EMAIL}\nSubject: ${emailSubject}\n\n${emailBody}`;

            statusEl.innerHTML = `
                <div class="contact-feedback-card" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px; margin-top:12px;">
                    <div class="contact-feedback-title" style="font-size:15px; font-weight:800; color:#166534; margin-bottom:6px;">
                        <span>✉️ Action Required: Send via Email Client</span>
                    </div>
                    <div class="contact-feedback-desc" style="font-size:13.5px; color:#15803d; line-height:1.5;">
                        Your default email client has been launched with your message pre-filled to <strong>${SUPPORT_EMAIL}</strong>. If your email application did not open automatically, click the button below or copy your formatted message:
                    </div>
                    <div class="contact-feedback-actions" style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                        <a href="${mailtoUrl}" class="btn-primary-hero" style="font-size:13px; padding:8px 14px;">Open Email App</a>
                        <button type="button" class="btn-secondary-hero" style="font-size:13px; padding:8px 14px;" onclick="MonuRouter.copyContactMessage()">Copy Formatted Message</button>
                    </div>
                    <div id="cf-copy-notice" style="display:none; margin-top:8px; font-size:12px; font-weight:700; color:#15803d;">
                        ✓ Message copied to clipboard! You can paste it into Gmail, Outlook, or any webmail provider.
                    </div>
                </div>
            `;
        });
    }

    function copyContactMessage() {
        if (!window._lastContactMessage) return;
        navigator.clipboard.writeText(window._lastContactMessage).then(() => {
            const notice = document.getElementById('cf-copy-notice');
            if (notice) notice.style.display = 'block';
        }).catch(err => {
            console.warn('Clipboard copy error:', err);
        });
    }

    // ═══ PRIVACY & LOCAL DATA MANAGEMENT ═══
    async function refreshPrivacyStorageStats() {
        if (!window.MonuStorageManager) return;
        const summary = await window.MonuStorageManager.getStorageSummary();
        const docEl = document.getElementById('privacy-doc-count');
        const idEl = document.getElementById('privacy-id-count');
        const editorEl = document.getElementById('privacy-editor-count');
        if (docEl) docEl.textContent = summary.docCount;
        if (idEl) idEl.textContent = summary.idSetCount;
        if (editorEl) editorEl.textContent = summary.editorProjectCount;
    }

    function promptClearAllData() {
        const modal = document.getElementById('confirmClearDataModal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            if (confirm('Are you sure you want to delete all locally stored documents, ID cards, and editor projects from your browser? This action permanently removes local storage data.')) {
                executeClearAllData();
            }
        }
    }

    function closeClearDataModal() {
        const modal = document.getElementById('confirmClearDataModal');
        if (modal) modal.style.display = 'none';
    }

    async function executeClearAllData() {
        closeClearDataModal();
        const statusEl = document.getElementById('privacy-clear-status');
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#b621fe; font-weight:700;">Clearing local IndexedDB, LocalStorage, and Cache Storage...</span>';
        }
        if (window.MonuStorageManager) {
            const result = await window.MonuStorageManager.clearAllData();
            if (statusEl) {
                if (result.success) {
                    statusEl.innerHTML = `<span style="color:#10b981; font-weight:700;">✓ ${result.details || 'All locally stored documents, ID sets, and editor data have been successfully deleted from your browser.'}</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color:#ef4444; font-weight:700;">Partial cleanup complete: ${result.details}</span>`;
                }
            }
            refreshPrivacyStorageStats();
        }
    }

    // ═══ INITIALIZE ROUTER & LISTENERS ═══
    function initRouter() {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        // Intercept internal link clicks with hash support
        document.addEventListener('click', function (e) {
            const link = e.target.closest('a[data-link], a.site-nav-link, a.btn-tool-guide, a.footer-link, a.breadcrumb-link, a.hero-anchor, a.btn-secondary-hero, a[href^="#"]');
            if (link) {
                const href = link.getAttribute('href');
                if (href && (href.startsWith('/') || href.startsWith('#')) && !href.startsWith('//')) {
                    const { pathname, search, hash } = parseUrl(href);

                    // If same page with hash anchor (and no conflicting query), scroll smoothly without full reload
                    if (pathname === currentRoutePath && !search && hash) {
                        e.preventDefault();
                        const resolvedHash = (hash === '#explore-tools') ? '#explore-our-tools' : hash;
                        scrollToHash(resolvedHash);
                        if (resolvedHash !== '#explore-our-tools') {
                            window.history.pushState({ path: pathname, hash: resolvedHash }, document.title, pathname + resolvedHash);
                        }
                        return;
                    }

                    // Internal route navigation
                    e.preventDefault();
                    navigateTo(href, true);
                }
            }
        });

        // Handle Browser Back / Forward buttons
        window.addEventListener('popstate', function () {
            navigateTo(window.location.pathname + window.location.search + window.location.hash, false);
        });

        // Handle URL hash changes
        window.addEventListener('hashchange', function () {
            scrollToHash(window.location.hash);
        });

        // Initialize FAQ accordions
        initFaqAccordions();

        // Initialize Contact Form
        initContactForm();

        // Dynamic Year in Footer
        const yearEl = document.getElementById('current-year');
        if (yearEl) {
            yearEl.textContent = new Date().getFullYear();
        }

        // Mobile Menu Button
        const mobileBtn = document.getElementById('mobileMenuBtn');
        const mobileDrawer = document.getElementById('mobileNavDrawer');
        if (mobileBtn && mobileDrawer) {
            mobileBtn.addEventListener('click', function () {
                mobileDrawer.classList.toggle('open');
            });
        }

        // Check for workspace URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('workspace')) {
            const requestedMode = urlParams.get('workspace') || 'DOC';
            openStudioWorkspace(requestedMode);
            return;
        }

        // Handle GitHub Pages 404 fallback redirect query param if present
        if (urlParams.has('p')) {
            const redirectPath = urlParams.get('p') || '/';
            const cleanTarget = normalizePath(redirectPath);
            const parsedRedirect = parseUrl(cleanTarget);
            if (ROUTES[parsedRedirect.pathname]) {
                window.history.replaceState({ path: parsedRedirect.pathname }, '', cleanTarget + window.location.hash);
            } else {
                renderNotFoundView(parsedRedirect.pathname);
                return;
            }
        }

        // Initial Route Resolution on Load
        const initialFullUrl = window.location.pathname + window.location.search + window.location.hash;
        const parsed = parseUrl(initialFullUrl);
        if (ROUTES[parsed.pathname]) {
            navigateTo(initialFullUrl, false);
        } else {
            renderNotFoundView(parsed.pathname);
        }

        // Re-check visible ads once full page layout / CSS completes and on resize >= 1200px
        window.addEventListener('load', function () {
            const activePage = document.querySelector('.page-view:not(.hidden)') || document;
            initVisibleAds(activePage);
        });

        let _adResizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(_adResizeTimer);
            _adResizeTimer = setTimeout(function () {
                const activePage = document.querySelector('.page-view:not(.hidden)') || document;
                initVisibleAds(activePage);
            }, 250);
        });
    }

    function initFaqAccordions() {
        document.addEventListener('click', function (e) {
            const questionBtn = e.target.closest('.faq-question-btn');
            if (!questionBtn) return;

            const item = questionBtn.closest('.faq-item');
            if (!item) return;

            const isActive = item.classList.contains('active');

            // Close other items in the same container
            const container = item.closest('.faq-list');
            if (container) {
                container.querySelectorAll('.faq-item').forEach(el => {
                    if (el !== item) el.classList.remove('active');
                });
            }

            item.classList.toggle('active', !isActive);
            questionBtn.setAttribute('aria-expanded', !isActive);
        });
    }

    function canGoBack() {
        return _spaHistoryCount > 0 || (window.history && window.history.length > 1);
    }

    function goBack() {
        if (!canGoBack()) return false;
        if (_spaHistoryCount > 0) _spaHistoryCount--;
        window.history.back();
        return true;
    }

    // Expose globals for onclick bindings in HTML
    window.navigateTo = navigateTo;
    window.MonuRouter = {
        navigateTo,
        openStudioWorkspace,
        closeStudioWorkspace,
        mountStudioTool,
        syncToolRoute,
        updateWorkspaceTopGuide,
        copyContactMessage,
        promptClearAllData,
        closeClearDataModal,
        executeClearAllData,
        refreshPrivacyStorageStats,
        canGoBack,
        goBack,
        DOC_SUBTOOL_URLS,
        EDITOR_TOOL_URLS
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRouter);
    } else {
        initRouter();
    }
})();
