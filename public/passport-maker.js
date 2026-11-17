/**
 * SMART VLE TOOL - Passport Photo Maker Engine
 * Features:
 * - Centered upload zone & static screen preview sizing (changing print size keeps preview large & clear)
 * - Full original-resolution master pipeline regardless of small physical print size
 * - Top tool tabs: 1. Photo Size Crop, 2. Background Remove, 3. Adjustment
 * - Presets + Custom Passport Size with cm / mm / inch / px units (exact print size preserved)
 * - Crop Zoom, Rotate, Flip, Center Fit & Lock Image Drag toggle
 * - MediaPipe Selfie Segmentation + client fallback & studio background colors
 * - Subject-only Brightness, Contrast, Midtones/Gamma, and R/G/B Channel Balance
 * - Left-margin aligned A4 & 4x6 Photo Sheet Print Preview Modal with Photo Gap, Photo Border,
 *   Crop Border Gap, Crop Line Type (Dashed / Plain), Synchronous Print, High-Res JPG & Vector PDF Export
 */

(function () {
    'use strict';

    // Global State
    let passImg = null;
    let passSubjectMask = null; // Canvas with isolated subject (transparent background)
    let passBgColor = 'rgb(241, 245, 249)';
    let passSizeKey = '3.5x4.5';
    let passPhysicalWmm = 35;
    let passPhysicalHmm = 45;
    let passTargetW = 1200; // Always full-resolution master bitmap width (decoupled from small print mm)
    let passTargetH = 1543;
    let passSizeLabel = '3.5 × 4.5 cm';
    let passActiveTool = 'sizecrop';
    let passZoom = 1.0;
    let passOffsetX = 0; // -100 to 100 (canvas pan)
    let passOffsetY = 0; // -100 to 100 (canvas pan)
    let passRotationDeg = 0; // 0, 90, 180, 270
    let passFlipH = false;
    let passDragLocked = false;
    let passPaperSize = 'A4';
    let passPhotoCount = 8;

    // Print preview spacing, crop line & print scale options
    let passPrintPhotoGapMm = 4.0;
    let passPrintPhotoBorderMm = 0.3;
    let passPrintCropGapMm = 0.0;
    let passPrintCropLineEnabled = true;
    let passPrintCropLineType = 'dashed'; // 'dashed' | 'solid'
    let passPrintScaleOffset = 0; // -50 to +50 (% scale adjustment in Print Preview)

    let isProcessingBg = false;

    const PASSPORT_TOOLS_META = {
        sizecrop: { title: 'Photo Size & Crop' },
        bgremove: { title: 'Background Remove & Color' },
        adjustment: { title: 'Color & Tone Adjustment' }
    };

    const PASSPORT_SIZE_PRESETS = {
        '3.5x4.5': { wMm: 35, hMm: 45, label: '3.5 × 4.5 cm' },
        '2x2': { wMm: 50.8, hMm: 50.8, label: '2 × 2 inch' },
        '3x4': { wMm: 30, hMm: 40, label: '3 × 4 cm' },
        '2.5x3.5': { wMm: 25, hMm: 35, label: '2.5 × 3.5 cm' }
    };

    const PAPER_SPECS = {
        'A4': {
            wMm: 210,
            hMm: 297,
            marginLeftMm: 8,
            marginTopMm: 10,
            marginRightMm: 8,
            marginBottomMm: 10,
            label: 'A4 (210 × 297 mm)'
        },
        '4x6': {
            wMm: 101.6,
            hMm: 152.4,
            marginLeftMm: 4,
            marginTopMm: 4,
            marginRightMm: 4,
            marginBottomMm: 4,
            label: '4 × 6 inch (101.6 × 152.4 mm)'
        }
    };

    function mmToPx(mm, dpi) {
        return Math.max(20, Math.round((mm / 25.4) * (dpi || 300)));
    }

    function unitToMm(val, unit) {
        const n = parseFloat(val);
        if (!isFinite(n) || n <= 0) return 35;
        if (unit === 'mm') return n;
        if (unit === 'inch') return n * 25.4;
        if (unit === 'px') return (n / 300) * 25.4;
        return n * 10; // 'cm'
    }

    function mmToUnit(mm, unit) {
        if (unit === 'mm') return Number(mm.toFixed(1));
        if (unit === 'inch') return Number((mm / 25.4).toFixed(2));
        if (unit === 'px') return Math.round((mm / 25.4) * 300);
        return Number((mm / 10).toFixed(2)); // 'cm'
    }

    /**
     * Keep master canvas at full original image resolution (capped cleanly for browser stability)
     * while preserving exact aspect ratio of passPhysicalWmm x passPhysicalHmm.
     * Small print sizes only scale physical print dimensions (mm), never downsampling quality.
     */
    function computeMasterRenderDimensions() {
        let origMax = 1500;
        if (passImg) {
            const rawW = passImg.naturalWidth || passImg.width || 1200;
            const rawH = passImg.naturalHeight || passImg.height || 1600;
            origMax = Math.max(1200, Math.min(2600, Math.max(rawW, rawH)));
        }
        const ratio = Math.max(0.15, passPhysicalWmm / Math.max(1, passPhysicalHmm));
        if (ratio >= 1) {
            passTargetW = origMax;
            passTargetH = Math.max(240, Math.round(origMax / ratio));
        } else {
            passTargetH = origMax;
            passTargetW = Math.max(240, Math.round(origMax * ratio));
        }
    }

    // Keep the preview canvas visual box size static across preset/custom print size changes
    function applyStaticPreviewDisplaySize() {
        const aspect = Math.max(0.15, passPhysicalWmm / Math.max(1, passPhysicalHmm));
        document.querySelectorAll('#passportCanvas').forEach(canvas => {
            const stage = canvas.closest('#passportSinglePreview');
            const availW = (stage && stage.clientWidth > 60) ? (stage.clientWidth - 24) : 440;
            const availH = (stage && stage.clientHeight > 60) ? (stage.clientHeight - 24) : 440;
            const boxSide = Math.max(220, Math.min(availW, availH, 440));

            let cssW, cssH;
            if (aspect >= 1) {
                cssW = boxSide;
                cssH = Math.round(boxSide / aspect);
            } else {
                cssH = boxSide;
                cssW = Math.round(boxSide * aspect);
            }
            canvas.style.width = cssW + 'px';
            canvas.style.height = cssH + 'px';
        });
    }

    // MediaPipe Vision Tasks loader from bundled script
    function getMediaPipeTasks() {
        if (window.MediaPipeTasks && window.MediaPipeTasks.ImageSegmenter) {
            return window.MediaPipeTasks;
        }
        if (typeof self !== 'undefined' && self.webpackChunk_N_E && Array.isArray(self.webpackChunk_N_E)) {
            for (const chunk of self.webpackChunk_N_E) {
                if (chunk && chunk[1] && chunk[1][46333]) {
                    const modFn = chunk[1][46333];
                    const exp = {};
                    const r = {
                        d: (obj, getters) => {
                            for (const k in getters) {
                                Object.defineProperty(obj, k, { get: getters[k], enumerable: true });
                            }
                        }
                    };
                    try {
                        modFn({}, exp, r);
                        window.MediaPipeTasks = exp;
                        return exp;
                    } catch (e) {
                        console.warn('[Passport Maker] Could not bootstrap MediaPipe chunk:', e);
                    }
                }
            }
        }
        return null;
    }

    function setPassportStatus(msg, type = 'ok') {
        document.querySelectorAll('#passportStatusBar').forEach(el => {
            el.textContent = msg;
            el.className = 'status-bar ' + type;
        });
    }

    function setPassportProgress(pct) {
        const wraps = document.querySelectorAll('#passportProgressWrap');
        const bars = document.querySelectorAll('#passportProgressBar');
        if (pct === null || pct === undefined) {
            wraps.forEach(w => w.classList.remove('show'));
            bars.forEach(b => b.style.width = '0%');
        } else {
            wraps.forEach(w => w.classList.add('show'));
            bars.forEach(b => b.style.width = Math.max(0, Math.min(100, pct)) + '%');
        }
    }

    function updatePassportInfoCluster() {
        computeMasterRenderDimensions();
        document.querySelectorAll('#passportInfoSize').forEach(el => {
            el.textContent = `Print: ${passSizeLabel} (${passPhysicalWmm.toFixed(1)} × ${passPhysicalHmm.toFixed(1)} mm)`;
        });
        document.querySelectorAll('#passportInfoDim').forEach(el => {
            el.textContent = `Quality: ${passTargetW} × ${passTargetH} px`;
        });
    }

    function showPassportToast(message, isSuccess = true) {
        setPassportStatus(message, isSuccess ? 'ok' : 'err');
        let toast = document.getElementById('passport-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'passport-toast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,0.18);transition:all 0.3s ease;pointer-events:none;';
            document.body.appendChild(toast);
        }
        toast.style.background = isSuccess ? '#10b981' : '#ef4444';
        toast.style.color = '#ffffff';
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 3200);
    }

    function updateHeaderActionsVisibility() {
        const displayVal = passImg ? '' : 'none';
        document.querySelectorAll('#passResetBtn, #passChangeImgBtn, #passDeleteImgBtn').forEach(btn => {
            btn.style.display = displayVal;
        });
        document.querySelectorAll('#btnRestoreBg').forEach(btn => {
            btn.style.display = (passImg && passSubjectMask) ? 'block' : 'none';
        });
    }

    /**
     * Switch Top Subnav Tool Tab (1. Photo Size Crop, 2. Background Remove, 3. Adjustment)
     */
    function switchPassportTool(toolId, btn) {
        passActiveTool = toolId;

        document.querySelectorAll('#passportSubnavTools .passport-tool-tab').forEach(b => {
            b.classList.remove('active');
        });
        if (btn) {
            btn.classList.add('active');
        } else {
            document.querySelectorAll(`#passportSubnavTools .passport-tool-tab[data-pass-tool="${toolId}"]`).forEach(b => {
                b.classList.add('active');
            });
        }

        const meta = PASSPORT_TOOLS_META[toolId] || {};
        document.querySelectorAll('#passportToolTitle').forEach(el => {
            el.textContent = meta.title || toolId;
        });

        document.querySelectorAll('[id^="pp-"]').forEach(el => {
            el.style.display = 'none';
        });
        document.querySelectorAll('#pp-' + toolId).forEach(el => {
            el.style.display = 'block';
        });
    }

    /**
     * 1. Load Portrait Image from File Input or Drag-and-Drop
     */
    function loadPassportImage(input) {
        let file = null;
        if (input instanceof File) {
            file = input;
        } else if (input && input.files && input.files[0]) {
            file = input.files[0];
        }
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            loadPassportFromDataUrl(e.target.result, 'device');
        };
        reader.readAsDataURL(file);
    }

    function loadPassportFromDataUrl(dataUrl, sourceLabel) {
        if (!dataUrl) return;
        const img = new Image();
        img.onload = function () {
            passImg = img;
            passSubjectMask = null;
            passRotationDeg = 0;
            passFlipH = false;
            passZoom = 1.0;
            passOffsetX = 0;
            passOffsetY = 0;

            document.querySelectorAll('#passportUploadZone').forEach(el => el.style.display = 'none');
            document.querySelectorAll('#passportSinglePreview').forEach(el => el.style.display = 'flex');

            syncFramingControls();
            syncAdjustmentSliders();
            updateHeaderActionsVisibility();
            updatePassportInfoCluster();
            renderPassportCanvas();
            if (sourceLabel && sourceLabel !== 'device') {
                showPassportToast(`Loaded photo from ${sourceLabel}! Drag to position or crop.`);
            } else {
                showPassportToast(
                    passDragLocked
                        ? 'Portrait photo loaded! Image drag is currently locked.'
                        : 'Portrait photo loaded! Drag photo on canvas to position.'
                );
            }
        };
        img.src = dataUrl;
    }

    async function readPassportTransferDb(key) {
        if (window.ImagePDFEditorDB && typeof window.ImagePDFEditorDB.getEditorData === 'function') {
            const val = await window.ImagePDFEditorDB.getEditorData(key);
            await window.ImagePDFEditorDB.saveEditorData(key, null);
            return val;
        }
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('Monu_ImagePDFEditor_DB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('editorProjects')) {
                        db.createObjectStore('editorProjects', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('editorProjects')) {
                        resolve(null);
                        return;
                    }
                    const tx = db.transaction('editorProjects', 'readwrite');
                    const store = tx.objectStore('editorProjects');
                    const getReq = store.get(key);
                    getReq.onsuccess = () => {
                        const data = getReq.result ? getReq.result.data : null;
                        if (data) store.put({ id: key, timestamp: Date.now(), data: null });
                        resolve(data);
                    };
                    getReq.onerror = () => resolve(null);
                };
                req.onerror = () => resolve(null);
            } catch (_) {
                resolve(null);
            }
        });
    }

    async function writeCrossTransferDb(key, payload) {
        if (window.ImagePDFEditorDB && typeof window.ImagePDFEditorDB.saveEditorData === 'function') {
            await window.ImagePDFEditorDB.saveEditorData(key, payload);
            return true;
        }
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('Monu_ImagePDFEditor_DB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('editorProjects')) {
                        db.createObjectStore('editorProjects', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('editorProjects')) {
                        resolve(false);
                        return;
                    }
                    const tx = db.transaction('editorProjects', 'readwrite');
                    tx.objectStore('editorProjects').put({ id: key, timestamp: Date.now(), data: payload });
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                };
                req.onerror = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    async function checkPendingPassportTransfer() {
        try {
            if (sessionStorage.getItem('monu_pending_passport_transfer') !== '1') return;
            sessionStorage.removeItem('monu_pending_passport_transfer');

            const fallbackRaw = sessionStorage.getItem('monu_passport_transfer_data');
            if (fallbackRaw) sessionStorage.removeItem('monu_passport_transfer_data');

            const dbPayload = await readPassportTransferDb('pending_passport_transfer');
            const payload = dbPayload || (fallbackRaw ? JSON.parse(fallbackRaw) : null);
            if (payload && payload.dataUrl) {
                loadPassportFromDataUrl(payload.dataUrl, payload.source || 'Studio');
            }
        } catch (err) {
            console.warn('[Passport Maker] Pending transfer load warning:', err);
        }
    }

    function syncFramingControls() {
        const zoomPct = Math.round(passZoom * 100);
        document.querySelectorAll('#passZoomSlider').forEach(el => el.value = zoomPct);
        document.querySelectorAll('#passZoomVal').forEach(el => el.textContent = zoomPct + '%');
        document.querySelectorAll('#passLockDragToggle').forEach(el => el.checked = passDragLocked);
        document.querySelectorAll('#passportCanvas').forEach(canvas => {
            canvas.style.cursor = passDragLocked ? 'not-allowed' : 'grab';
        });
    }

    function syncAdjustmentSliders() {
        document.querySelectorAll('#passBrSlider').forEach(el => el.value = 100);
        document.querySelectorAll('#passCtSlider').forEach(el => el.value = 100);
        document.querySelectorAll('#passGammaSlider').forEach(el => el.value = 1.0);
        document.querySelectorAll('#passRSlider').forEach(el => el.value = 0);
        document.querySelectorAll('#passGSlider').forEach(el => el.value = 0);
        document.querySelectorAll('#passBSlider').forEach(el => el.value = 0);

        document.querySelectorAll('#passBrVal').forEach(el => el.textContent = '100%');
        document.querySelectorAll('#passCtVal').forEach(el => el.textContent = '100%');
        document.querySelectorAll('#passGammaVal').forEach(el => el.textContent = '1.00');
        document.querySelectorAll('#passRVal').forEach(el => el.textContent = '0');
        document.querySelectorAll('#passGVal').forEach(el => el.textContent = '0');
        document.querySelectorAll('#passBVal').forEach(el => el.textContent = '0');
    }

    /**
     * Crop Zoom / Lock Image Drag / Rotate / Flip Controls
     */
    function updatePassportFraming() {
        const zEl = document.getElementById('passZoomSlider');
        if (zEl) {
            passZoom = (parseInt(zEl.value || 100, 10)) / 100;
        }
        syncFramingControls();
        renderPassportCanvas();
    }

    function togglePassportDragLock(locked) {
        passDragLocked = !!locked;
        syncFramingControls();
        if (passImg) {
            setPassportStatus(
                passDragLocked
                    ? 'Image drag locked. Uncheck to reposition by dragging.'
                    : 'Image drag unlocked — drag canvas to reposition.',
                'info'
            );
        }
    }

    function rotatePassportPhoto(deltaDeg) {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        passRotationDeg = ((passRotationDeg + deltaDeg) % 360 + 360) % 360;
        renderPassportCanvas();
        setPassportStatus(`Rotated portrait (${passRotationDeg}°).`, 'info');
    }

    function flipPassportPhoto() {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        passFlipH = !passFlipH;
        renderPassportCanvas();
        setPassportStatus('Flipped portrait horizontally.', 'info');
    }

    function resetPassportFraming() {
        passZoom = 1.0;
        passOffsetX = 0;
        passOffsetY = 0;
        passRotationDeg = 0;
        passFlipH = false;
        syncFramingControls();
        renderPassportCanvas();
        if (passImg) setPassportStatus('Crop zoom and position reset to center.', 'ok');
    }

    function normalizeColorToHex(col) {
        if (!col) return '#f1f5f9';
        const trimmed = String(col).trim();
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
        const m = trimmed.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
        if (m) {
            const toHex = n => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0');
            return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
        }
        return '#f1f5f9';
    }

    /**
     * 2. Set Background Color
     */
    function setPassportBgColor(col, btn) {
        passBgColor = col;

        document.querySelectorAll('#bgColorPalette .bg-color-btn').forEach(b => {
            b.classList.remove('active');
            b.style.borderColor = '';
        });
        if (btn) {
            btn.classList.add('active');
        } else {
            document.querySelectorAll(`#bgColorPalette .bg-color-btn[data-color="${col}"]`).forEach(b => {
                b.classList.add('active');
            });
        }

        const hexVal = normalizeColorToHex(col);
        document.querySelectorAll('#passCustomBgColor').forEach(inp => {
            inp.value = hexVal;
        });
        document.querySelectorAll('#passCustomBgHex').forEach(el => {
            el.textContent = hexVal.toUpperCase();
        });

        renderPassportCanvas();
        if (passImg) {
            setPassportStatus('Background color updated.', 'ok');
        }
    }

    function restorePassportOriginalBg() {
        if (!passImg) return;
        passSubjectMask = null;
        updateHeaderActionsVisibility();
        renderPassportCanvas();
        showPassportToast('Original background restored.');
    }

    /**
     * 3. Update Target Passport Size (Presets + Custom Size & Unit)
     */
    function toggleCustomSizeBoxes(show) {
        document.querySelectorAll('#passportCustomSizeBox').forEach(box => {
            box.style.display = show ? 'block' : 'none';
        });
    }

    function syncCustomInputsFromMm(unit) {
        const targetUnit = unit || document.getElementById('passCustomUnit')?.value || 'cm';
        const wVal = mmToUnit(passPhysicalWmm, targetUnit);
        const hVal = mmToUnit(passPhysicalHmm, targetUnit);
        const step = targetUnit === 'px' ? '1' : (targetUnit === 'mm' ? '0.5' : '0.1');
        const min = targetUnit === 'px' ? '60' : (targetUnit === 'mm' ? '10' : (targetUnit === 'inch' ? '0.4' : '1'));

        document.querySelectorAll('#passCustomUnit').forEach(el => el.value = targetUnit);
        document.querySelectorAll('#passCustomW').forEach(el => {
            el.step = step;
            el.min = min;
            el.value = wVal;
        });
        document.querySelectorAll('#passCustomH').forEach(el => {
            el.step = step;
            el.min = min;
            el.value = hVal;
        });
    }

    function applySizeKey(val) {
        passSizeKey = val || '3.5x4.5';

        document.querySelectorAll('#passportSizeSelect').forEach(sel => sel.value = passSizeKey);
        document.querySelectorAll('#passportSizePresets .ap-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-size') === passSizeKey);
        });

        if (passSizeKey === 'custom') {
            toggleCustomSizeBoxes(true);
            syncCustomInputsFromMm();
            applyCustomPassportSize();
            return;
        }

        toggleCustomSizeBoxes(false);
        const preset = PASSPORT_SIZE_PRESETS[passSizeKey] || PASSPORT_SIZE_PRESETS['3.5x4.5'];
        passPhysicalWmm = preset.wMm;
        passPhysicalHmm = preset.hMm;
        passSizeLabel = preset.label;

        updatePassportInfoCluster();
        renderPassportCanvas();
        refreshOpenPrintModalIfActive();
    }

    function updatePassportSize() {
        const select = document.getElementById('passportSizeSelect');
        applySizeKey(select ? select.value : '3.5x4.5');
    }

    function setPassportSizePreset(sizeKey, btn) {
        applySizeKey(sizeKey);
        if (btn) {
            document.querySelectorAll('#passportSizePresets .ap-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        setPassportStatus(`Print size set to ${passSizeLabel} (preview & photo resolution kept sharp).`, 'ok');
    }

    let prevCustomUnit = 'cm';
    function onCustomUnitChange() {
        const unitEl = document.getElementById('passCustomUnit');
        const newUnit = unitEl ? unitEl.value : 'cm';
        syncCustomInputsFromMm(newUnit);
        prevCustomUnit = newUnit;
        applyCustomPassportSize();
    }

    function applyCustomPassportSize() {
        const unitEl = document.getElementById('passCustomUnit');
        const wEl = document.getElementById('passCustomW');
        const hEl = document.getElementById('passCustomH');
        if (!wEl || !hEl) return;

        const unit = unitEl ? unitEl.value : prevCustomUnit;
        prevCustomUnit = unit;
        const rawW = parseFloat(wEl.value);
        const rawH = parseFloat(hEl.value);
        if (!isFinite(rawW) || !isFinite(rawH) || rawW <= 0 || rawH <= 0) return;

        let wMm = unitToMm(rawW, unit);
        let hMm = unitToMm(rawH, unit);

        wMm = Math.max(10, Math.min(200, wMm));
        hMm = Math.max(10, Math.min(280, hMm));

        passSizeKey = 'custom';
        passPhysicalWmm = wMm;
        passPhysicalHmm = hMm;

        const unitSuffix = unit === 'inch' ? 'in' : unit;
        passSizeLabel = `${rawW} × ${rawH} ${unitSuffix}`;

        document.querySelectorAll('#passportSizeSelect').forEach(sel => sel.value = 'custom');
        document.querySelectorAll('#passportSizePresets .ap-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-size') === 'custom');
        });
        document.querySelectorAll('#passCustomUnit').forEach(el => { if (el !== unitEl) el.value = unit; });
        document.querySelectorAll('#passCustomW').forEach(el => { if (el !== wEl) el.value = rawW; });
        document.querySelectorAll('#passCustomH').forEach(el => { if (el !== hEl) el.value = rawH; });

        updatePassportInfoCluster();
        renderPassportCanvas();
        refreshOpenPrintModalIfActive();
        setPassportStatus(`Custom print size: ${passSizeLabel} (${wMm.toFixed(1)} × ${hMm.toFixed(1)} mm)`, 'ok');
    }

    /**
     * 4. Update Adjustments (Brightness, Contrast, Midtones/Gamma, RGB Channels)
     */
    function updatePassportAdjustments() {
        const br = document.getElementById('passBrSlider')?.value || 100;
        const ct = document.getElementById('passCtSlider')?.value || 100;
        const gm = parseFloat(document.getElementById('passGammaSlider')?.value || 1.0);
        const r = parseInt(document.getElementById('passRSlider')?.value || 0, 10);
        const g = parseInt(document.getElementById('passGSlider')?.value || 0, 10);
        const b = parseInt(document.getElementById('passBSlider')?.value || 0, 10);
        const fmtSigned = (v) => (v > 0 ? '+' + v : String(v));

        document.querySelectorAll('#passBrVal').forEach(el => el.textContent = br + '%');
        document.querySelectorAll('#passCtVal').forEach(el => el.textContent = ct + '%');
        document.querySelectorAll('#passGammaVal').forEach(el => el.textContent = gm.toFixed(2));
        document.querySelectorAll('#passRVal').forEach(el => el.textContent = fmtSigned(r));
        document.querySelectorAll('#passGVal').forEach(el => el.textContent = fmtSigned(g));
        document.querySelectorAll('#passBVal').forEach(el => el.textContent = fmtSigned(b));

        renderPassportCanvas();
    }

    function resetPassportSlidersOnly() {
        syncAdjustmentSliders();
        renderPassportCanvas();
        showPassportToast('Color & tone sliders reset.');
    }

    /**
     * Smart Portrait Subject Extractor (Client-Side Fallback)
     */
    function segmentPortraitFallback(sourceImg) {
        const w = sourceImg.naturalWidth || sourceImg.width;
        const h = sourceImg.naturalHeight || sourceImg.height;

        const tempC = document.createElement('canvas');
        tempC.width = w;
        tempC.height = h;
        const ctx = tempC.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(sourceImg, 0, 0);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const samplePoints = [
            [4, 4], [w - 5, 4], [Math.floor(w / 2), 4],
            [4, Math.floor(h * 0.15)], [w - 5, Math.floor(h * 0.15)]
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        for (const [sx, sy] of samplePoints) {
            const idx = (sy * w + sx) * 4;
            bgR += data[idx];
            bgG += data[idx + 1];
            bgB += data[idx + 2];
        }
        bgR /= samplePoints.length;
        bgG /= samplePoints.length;
        bgB /= samplePoints.length;

        const threshold = 38;
        const centerX = w / 2;
        const centerY = h * 0.45;
        const headRadiusX = w * 0.35;
        const headRadiusY = h * 0.40;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                const dist = Math.sqrt(
                    (r - bgR) * (r - bgR) +
                    (g - bgG) * (g - bgG) +
                    (b - bgB) * (b - bgB)
                );

                const normX = (x - centerX) / headRadiusX;
                const normY = (y - centerY) / headRadiusY;
                const centerDist = normX * normX + normY * normY;

                if (dist < threshold && centerDist > 0.45) {
                    const alphaRatio = Math.max(0, Math.min(1, (dist - (threshold - 14)) / 14));
                    data[idx + 3] = Math.floor(alphaRatio * 255);
                } else if (dist < threshold * 0.6) {
                    data[idx + 3] = 0;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return tempC;
    }

    let cachedSegmenter = null;
    let segmenterPromise = null;

    async function fetchBinaryWithTimeout(url, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response || !response.ok) {
                throw new Error(`HTTP ${response ? response.status : 'error'} loading ${url}`);
            }
            const buf = await response.arrayBuffer();
            if (!buf || buf.byteLength === 0) {
                throw new Error(`Empty response for ${url}`);
            }
            return new Uint8Array(buf);
        } finally {
            clearTimeout(timer);
        }
    }

    async function getOrCreateSegmenter(mp) {
        if (cachedSegmenter) return cachedSegmenter;
        if (segmenterPromise) return segmenterPromise;

        segmenterPromise = (async () => {
            let vision;
            try {
                vision = await mp.FilesetResolver.forVisionTasks('/mediapipe/wasm');
            } catch (localErr) {
                vision = await mp.FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
                );
            }

            let wasmBytes;
            const wasmFileName = String(vision.wasmBinaryPath || '').split('/').pop() || 'vision_wasm_internal.wasm';
            try {
                wasmBytes = await fetchBinaryWithTimeout(vision.wasmBinaryPath, 15000);
            } catch (primaryWasmErr) {
                wasmBytes = await fetchBinaryWithTimeout(
                    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/${wasmFileName}`,
                    15000
                );
            }

            let modelBytes;
            try {
                modelBytes = await fetchBinaryWithTimeout('/mediapipe/models/selfie_segmenter.tflite', 15000);
            } catch (localModelErr) {
                modelBytes = await fetchBinaryWithTimeout(
                    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
                    15000
                );
            }

            async function createWithDelegate(delegate) {
                self.Module = {
                    wasmBinary: wasmBytes.slice(),
                    printErr: (msg) => console.warn('[MediaPipe WASM]', msg)
                };
                try {
                    return await mp.ImageSegmenter.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetBuffer: modelBytes.slice(),
                            delegate
                        },
                        runningMode: 'IMAGE',
                        outputCategoryMask: true,
                        outputConfidenceMasks: true
                    });
                } catch (err) {
                    self.Module = undefined;
                    throw err;
                }
            }

            try {
                cachedSegmenter = await createWithDelegate('GPU');
            } catch (gpuErr) {
                cachedSegmenter = await createWithDelegate('CPU');
            }
            return cachedSegmenter;
        })();

        try {
            return await segmenterPromise;
        } catch (err) {
            segmenterPromise = null;
            throw err;
        }
    }

    function applyConfidenceMaskToImage(sourceImg, maskData, mW, mH, invertMask) {
        const w = sourceImg.naturalWidth || sourceImg.width;
        const h = sourceImg.naturalHeight || sourceImg.height;

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = w;
        maskCanvas.height = h;
        const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
        mCtx.drawImage(sourceImg, 0, 0, w, h);

        const imgData = mCtx.getImageData(0, 0, w, h);
        const pixels = imgData.data;

        for (let y = 0; y < h; y++) {
            const fy = ((y + 0.5) * mH) / h - 0.5;
            const y0 = Math.max(0, Math.min(mH - 1, Math.floor(fy)));
            const y1 = Math.max(0, Math.min(mH - 1, y0 + 1));
            const wy = Math.max(0, Math.min(1, fy - y0));

            for (let x = 0; x < w; x++) {
                const fx = ((x + 0.5) * mW) / w - 0.5;
                const x0 = Math.max(0, Math.min(mW - 1, Math.floor(fx)));
                const x1 = Math.max(0, Math.min(mW - 1, x0 + 1));
                const wx = Math.max(0, Math.min(1, fx - x0));

                const c00 = maskData[y0 * mW + x0];
                const c10 = maskData[y0 * mW + x1];
                const c01 = maskData[y1 * mW + x0];
                const c11 = maskData[y1 * mW + x1];

                let conf = (c00 * (1 - wx) + c10 * wx) * (1 - wy) +
                           (c01 * (1 - wx) + c11 * wx) * wy;
                if (invertMask) conf = 1 - conf;

                const alpha = Math.max(0, Math.min(1, (conf - 0.25) / 0.50));
                const pIdx = (y * w + x) * 4;
                pixels[pIdx + 3] = Math.round(pixels[pIdx + 3] * alpha);
            }
        }

        mCtx.putImageData(imgData, 0, 0);
        return maskCanvas;
    }

    /**
     * 5. Remove Background using MediaPipe ImageSegmenter with fast client fallback
     */
    async function removePassportBackground() {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        if (isProcessingBg) return;

        isProcessingBg = true;
        setPassportProgress(30);
        const btn = document.getElementById('btnRemoveBg');
        const origText = btn ? btn.innerHTML : '✨ Remove Background';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Removing Background...';
        }

        try {
            const mp = getMediaPipeTasks();
            let segmented = false;

            if (mp && mp.FilesetResolver && mp.ImageSegmenter) {
                try {
                    setPassportStatus('Isolating portrait subject...', 'info');
                    setPassportProgress(55);
                    const segmenter = await getOrCreateSegmenter(mp);
                    setPassportProgress(80);
                    const labels = typeof segmenter.getLabels === 'function' ? segmenter.getLabels() : [];

                    const segPromise = new Promise((resolve, reject) => {
                        segmenter.segment(passImg, (result) => {
                            if (!result) {
                                return reject(new Error('Empty segmentation result'));
                            }

                            if (result.confidenceMasks && result.confidenceMasks.length > 0) {
                                let targetIdx = 0;
                                let invertMask = false;
                                if (result.confidenceMasks.length === 1) {
                                    targetIdx = 0;
                                    const lbl = String(labels[0] || '').toLowerCase();
                                    invertMask = lbl.includes('background');
                                } else {
                                    const personIdx = labels.findIndex(l => /selfie|person|foreground/i.test(String(l)));
                                    targetIdx = personIdx >= 0 ? personIdx : 1;
                                }
                                const maskObj = result.confidenceMasks[targetIdx];
                                const maskData = maskObj.getAsFloat32Array();
                                return resolve(applyConfidenceMaskToImage(passImg, maskData, maskObj.width, maskObj.height, invertMask));
                            }

                            if (result.categoryMask) {
                                const mask = result.categoryMask.getAsUint8Array();
                                const mW = result.categoryMask.width;
                                const mH = result.categoryMask.height;

                                const cornerVal = mask[0];
                                const bgIdx = labels.findIndex(l => /background/i.test(String(l)));
                                const bgValue = bgIdx >= 0 ? bgIdx : cornerVal;

                                const maskCanvas = document.createElement('canvas');
                                maskCanvas.width = passImg.naturalWidth || passImg.width;
                                maskCanvas.height = passImg.naturalHeight || passImg.height;
                                const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

                                mCtx.drawImage(passImg, 0, 0, maskCanvas.width, maskCanvas.height);
                                const imgData = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                                const pixels = imgData.data;

                                const scaleX = mW / maskCanvas.width;
                                const scaleY = mH / maskCanvas.height;

                                for (let y = 0; y < maskCanvas.height; y++) {
                                    for (let x = 0; x < maskCanvas.width; x++) {
                                        const mIdx = Math.floor(y * scaleY) * mW + Math.floor(x * scaleX);
                                        const pIdx = (y * maskCanvas.width + x) * 4;
                                        if (mask[mIdx] === bgValue) {
                                            pixels[pIdx + 3] = 0;
                                        }
                                    }
                                }

                                mCtx.putImageData(imgData, 0, 0);
                                return resolve(maskCanvas);
                            }

                            reject(new Error('No segmentation mask returned'));
                        });
                    });

                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Segmentation timeout')), 12000));
                    passSubjectMask = await Promise.race([segPromise, timeoutPromise]);
                    segmented = true;
                } catch (mpErr) {
                    console.warn('[Passport Maker] MediaPipe execution fell back to local segmentation:', mpErr);
                }
            }

            if (!segmented) {
                setPassportStatus('Applying fallback portrait separation...', 'info');
                passSubjectMask = segmentPortraitFallback(passImg);
            }

            setPassportProgress(100);
            updateHeaderActionsVisibility();
            renderPassportCanvas();
            showPassportToast('Background removed! Choose your desired background color.');
        } catch (err) {
            console.warn('[Passport Maker] Segmentation fallback error:', err);
            showPassportToast('Could not remove background automatically. You can still adjust colors.', false);
        } finally {
            isProcessingBg = false;
            setTimeout(() => setPassportProgress(null), 250);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        }
    }

    /**
     * Build oriented source canvas when rotated or flipped
     */
    function getOrientedSource(srcImg) {
        const rawW = srcImg.width || srcImg.naturalWidth;
        const rawH = srcImg.height || srcImg.naturalHeight;
        if (passRotationDeg === 0 && !passFlipH) {
            return { el: srcImg, w: rawW, h: rawH };
        }

        const swap = (passRotationDeg === 90 || passRotationDeg === 270);
        const outW = swap ? rawH : rawW;
        const outH = swap ? rawW : rawH;
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const cx = c.getContext('2d');
        cx.translate(outW / 2, outH / 2);
        if (passFlipH) cx.scale(-1, 1);
        cx.rotate((passRotationDeg * Math.PI) / 180);
        cx.drawImage(srcImg, -rawW / 2, -rawH / 2, rawW, rawH);
        return { el: c, w: outW, h: outH };
    }

    /**
     * Render full-resolution master passport photo into an arbitrary target canvas
     */
    function composeMasterPhotoCanvas(targetCanvas, includeInnerBorder) {
        computeMasterRenderDimensions();

        const baseSrc = passSubjectMask || passImg;
        const oriented = getOrientedSource(baseSrc);

        const br = parseInt(document.getElementById('passBrSlider')?.value || 100, 10) / 100;
        const ct = parseInt(document.getElementById('passCtSlider')?.value || 100, 10) / 100;
        const gamma = Math.max(0.2, parseFloat(document.getElementById('passGammaSlider')?.value || 1.0));
        const rShift = parseInt(document.getElementById('passRSlider')?.value || 0, 10);
        const gShift = parseInt(document.getElementById('passGSlider')?.value || 0, 10);
        const bShift = parseInt(document.getElementById('passBSlider')?.value || 0, 10);

        const baseScale = Math.max(passTargetW / oriented.w, passTargetH / oriented.h);
        const drawW = oriented.w * baseScale * passZoom;
        const drawH = oriented.h * baseScale * passZoom;
        const offsetPxX = (passOffsetX / 100) * (passTargetW * 0.6);
        const offsetPxY = (passOffsetY / 100) * (passTargetH * 0.6);
        const drawX = (passTargetW - drawW) / 2 + offsetPxX;
        const drawY = (passTargetH - drawH) / 2 + offsetPxY;

        const hasGamma = Math.abs(gamma - 1.0) > 0.005;
        const hasRgbShift = (rShift !== 0 || gShift !== 0 || bShift !== 0);

        // Render foreground on transparent offscreen canvas so gamma & RGB never tint background color
        const fgCanvas = document.createElement('canvas');
        fgCanvas.width = passTargetW;
        fgCanvas.height = passTargetH;
        const fgCtx = fgCanvas.getContext('2d', { willReadFrequently: (hasGamma || hasRgbShift) });
        fgCtx.save();
        fgCtx.imageSmoothingEnabled = true;
        fgCtx.imageSmoothingQuality = 'high';
        fgCtx.filter = `brightness(${br}) contrast(${ct})`;
        fgCtx.drawImage(oriented.el, drawX, drawY, drawW, drawH);
        fgCtx.restore();

        if (hasGamma || hasRgbShift) {
            let gammaLut = null;
            if (hasGamma) {
                gammaLut = new Uint8ClampedArray(256);
                const invGamma = 1 / gamma;
                for (let v = 0; v < 256; v++) {
                    gammaLut[v] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(v / 255, invGamma))));
                }
            }

            const imgData = fgCtx.getImageData(0, 0, passTargetW, passTargetH);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] > 0) {
                    let r = d[i];
                    let g = d[i + 1];
                    let b = d[i + 2];
                    if (gammaLut) {
                        r = gammaLut[r];
                        g = gammaLut[g];
                        b = gammaLut[b];
                    }
                    d[i] = Math.min(255, Math.max(0, r + rShift));
                    d[i + 1] = Math.min(255, Math.max(0, g + gShift));
                    d[i + 2] = Math.min(255, Math.max(0, b + bShift));
                }
            }
            fgCtx.putImageData(imgData, 0, 0);
        }

        const ctx = targetCanvas.getContext('2d');
        targetCanvas.width = passTargetW;
        targetCanvas.height = passTargetH;

        ctx.fillStyle = passBgColor;
        ctx.fillRect(0, 0, passTargetW, passTargetH);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(fgCanvas, 0, 0);

        if (includeInnerBorder) {
            const borderPx = Math.max(2, Math.round(Math.min(passTargetW, passTargetH) * 0.004));
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = borderPx;
            ctx.strokeRect(borderPx / 2, borderPx / 2, passTargetW - borderPx, passTargetH - borderPx);
        }
    }

    function getHighResBorderlessPhotoCanvas() {
        const off = document.createElement('canvas');
        composeMasterPhotoCanvas(off, false);
        return off;
    }

    /**
     * 6. Master Canvas Render Function
     */
    function renderPassportCanvas() {
        if (!passImg) return;

        const canvasList = document.querySelectorAll('#passportCanvas');
        canvasList.forEach(canvas => {
            composeMasterPhotoCanvas(canvas, false);
        });

        applyStaticPreviewDisplaySize();
        updatePassportInfoCluster();
        refreshOpenPrintModalIfActive();
    }

    /**
     * 7. Paper & Sheet Layout Helpers (Left Margin Aligned + Exact Physical Photo Size + Gap & Crop Line Options)
     */
    function readPaperSize() {
        const sel = document.getElementById('passportPaperSize');
        if (sel && PAPER_SPECS[sel.value]) {
            passPaperSize = sel.value;
        }
        return passPaperSize;
    }

    function readPhotoCount(explicitCount) {
        if (explicitCount !== undefined && explicitCount !== null) {
            passPhotoCount = Math.max(1, Math.min(100, parseInt(explicitCount, 10) || 1));
            return passPhotoCount;
        }
        const inp = document.getElementById('passportSheetCount');
        if (inp) {
            const val = parseInt(inp.value, 10);
            if (!isNaN(val) && val >= 1) {
                passPhotoCount = Math.max(1, Math.min(100, val));
            }
        }
        return passPhotoCount;
    }

    function syncModalSpacingState() {
        const gapEl = document.getElementById('passportModalPhotoGap');
        const borderEl = document.getElementById('passportModalPhotoBorder');
        const cropGapEl = document.getElementById('passportModalCropGap');
        const cropLineEnableEl = document.getElementById('passportModalCropLineEnable');
        const lineTypeEl = document.getElementById('passportModalCropLineType');
        const scaleSliderEl = document.getElementById('passportModalPhotoScaleSlider');
        const scaleInputEl = document.getElementById('passportModalPhotoScaleInput');

        if (gapEl) {
            const v = parseFloat(gapEl.value);
            if (isFinite(v) && v >= 0) passPrintPhotoGapMm = Math.min(20, v);
        }
        if (borderEl) {
            const v = parseFloat(borderEl.value);
            if (isFinite(v) && v >= 0) passPrintPhotoBorderMm = Math.min(3, v);
        }
        if (cropGapEl) {
            const v = parseFloat(cropGapEl.value);
            if (isFinite(v) && v >= 0) passPrintCropGapMm = Math.min(10, v);
        }
        if (cropLineEnableEl) {
            passPrintCropLineEnabled = !!cropLineEnableEl.checked;
        }
        if (lineTypeEl) {
            lineTypeEl.disabled = !passPrintCropLineEnabled;
            if (lineTypeEl.value === 'dashed' || lineTypeEl.value === 'solid') {
                passPrintCropLineType = lineTypeEl.value;
            }
        }
        if (scaleSliderEl && document.activeElement !== scaleSliderEl) {
            scaleSliderEl.value = passPrintScaleOffset;
        }
        if (scaleInputEl && document.activeElement !== scaleInputEl) {
            scaleInputEl.value = passPrintScaleOffset;
        }
    }

    function updatePassportPrintSettings() {
        readPaperSize();
        readPhotoCount();
        document.querySelectorAll('#passportPaperSize').forEach(el => el.value = passPaperSize);
        document.querySelectorAll('#passportSheetCount').forEach(el => el.value = passPhotoCount);
        refreshOpenPrintModalIfActive();
    }

    function computeSheetLayout(paperKey, requestedCount) {
        const paper = PAPER_SPECS[paperKey] || PAPER_SPECS['A4'];
        const count = Math.max(1, Math.min(100, parseInt(requestedCount, 10) || 1));

        const scaleFactor = Math.max(0.5, Math.min(1.5, (100 + passPrintScaleOffset) / 100));
        const imgWmm = passPhysicalWmm * scaleFactor;
        const imgHmm = passPhysicalHmm * scaleFactor;
        const photoGap = Math.max(0, Math.min(20, Number(passPrintPhotoGapMm) || 0));
        const photoBorderMm = Math.max(0, Math.min(3, Number(passPrintPhotoBorderMm) || 0));
        const cropGap = Math.max(0, Math.min(10, Number(passPrintCropGapMm) || 0));
        const cropLineEnabled = !!passPrintCropLineEnabled;
        const cropLineType = passPrintCropLineType === 'solid' ? 'solid' : 'dashed';

        // Crop border wraps photo + cropGap on all 4 sides, while photo keeps exact scaled (imgWmm x imgHmm) size
        const slotWmm = imgWmm + 2 * cropGap;
        const slotHmm = imgHmm + 2 * cropGap;

        const usableWmm = Math.max(slotWmm, paper.wMm - paper.marginLeftMm - paper.marginRightMm);
        const usableHmm = Math.max(slotHmm, paper.hMm - paper.marginTopMm - paper.marginBottomMm);

        const cols = Math.max(1, Math.floor((usableWmm + photoGap + 0.01) / (slotWmm + photoGap)));
        const rowsPerPage = Math.max(1, Math.floor((usableHmm + photoGap + 0.01) / (slotHmm + photoGap)));
        const perPage = cols * rowsPerPage;

        const pages = [];
        let remaining = count;
        while (remaining > 0) {
            const pageCount = Math.min(remaining, perPage);
            const items = [];
            for (let idx = 0; idx < pageCount; idx++) {
                const row = Math.floor(idx / cols);
                const col = idx % cols;
                const slotXmm = paper.marginLeftMm + col * (slotWmm + photoGap);
                const slotYmm = paper.marginTopMm + row * (slotHmm + photoGap);
                items.push({
                    slotXmm,
                    slotYmm,
                    slotWmm,
                    slotHmm,
                    imgXmm: slotXmm + cropGap,
                    imgYmm: slotYmm + cropGap,
                    imgWmm,
                    imgHmm
                });
            }
            pages.push(items);
            remaining -= pageCount;
        }

        return {
            paperKey,
            paper,
            count,
            cols,
            rowsPerPage,
            perPage,
            imgWmm,
            imgHmm,
            scaleFactor,
            photoGap,
            photoBorderMm,
            cropGap,
            cropLineEnabled,
            cropLineType,
            pages
        };
    }

    function ensureDynamicPrintPageStyle(paper) {
        let styleEl = document.getElementById('passport-print-page-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'passport-print-page-style';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = `
            @media print {
                @page {
                    size: ${paper.wMm}mm ${paper.hMm}mm;
                    margin: 0;
                }
                #print-area {
                    width: ${paper.wMm}mm !important;
                    min-height: ${paper.hMm}mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
            }
        `;
    }

    function buildPrintPageElements(photoDataUrl, layout) {
        const { paper, photoBorderMm, cropGap, cropLineEnabled, cropLineType, pages } = layout;
        const fragment = document.createDocumentFragment();
        const imgs = [];

        pages.forEach((items, pageIdx) => {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'passport-print-sheet-page';
            pageDiv.style.cssText = `position:relative; width:${paper.wMm}mm; height:${paper.hMm}mm; margin:0; padding:0; background:#ffffff; overflow:hidden; box-sizing:border-box; ${pageIdx < pages.length - 1 ? 'page-break-after:always; break-after:page;' : ''}`;

            items.forEach((item, i) => {
                const slot = document.createElement('div');
                const cropBorderCss = cropLineEnabled ? `border:0.1mm ${cropLineType} #cbd5e1;` : 'border:none;';
                slot.style.cssText = `position:absolute; left:${item.slotXmm.toFixed(2)}mm; top:${item.slotYmm.toFixed(2)}mm; width:${item.slotWmm.toFixed(2)}mm; height:${item.slotHmm.toFixed(2)}mm; padding:${cropGap.toFixed(2)}mm; ${cropBorderCss} box-sizing:border-box; background:#ffffff;`;

                const img = document.createElement('img');
                img.src = photoDataUrl;
                img.alt = `Passport Photo ${i + 1}`;
                const borderCss = photoBorderMm > 0 ? `border:${photoBorderMm.toFixed(2)}mm solid #334155;` : 'border:none;';
                img.style.cssText = `width:${item.imgWmm.toFixed(2)}mm; height:${item.imgHmm.toFixed(2)}mm; ${borderCss} box-sizing:border-box; display:block; object-fit:fill;`;

                slot.appendChild(img);
                pageDiv.appendChild(slot);
                imgs.push(img);
            });

            fragment.appendChild(pageDiv);
        });

        return { fragment, imgs };
    }

    function buildModalPreviewPaper(photoDataUrl, layout) {
        const { paper, photoBorderMm, cropLineEnabled, cropLineType, pages } = layout;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:18px; width:100%;';

        const maxPreviewWidthPx = paper.wMm < 140 ? 380 : 620;
        const scalePxPerMm = maxPreviewWidthPx / paper.wMm;

        pages.forEach((items, pageIdx) => {
            const pageBox = document.createElement('div');
            pageBox.className = 'passport-paper-preview';
            pageBox.style.cssText = `width:min(88vw, ${maxPreviewWidthPx}px); aspect-ratio:${paper.wMm} / ${paper.hMm}; background:#ffffff; position:relative; overflow:hidden; box-shadow:0 20px 55px rgba(0,0,0,0.45); border-radius:2px;`;

            items.forEach((item, i) => {
                const slotLeftPct = (item.slotXmm / paper.wMm) * 100;
                const slotTopPct = (item.slotYmm / paper.hMm) * 100;
                const slotWPct = (item.slotWmm / paper.wMm) * 100;
                const slotHPct = (item.slotHmm / paper.hMm) * 100;

                const slot = document.createElement('div');
                const cropBorderCss = cropLineEnabled ? `border:1px ${cropLineType} #cbd5e1;` : 'border:none;';
                slot.style.cssText = `position:absolute; left:${slotLeftPct.toFixed(3)}%; top:${slotTopPct.toFixed(3)}%; width:${slotWPct.toFixed(3)}%; height:${slotHPct.toFixed(3)}%; ${cropBorderCss} box-sizing:border-box; background:#fff;`;

                // Position exact photo inside crop slot at exact cropGap percentage
                const innerX = ((item.imgXmm - item.slotXmm) / item.slotWmm) * 100;
                const innerY = ((item.imgYmm - item.slotYmm) / item.slotHmm) * 100;
                const innerW = (item.imgWmm / item.slotWmm) * 100;
                const innerH = (item.imgHmm / item.slotHmm) * 100;

                const photoBorderPx = photoBorderMm > 0 ? Math.max(1, Number((photoBorderMm * scalePxPerMm).toFixed(2))) : 0;
                const borderCss = photoBorderPx > 0 ? `border:${photoBorderPx}px solid #334155;` : 'border:none;';

                const img = document.createElement('img');
                img.src = photoDataUrl;
                img.alt = `Preview Photo ${i + 1}`;
                img.style.cssText = `position:absolute; left:${innerX.toFixed(3)}%; top:${innerY.toFixed(3)}%; width:${innerW.toFixed(3)}%; height:${innerH.toFixed(3)}%; ${borderCss} box-sizing:border-box; display:block; object-fit:fill;`;

                slot.appendChild(img);
                pageBox.appendChild(slot);
            });

            if (pages.length > 1) {
                const pageBadge = document.createElement('div');
                pageBadge.textContent = `Page ${pageIdx + 1} of ${pages.length}`;
                pageBadge.style.cssText = 'position:absolute; right:8px; bottom:6px; font-size:10px; font-weight:700; color:#64748b; background:rgba(255,255,255,0.88); padding:2px 6px; border-radius:4px;';
                pageBox.appendChild(pageBadge);
            }

            wrapper.appendChild(pageBox);
        });

        return wrapper;
    }

    async function renderPassportPrintTargets() {
        if (!passImg) return null;

        syncModalSpacingState();
        const paperKey = readPaperSize();
        const count = readPhotoCount();
        const layout = computeSheetLayout(paperKey, count);

        // Always render full high-resolution photo bitmap (no inner canvas border so modal photoBorderMm controls it accurately)
        const photoCanvas = getHighResBorderlessPhotoCanvas();
        const photoDataUrl = photoCanvas.toDataURL('image/jpeg', 0.98);

        ensureDynamicPrintPageStyle(layout.paper);

        let printArea = document.getElementById('print-area');
        if (!printArea) {
            printArea = document.createElement('div');
            printArea.id = 'print-area';
            document.body.appendChild(printArea);
        }
        printArea.innerHTML = '';
        const { fragment, imgs } = buildPrintPageElements(photoDataUrl, layout);
        printArea.appendChild(fragment);

        const previewContainer = document.getElementById('passportPrintPreviewContainer');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.appendChild(buildModalPreviewPaper(photoDataUrl, layout));
        }

        const summaryEl = document.getElementById('passportModalSummary');
        if (summaryEl) {
            const scaleBadge = passPrintScaleOffset !== 0 ? ` [${passPrintScaleOffset > 0 ? '+' : ''}${passPrintScaleOffset}%]` : '';
            summaryEl.textContent = `${layout.paper.label} • ${layout.cols} col${layout.cols > 1 ? 's' : ''} × ${layout.rowsPerPage} row${layout.rowsPerPage > 1 ? 's' : ''}/page • ${count} Photo${count > 1 ? 's' : ''} (${layout.imgWmm.toFixed(1)} × ${layout.imgHmm.toFixed(1)} mm${scaleBadge} • ${photoCanvas.width}×${photoCanvas.height}px master)`;
        }

        const modalPaperSel = document.getElementById('passportModalPaperSize');
        if (modalPaperSel) modalPaperSel.value = paperKey;
        const modalCountInp = document.getElementById('passportModalPhotoCount');
        if (modalCountInp) modalCountInp.value = count;
        const scaleSliderEl = document.getElementById('passportModalPhotoScaleSlider');
        if (scaleSliderEl && document.activeElement !== scaleSliderEl) scaleSliderEl.value = passPrintScaleOffset;
        const scaleInputEl = document.getElementById('passportModalPhotoScaleInput');
        if (scaleInputEl && document.activeElement !== scaleInputEl) scaleInputEl.value = passPrintScaleOffset;

        await Promise.all(imgs.map(img => (
            img.decode ? img.decode().catch(() => {}) : Promise.resolve()
        )));

        return layout;
    }

    function onPassportModalPhotoScaleSlider(val) {
        const parsed = parseInt(val, 10);
        passPrintScaleOffset = isNaN(parsed) ? 0 : Math.max(-50, Math.min(50, parsed));
        const inputEl = document.getElementById('passportModalPhotoScaleInput');
        if (inputEl && document.activeElement !== inputEl) {
            inputEl.value = passPrintScaleOffset;
        }
        renderPassportPrintTargets();
    }

    function onPassportModalPhotoScaleInput(val) {
        const trimmed = String(val || '').trim();
        if (trimmed === '' || trimmed === '-' || trimmed === '+') return;
        const parsed = parseInt(trimmed, 10);
        if (isNaN(parsed)) return;
        passPrintScaleOffset = Math.max(-50, Math.min(50, parsed));
        const sliderEl = document.getElementById('passportModalPhotoScaleSlider');
        if (sliderEl) sliderEl.value = passPrintScaleOffset;
        const inputEl = document.getElementById('passportModalPhotoScaleInput');
        if (inputEl && parsed !== passPrintScaleOffset) {
            inputEl.value = passPrintScaleOffset;
        }
        renderPassportPrintTargets();
    }

    function refreshOpenPrintModalIfActive() {
        const modal = document.getElementById('passport-print-modal');
        if (modal && modal.classList.contains('active') && passImg) {
            renderPassportPrintTargets();
        }
    }

    function onPassportModalSettingsChange() {
        const modalPaperSel = document.getElementById('passportModalPaperSize');
        const modalCountInp = document.getElementById('passportModalPhotoCount');
        if (modalPaperSel && PAPER_SPECS[modalPaperSel.value]) {
            passPaperSize = modalPaperSel.value;
            document.querySelectorAll('#passportPaperSize').forEach(el => el.value = passPaperSize);
        }
        if (modalCountInp) {
            const v = parseInt(modalCountInp.value, 10);
            if (!isNaN(v) && v >= 1) {
                passPhotoCount = Math.max(1, Math.min(100, v));
                document.querySelectorAll('#passportSheetCount').forEach(el => el.value = passPhotoCount);
            }
        }
        syncModalSpacingState();
        renderPassportPrintTargets();
    }

    /**
     * 8. Download Single Passport Photo (Full Master Resolution)
     */
    function downloadPassportPhoto() {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        const canvas = document.getElementById('passportCanvas');
        if (!canvas) return;

        const link = document.createElement('a');
        link.download = `passport_photo_${passTargetW}x${passTargetH}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.98);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showPassportToast(`Passport photo downloaded (${passTargetW} × ${passTargetH} px)!`);
    }

    /**
     * 9. Open Print Preview Modal
     */
    async function printPassportSheet(photoCount) {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        if (photoCount !== undefined && photoCount !== null) {
            passPhotoCount = Math.max(1, Math.min(100, parseInt(photoCount, 10) || 1));
            document.querySelectorAll('#passportSheetCount').forEach(el => el.value = passPhotoCount);
        }

        const scaleSliderEl = document.getElementById('passportModalPhotoScaleSlider');
        if (scaleSliderEl) scaleSliderEl.value = passPrintScaleOffset;
        const scaleInputEl = document.getElementById('passportModalPhotoScaleInput');
        if (scaleInputEl) scaleInputEl.value = passPrintScaleOffset;

        const modal = document.getElementById('passport-print-modal');
        if (modal) {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            await renderPassportPrintTargets();
            setPassportStatus(`Print preview ready (${PAPER_SPECS[passPaperSize].label}, ${passPhotoCount} photos). Click Print Now or Download PDF.`, 'ok');
        } else {
            await renderPassportPrintTargets();
            confirmPassportPrintNow();
        }
    }

    function closePassportPrintModal() {
        const modal = document.getElementById('passport-print-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    /**
     * Trigger System Print synchronously from user click on "Print Now"
     */
    function confirmPassportPrintNow() {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        const paper = PAPER_SPECS[readPaperSize()] || PAPER_SPECS['A4'];
        ensureDynamicPrintPageStyle(paper);
        try {
            window.focus();
        } catch (_) {}
        try {
            window.print();
        } catch (err) {
            console.warn('[Passport Maker] window.print() failed:', err);
            showPassportToast('System print is unavailable here. Use Download PDF or Download JPG.', false);
        }
    }

    /**
     * 10. High-DPI JPG Sheet Generator (600 DPI for 4x6, 450 DPI for A4, with exact gaps & borders)
     */
    function renderSheetCanvases(paperKey, photoCount) {
        if (!passImg) return null;

        syncModalSpacingState();
        const layout = computeSheetLayout(paperKey, photoCount);
        const { paper, photoBorderMm, cropLineEnabled, cropLineType, pages } = layout;

        const sheetDpi = paperKey === '4x6' ? 600 : 450;
        const pageWpx = mmToPx(paper.wMm, sheetDpi);
        const pageHpx = mmToPx(paper.hMm, sheetDpi);
        const pxPerMm = sheetDpi / 25.4;

        const photoCanvas = getHighResBorderlessPhotoCanvas();

        const renderedPages = pages.map((items) => {
            const sheetCanvas = document.createElement('canvas');
            sheetCanvas.width = pageWpx;
            sheetCanvas.height = pageHpx;
            const sCtx = sheetCanvas.getContext('2d');

            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, pageWpx, pageHpx);
            sCtx.imageSmoothingEnabled = true;
            sCtx.imageSmoothingQuality = 'high';

            items.forEach((item) => {
                const slotX = item.slotXmm * pxPerMm;
                const slotY = item.slotYmm * pxPerMm;
                const slotW = item.slotWmm * pxPerMm;
                const slotH = item.slotHmm * pxPerMm;

                const imgX = item.imgXmm * pxPerMm;
                const imgY = item.imgYmm * pxPerMm;
                const imgW = item.imgWmm * pxPerMm;
                const imgH = item.imgHmm * pxPerMm;

                // Draw high-res photo at exact physical coordinates
                sCtx.drawImage(photoCanvas, imgX, imgY, imgW, imgH);

                // Inner photo border flush inside photo boundary
                if (photoBorderMm > 0) {
                    const bPx = Math.max(1, photoBorderMm * pxPerMm);
                    sCtx.strokeStyle = '#334155';
                    sCtx.lineWidth = bPx;
                    sCtx.setLineDash([]);
                    sCtx.strokeRect(imgX + bPx / 2, imgY + bPx / 2, imgW - bPx, imgH - bPx);
                }

                // Optional outer crop line: fixed 0.1 mm light grey around (slotX, slotY, slotW, slotH)
                if (cropLineEnabled) {
                    const cropLw = Math.max(1, 0.1 * pxPerMm);
                    sCtx.strokeStyle = '#cbd5e1';
                    sCtx.lineWidth = cropLw;
                    if (cropLineType === 'dashed') {
                        sCtx.setLineDash([Math.round(1.8 * pxPerMm), Math.round(1.4 * pxPerMm)]);
                    } else {
                        sCtx.setLineDash([]);
                    }
                    sCtx.strokeRect(slotX, slotY, slotW, slotH);
                    sCtx.setLineDash([]);
                }
            });

            return sheetCanvas;
        });

        return { layout, renderedPages };
    }

    /**
     * Download Full Photo Sheet as High-DPI JPG (A4 or 4x6, Left Margin Aligned)
     */
    function downloadPassportSheet(photoCount) {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        const paperKey = readPaperSize();
        const count = readPhotoCount(photoCount);
        const result = renderSheetCanvases(paperKey, count);
        if (!result || !result.renderedPages.length) return;

        result.renderedPages.forEach((sheetCanvas, idx) => {
            const link = document.createElement('a');
            const suffix = result.renderedPages.length > 1 ? `_page${idx + 1}` : '';
            link.download = `passport_sheet_${paperKey}_${count}up${suffix}_hd.jpg`;
            link.href = sheetCanvas.toDataURL('image/jpeg', 0.98);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        showPassportToast(`${PAPER_SPECS[paperKey].label} High-Res JPG (${count} photos) downloaded!`);
    }

    /**
     * Vector + Single Full-Res JPEG XObject PDF Generator:
     * Preserves 100% original photo resolution regardless of small print dimensions,
     * with crisp vector borders and dashed/solid crop lines at exact mm positions.
     */
    function dataUrlToUint8Array(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function buildVectorSheetPdfBlob(photoCanvas, layout) {
        const { paper, photoBorderMm, cropLineEnabled, cropLineType, pages } = layout;
        const PT_PER_MM = 72 / 25.4;
        const pageWPt = +(paper.wMm * PT_PER_MM).toFixed(3);
        const pageHPt = +(paper.hMm * PT_PER_MM).toFixed(3);

        const jpgBytes = dataUrlToUint8Array(photoCanvas.toDataURL('image/jpeg', 0.98));
        const encoder = new TextEncoder();
        const parts = [];
        const offsets = [0];
        let byteLength = 0;

        function pushBytes(u8) {
            parts.push(u8);
            byteLength += u8.length;
        }

        function pushStr(str) {
            pushBytes(encoder.encode(str));
        }

        pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

        // Obj 1: Catalog, Obj 2: Pages, Obj 3: Shared High-Res Image XObject
        // Then per page i: Page = 4 + 2*i, Content = 5 + 2*i
        const pageObjIds = pages.map((_, i) => 4 + i * 2);

        offsets[1] = byteLength;
        pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

        offsets[2] = byteLength;
        pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

        offsets[3] = byteLength;
        pushStr(
            `3 0 obj\n<< /Type /XObject /Subtype /Image /Width ${photoCanvas.width} /Height ${photoCanvas.height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpgBytes.length} >>\nstream\n`
        );
        pushBytes(jpgBytes);
        pushStr('\nendstream\nendobj\n');

        pages.forEach((items, pageIdx) => {
            const pageId = 4 + pageIdx * 2;
            const contentId = pageId + 1;

            let ops = 'q\n1 1 1 rg\n0 0 ' + pageWPt + ' ' + pageHPt + ' re f\nQ\n';

            items.forEach((item) => {
                const imgXPt = (item.imgXmm * PT_PER_MM).toFixed(3);
                const imgYBottomPt = (pageHPt - (item.imgYmm + item.imgHmm) * PT_PER_MM).toFixed(3);
                const imgWPt = (item.imgWmm * PT_PER_MM).toFixed(3);
                const imgHPt = (item.imgHmm * PT_PER_MM).toFixed(3);

                // Draw full-res photo image
                ops += `q\n${imgWPt} 0 0 ${imgHPt} ${imgXPt} ${imgYBottomPt} cm\n/Im0 Do\nQ\n`;

                // Draw crisp inner photo border if > 0
                if (photoBorderMm > 0) {
                    const bPtNum = photoBorderMm * PT_PER_MM;
                    const bPt = bPtNum.toFixed(3);
                    const bx = (item.imgXmm * PT_PER_MM + bPtNum / 2).toFixed(3);
                    const by = (pageHPt - (item.imgYmm + item.imgHmm) * PT_PER_MM + bPtNum / 2).toFixed(3);
                    const bw = Math.max(0.5, item.imgWmm * PT_PER_MM - bPtNum).toFixed(3);
                    const bh = Math.max(0.5, item.imgHmm * PT_PER_MM - bPtNum).toFixed(3);
                    ops += `q\n0.2 0.255 0.333 RG\n${bPt} w\n[] 0 d\n${bx} ${by} ${bw} ${bh} re S\nQ\n`;
                }

                // Draw optional outer crop line: fixed 0.1 mm light grey (#cbd5e1) dashed or plain/solid
                if (cropLineEnabled) {
                    const slotXPt = (item.slotXmm * PT_PER_MM).toFixed(3);
                    const slotYBottomPt = (pageHPt - (item.slotYmm + item.slotHmm) * PT_PER_MM).toFixed(3);
                    const slotWPt = (item.slotWmm * PT_PER_MM).toFixed(3);
                    const slotHPt = (item.slotHmm * PT_PER_MM).toFixed(3);
                    const cropLineWidthPt = (0.1 * PT_PER_MM).toFixed(3);
                    const dashPattern = cropLineType === 'dashed' ? '[3.5 2.5] 0 d' : '[] 0 d';

                    ops += `q\n0.796 0.835 0.882 RG\n${cropLineWidthPt} w\n${dashPattern}\n${slotXPt} ${slotYBottomPt} ${slotWPt} ${slotHPt} re S\nQ\n`;
                }
            });

            offsets[pageId] = byteLength;
            pushStr(
                `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWPt} ${pageHPt}] ` +
                `/Resources << /XObject << /Im0 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
            );

            offsets[contentId] = byteLength;
            pushStr(`${contentId} 0 obj\n<< /Length ${ops.length} >>\nstream\n${ops}endstream\nendobj\n`);
        });

        const xrefStart = byteLength;
        const totalObjs = 4 + pages.length * 2;
        pushStr(`xref\n0 ${totalObjs}\n0000000000 65535 f \n`);
        for (let id = 1; id < totalObjs; id++) {
            const offStr = String(offsets[id]).padStart(10, '0');
            pushStr(`${offStr} 00000 n \n`);
        }
        pushStr(`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

        return new Blob(parts, { type: 'application/pdf' });
    }

    function downloadPassportPrintPdf() {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        syncModalSpacingState();
        const paperKey = readPaperSize();
        const count = readPhotoCount();
        const layout = computeSheetLayout(paperKey, count);
        const photoCanvas = getHighResBorderlessPhotoCanvas();

        const pdfBlob = buildVectorSheetPdfBlob(photoCanvas, layout);
        const url = URL.createObjectURL(pdfBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `passport_print_${paperKey}_${count}up.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        showPassportToast(`${layout.paper.label} High-Res Print PDF downloaded (${count} photos)!`);
    }

    /**
     * 11. Send To Menu (matching Image & PDF Editor popover style)
     */
    async function sendPassportToTargetTool(targetTool) {
        if (!passImg) {
            showPassportToast('Please upload a photo first.', false);
            return;
        }
        const photoCanvas = getHighResBorderlessPhotoCanvas();
        const dataUrl = photoCanvas.toDataURL('image/jpeg', 0.98);
        const payload = {
            source: 'Passport Photo Maker',
            targetTool: targetTool || 'compress',
            items: [{ dataUrl, name: 'passport_photo.jpg' }],
            timestamp: Date.now()
        };

        const hasSpaEditor = !!document.getElementById('page-editor-studio') && typeof window.receiveCrossStudioTransfer === 'function';
        if (hasSpaEditor) {
            if (window.MonuRouter && window.MonuRouter.navigateTo) {
                window.MonuRouter.navigateTo('/image-pdf-editor');
            }
            await window.receiveCrossStudioTransfer(payload);
            return;
        }

        try {
            await writeCrossTransferDb('pending_cross_studio_transfer', payload);
            sessionStorage.setItem('monu_pending_transfer', '1');
        } catch (e) {
            console.warn(e);
        }
        if (window.MonuRouter && window.MonuRouter.navigateTo) {
            window.MonuRouter.navigateTo('/image-pdf-editor');
        } else {
            window.location.href = '/image-pdf-editor';
        }
    }

    function sendPassportToImageEditor() {
        return sendPassportToTargetTool('compress');
    }

    function sendPassportToPdf() {
        return sendPassportToTargetTool('img2pdf');
    }

    function openPassportSendToMenu(triggerBtn) {
        if (!passImg) {
            showPassportToast('Please upload a portrait photo first.', false);
            return;
        }
        if (!triggerBtn) return;

        if (typeof window.closeSendToMenu === 'function') {
            window.closeSendToMenu();
        } else {
            const existing = document.getElementById('monuSendToPopover');
            if (existing) existing.remove();
        }

        const options = [
            { icon: '🖼️', title: 'Image & PDF Editor', sub: 'Compress KB size, resize, watermark & convert format', action: sendPassportToImageEditor },
            { icon: '📄', title: 'Images to PDF Tool', sub: 'Compile passport photo directly into PDF', action: sendPassportToPdf },
            { icon: '📑', title: 'Download Print Sheet (PDF)', sub: 'Export exact-size A4 / 4×6 PDF for printing', action: () => downloadPassportPrintPdf() }
        ];

        const pop = document.createElement('div');
        pop.id = 'monuSendToPopover';
        pop.className = 'send-to-popover';
        pop.setAttribute('role', 'menu');

        const header = document.createElement('div');
        header.className = 'send-to-popover-header';
        header.innerHTML = '<span>Send Passport Photo To</span>';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'send-to-close-btn';
        closeBtn.setAttribute('aria-label', 'Close menu');
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => pop.remove();
        header.appendChild(closeBtn);
        pop.appendChild(header);

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'send-to-option';
            btn.setAttribute('role', 'menuitem');
            btn.innerHTML = `
                <span class="send-to-option-icon">${opt.icon}</span>
                <span class="send-to-option-text">
                    <span class="send-to-option-title">${opt.title}</span>
                    <span class="send-to-option-sub">${opt.sub}</span>
                </span>
                <span class="send-to-option-arrow">→</span>`;
            btn.onclick = (ev) => {
                ev.stopPropagation();
                pop.remove();
                opt.action();
            };
            pop.appendChild(btn);
        });

        document.body.appendChild(pop);
        triggerBtn.setAttribute('aria-expanded', 'true');

        const tr = triggerBtn.getBoundingClientRect();
        const pr = pop.getBoundingClientRect();
        const spaceBelow = window.innerHeight - tr.bottom;
        const top = (spaceBelow >= pr.height + 12)
            ? Math.min(window.innerHeight - pr.height - 12, tr.bottom + 8)
            : Math.max(12, tr.top - pr.height - 8);
        let left = tr.left + (tr.width / 2) - (pr.width / 2);
        left = Math.max(12, Math.min(left, window.innerWidth - pr.width - 12));

        pop.style.top = `${Math.round(top)}px`;
        pop.style.left = `${Math.round(left)}px`;

        const cleanup = (ev) => {
            if (!pop.contains(ev.target) && ev.target !== triggerBtn && !triggerBtn.contains(ev.target)) {
                pop.remove();
                triggerBtn.setAttribute('aria-expanded', 'false');
                document.removeEventListener('mousedown', cleanup, true);
                document.removeEventListener('touchstart', cleanup, true);
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', cleanup, true);
            document.addEventListener('touchstart', cleanup, true);
        }, 0);
    }

    /**
     * Reset Edits (keep uploaded photo) vs Full Reset (delete photo)
     */
    function resetPassportEdits() {
        if (!passImg) return;
        passSubjectMask = null;
        passBgColor = 'rgb(241, 245, 249)';
        passZoom = 1.0;
        passOffsetX = 0;
        passOffsetY = 0;
        passRotationDeg = 0;
        passFlipH = false;
        passDragLocked = false;

        syncFramingControls();
        syncAdjustmentSliders();
        setPassportBgColor('rgb(241, 245, 249)', null);
        updateHeaderActionsVisibility();
        renderPassportCanvas();
        showPassportToast('Photo framing, background & adjustments reset.');
    }

    function resetPassportMaker() {
        passImg = null;
        passSubjectMask = null;
        passBgColor = 'rgb(241, 245, 249)';
        passZoom = 1.0;
        passOffsetX = 0;
        passOffsetY = 0;
        passRotationDeg = 0;
        passFlipH = false;
        passDragLocked = false;

        syncFramingControls();
        syncAdjustmentSliders();
        updateHeaderActionsVisibility();

        document.querySelectorAll('#passportUploadZone').forEach(el => el.style.display = 'flex');
        document.querySelectorAll('#passportSinglePreview').forEach(el => el.style.display = 'none');
        document.querySelectorAll('#passportCanvas').forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });

        document.querySelectorAll('#passportFileInput').forEach(fi => fi.value = '');
        setPassportBgColor('rgb(241, 245, 249)', null);
        setPassportStatus('Ready. Upload a portrait photo in the center workspace to begin.', 'ok');
    }

    // Attach to window object for global availability
    window.switchPassportTool = switchPassportTool;
    window.loadPassportImage = loadPassportImage;
    window.loadPassportFromDataUrl = loadPassportFromDataUrl;
    window.checkPendingPassportTransfer = checkPendingPassportTransfer;
    window.removePassportBackground = removePassportBackground;
    window.restorePassportOriginalBg = restorePassportOriginalBg;
    window.setPassportBgColor = setPassportBgColor;
    window.updatePassportSize = updatePassportSize;
    window.setPassportSizePreset = setPassportSizePreset;
    window.onCustomUnitChange = onCustomUnitChange;
    window.applyCustomPassportSize = applyCustomPassportSize;
    window.updatePassportFraming = updatePassportFraming;
    window.togglePassportDragLock = togglePassportDragLock;
    window.rotatePassportPhoto = rotatePassportPhoto;
    window.flipPassportPhoto = flipPassportPhoto;
    window.resetPassportFraming = resetPassportFraming;
    window.updatePassportAdjustments = updatePassportAdjustments;
    window.resetPassportSlidersOnly = resetPassportSlidersOnly;
    window.updatePassportPrintSettings = updatePassportPrintSettings;
    window.onPassportModalSettingsChange = onPassportModalSettingsChange;
    window.onPassportModalPhotoScaleSlider = onPassportModalPhotoScaleSlider;
    window.onPassportModalPhotoScaleInput = onPassportModalPhotoScaleInput;
    window.closePassportPrintModal = closePassportPrintModal;
    window.confirmPassportPrintNow = confirmPassportPrintNow;
    window.resetPassportEdits = resetPassportEdits;
    window.downloadPassportPhoto = downloadPassportPhoto;
    window.printPassportSheet = printPassportSheet;
    window.downloadPassportSheet = downloadPassportSheet;
    window.downloadPassportPrintPdf = downloadPassportPrintPdf;
    window.sendPassportToImageEditor = sendPassportToImageEditor;
    window.sendPassportToPdf = sendPassportToPdf;
    window.openPassportSendToMenu = openPassportSendToMenu;
    window.resetPassportMaker = resetPassportMaker;
    window.renderPassportCanvas = renderPassportCanvas;

    // Initialize drag-and-drop upload, canvas pointer pan & static preview resize handling
    function setupPassportEvents() {
        const dropTargets = document.querySelectorAll('#passportUploadZone, #passportPreviewPane');
        dropTargets.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
            });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                    loadPassportImage(e.dataTransfer.files[0]);
                }
            });
        });

        // Interactive pointer drag-to-pan directly on the passport canvas (respects passDragLocked)
        document.querySelectorAll('#passportCanvas').forEach(canvas => {
            let dragging = false;
            let startX = 0;
            let startY = 0;
            let origOffX = 0;
            let origOffY = 0;
            let dragRafPending = false;

            canvas.addEventListener('pointerdown', (e) => {
                if (!passImg || passDragLocked) return;
                dragging = true;
                startX = e.clientX;
                startY = e.clientY;
                origOffX = passOffsetX;
                origOffY = passOffsetY;
                canvas.style.cursor = 'grabbing';
                try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            });

            canvas.addEventListener('pointermove', (e) => {
                if (!dragging || !passImg || passDragLocked) return;
                const rect = canvas.getBoundingClientRect();
                const scaleX = rect.width ? (100 / (rect.width * 0.6)) : 0.4;
                const scaleY = rect.height ? (100 / (rect.height * 0.6)) : 0.4;
                passOffsetX = Math.max(-100, Math.min(100, Math.round(origOffX + (e.clientX - startX) * scaleX)));
                passOffsetY = Math.max(-100, Math.min(100, Math.round(origOffY + (e.clientY - startY) * scaleY)));
                if (!dragRafPending) {
                    dragRafPending = true;
                    requestAnimationFrame(() => {
                        dragRafPending = false;
                        renderPassportCanvas();
                    });
                }
            });

            const endDrag = () => {
                if (!dragging) return;
                dragging = false;
                canvas.style.cursor = passDragLocked ? 'not-allowed' : 'grab';
            };
            canvas.addEventListener('pointerup', endDrag);
            canvas.addEventListener('pointercancel', endDrag);
        });

        window.addEventListener('resize', () => {
            if (passImg) applyStaticPreviewDisplaySize();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePassportPrintModal();
            }
        });

        updatePassportInfoCluster();
        syncFramingControls();
        checkPendingPassportTransfer();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPassportEvents);
    } else {
        setupPassportEvents();
    }

})();
