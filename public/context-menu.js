/**
 * SMART VLE TOOL - Professional Custom Right-Click Context Menu
 * Provides quick navigation, active tool reset/clear actions with safety confirmations,
 * selective browser storage cleanup (without touching browser HTTP cache/cookies),
 * and context-sensitive options for images and links.
 */
(function () {
    'use strict';

    if (window.__svtContextMenuInit) return;
    window.__svtContextMenuInit = true;

    let menuEl = null;
    let dialogBackdrop = null;
    let toastTimer = null;
    let lastPointerType = 'mouse';
    let lastRightClickTrigger = null;

    document.addEventListener('pointerdown', (e) => {
        if (e && e.pointerType) lastPointerType = e.pointerType;
    }, { capture: true, passive: true });

    function showToast(msg) {
        let existing = document.getElementById('svt-ctx-toast');
        if (existing) existing.remove();
        if (toastTimer) clearTimeout(toastTimer);
        const el = document.createElement('div');
        el.id = 'svt-ctx-toast';
        el.className = 'svt-toast';
        el.setAttribute('role', 'status');
        el.textContent = msg;
        document.body.appendChild(el);
        toastTimer = setTimeout(() => {
            if (el.parentNode) el.remove();
        }, 2800);
    }

    async function copyTextSafe(text) {
        if (!text) return false;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (_) {}
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_) {
            return false;
        }
    }

    function openUrlInNewTab(rawUrl) {
        if (!rawUrl) return;
        let targetHref = rawUrl;
        let revokeAfter = false;
        try {
            if (rawUrl.startsWith('data:')) {
                const parts = rawUrl.split(',');
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                const bstr = atob(parts[1] || '');
                const u8 = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                const blob = new Blob([u8], { type: mime });
                targetHref = URL.createObjectURL(blob);
                revokeAfter = true;
            }
            const a = document.createElement('a');
            a.href = targetHref;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (revokeAfter) {
                setTimeout(() => URL.revokeObjectURL(targetHref), 15000);
            }
        } catch (err) {
            console.warn('Open in new tab failed:', err);
        }
    }

    function navigateApp(url) {
        const current = window.location.pathname || '/';
        if (url === '/#explore-our-tools' && (current === '/' || !document.getElementById('page-home')?.classList.contains('hidden'))) {
            const target = document.getElementById('explore-our-tools');
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
        if (window.MonuRouter && typeof window.MonuRouter.navigateTo === 'function') {
            window.MonuRouter.navigateTo(url, true);
            return;
        }
        window.location.href = url;
    }

    function getActivePageInfo() {
        const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        const visiblePage = document.querySelector('.page-view:not(.hidden)');
        const pageId = visiblePage ? visiblePage.id : '';

        if (path === '/document-studio' || pageId === 'page-doc-studio') {
            const sub = window._docStudioActiveSubTool || 'scanner';
            if (sub === 'img2pdf') {
                return { kind: 'doc-img2pdf', label: 'Images to PDF', tutorialId: 'doc-tutorial' };
            }
            if (sub === 'pdfcompress') {
                return { kind: 'doc-pdfcompress', label: 'PDF Optimizer', tutorialId: 'doc-tutorial' };
            }
            return { kind: 'doc-scanner', label: 'Document Scanner', tutorialId: 'doc-tutorial' };
        }
        if (path === '/id-card-studio' || pageId === 'page-id-studio') {
            return { kind: 'id-studio', label: 'ID Card Studio', tutorialId: 'id-tutorial' };
        }
        if (path === '/image-pdf-editor' || pageId === 'page-editor-studio') {
            const label = window.TOOL === 'pdfwatermark' ? 'PDF Watermark' : 'Image Editor';
            return { kind: 'image-editor', label, tutorialId: 'editor-tutorial' };
        }
        if (path === '/passport-photo-maker' || pageId === 'page-passport-maker') {
            return { kind: 'passport-maker', label: 'Passport Photo Maker', tutorialId: 'passport-technical-overview' };
        }
        return { kind: 'static', label: null, tutorialId: 'tutorial-videos' };
    }

    function findTutorialTarget() {
        const info = getActivePageInfo();
        const candidateIds = [info.tutorialId, 'doc-tutorial', 'id-tutorial', 'editor-tutorial', 'passport-technical-overview', 'tutorial-videos'];
        for (const id of candidateIds) {
            if (!id) continue;
            const el = document.getElementById(id);
            if (el && !el.closest('.page-view.hidden')) {
                return { element: el, url: null };
            }
        }
        return { element: null, url: '/#tutorial-videos' };
    }

    function hasActiveToolUnsavedWork(info) {
        if (!info || info.kind === 'static') return false;
        if (info.kind === 'doc-scanner') {
            return typeof window.hasDocOrIdWork === 'function' && window.hasDocOrIdWork('DOC');
        }
        if (info.kind === 'id-studio') {
            return typeof window.hasDocOrIdWork === 'function' && window.hasDocOrIdWork('ID');
        }
        if (info.kind === 'doc-img2pdf') {
            return typeof window.hasEditorToolWork === 'function' && window.hasEditorToolWork('img2pdf');
        }
        if (info.kind === 'doc-pdfcompress') {
            return typeof window.hasEditorToolWork === 'function' && window.hasEditorToolWork('pdfcompress');
        }
        if (info.kind === 'image-editor') {
            return typeof window.hasEditorToolWork === 'function' && window.hasEditorToolWork();
        }
        if (info.kind === 'passport-maker') {
            return typeof window.hasPassportWork === 'function' && window.hasPassportWork();
        }
        return false;
    }

    function executeResetCurrentTool(info) {
        if (!info || info.kind === 'static') return;
        if (info.kind === 'doc-scanner' && typeof window.resetActiveDocOrIdTool === 'function') {
            window.resetActiveDocOrIdTool('DOC');
            showToast('Document Scanner reset to initial settings.');
        } else if (info.kind === 'id-studio' && typeof window.resetActiveDocOrIdTool === 'function') {
            window.resetActiveDocOrIdTool('ID');
            showToast('ID Card Studio reset to initial settings.');
        } else if (info.kind === 'doc-img2pdf' && typeof window.resetActiveEditorTool === 'function') {
            window.resetActiveEditorTool('img2pdf');
            showToast('Images to PDF settings reset.');
        } else if (info.kind === 'doc-pdfcompress' && typeof window.resetActiveEditorTool === 'function') {
            window.resetActiveEditorTool('pdfcompress');
            showToast('PDF Optimizer settings reset.');
        } else if (info.kind === 'image-editor' && typeof window.resetActiveEditorTool === 'function') {
            window.resetActiveEditorTool();
            showToast(`${info.label} reset to initial state.`);
        } else if (info.kind === 'passport-maker') {
            if (typeof window.resetPassportEdits === 'function') {
                window.resetPassportEdits();
            } else {
                if (typeof window.resetPassportFraming === 'function') window.resetPassportFraming();
                if (typeof window.resetPassportSlidersOnly === 'function') window.resetPassportSlidersOnly();
            }
            showToast('Passport Photo Maker adjustments reset.');
        }
    }

    function executeClearCurrentWork(info) {
        if (!info || info.kind === 'static') return;
        if (info.kind === 'doc-scanner' && typeof window.clearActiveDocOrIdWork === 'function') {
            window.clearActiveDocOrIdWork('DOC');
            showToast('Document Scanner workspace cleared.');
        } else if (info.kind === 'id-studio' && typeof window.clearActiveDocOrIdWork === 'function') {
            window.clearActiveDocOrIdWork('ID');
            showToast('ID Card Studio workspace cleared.');
        } else if (info.kind === 'doc-img2pdf' && typeof window.clearActiveEditorWork === 'function') {
            window.clearActiveEditorWork('img2pdf');
            showToast('Images to PDF queue cleared.');
        } else if (info.kind === 'doc-pdfcompress' && typeof window.clearActiveEditorWork === 'function') {
            window.clearActiveEditorWork('pdfcompress');
            showToast('PDF Optimizer workspace cleared.');
        } else if (info.kind === 'image-editor' && typeof window.clearActiveEditorWork === 'function') {
            window.clearActiveEditorWork();
            showToast(`${info.label} workspace cleared.`);
        } else if (info.kind === 'passport-maker' && typeof window.clearPassportWork === 'function') {
            window.clearPassportWork();
            showToast('Passport Photo Maker cleared.');
        }
    }

    function ensureDialogBackdrop() {
        if (dialogBackdrop && document.body.contains(dialogBackdrop)) return dialogBackdrop;
        dialogBackdrop = document.createElement('div');
        dialogBackdrop.id = 'svt-dialog-backdrop';
        dialogBackdrop.setAttribute('role', 'dialog');
        dialogBackdrop.setAttribute('aria-modal', 'true');
        dialogBackdrop.addEventListener('click', (e) => {
            if (e.target === dialogBackdrop) closeDialog();
        });
        document.body.appendChild(dialogBackdrop);
        return dialogBackdrop;
    }

    function closeDialog() {
        if (dialogBackdrop) {
            dialogBackdrop.classList.remove('open');
            dialogBackdrop.innerHTML = '';
        }
    }

    function openConfirmDialog({ title, warningText, message, confirmLabel, danger, onConfirm }) {
        const bd = ensureDialogBackdrop();
        bd.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'svt-dialog-card';

        const header = document.createElement('div');
        header.className = 'svt-dialog-header';
        const h3 = document.createElement('h3');
        h3.textContent = title;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'svt-dialog-close';
        closeBtn.setAttribute('aria-label', 'Close dialog');
        closeBtn.textContent = '×';
        closeBtn.onclick = closeDialog;
        header.appendChild(h3);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'svt-dialog-body';
        if (warningText) {
            const warn = document.createElement('div');
            warn.className = 'svt-dialog-warning';
            warn.textContent = warningText;
            body.appendChild(warn);
        }
        const p = document.createElement('p');
        p.style.margin = '0';
        p.textContent = message;
        body.appendChild(p);

        const footer = document.createElement('div');
        footer.className = 'svt-dialog-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'svt-dialog-btn svt-dialog-btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = closeDialog;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'svt-dialog-btn ' + (danger ? 'svt-dialog-btn-danger' : 'svt-dialog-btn-confirm');
        confirmBtn.textContent = confirmLabel || 'Confirm';
        confirmBtn.onclick = () => {
            closeDialog();
            if (typeof onConfirm === 'function') onConfirm();
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        bd.appendChild(card);
        bd.classList.add('open');
        cancelBtn.focus();
    }

    async function openClearSavedDataDialog() {
        const bd = ensureDialogBackdrop();
        bd.innerHTML = '';

        let summary = { docCount: 0, idSetCount: 0, editorProjectCount: 0, prefCount: 0 };
        if (window.MonuStorageManager && typeof window.MonuStorageManager.getDetailedStorageSummary === 'function') {
            try {
                summary = await window.MonuStorageManager.getDetailedStorageSummary();
            } catch (_) {}
        }

        const card = document.createElement('div');
        card.className = 'svt-dialog-card';

        const header = document.createElement('div');
        header.className = 'svt-dialog-header';
        const h3 = document.createElement('h3');
        h3.textContent = 'Clear Saved Website Data';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'svt-dialog-close';
        closeBtn.setAttribute('aria-label', 'Close dialog');
        closeBtn.textContent = '×';
        closeBtn.onclick = closeDialog;
        header.appendChild(h3);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'svt-dialog-body';

        const warn = document.createElement('div');
        warn.className = 'svt-dialog-warning';
        warn.textContent = 'Warning: Clearing saved data will permanently remove the selected SmartVLETool saved settings, saved ID card sets, or saved studio sessions from this browser. Browser HTTP cache, cookies, and other websites are never affected.';
        body.appendChild(warn);

        const intro = document.createElement('div');
        intro.style.fontWeight = '700';
        intro.style.fontSize = '12.5px';
        intro.style.color = '#1e293b';
        intro.textContent = 'Select what website data you want to remove:';
        body.appendChild(intro);

        const categories = [
            {
                key: 'docSession',
                title: 'Document Studio Saved Session',
                meta: `${summary.docCount} saved document image${summary.docCount === 1 ? '' : 's'} & scan state`,
                checked: summary.docCount > 0
            },
            {
                key: 'idSets',
                title: 'ID Card Studio Saved Sets & Session',
                meta: `${summary.idSetCount} saved ID card set${summary.idSetCount === 1 ? '' : 's'} & slot previews`,
                checked: summary.idSetCount > 0
            },
            {
                key: 'editorProjects',
                title: 'Image Editor Saved Items',
                meta: `${summary.editorProjectCount} saved project${summary.editorProjectCount === 1 ? '' : 's'} / pending transfers`,
                checked: summary.editorProjectCount > 0
            },
            {
                key: 'preferences',
                title: 'Website Saved Preferences',
                meta: `${summary.prefCount} local setting${summary.prefCount === 1 ? '' : 's'} stored in LocalStorage`,
                checked: summary.prefCount > 0
            }
        ];

        const checksWrap = document.createElement('div');
        checksWrap.className = 'svt-dialog-checks';
        const checkboxes = {};

        categories.forEach(cat => {
            const row = document.createElement('label');
            row.className = 'svt-dialog-check-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = cat.checked;
            checkboxes[cat.key] = cb;

            const textWrap = document.createElement('div');
            const titleSpan = document.createElement('span');
            titleSpan.className = 'svt-dialog-check-title';
            titleSpan.textContent = cat.title;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'svt-dialog-check-meta';
            metaSpan.textContent = cat.meta;
            textWrap.appendChild(titleSpan);
            textWrap.appendChild(metaSpan);

            row.appendChild(cb);
            row.appendChild(textWrap);
            checksWrap.appendChild(row);
        });
        body.appendChild(checksWrap);

        const footer = document.createElement('div');
        footer.className = 'svt-dialog-footer';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'svt-dialog-btn svt-dialog-btn-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = closeDialog;

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'svt-dialog-btn svt-dialog-btn-danger';
        confirmBtn.textContent = 'Confirm Clear Data';

        const syncConfirmState = () => {
            const anyChecked = Object.values(checkboxes).some(cb => cb.checked);
            confirmBtn.disabled = !anyChecked;
        };
        Object.values(checkboxes).forEach(cb => cb.addEventListener('change', syncConfirmState));
        syncConfirmState();

        confirmBtn.onclick = async () => {
            const selected = {
                docSession: checkboxes.docSession.checked,
                idSets: checkboxes.idSets.checked,
                editorProjects: checkboxes.editorProjects.checked,
                preferences: checkboxes.preferences.checked
            };
            closeDialog();
            if (window.MonuStorageManager && typeof window.MonuStorageManager.clearSelectedData === 'function') {
                const res = await window.MonuStorageManager.clearSelectedData(selected);
                if (window.MonuRouter && typeof window.MonuRouter.refreshPrivacyStorageStats === 'function') {
                    window.MonuRouter.refreshPrivacyStorageStats();
                }
                if (res && res.cleared && res.cleared.length > 0) {
                    showToast('Cleared: ' + res.cleared.join(', '));
                } else {
                    showToast('No saved data deleted.');
                }
            } else {
                showToast('Storage manager unavailable on this page.');
            }
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        bd.appendChild(card);
        bd.classList.add('open');
        cancelBtn.focus();
    }

    function buildImagePngBlob(imgEl) {
        return new Promise((resolve, reject) => {
            try {
                const w = imgEl.naturalWidth || imgEl.width;
                const h = imgEl.naturalHeight || imgEl.height;
                if (!w || !h) return reject(new Error('Image has zero dimensions'));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgEl, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas export blocked'));
                }, 'image/png');
            } catch (err) {
                reject(err);
            }
        });
    }

    function deriveImageFilename(imgEl) {
        const rawAlt = (imgEl.getAttribute('alt') || '').trim();
        const src = imgEl.currentSrc || imgEl.src || '';
        let ext = 'png';
        if (!src.startsWith('data:')) {
            const m = src.split('?')[0].match(/\.(jpe?g|png|webp|gif|bmp|svg)$/i);
            if (m) ext = m[1].toLowerCase();
        } else {
            const m = src.match(/^data:image\/([a-z0-9+.-]+);/i);
            if (m) ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase().replace(/\+.*/, '');
        }
        const fromPath = !src.startsWith('data:') ? (src.split('?')[0].split('/').pop() || '').replace(/\.[^.]+$/, '') : '';
        const base = (fromPath || rawAlt || 'smartvletool_image')
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48) || 'smartvletool_image';
        return `${base}.${ext}`;
    }

    function downloadImageElement(imgEl) {
        const src = imgEl.currentSrc || imgEl.src;
        if (!src) return;
        const filename = deriveImageFilename(imgEl);
        const a = document.createElement('a');
        a.href = src;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Downloading image...');
    }

    function inspectContextTarget(target) {
        if (!target || !(target instanceof Element)) return { img: null, link: null };

        // Detect image target (ignore decorative tiny icons inside buttons)
        let imgEl = target.closest('img');
        if (imgEl) {
            const src = imgEl.currentSrc || imgEl.src || '';
            const loaded = imgEl.complete && imgEl.naturalWidth > 0;
            const rect = imgEl.getBoundingClientRect();
            const isSmallButtonIcon = !!imgEl.closest('button') && Math.max(rect.width, rect.height) < 36;
            if (!src || !loaded || isSmallButtonIcon) {
                imgEl = null;
            }
        }

        // Detect link target (ignore javascript: pseudolinks)
        let linkEl = target.closest('a[href]');
        if (linkEl) {
            const rawHref = (linkEl.getAttribute('href') || '').trim();
            if (!rawHref || rawHref.toLowerCase().startsWith('javascript:')) {
                linkEl = null;
            }
        }

        return { img: imgEl, link: linkEl };
    }

    function ensureMenuElement() {
        if (menuEl && document.body.contains(menuEl)) return menuEl;
        menuEl = document.createElement('div');
        menuEl.id = 'svt-context-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.setAttribute('aria-label', 'SmartVLETool Context Menu');
        menuEl.addEventListener('contextmenu', (e) => e.preventDefault());
        menuEl.addEventListener('keydown', onMenuKeyDown);
        document.body.appendChild(menuEl);
        return menuEl;
    }

    function hideMenu() {
        if (menuEl && menuEl.classList.contains('open')) {
            menuEl.classList.remove('open');
        }
    }

    function addMenuItem(parent, { icon, label, disabled, danger, onClick }) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'svt-ctx-item' + (danger ? ' danger' : '');
        btn.setAttribute('role', 'menuitem');
        if (disabled) btn.disabled = true;

        const ic = document.createElement('span');
        ic.className = 'svt-ctx-icon';
        ic.setAttribute('aria-hidden', 'true');
        ic.textContent = icon;

        const txt = document.createElement('span');
        txt.className = 'svt-ctx-label';
        txt.textContent = label;

        btn.appendChild(ic);
        btn.appendChild(txt);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.disabled) return;
            hideMenu();
            if (typeof onClick === 'function') onClick();
        });
        parent.appendChild(btn);
        return btn;
    }

    function addSeparator(parent) {
        const sep = document.createElement('div');
        sep.className = 'svt-ctx-sep';
        sep.setAttribute('role', 'separator');
        parent.appendChild(sep);
    }

    function addSectionLabel(parent, text) {
        const lbl = document.createElement('div');
        lbl.className = 'svt-ctx-section-label';
        lbl.textContent = text;
        parent.appendChild(lbl);
    }

    function buildAndShowMenu(clientX, clientY, target) {
        const menu = ensureMenuElement();
        menu.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'svt-ctx-header';
        header.textContent = 'SmartVLETool Quick Menu';
        menu.appendChild(header);

        const { img, link } = inspectContextTarget(target);

        // ─── Context-Sensitive: Image ───
        if (img) {
            addSectionLabel(menu, 'Image Options');
            const supportsCopyImage = !!(navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof window.ClipboardItem !== 'undefined');
            if (supportsCopyImage) {
                addMenuItem(menu, {
                    icon: '🖼️',
                    label: 'Copy Image',
                    onClick: async () => {
                        try {
                            const blob = await buildImagePngBlob(img);
                            await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
                            showToast('Image copied to clipboard!');
                        } catch (err) {
                            showToast('Unable to copy this image directly in browser.');
                        }
                    }
                });
            }
            const allowDownload = !img.hasAttribute('data-no-download') && img.dataset.downloadable !== 'false';
            if (allowDownload) {
                addMenuItem(menu, {
                    icon: '⬇️',
                    label: 'Download Image',
                    onClick: () => downloadImageElement(img)
                });
            }
            addMenuItem(menu, {
                icon: '🗗',
                label: 'Open Image in New Tab',
                onClick: () => openUrlInNewTab(img.currentSrc || img.src)
            });
            addSeparator(menu);
        }

        // ─── Context-Sensitive: Link ───
        if (link) {
            addSectionLabel(menu, 'Link Options');
            const resolvedHref = link.href;
            addMenuItem(menu, {
                icon: '↗️',
                label: 'Open Link in New Tab',
                onClick: () => openUrlInNewTab(resolvedHref)
            });
            addMenuItem(menu, {
                icon: '🔗',
                label: 'Copy Link Address',
                onClick: async () => {
                    const ok = await copyTextSafe(resolvedHref);
                    showToast(ok ? 'Link address copied!' : 'Could not copy link address.');
                }
            });
            addSeparator(menu);
        }

        // ─── Main Navigation Options ───
        const canBack = (window.MonuRouter && typeof window.MonuRouter.canGoBack === 'function')
            ? window.MonuRouter.canGoBack()
            : (window.history && window.history.length > 1);

        addMenuItem(menu, {
            icon: '🏠',
            label: 'Home',
            onClick: () => navigateApp('/')
        });
        addMenuItem(menu, {
            icon: '⬅️',
            label: 'Go Back',
            disabled: !canBack,
            onClick: () => {
                if (window.MonuRouter && typeof window.MonuRouter.goBack === 'function') {
                    window.MonuRouter.goBack();
                } else {
                    window.history.back();
                }
            }
        });
        addMenuItem(menu, {
            icon: '🔄',
            label: 'Refresh Page',
            onClick: () => window.location.reload()
        });
        addMenuItem(menu, {
            icon: '🧰',
            label: 'Explore All Tools',
            onClick: () => navigateApp('/#explore-our-tools')
        });

        const tut = findTutorialTarget();
        addMenuItem(menu, {
            icon: '📖',
            label: 'How to Use / Tutorials',
            disabled: !tut.element && !tut.url,
            onClick: () => {
                if (tut.element) {
                    const details = tut.element.querySelector('details');
                    if (details) details.open = true;
                    tut.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (tut.url) {
                    navigateApp(tut.url);
                }
            }
        });

        addSeparator(menu);

        // ─── Share & Copy Website URL ───
        addMenuItem(menu, {
            icon: '📤',
            label: 'Share Website',
            onClick: async () => {
                const shareData = {
                    title: document.title || 'SMART VLE TOOL',
                    text: 'Free privacy-focused document scanner, ID card printer & image editor tools on SmartVLETool.in',
                    url: window.location.href
                };
                if (navigator.share) {
                    try {
                        await navigator.share(shareData);
                        return;
                    } catch (err) {
                        if (err && err.name === 'AbortError') return;
                    }
                }
                const ok = await copyTextSafe(window.location.href);
                showToast(ok ? 'Website link copied for sharing!' : 'Could not copy website link.');
            }
        });
        addMenuItem(menu, {
            icon: '📋',
            label: 'Copy Website Link',
            onClick: async () => {
                const ok = await copyTextSafe(window.location.href);
                showToast(ok ? 'Website link copied to clipboard!' : 'Could not copy link.');
            }
        });

        addSeparator(menu);

        // ─── Tool State & Storage Safety ───
        const pageInfo = getActivePageInfo();
        const isToolActive = pageInfo.kind !== 'static';
        const hasWork = hasActiveToolUnsavedWork(pageInfo);

        addMenuItem(menu, {
            icon: '↺',
            label: 'Reset Current Tool',
            disabled: !isToolActive,
            onClick: () => {
                if (hasWork) {
                    openConfirmDialog({
                        title: `Reset ${pageInfo.label}?`,
                        warningText: 'Unsaved adjustments in this tool will be restored to default settings.',
                        message: `Only "${pageInfo.label}" settings will be reset. Saved sets and other tools will not be affected.`,
                        confirmLabel: 'Reset Tool',
                        danger: false,
                        onConfirm: () => executeResetCurrentTool(pageInfo)
                    });
                } else {
                    executeResetCurrentTool(pageInfo);
                }
            }
        });

        addMenuItem(menu, {
            icon: '🧹',
            label: 'Clear Current Work',
            disabled: !isToolActive || !hasWork,
            danger: true,
            onClick: () => {
                openConfirmDialog({
                    title: `Clear ${pageInfo.label} Work?`,
                    warningText: 'Uploaded files, live previews, and temporary edits in the current tool will be removed.',
                    message: `Only your current work in "${pageInfo.label}" will be cleared. Your saved ID card sets and other tools stay untouched.`,
                    confirmLabel: 'Clear Work',
                    danger: true,
                    onConfirm: () => executeClearCurrentWork(pageInfo)
                });
            }
        });

        addMenuItem(menu, {
            icon: '🗄️',
            label: 'Clear Saved Data',
            danger: true,
            onClick: () => openClearSavedDataDialog()
        });

        addSeparator(menu);

        addMenuItem(menu, {
            icon: '✉️',
            label: 'Contact Us',
            onClick: () => navigateApp('/contact-us')
        });

        // Position menu and clamp safely within viewport
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.classList.add('open');

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = menu.getBoundingClientRect();
        const margin = 8;

        let left = clientX;
        let top = clientY;
        if (left + rect.width + margin > vw) {
            left = Math.max(margin, vw - rect.width - margin);
        }
        if (top + rect.height + margin > vh) {
            top = Math.max(margin, vh - rect.height - margin);
        }
        menu.style.left = `${Math.max(margin, left)}px`;
        menu.style.top = `${Math.max(margin, top)}px`;

        const firstEnabled = menu.querySelector('.svt-ctx-item:not(:disabled)');
        if (firstEnabled) firstEnabled.focus({ preventScroll: true });
    }

    function onMenuKeyDown(e) {
        if (!menuEl || !menuEl.classList.contains('open')) return;
        const items = Array.from(menuEl.querySelectorAll('.svt-ctx-item:not(:disabled)'));
        if (!items.length) return;
        const idx = items.indexOf(document.activeElement);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[(idx + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[(idx - 1 + items.length) % items.length].focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            items[0].focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1].focus();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMenu();
            if (lastRightClickTrigger && typeof lastRightClickTrigger.focus === 'function') {
                lastRightClickTrigger.focus({ preventScroll: true });
            }
        }
    }

    function shouldBypassCustomMenu(e) {
        if (lastPointerType === 'touch') return true;
        if (e.shiftKey && e.altKey) return true;
        const t = e.target;
        if (t && t instanceof Element) {
            if (t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
                return true;
            }
        }
        try {
            const sel = window.getSelection ? window.getSelection() : null;
            if (sel && sel.toString().trim().length > 0) {
                return true;
            }
        } catch (_) {}
        return false;
    }

    document.addEventListener('contextmenu', (e) => {
        if (shouldBypassCustomMenu(e)) {
            hideMenu();
            return;
        }
        e.preventDefault();
        lastRightClickTrigger = e.target;
        buildAndShowMenu(e.clientX, e.clientY, e.target);
    });

    document.addEventListener('mousedown', (e) => {
        if (menuEl && menuEl.classList.contains('open') && !menuEl.contains(e.target)) {
            hideMenu();
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideMenu();
            closeDialog();
        }
    });

    window.addEventListener('scroll', hideMenu, { passive: true, capture: true });
    window.addEventListener('resize', hideMenu, { passive: true });
    window.addEventListener('blur', hideMenu);
})();
