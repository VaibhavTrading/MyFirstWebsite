import { OPS, Util } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type {
  DocBlock,
  PageClassification,
  PageConversionResult,
  PageMarginsPt,
  StyledRun,
  TableCellData,
  TableCellImage,
  TableRowData,
  TextAlign,
} from './types';

const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
} as const;

interface RawGlyphItem {
  str: string;
  x: number;
  y: number; // Top-down Y in pt
  endX: number;
  width: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  hasEOL: boolean;
}

interface TextSegment {
  x: number;
  endX: number;
  y: number;
  fontSize: number;
  text: string;
  runs: StyledRun[];
}

interface VisualLine {
  y: number;
  x: number;
  endX: number;
  fontSize: number;
  segments: TextSegment[];
  text: string;
  runs: StyledRun[];
  isBoldOnly: boolean;
}

interface RulingSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: 'h' | 'v';
}

interface FillRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hex: string;
}

interface ExtractedImage {
  x: number;
  yTop: number;
  widthPt: number;
  heightPt: number;
  pngBytes: Uint8Array;
}

function sanitizeXmlChars(input: string): string {
  // Strip XML-illegal control characters except \t, \n, \r
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function parseFontFlags(fontName: string, fontFamily?: string): { bold: boolean; italic: boolean } {
  const combined = `${fontName || ''} ${fontFamily || ''}`.toLowerCase();
  const bold = /\b(bold|black|heavy|semibold|demibold|demi|extrabold|ultrabold|medi|medium)\b|[-_,](bd|b)\b/i.test(
    combined
  );
  const italic = /\b(italic|oblique|slant|slanted|cursiv)\b|[-_,](it|i|bi)\b/i.test(combined);
  return { bold, italic };
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function isCombiningOrZeroWidth(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  // Devanagari signs/matras (0900-0903, 093A-094F, 0951-0957, 0962-0963), ZWNJ/ZWJ, Latin combining
  return (
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x0900 && code <= 0x0903) ||
    (code >= 0x093a && code <= 0x094f) ||
    (code >= 0x0951 && code <= 0x0957) ||
    (code >= 0x0962 && code <= 0x0963) ||
    code === 0x200c ||
    code === 0x200d
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) => {
    const scaled = v <= 1 ? Math.round(v * 255) : Math.round(v);
    return Math.max(0, Math.min(255, scaled)).toString(16).padStart(2, '0').toUpperCase();
  };
  return `${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function isNearWhiteHex(hex: string): boolean {
  if (!hex || hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 248 && g >= 248 && b >= 248;
}

/**
 * Inspect a PDF page to classify whether it contains meaningful selectable digital text,
 * is a scanned/image page needing OCR, or is completely empty.
 */
export async function classifyPdfPage(
  page: PDFPageProxy
): Promise<{ classification: PageClassification; textCharCount: number; hasPaintImage: boolean; hasPaths: boolean }> {
  const textContent = await page.getTextContent({ includeMarkedContent: false });
  let nonSpaceChars = 0;
  let alphaNumCount = 0;

  for (const item of textContent.items) {
    if ('str' in item && item.str) {
      const cleaned = item.str.replace(/\s+/g, '');
      nonSpaceChars += cleaned.length;
      const alphaMatches = cleaned.match(/[\p{L}\p{N}]/gu);
      if (alphaMatches) alphaNumCount += alphaMatches.length;
    }
  }

  let hasPaintImage = false;
  let hasPaths = false;
  try {
    const opList = await page.getOperatorList();
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject
      ) {
        hasPaintImage = true;
      } else if (fn === OPS.constructPath || fn === OPS.stroke || fn === OPS.fill) {
        hasPaths = true;
      }
      if (hasPaintImage && hasPaths) break;
    }
  } catch {
    // Fallback strictly to text heuristic if operator list fails
  }

  if (alphaNumCount >= 18 || nonSpaceChars >= 25) {
    return { classification: 'digital', textCharCount: nonSpaceChars, hasPaintImage, hasPaths };
  }
  if (hasPaintImage || hasPaths) {
    return {
      classification: nonSpaceChars >= 10 && !hasPaintImage ? 'digital' : 'scanned',
      textCharCount: nonSpaceChars,
      hasPaintImage,
      hasPaths,
    };
  }
  if (nonSpaceChars > 0) {
    return { classification: 'digital', textCharCount: nonSpaceChars, hasPaintImage, hasPaths };
  }
  return { classification: 'empty', textCharCount: 0, hasPaintImage: false, hasPaths: false };
}

function applyCtmPoint(ctm: number[], x: number, y: number): [number, number] {
  return [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
}

interface VectorGraphicBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function stitchCollinearDashes(dashes: RulingSegment[]): RulingSegment[] {
  const out: RulingSegment[] = [];
  const hDashes = dashes.filter((d) => d.orientation === 'h').sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vDashes = dashes.filter((d) => d.orientation === 'v').sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  const stitchAxis = (
    items: RulingSegment[],
    orientation: 'h' | 'v'
  ) => {
    const groups: RulingSegment[][] = [];
    for (const seg of items) {
      const coord = orientation === 'h' ? seg.y1 : seg.x1;
      let placed = false;
      for (let gi = groups.length - 1; gi >= 0; gi--) {
        const ref = orientation === 'h' ? groups[gi][0].y1 : groups[gi][0].x1;
        if (Math.abs(coord - ref) <= 1.5) {
          groups[gi].push(seg);
          placed = true;
          break;
        }
        if (coord - ref > 2.2) break;
      }
      if (!placed) groups.push([seg]);
    }
    for (const grp of groups) {
      if (grp.length < 3) continue;
      grp.sort((a, b) => (orientation === 'h' ? a.x1 - b.x1 : a.y1 - b.y1));
      const fixedCoord =
        grp.reduce((s, g) => s + (orientation === 'h' ? g.y1 : g.x1), 0) / grp.length;
      let run: RulingSegment[] = [grp[0]];
      const flushRun = () => {
        if (run.length >= 3) {
          const s0 = orientation === 'h' ? run[0].x1 : run[0].y1;
          const s1 = orientation === 'h' ? run[run.length - 1].x2 : run[run.length - 1].y2;
          if (s1 - s0 >= 18) {
            out.push(
              orientation === 'h'
                ? { x1: s0, y1: fixedCoord, x2: s1, y2: fixedCoord, orientation: 'h' }
                : { x1: fixedCoord, y1: s0, x2: fixedCoord, y2: s1, orientation: 'v' }
            );
          }
        }
        run = [];
      };
      for (let i = 1; i < grp.length; i++) {
        const prevEnd = orientation === 'h' ? grp[i - 1].x2 : grp[i - 1].y2;
        const curStart = orientation === 'h' ? grp[i].x1 : grp[i].y1;
        if (curStart - prevEnd <= 7.5) {
          run.push(grp[i]);
        } else {
          flushRun();
          run = [grp[i]];
        }
      }
      flushRun();
    }
  };

  stitchAxis(hDashes, 'h');
  stitchAxis(vDashes, 'v');
  return out;
}

function mergeCollinearRulings(segments: RulingSegment[]): RulingSegment[] {
  const hSegs = segments.filter((s) => s.orientation === 'h');
  const vSegs = segments.filter((s) => s.orientation === 'v');
  const out: RulingSegment[] = [];

  // Merge horizontal segments along matching Y
  hSegs.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const hGroups: RulingSegment[][] = [];
  for (const seg of hSegs) {
    let placed = false;
    for (let gi = hGroups.length - 1; gi >= 0; gi--) {
      const refY = hGroups[gi][0].y1;
      if (Math.abs(seg.y1 - refY) <= 1.6) {
        hGroups[gi].push(seg);
        placed = true;
        break;
      }
      if (seg.y1 - refY > 2.5) break;
    }
    if (!placed) hGroups.push([seg]);
  }
  for (const grp of hGroups) {
    grp.sort((a, b) => a.x1 - b.x1);
    const avgY = grp.reduce((s, g) => s + g.y1, 0) / grp.length;
    let curX1 = grp[0].x1;
    let curX2 = grp[0].x2;
    for (let i = 1; i < grp.length; i++) {
      if (grp[i].x1 <= curX2 + 2.2) {
        curX2 = Math.max(curX2, grp[i].x2);
      } else {
        out.push({ x1: curX1, y1: avgY, x2: curX2, y2: avgY, orientation: 'h' });
        curX1 = grp[i].x1;
        curX2 = grp[i].x2;
      }
    }
    out.push({ x1: curX1, y1: avgY, x2: curX2, y2: avgY, orientation: 'h' });
  }

  // Merge vertical segments along matching X
  vSegs.sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
  const vGroups: RulingSegment[][] = [];
  for (const seg of vSegs) {
    let placed = false;
    for (let gi = vGroups.length - 1; gi >= 0; gi--) {
      const refX = vGroups[gi][0].x1;
      if (Math.abs(seg.x1 - refX) <= 1.6) {
        vGroups[gi].push(seg);
        placed = true;
        break;
      }
      if (seg.x1 - refX > 2.5) break;
    }
    if (!placed) vGroups.push([seg]);
  }
  for (const grp of vGroups) {
    grp.sort((a, b) => a.y1 - b.y1);
    const avgX = grp.reduce((s, g) => s + g.x1, 0) / grp.length;
    let curY1 = grp[0].y1;
    let curY2 = grp[0].y2;
    for (let i = 1; i < grp.length; i++) {
      if (grp[i].y1 <= curY2 + 2.2) {
        curY2 = Math.max(curY2, grp[i].y2);
      } else {
        out.push({ x1: avgX, y1: curY1, x2: avgX, y2: curY2, orientation: 'v' });
        curY1 = grp[i].y1;
        curY2 = grp[i].y2;
      }
    }
    out.push({ x1: avgX, y1: curY1, x2: avgX, y2: curY2, orientation: 'v' });
  }

  return out;
}

async function extractVectorRulingsAndImages(
  page: PDFPageProxy,
  viewportTransform: number[],
  pageWidthPt: number,
  pageHeightPt: number,
  includeImages: boolean
): Promise<{
  rulings: RulingSegment[];
  fillRects: FillRect[];
  vectorGraphicBoxes: VectorGraphicBox[];
  images: ExtractedImage[];
}> {
  const rawRulings: RulingSegment[] = [];
  const rawDashes: RulingSegment[] = [];
  const fillRects: FillRect[] = [];
  const cardBoxes: VectorGraphicBox[] = [];
  const microFillBoxes: VectorGraphicBox[] = [];
  const images: ExtractedImage[] = [];
  const seenImageBounds = new Set<string>();

  let opList: Awaited<ReturnType<PDFPageProxy['getOperatorList']>>;
  try {
    opList = await page.getOperatorList();
  } catch {
    return { rulings: rawRulings, fillRects, vectorGraphicBoxes: [], images };
  }

  interface GraphicsState {
    ctm: number[];
    fillHex: string;
  }
  const stateStack: GraphicsState[] = [];
  let ctm = viewportTransform.slice();
  let fillHex = 'FFFFFF';

  const isMatrixLike = (val: unknown): val is ArrayLike<number> =>
    Boolean(val && typeof (val as ArrayLike<number>).length === 'number' && (val as ArrayLike<number>).length >= 6);

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) {
      stateStack.push({ ctm: ctm.slice(), fillHex });
    } else if (fn === OPS.restore) {
      const popped = stateStack.pop();
      ctm = popped ? popped.ctm : viewportTransform.slice();
      fillHex = popped ? popped.fillHex : 'FFFFFF';
    } else if (fn === OPS.paintFormXObjectBegin) {
      stateStack.push({ ctm: ctm.slice(), fillHex });
      if (Array.isArray(args) && isMatrixLike(args[0])) {
        ctm = Util.transform(ctm, Array.from(args[0]));
      }
    } else if (fn === OPS.paintFormXObjectEnd) {
      const popped = stateStack.pop();
      ctm = popped ? popped.ctm : viewportTransform.slice();
      fillHex = popped ? popped.fillHex : 'FFFFFF';
    } else if (fn === OPS.beginGroup) {
      stateStack.push({ ctm: ctm.slice(), fillHex });
    } else if (fn === OPS.endGroup) {
      const popped = stateStack.pop();
      ctm = popped ? popped.ctm : viewportTransform.slice();
      fillHex = popped ? popped.fillHex : 'FFFFFF';
    } else if (fn === OPS.transform && isMatrixLike(args)) {
      ctm = Util.transform(ctm, Array.from(args));
    } else if (fn === OPS.setFillRGBColor && Array.isArray(args) && args.length >= 3) {
      if (typeof args[0] === 'string') {
        const clean = args[0].replace('#', '').toUpperCase();
        if (/^[0-9A-F]{6}$/.test(clean)) fillHex = clean;
      } else {
        fillHex = rgbToHex(Number(args[0]), Number(args[1]), Number(args[2]));
      }
    } else if (fn === OPS.setFillGray && Array.isArray(args) && args.length >= 1) {
      const g = Number(args[0]);
      fillHex = rgbToHex(g, g, g);
    } else if (fn === OPS.setFillCMYKColor && Array.isArray(args) && args.length >= 4) {
      const [c, m, y, k] = args.map(Number);
      const r = 1 - Math.min(1, c * (1 - k) + k);
      const g = 1 - Math.min(1, m * (1 - k) + k);
      const b = 1 - Math.min(1, y * (1 - k) + k);
      fillHex = rgbToHex(r, g, b);
    } else if (fn === OPS.constructPath && Array.isArray(args)) {
      const strokeOrFillOp = args[0];
      const pathDataContainer = args[1];
      const subPaths: any[] = Array.isArray(pathDataContainer) ? pathDataContainer : [pathDataContainer];

      const isStroked =
        strokeOrFillOp === OPS.stroke ||
        strokeOrFillOp === OPS.closeStroke ||
        strokeOrFillOp === OPS.fillStroke ||
        strokeOrFillOp === OPS.eoFillStroke ||
        strokeOrFillOp === OPS.closeFillStroke ||
        strokeOrFillOp === OPS.closeEOFillStroke;

      const isFilled =
        strokeOrFillOp === OPS.fill ||
        strokeOrFillOp === OPS.eoFill ||
        strokeOrFillOp === OPS.fillStroke ||
        strokeOrFillOp === OPS.eoFillStroke ||
        strokeOrFillOp === OPS.closeFillStroke ||
        strokeOrFillOp === OPS.closeEOFillStroke;

      for (const pathArr of subPaths) {
        if (!pathArr || typeof pathArr.length !== 'number') continue;

        let curX = 0;
        let curY = 0;
        let startX = 0;
        let startY = 0;
        let idx = 0;
        const pts: Array<{ op: number; x: number; y: number }> = [];
        const pathSegs: Array<{ seg: RulingSegment; hasCurveAfter?: boolean }> = [];
        let lastHadCurve = false;
        let firstSegIdxInSubpath = -1;

        const recordLine = (ax: number, ay: number, bx: number, by: number) => {
          if (!isStroked) return;
          const dx = Math.abs(bx - ax);
          const dy = Math.abs(by - ay);
          if (dy <= 1.8 && dx >= 6) {
            const seg: RulingSegment = {
              x1: Math.min(ax, bx),
              y1: (ay + by) / 2,
              x2: Math.max(ax, bx),
              y2: (ay + by) / 2,
              orientation: 'h',
            };
            if (lastHadCurve && pathSegs.length > 0) {
              const prev = pathSegs[pathSegs.length - 1].seg;
              if (prev.orientation === 'v' && Math.abs(prev.x1 - seg.x1) <= 16) {
                seg.x1 = Math.min(seg.x1, prev.x1);
                prev.y1 = Math.min(prev.y1, seg.y1);
                prev.y2 = Math.max(prev.y2, seg.y1);
              } else if (prev.orientation === 'v' && Math.abs(prev.x1 - seg.x2) <= 16) {
                seg.x2 = Math.max(seg.x2, prev.x1);
                prev.y1 = Math.min(prev.y1, seg.y1);
                prev.y2 = Math.max(prev.y2, seg.y1);
              }
            }
            if (firstSegIdxInSubpath === -1) firstSegIdxInSubpath = pathSegs.length;
            pathSegs.push({ seg });
            rawRulings.push(seg);
          } else if (dx <= 1.8 && dy >= 6) {
            const seg: RulingSegment = {
              x1: (ax + bx) / 2,
              y1: Math.min(ay, by),
              x2: (ax + bx) / 2,
              y2: Math.max(ay, by),
              orientation: 'v',
            };
            if (lastHadCurve && pathSegs.length > 0) {
              const prev = pathSegs[pathSegs.length - 1].seg;
              if (prev.orientation === 'h' && Math.abs(prev.y1 - seg.y1) <= 16) {
                seg.y1 = Math.min(seg.y1, prev.y1);
                prev.x1 = Math.min(prev.x1, seg.x1);
                prev.x2 = Math.max(prev.x2, seg.x1);
              } else if (prev.orientation === 'h' && Math.abs(prev.y1 - seg.y2) <= 16) {
                seg.y2 = Math.max(seg.y2, prev.y1);
                prev.x1 = Math.min(prev.x1, seg.x1);
                prev.x2 = Math.max(prev.x2, seg.x1);
              }
            }
            if (firstSegIdxInSubpath === -1) firstSegIdxInSubpath = pathSegs.length;
            pathSegs.push({ seg });
            rawRulings.push(seg);
          } else if (dy <= 1.5 && dx >= 1.5 && dx < 6) {
            rawDashes.push({
              x1: Math.min(ax, bx),
              y1: (ay + by) / 2,
              x2: Math.max(ax, bx),
              y2: (ay + by) / 2,
              orientation: 'h',
            });
          } else if (dx <= 1.5 && dy >= 1.5 && dy < 6) {
            rawDashes.push({
              x1: (ax + bx) / 2,
              y1: Math.min(ay, by),
              x2: (ax + bx) / 2,
              y2: Math.max(ay, by),
              orientation: 'v',
            });
          }
          lastHadCurve = false;
        };

        while (idx < pathArr.length) {
          const drawOp = pathArr[idx++];
          if (drawOp === DRAW_OPS.moveTo) {
            const x = pathArr[idx++];
            const y = pathArr[idx++];
            const [vx, vy] = applyCtmPoint(ctm, x, y);
            curX = vx;
            curY = vy;
            startX = vx;
            startY = vy;
            lastHadCurve = false;
            firstSegIdxInSubpath = -1;
            pts.push({ op: drawOp, x: vx, y: vy });
          } else if (drawOp === DRAW_OPS.lineTo) {
            const x = pathArr[idx++];
            const y = pathArr[idx++];
            const [vx, vy] = applyCtmPoint(ctm, x, y);
            recordLine(curX, curY, vx, vy);
            curX = vx;
            curY = vy;
            pts.push({ op: drawOp, x: vx, y: vy });
          } else if (drawOp === DRAW_OPS.curveTo) {
            idx += 4;
            const x3 = pathArr[idx++];
            const y3 = pathArr[idx++];
            const [vx, vy] = applyCtmPoint(ctm, x3, y3);
            curX = vx;
            curY = vy;
            lastHadCurve = true;
          } else if (drawOp === DRAW_OPS.quadraticCurveTo) {
            idx += 2;
            const x2 = pathArr[idx++];
            const y2 = pathArr[idx++];
            const [vx, vy] = applyCtmPoint(ctm, x2, y2);
            curX = vx;
            curY = vy;
            lastHadCurve = true;
          } else if (drawOp === DRAW_OPS.closePath) {
            recordLine(curX, curY, startX, startY);
            if (lastHadCurve && firstSegIdxInSubpath >= 0 && pathSegs.length - firstSegIdxInSubpath >= 2) {
              const firstSeg = pathSegs[firstSegIdxInSubpath].seg;
              const lastSeg = pathSegs[pathSegs.length - 1].seg;
              if (firstSeg.orientation === 'h' && lastSeg.orientation === 'v') {
                if (Math.abs(lastSeg.x1 - firstSeg.x1) <= 16) firstSeg.x1 = Math.min(firstSeg.x1, lastSeg.x1);
                if (Math.abs(lastSeg.x1 - firstSeg.x2) <= 16) firstSeg.x2 = Math.max(firstSeg.x2, lastSeg.x1);
                if (Math.abs(lastSeg.y1 - firstSeg.y1) <= 16) lastSeg.y1 = Math.min(lastSeg.y1, firstSeg.y1);
                if (Math.abs(lastSeg.y2 - firstSeg.y1) <= 16) lastSeg.y2 = Math.max(lastSeg.y2, firstSeg.y1);
              }
            }
            curX = startX;
            curY = startY;
            lastHadCurve = false;
          } else {
            break;
          }
        }

        // Handle filled rectangles: either thin filled rule lines, shaded cell backgrounds, or card cells
        if (isFilled && pts.length >= 4 && pts.length <= 6) {
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const rw = maxX - minX;
          const rh = maxY - minY;
          const areaRatio = (rw * rh) / Math.max(1, pageWidthPt * pageHeightPt);
          if (rw > 0 && rh > 0 && rw <= 10 && rh <= 10) {
            microFillBoxes.push({ x1: minX, y1: minY, x2: maxX, y2: maxY });
          } else if (rh > 0 && rh <= 4.5 && rw >= 16 && rw / rh >= 4.5) {
            rawRulings.push({
              x1: minX,
              y1: (minY + maxY) / 2,
              x2: maxX,
              y2: (minY + maxY) / 2,
              orientation: 'h',
            });
          } else if (rw > 0 && rw <= 4.5 && rh >= 16 && rh / rw >= 4.5) {
            rawRulings.push({
              x1: (minX + maxX) / 2,
              y1: minY,
              x2: (minX + maxX) / 2,
              y2: maxY,
              orientation: 'v',
            });
          } else if (rw >= 24 && rh >= 22 && areaRatio < 0.45) {
            if (!isNearWhiteHex(fillHex)) {
              fillRects.push({
                x1: minX,
                y1: minY,
                x2: maxX,
                y2: maxY,
                hex: fillHex,
              });
            }
            cardBoxes.push({ x1: minX, y1: minY, x2: maxX, y2: maxY });
          }
        }
      }
    } else if (includeImages && (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject)) {
      const corners = [
        applyCtmPoint(ctm, 0, 0),
        applyCtmPoint(ctm, 1, 0),
        applyCtmPoint(ctm, 0, 1),
        applyCtmPoint(ctm, 1, 1),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const x0 = Math.max(0, Math.min(...xs));
      const x1 = Math.min(pageWidthPt, Math.max(...xs));
      const y0 = Math.max(0, Math.min(...ys));
      const y1 = Math.min(pageHeightPt, Math.max(...ys));
      const drawW = x1 - x0;
      const drawH = y1 - y0;

      const areaRatio = (drawW * drawH) / Math.max(1, pageWidthPt * pageHeightPt);
      if (drawW >= 18 && drawH >= 18 && areaRatio < 0.88) {
        const key = `${Math.round(x0)}:${Math.round(y0)}:${Math.round(drawW)}:${Math.round(drawH)}`;
        if (!seenImageBounds.has(key)) {
          seenImageBounds.add(key);
          try {
            let imgObj: any = null;
            if (fn === OPS.paintInlineImageXObject && args && args[0]) {
              imgObj = args[0];
            } else if (args && typeof args[0] === 'string') {
              const objId = args[0];
              if (page.objs.has(objId)) {
                imgObj = page.objs.get(objId);
              } else if (page.commonObjs?.has(objId)) {
                imgObj = page.commonObjs.get(objId);
              } else {
                imgObj = await Promise.race([
                  new Promise<any>((resolve) => {
                    try {
                      page.objs.get(objId, resolve);
                    } catch {
                      resolve(null);
                    }
                  }),
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
                ]);
              }
            }
            if (imgObj && imgObj.width >= 12 && imgObj.height >= 12) {
              const pngBytes = await pdfImageObjectToPng(imgObj);
              if (pngBytes && pngBytes.length > 0) {
                images.push({
                  x: x0,
                  yTop: y0,
                  widthPt: drawW,
                  heightPt: drawH,
                  pngBytes,
                });
              }
            }
          } catch {
            // Skip undecodable image objects gracefully
          }
        }
      }
    }
  }

  // Detect dense vector QR-code micro-module clusters so they don't shatter table grids
  const vectorGraphicBoxes: VectorGraphicBox[] = [];
  if (microFillBoxes.length >= 16) {
    const visitedMicro = new Set<number>();
    for (let mi = 0; mi < microFillBoxes.length; mi++) {
      if (visitedMicro.has(mi)) continue;
      const cluster: VectorGraphicBox[] = [microFillBoxes[mi]];
      visitedMicro.add(mi);
      let bMinX = microFillBoxes[mi].x1;
      let bMaxX = microFillBoxes[mi].x2;
      let bMinY = microFillBoxes[mi].y1;
      let bMaxY = microFillBoxes[mi].y2;
      let changed = true;
      while (changed) {
        changed = false;
        for (let mj = 0; mj < microFillBoxes.length; mj++) {
          if (visitedMicro.has(mj)) continue;
          const m = microFillBoxes[mj];
          if (m.x1 >= bMinX - 10 && m.x2 <= bMaxX + 10 && m.y1 >= bMinY - 10 && m.y2 <= bMaxY + 10) {
            visitedMicro.add(mj);
            cluster.push(m);
            bMinX = Math.min(bMinX, m.x1);
            bMaxX = Math.max(bMaxX, m.x2);
            bMinY = Math.min(bMinY, m.y1);
            bMaxY = Math.max(bMaxY, m.y2);
            changed = true;
          }
        }
      }
      if (cluster.length >= 16 && bMaxX - bMinX <= 110 && bMaxY - bMinY <= 110) {
        vectorGraphicBoxes.push({ x1: bMinX, y1: bMinY, x2: bMaxX, y2: bMaxY });
      }
    }
  }

  // Filter out short rulings inside vector QR clusters
  const filteredRawRulings =
    vectorGraphicBoxes.length === 0
      ? rawRulings
      : rawRulings.filter((r) => {
          const len = r.orientation === 'h' ? r.x2 - r.x1 : r.y2 - r.y1;
          if (len > 45) return true;
          const rcx = (r.x1 + r.x2) / 2;
          const rcy = (r.y1 + r.y2) / 2;
          return !vectorGraphicBoxes.some(
            (q) => rcx >= q.x1 - 2 && rcx <= q.x2 + 2 && rcy >= q.y1 - 2 && rcy <= q.y2 + 2
          );
        });

  // Synthesize borders for horizontally aligned filled card cells when no stroked rulings exist there
  if (cardBoxes.length >= 2) {
    // Deduplicate nearly identical card boxes
    const uniqCards: VectorGraphicBox[] = [];
    for (const c of cardBoxes) {
      const dup = uniqCards.some(
        (u) =>
          Math.abs(u.x1 - c.x1) <= 3 &&
          Math.abs(u.x2 - c.x2) <= 3 &&
          Math.abs(u.y1 - c.y1) <= 3 &&
          Math.abs(u.y2 - c.y2) <= 3
      );
      if (!dup) uniqCards.push(c);
    }
    for (let ci = 0; ci < uniqCards.length; ci++) {
      const card = uniqCards[ci];
      const ch = card.y2 - card.y1;
      const hasCoBandedSibling = uniqCards.some((other, oi) => {
        if (oi === ci) return false;
        const oh = other.y2 - other.y1;
        const ovY = Math.min(card.y2, other.y2) - Math.max(card.y1, other.y1);
        const horizOverlap = Math.min(card.x2, other.x2) - Math.max(card.x1, other.x1);
        const gapX = Math.max(other.x1 - card.x2, card.x1 - other.x2);
        return ovY >= Math.min(ch, oh) * 0.7 && horizOverlap < 6 && gapX <= 28;
      });
      if (hasCoBandedSibling) {
        const alreadyCovered = filteredRawRulings.some(
          (r) =>
            r.orientation === 'h' &&
            Math.abs(r.y1 - card.y1) <= 4 &&
            r.x1 <= card.x1 + 6 &&
            r.x2 >= card.x2 - 6
        );
        if (!alreadyCovered) {
          filteredRawRulings.push(
            { x1: card.x1, y1: card.y1, x2: card.x2, y2: card.y1, orientation: 'h' },
            { x1: card.x1, y1: card.y2, x2: card.x2, y2: card.y2, orientation: 'h' },
            { x1: card.x1, y1: card.y1, x2: card.x1, y2: card.y2, orientation: 'v' },
            { x1: card.x2, y1: card.y1, x2: card.x2, y2: card.y2, orientation: 'v' }
          );
        }
      }
    }
  }

  const stitchedDashes = stitchCollinearDashes(rawDashes);
  return {
    rulings: mergeCollinearRulings([...filteredRawRulings, ...stitchedDashes]),
    fillRects,
    vectorGraphicBoxes,
    images,
  };
}

async function pdfImageObjectToPng(imgObj: any): Promise<Uint8Array | null> {
  const w = imgObj.width;
  const h = imgObj.height;
  if (!w || !h || w * h > 16_000_000) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    if (imgObj.bitmap) {
      ctx.drawImage(imgObj.bitmap, 0, 0, w, h);
    } else if (imgObj.data) {
      const raw: Uint8ClampedArray | Uint8Array = imgObj.data;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const kind = imgObj.kind;

      if (raw.length === w * h * 4 || kind === 3) {
        rgba.set(raw.subarray(0, w * h * 4));
      } else if (raw.length === w * h * 3 || kind === 2) {
        for (let p = 0, q = 0; p < w * h * 3 && q < rgba.length; p += 3, q += 4) {
          rgba[q] = raw[p];
          rgba[q + 1] = raw[p + 1];
          rgba[q + 2] = raw[p + 2];
          rgba[q + 3] = 255;
        }
      } else if (raw.length === w * h) {
        for (let p = 0, q = 0; p < w * h; p++, q += 4) {
          const v = raw[p];
          rgba[q] = v;
          rgba[q + 1] = v;
          rgba[q + 2] = v;
          rgba[q + 3] = 255;
        }
      } else if (kind === 1) {
        let bitIdx = 0;
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w; col++) {
            const byteVal = raw[bitIdx >> 3] || 0;
            const bit = (byteVal >> (7 - (bitIdx & 7))) & 1;
            const v = bit ? 255 : 0;
            const q = (row * w + col) * 4;
            rgba[q] = v;
            rgba[q + 1] = v;
            rgba[q + 2] = v;
            rgba[q + 3] = 255;
            bitIdx++;
          }
          if (bitIdx % 8 !== 0) {
            bitIdx += 8 - (bitIdx % 8);
          }
        }
      } else {
        return null;
      }

      const imageData = new ImageData(rgba, w, h);
      ctx.putImageData(imageData, 0, 0);
    } else {
      return null;
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

function buildVisualLines(glyphs: RawGlyphItem[], vRulings: RulingSegment[] = []): VisualLine[] {
  if (glyphs.length === 0) return [];
  const sorted = [...glyphs].sort((a, b) => a.y - b.y || a.x - b.x);

  const rowGroups: RawGlyphItem[][] = [];
  for (const g of sorted) {
    const lastRow = rowGroups[rowGroups.length - 1];
    if (!lastRow) {
      rowGroups.push([g]);
      continue;
    }
    const avgY = lastRow.reduce((s, item) => s + item.y, 0) / lastRow.length;
    const refFont = lastRow[0].fontSize;
    const yTol = Math.max(2.6, Math.min(refFont, g.fontSize) * 0.4);
    if (Math.abs(g.y - avgY) <= yTol) {
      lastRow.push(g);
    } else {
      rowGroups.push([g]);
    }
  }

  const lines: VisualLine[] = [];
  for (const row of rowGroups) {
    row.sort((a, b) => a.x - b.x);
    const segments: TextSegment[] = [];

    let curSegItems: RawGlyphItem[] = [];
    const flushSegment = () => {
      if (curSegItems.length === 0) return;
      const runs: StyledRun[] = [];
      let segText = '';

      for (let idx = 0; idx < curSegItems.length; idx++) {
        const item = curSegItems[idx];
        const prev = idx > 0 ? curSegItems[idx - 1] : null;
        let chunkText = item.str;

        if (prev && segText.length > 0) {
          const gap = item.x - prev.endX;
          const spaceThreshold = Math.max(1.2, Math.min(prev.fontSize, item.fontSize) * 0.16);
          const alreadyHasSpace = /\s$/.test(segText) || /^\s/.test(chunkText);
          const firstCh = chunkText.charAt(0);
          if (!alreadyHasSpace && gap > spaceThreshold && !isCombiningOrZeroWidth(firstCh)) {
            chunkText = ' ' + chunkText;
          }
        }

        segText += chunkText;
        const lastRun = runs[runs.length - 1];
        const roundedSize = Math.round(item.fontSize * 2) / 2;
        if (
          lastRun &&
          Boolean(lastRun.bold) === item.bold &&
          Boolean(lastRun.italic) === item.italic &&
          Math.abs((lastRun.fontSizePt || roundedSize) - roundedSize) < 0.6
        ) {
          lastRun.text += chunkText;
        } else {
          runs.push({
            text: chunkText,
            bold: item.bold || undefined,
            italic: item.italic || undefined,
            fontSizePt: roundedSize,
          });
        }
      }

      const trimmed = segText.trim();
      if (trimmed.length > 0) {
        const avgFont =
          curSegItems.reduce((s, it) => s + it.fontSize * Math.max(1, it.str.length), 0) /
          Math.max(1, curSegItems.reduce((s, it) => s + Math.max(1, it.str.length), 0));
        segments.push({
          x: curSegItems[0].x,
          endX: Math.max(...curSegItems.map((it) => it.endX)),
          y: curSegItems.reduce((s, it) => s + it.y, 0) / curSegItems.length,
          fontSize: avgFont,
          text: trimmed,
          runs: normalizeRunsTrim(runs),
        });
      }
      curSegItems = [];
    };

    for (const item of row) {
      if (curSegItems.length === 0) {
        curSegItems.push(item);
      } else {
        const prev = curSegItems[curSegItems.length - 1];
        const gap = item.x - prev.endX;
        const columnGapThreshold = Math.max(12, Math.min(prev.fontSize, item.fontSize) * 1.3);
        const midY = (prev.y + item.y) / 2;
        const crossedVerticalBorder =
          item.str.trim().length > 0 &&
          vRulings.some(
            (v) =>
              v.orientation === 'v' &&
              midY >= v.y1 - 3 &&
              midY <= v.y2 + 3 &&
              v.x1 >= prev.endX - 2 &&
              v.x1 <= item.x + 2 &&
              item.x - prev.x > 4
          );
        if ((gap > columnGapThreshold || crossedVerticalBorder) && item.str.trim().length > 0) {
          flushSegment();
        }
        curSegItems.push(item);
      }
    }
    flushSegment();

    if (segments.length === 0) continue;
    lines.push(makeSingleColumnLine(segments));
  }

  return lines;
}

function makeSingleColumnLine(segments: TextSegment[]): VisualLine {
  const sortedSegs = [...segments].sort((a, b) => a.x - b.x);
  const mergedRuns: StyledRun[] = [];
  for (let s = 0; s < sortedSegs.length; s++) {
    if (s > 0) {
      mergedRuns.push({ text: ' ', fontSizePt: sortedSegs[s].fontSize });
    }
    for (const r of sortedSegs[s].runs) {
      const prevRun = mergedRuns[mergedRuns.length - 1];
      if (
        prevRun &&
        Boolean(prevRun.bold) === Boolean(r.bold) &&
        Boolean(prevRun.italic) === Boolean(r.italic) &&
        Boolean(prevRun.underline) === Boolean(r.underline) &&
        Math.abs((prevRun.fontSizePt || 11) - (r.fontSizePt || 11)) < 0.6
      ) {
        prevRun.text += r.text;
      } else {
        mergedRuns.push({ ...r });
      }
    }
  }

  const lineText = sortedSegs.map((s) => s.text).join(' ').trim();
  const weightedFont =
    sortedSegs.reduce((s, seg) => s + seg.fontSize * Math.max(1, seg.text.length), 0) /
    Math.max(1, sortedSegs.reduce((s, seg) => s + Math.max(1, seg.text.length), 0));

  const totalNonSpace = lineText.replace(/\s+/g, '').length;
  const boldChars = mergedRuns
    .filter((r) => r.bold)
    .reduce((s, r) => s + r.text.replace(/\s+/g, '').length, 0);

  return {
    y: sortedSegs.reduce((s, seg) => s + seg.y, 0) / sortedSegs.length,
    x: sortedSegs[0].x,
    endX: sortedSegs[sortedSegs.length - 1].endX,
    fontSize: weightedFont,
    segments: sortedSegs,
    text: lineText,
    runs: mergedRuns,
    isBoldOnly: totalNonSpace > 0 && boldChars / totalNonSpace >= 0.85,
  };
}

function normalizeRunsTrim(runs: StyledRun[]): StyledRun[] {
  const cloned = runs.map((r) => ({ ...r })).filter((r) => r.text.length > 0);
  while (cloned.length > 0 && /^\s+$/.test(cloned[0].text)) cloned.shift();
  while (cloned.length > 0 && /^\s+$/.test(cloned[cloned.length - 1].text)) cloned.pop();
  if (cloned.length > 0) {
    cloned[0].text = cloned[0].text.replace(/^\s+/, '');
    cloned[cloned.length - 1].text = cloned[cloned.length - 1].text.replace(/\s+$/, '');
  }
  return cloned.filter((r) => r.text.length > 0);
}

function computeBodyFontSize(lines: VisualLine[]): number {
  const histogram = new Map<number, number>();
  for (const line of lines) {
    const bucket = Math.round(line.fontSize);
    const weight = line.text.replace(/\s+/g, '').length;
    histogram.set(bucket, (histogram.get(bucket) || 0) + weight);
  }
  let bestSize = 11;
  let bestCount = -1;
  for (const [size, count] of histogram.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestSize = size;
    }
  }
  return Math.max(8, Math.min(20, bestSize));
}

function detectAlignment(
  x: number,
  endX: number,
  regionLeft: number,
  regionRight: number
): TextAlign {
  const regionWidth = Math.max(40, regionRight - regionLeft);
  const lineWidth = endX - x;
  if (lineWidth >= regionWidth * 0.84) return 'left';

  const regionCenter = (regionLeft + regionRight) / 2;
  const lineCenter = (x + endX) / 2;
  const leftDist = Math.abs(x - regionLeft);
  const rightDist = Math.abs(regionRight - endX);

  if (Math.abs(lineCenter - regionCenter) <= 18 && leftDist > 16 && rightDist > 16) {
    return 'center';
  }
  if (rightDist <= 14 && leftDist > regionWidth * 0.35) {
    return 'right';
  }
  return 'left';
}

function detectCellLineAlignment(
  segMinX: number,
  segMaxX: number,
  cellLeft: number,
  cellRight: number
): TextAlign {
  const cellWidth = Math.max(8, cellRight - cellLeft);
  const segWidth = Math.max(1, segMaxX - segMinX);
  if (segWidth >= cellWidth * 0.8) return 'left';

  const leftGap = segMinX - cellLeft;
  const rightGap = cellRight - segMaxX;
  const cellCenter = (cellLeft + cellRight) / 2;
  const segCenter = (segMinX + segMaxX) / 2;

  if (
    leftGap >= 2 &&
    rightGap >= 2 &&
    Math.abs(segCenter - cellCenter) <= Math.max(4, cellWidth * 0.14)
  ) {
    return 'center';
  }
  if (rightGap <= Math.max(6, cellWidth * 0.14) && leftGap > cellWidth * 0.36 && segWidth < cellWidth * 0.6) {
    return 'right';
  }
  return 'left';
}

function clusterSortedValues(values: number[], tol: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = clusters[clusters.length - 1];
    if (Math.abs(cur - last[last.length - 1]) <= tol) {
      last.push(cur);
    } else {
      clusters.push([cur]);
    }
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

interface TableCandidateMatch {
  block: DocBlock;
  consumedSegments: Set<TextSegment>;
  consumedImageIndices: Set<number>;
  bounds: { left: number; right: number; top: number; bottom: number };
}

function splitWideFirstColumnByX(
  segs: TextSegment[],
  colLeft: number,
  colRight: number
): number | null {
  if (segs.length < 4 || colRight - colLeft < 180) return null;
  const searchStart = Math.ceil(colLeft + 48);
  const searchEnd = Math.floor(colRight - 48);
  if (searchEnd <= searchStart + 12) return null;

  let bestStart = -1;
  let bestEnd = -1;
  let curStart = -1;
  for (let x = searchStart; x <= searchEnd; x++) {
    const hits = segs.some((s) => s.x <= x + 1 && s.endX >= x - 1);
    if (!hits) {
      if (curStart === -1) curStart = x;
    } else {
      if (curStart !== -1 && x - curStart > bestEnd - bestStart) {
        bestStart = curStart;
        bestEnd = x;
      }
      curStart = -1;
    }
  }
  if (curStart !== -1 && searchEnd - curStart > bestEnd - bestStart) {
    bestStart = curStart;
    bestEnd = searchEnd;
  }

  if (bestEnd - bestStart < 12) return null;
  const splitX = (bestStart + bestEnd) / 2;
  const leftSegs = segs.filter((s) => (s.x + s.endX) / 2 < splitX);
  const rightSegs = segs.filter((s) => (s.x + s.endX) / 2 > splitX);
  if (leftSegs.length < 2 || rightSegs.length < 2) return null;
  return splitX;
}

function buildSingleTableFromGrid(
  subH: RulingSegment[],
  subV: RulingSegment[],
  lines: VisualLine[],
  usedSegments: Set<TextSegment>,
  images: ExtractedImage[],
  usedImageIndices: Set<number>,
  fillRects: FillRect[],
  vectorGraphicBoxes: VectorGraphicBox[] = [],
  allowSingleCell = false
): TableCandidateMatch | null {
  const rowBounds = clusterSortedValues(
    subH.map((h) => h.y1),
    3.5
  );
  let colBounds = clusterSortedValues(
    subV.map((v) => v.x1),
    3.5
  );
  if (rowBounds.length < 2 || colBounds.length < 2) return null;

  const tableTop = rowBounds[0];
  const tableBottom = rowBounds[rowBounds.length - 1];

  // Expand open left/right outer columns when horizontal rules extend past outer vertical strokes
  // and unconsumed text/images/vector graphics exist in those open outer wings
  if (subH.length >= 2) {
    const minHX = Math.min(...subH.map((h) => h.x1));
    const maxHX = Math.max(...subH.map((h) => h.x2));
    const hasEntityInBox = (bx1: number, bx2: number) => {
      const hasTxt = lines.some(
        (l) =>
          l.y >= tableTop - 3.5 &&
          l.y <= tableBottom + 3.5 &&
          l.segments.some((s) => {
            if (usedSegments.has(s)) return false;
            const cx = (s.x + s.endX) / 2;
            return cx >= bx1 - 3 && cx <= bx2 + 3;
          })
      );
      if (hasTxt) return true;
      const hasImg = images.some((img, idx) => {
        if (usedImageIndices.has(idx)) return false;
        const icx = img.x + img.widthPt / 2;
        const icy = img.yTop + img.heightPt / 2;
        return icx >= bx1 - 3 && icx <= bx2 + 3 && icy >= tableTop - 3 && icy <= tableBottom + 3;
      });
      if (hasImg) return true;
      return vectorGraphicBoxes.some((vb) => {
        const vcx = (vb.x1 + vb.x2) / 2;
        const vcy = (vb.y1 + vb.y2) / 2;
        return vcx >= bx1 - 3 && vcx <= bx2 + 3 && vcy >= tableTop - 3 && vcy <= tableBottom + 3;
      });
    };

    if (minHX < colBounds[0] - 14 && hasEntityInBox(minHX, colBounds[0])) {
      colBounds = [minHX, ...colBounds];
    }
    if (
      maxHX > colBounds[colBounds.length - 1] + 14 &&
      hasEntityInBox(colBounds[colBounds.length - 1], maxHX)
    ) {
      colBounds = [...colBounds, maxHX];
    }
  }

  let numRows = rowBounds.length - 1;
  let numCols = colBounds.length - 1;
  if (!allowSingleCell && numRows * numCols < 2) return null;

  const tableLeft = colBounds[0];
  const tableRight = colBounds[colBounds.length - 1];
  if (tableRight - tableLeft < 36 || tableBottom - tableTop < 10) return null;

  // Check whether an unruled wide Column 0 cleanly houses two distinct text columns (e.g., Col 1 + Col 2)
  let syntheticSplitAtCol0 = false;
  if (numRows === 1 && numCols === 4 && colBounds[1] - colBounds[0] >= 180) {
    const col0Segs: TextSegment[] = [];
    for (const line of lines) {
      if (line.y < tableTop - 3.5 || line.y > tableBottom + 3.5) continue;
      for (const seg of line.segments) {
        if (usedSegments.has(seg)) continue;
        const cx = (seg.x + seg.endX) / 2;
        if (cx >= colBounds[0] - 4 && cx <= colBounds[1] + 4) {
          col0Segs.push(seg);
        }
      }
    }
    const splitX = splitWideFirstColumnByX(col0Segs, colBounds[0], colBounds[1]);
    if (splitX !== null) {
      colBounds = [colBounds[0], splitX, ...colBounds.slice(1)];
      numCols = colBounds.length - 1;
      syntheticSplitAtCol0 = true;
    }
  }

  const colWidthsPt: number[] = [];
  for (let c = 0; c < numCols; c++) {
    colWidthsPt.push(Math.max(8, colBounds[c + 1] - colBounds[c]));
  }

  // Build border existence matrices so merged cells (colSpan / rowSpan) are reconstructed from actual PDF rulings
  const tol = 4.2;
  const hasRightBorder: boolean[][] = Array.from({ length: numRows }, (_, r) => {
    const rTop = rowBounds[r];
    const rBot = rowBounds[r + 1];
    const rH = Math.max(1, rBot - rTop);
    return Array.from({ length: Math.max(0, numCols - 1) }, (__, c) => {
      if (syntheticSplitAtCol0 && c === 0) return true;
      const targetX = colBounds[c + 1];
      let coveredY = 0;
      for (const v of subV) {
        if (Math.abs(v.x1 - targetX) <= tol) {
          const overlap = Math.min(rBot, v.y2) - Math.max(rTop, v.y1);
          if (overlap > 0) coveredY += overlap;
        }
      }
      return coveredY >= rH * 0.58;
    });
  });

  const hasBottomBorder: boolean[][] = Array.from({ length: Math.max(0, numRows - 1) }, (_, r) => {
    const targetY = rowBounds[r + 1];
    return Array.from({ length: numCols }, (__, c) => {
      const cLeft = colBounds[c];
      const cRight = colBounds[c + 1];
      const cW = Math.max(1, cRight - cLeft);
      let coveredX = 0;
      for (const h of subH) {
        if (Math.abs(h.y1 - targetY) <= tol) {
          const overlap = Math.min(cRight, h.x2) - Math.max(cLeft, h.x1);
          if (overlap > 0) coveredX += overlap;
        }
      }
      return coveredX >= cW * 0.58;
    });
  });

  const localUsedSegments = new Set<TextSegment>();
  const localUsedImages = new Set<number>();

  interface RawCellContent {
    r: number;
    c: number;
    rowSpan: number;
    colSpan: number;
    cellLeft: number;
    cellRight: number;
    cellTop: number;
    cellBottom: number;
    segs: TextSegment[];
    imgs: ExtractedImage[];
    shadingHex?: string;
  }

  const occupied: boolean[][] = Array.from({ length: numRows }, () => new Array(numCols).fill(false));
  const rowCells: RawCellContent[][] = Array.from({ length: numRows }, () => []);
  let totalSegsInTable = 0;
  let totalCharsInTable = 0;
  let totalImgsInTable = 0;
  let totalVectorGraphicsInTable = 0;
  let fontWeightSum = 0;

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (occupied[r][c]) continue;

      let colSpan = 1;
      while (
        c + colSpan < numCols &&
        !hasRightBorder[r][c + colSpan - 1] &&
        !occupied[r][c + colSpan]
      ) {
        colSpan++;
      }

      let rowSpan = 1;
      while (r + rowSpan < numRows) {
        const nextRow = r + rowSpan;
        let canMergeDown = true;
        for (let k = c; k < c + colSpan; k++) {
          if (hasBottomBorder[nextRow - 1][k] || occupied[nextRow][k]) {
            canMergeDown = false;
            break;
          }
        }
        if (canMergeDown) {
          for (let k = c; k < c + colSpan - 1; k++) {
            if (hasRightBorder[nextRow][k]) {
              canMergeDown = false;
              break;
            }
          }
        }
        if (!canMergeDown) break;
        rowSpan++;
      }

      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          occupied[r + dr][c + dc] = true;
        }
      }

      const cellLeft = colBounds[c];
      const cellRight = colBounds[c + colSpan];
      const cellTop = rowBounds[r];
      const cellBottom = rowBounds[r + rowSpan];

      const segs: TextSegment[] = [];
      lines.forEach((line) => {
        if (line.y < cellTop - 3.5 || line.y > cellBottom + 3.5) return;
        for (const seg of line.segments) {
          if (usedSegments.has(seg) || localUsedSegments.has(seg)) continue;
          const cx = (seg.x + seg.endX) / 2;
          if (cx >= cellLeft - 4 && cx <= cellRight + 4 && seg.y >= cellTop - 3.5 && seg.y <= cellBottom + 3.5) {
            segs.push(seg);
            localUsedSegments.add(seg);
            totalSegsInTable++;
            totalCharsInTable += seg.text.replace(/\s+/g, '').length;
            fontWeightSum += seg.fontSize * Math.max(1, seg.text.length);
          }
        }
      });

      const cellImgs: ExtractedImage[] = [];
      images.forEach((img, imgIdx) => {
        if (usedImageIndices.has(imgIdx) || localUsedImages.has(imgIdx)) return;
        const icx = img.x + img.widthPt / 2;
        const icy = img.yTop + img.heightPt / 2;
        if (icx >= cellLeft - 3.5 && icx <= cellRight + 3.5 && icy >= cellTop - 3.5 && icy <= cellBottom + 3.5) {
          cellImgs.push(img);
          localUsedImages.add(imgIdx);
          totalImgsInTable++;
        }
      });

      const hasVectorGraphic = vectorGraphicBoxes.some((vb) => {
        const vcx = (vb.x1 + vb.x2) / 2;
        const vcy = (vb.y1 + vb.y2) / 2;
        return vcx >= cellLeft - 3.5 && vcx <= cellRight + 3.5 && vcy >= cellTop - 3.5 && vcy <= cellBottom + 3.5;
      });
      if (hasVectorGraphic) {
        totalVectorGraphicsInTable++;
      }

      let shadingHex: string | undefined;
      const cellArea = Math.max(1, (cellRight - cellLeft) * (cellBottom - cellTop));
      for (const fr of fillRects) {
        const ix = Math.max(0, Math.min(cellRight, fr.x2) - Math.max(cellLeft, fr.x1));
        const iy = Math.max(0, Math.min(cellBottom, fr.y2) - Math.max(cellTop, fr.y1));
        if ((ix * iy) / cellArea >= 0.55) {
          shadingHex = fr.hex;
          break;
        }
      }

      rowCells[r].push({
        r,
        c,
        rowSpan,
        colSpan,
        cellLeft,
        cellRight,
        cellTop,
        cellBottom,
        segs,
        imgs: cellImgs,
        shadingHex,
      });
    }
  }

  if (totalSegsInTable < 1 && totalImgsInTable < 1 && totalVectorGraphicsInTable < 1) {
    return null;
  }

  const avgFontSize = totalCharsInTable > 0 ? fontWeightSum / totalCharsInTable : 10;
  const compact = numCols >= 4 || numRows >= 6 || avgFontSize <= 10.2;

  const rows: TableRowData[] = rowCells.map((cellsInRow, rIdx) => {
    let rowBoldChars = 0;
    let rowTotalChars = 0;
    const rowHeightPt = Math.max(12, Math.round(rowBounds[rIdx + 1] - rowBounds[rIdx]));

    const builtCells: TableCellData[] = cellsInRow.map((rc) => {
      const segs = rc.segs.sort((a, b) => a.y - b.y || a.x - b.x);
      const paras: Array<{ align: TextAlign; runs: StyledRun[] }> = [];

      let lineSegGroup: TextSegment[] = [];
      let lastY: number | null = null;
      const flushPara = () => {
        if (lineSegGroup.length === 0) return;
        lineSegGroup.sort((a, b) => a.x - b.x);
        const runs: StyledRun[] = [];
        for (let si = 0; si < lineSegGroup.length; si++) {
          if (si > 0) {
            const gap = lineSegGroup[si].x - lineSegGroup[si - 1].endX;
            const sep = gap > 22 ? '   ' : ' ';
            runs.push({ text: sep, fontSizePt: lineSegGroup[si].fontSize });
          }
          runs.push(...lineSegGroup[si].runs);
        }
        const minX = lineSegGroup[0].x;
        const maxX = lineSegGroup[lineSegGroup.length - 1].endX;
        const align = detectCellLineAlignment(minX, maxX, rc.cellLeft, rc.cellRight);
        paras.push({ align, runs });
        lineSegGroup = [];
      };

      for (const seg of segs) {
        if (lastY !== null && Math.abs(seg.y - lastY) > Math.max(3.5, seg.fontSize * 0.62)) {
          flushPara();
        }
        lineSegGroup.push(seg);
        lastY = seg.y;

        for (const run of seg.runs) {
          const len = run.text.replace(/\s+/g, '').length;
          rowTotalChars += len;
          if (run.bold) rowBoldChars += len;
        }
      }
      flushPara();

      if (paras.length === 0) {
        paras.push({ align: 'left', runs: [{ text: '' }] });
      }

      const cellImages: TableCellImage[] | undefined =
        rc.imgs.length > 0
          ? rc.imgs.map((img) => ({
              pngBytes: img.pngBytes,
              widthPt: img.widthPt,
              heightPt: img.heightPt,
              align: detectCellLineAlignment(
                img.x,
                img.x + img.widthPt,
                rc.cellLeft,
                rc.cellRight
              ),
            }))
          : undefined;

      const isCellBold =
        rc.segs.length > 0 &&
        rc.segs.every((s) => s.runs.every((run) => Boolean(run.bold) || run.text.trim().length === 0));

      return {
        paragraphs: paras,
        images: cellImages,
        colSpan: rc.colSpan > 1 ? rc.colSpan : undefined,
        rowSpan: rc.rowSpan > 1 ? rc.rowSpan : undefined,
        vAlign: rc.imgs.length > 0 || rc.rowSpan > 1 ? 'center' : 'top',
        shadingHex: rc.shadingHex,
        isHeader: rIdx === 0 && isCellBold,
      };
    });

    const isHeaderRow = rIdx === 0 && rowTotalChars > 0 && rowBoldChars / rowTotalChars >= 0.72;
    if (isHeaderRow) {
      builtCells.forEach((c) => {
        c.isHeader = true;
      });
    }

    return {
      cells: builtCells,
      isHeader: isHeaderRow,
      heightPt: numRows <= 2 && rowHeightPt >= 26 ? rowHeightPt : undefined,
    };
  });

  return {
    consumedSegments: localUsedSegments,
    consumedImageIndices: localUsedImages,
    bounds: { left: tableLeft, right: tableRight, top: tableTop, bottom: tableBottom },
    block: {
      type: 'table',
      colWidthsPt,
      rows,
      hasBorders: true,
      compact,
      yTop: tableTop,
    },
  };
}

function areDividerSetsCompatible(
  upperInteriorXs: number[],
  lowerInteriorXs: number[],
  tol = 4.5
): boolean {
  if (upperInteriorXs.length === 0 || lowerInteriorXs.length === 0) return true;
  const hasMatch = (x: number, arr: number[]) => arr.some((other) => Math.abs(other - x) <= tol);
  const uOnly = upperInteriorXs.filter((x) => !hasMatch(x, lowerInteriorXs)).length;
  const lOnly = lowerInteriorXs.filter((x) => !hasMatch(x, upperInteriorXs)).length;
  return !(uOnly >= 1 && lOnly >= 1);
}

interface RawSliceCandidate {
  subH: RulingSegment[];
  subV: RulingSegment[];
  rawV: RulingSegment[];
  left: number;
  right: number;
  top: number;
  bottom: number;
  numRows: number;
  numCols: number;
}

function buildCellContentFromSegments(
  segs: TextSegment[],
  cellLeft: number,
  cellRight: number
): TableCellData {
  const sorted = [...segs].sort((a, b) => a.y - b.y || a.x - b.x);
  const paras: Array<{ align: TextAlign; runs: StyledRun[] }> = [];
  let lineGroup: TextSegment[] = [];
  let lastY: number | null = null;
  const flush = () => {
    if (lineGroup.length === 0) return;
    lineGroup.sort((a, b) => a.x - b.x);
    const runs: StyledRun[] = [];
    for (let si = 0; si < lineGroup.length; si++) {
      if (si > 0) {
        const gap = lineGroup[si].x - lineGroup[si - 1].endX;
        runs.push({ text: gap > 22 ? '   ' : ' ', fontSizePt: lineGroup[si].fontSize });
      }
      runs.push(...lineGroup[si].runs);
    }
    const align = detectCellLineAlignment(
      lineGroup[0].x,
      lineGroup[lineGroup.length - 1].endX,
      cellLeft,
      cellRight
    );
    paras.push({ align, runs });
    lineGroup = [];
  };
  for (const seg of sorted) {
    if (lastY !== null && Math.abs(seg.y - lastY) > Math.max(3.5, seg.fontSize * 0.62)) {
      flush();
    }
    lineGroup.push(seg);
    lastY = seg.y;
  }
  flush();
  if (paras.length === 0) {
    paras.push({ align: 'left', runs: [{ text: '' }] });
  }
  return {
    paragraphs: paras,
    vAlign: 'top',
  };
}

/**
 * Detect bordered grid tables from vector ruling lines + visual lines inside their bounds,
 * decomposing stacked or enclosed form sections AND merging horizontally co-banded cards/boxes.
 */
function detectBorderedTables(
  lines: VisualLine[],
  rulings: RulingSegment[],
  images: ExtractedImage[],
  fillRects: FillRect[],
  vectorGraphicBoxes: VectorGraphicBox[],
  pageWidthPt: number,
  pageHeightPt: number
): {
  tables: TableCandidateMatch[];
  usedSegments: Set<TextSegment>;
  usedLineIndices: Set<number>;
  usedImageIndices: Set<number>;
  consumedRulings: Set<RulingSegment>;
} {
  const hLines = rulings.filter((r) => r.orientation === 'h');
  const vLines = rulings.filter((r) => r.orientation === 'v');
  const tables: TableCandidateMatch[] = [];
  const usedSegments = new Set<TextSegment>();
  const usedLineIndices = new Set<number>();
  const usedImageIndices = new Set<number>();
  const consumedRulings = new Set<RulingSegment>();

  if (hLines.length < 2 || vLines.length < 2) {
    return { tables, usedSegments, usedLineIndices, usedImageIndices, consumedRulings };
  }

  const visitedH = new Set<number>();
  const visitedV = new Set<number>();
  const tol = 5;

  const intersects = (h: RulingSegment, v: RulingSegment) =>
    v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol && h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol;

  const singleRowPool: RawSliceCandidate[] = [];
  const multiRowSlices: RawSliceCandidate[] = [];

  for (let hi = 0; hi < hLines.length; hi++) {
    if (visitedH.has(hi)) continue;
    const compH: RulingSegment[] = [];
    const compV: RulingSegment[] = [];
    const queue: Array<{ type: 'h' | 'v'; idx: number }> = [{ type: 'h', idx: hi }];
    visitedH.add(hi);

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.type === 'h') {
        const h = hLines[item.idx];
        compH.push(h);
        for (let vi = 0; vi < vLines.length; vi++) {
          if (!visitedV.has(vi) && intersects(h, vLines[vi])) {
            visitedV.add(vi);
            queue.push({ type: 'v', idx: vi });
          }
        }
      } else {
        const v = vLines[item.idx];
        compV.push(v);
        for (let hj = 0; hj < hLines.length; hj++) {
          if (!visitedH.has(hj) && intersects(hLines[hj], v)) {
            visitedH.add(hj);
            queue.push({ type: 'h', idx: hj });
          }
        }
      }
    }

    if (compH.length < 2 || compV.length < 2) continue;

    const allRowYs = clusterSortedValues(
      compH.map((h) => h.y1),
      3.5
    );
    const allColXs = clusterSortedValues(
      compV.map((v) => v.x1),
      3.5
    );
    if (allRowYs.length < 2 || allColXs.length < 2) continue;

    const compLeft = allColXs[0];
    const compRight = allColXs[allColXs.length - 1];
    const compWidth = Math.max(1, compRight - compLeft);
    const compHeight = Math.max(1, allRowYs[allRowYs.length - 1] - allRowYs[0]);

    // Skip standalone full-page decorative border frames
    if (
      allRowYs.length === 2 &&
      allColXs.length === 2 &&
      compWidth >= pageWidthPt * 0.88 &&
      compHeight >= pageHeightPt * 0.85
    ) {
      continue;
    }

    const numBands = allRowYs.length - 1;
    const bandInteriorXs: number[][] = [];
    const bandHasContent: boolean[] = [];

    for (let r = 0; r < numBands; r++) {
      const bTop = allRowYs[r];
      const bBot = allRowYs[r + 1];
      const bH = bBot - bTop;
      const activeVs = compV.filter((v) => {
        const overlap = Math.min(bBot, v.y2) - Math.max(bTop, v.y1);
        return overlap >= Math.max(3, bH * 0.55);
      });
      const activeXs = clusterSortedValues(
        activeVs.map((v) => v.x1),
        3.5
      );
      const interior = activeXs.filter((x) => x > compLeft + 4.5 && x < compRight - 4.5);
      bandInteriorXs.push(interior);

      const hasLineText = lines.some(
        (l) => l.y >= bTop - 3 && l.y <= bBot + 3 && l.x <= compRight + 3 && l.endX >= compLeft - 3
      );
      const hasImg = images.some((img) => {
        const cy = img.yTop + img.heightPt / 2;
        const cx = img.x + img.widthPt / 2;
        return cy >= bTop - 3 && cy <= bBot + 3 && cx >= compLeft - 3 && cx <= compRight + 3;
      });
      const hasVBox = vectorGraphicBoxes.some((vb) => {
        const cy = (vb.y1 + vb.y2) / 2;
        const cx = (vb.x1 + vb.x2) / 2;
        return cy >= bTop - 3 && cy <= bBot + 3 && cx >= compLeft - 3 && cx <= compRight + 3;
      });
      bandHasContent.push(hasLineText || hasImg || hasVBox);
    }

    const cutBandIndices: number[] = [0];
    for (let b = 1; b < numBands; b++) {
      const cutY = allRowYs[b];
      const cutHs = compH.filter((h) => Math.abs(h.y1 - cutY) <= 3.5);
      const cutSpan = cutHs.reduce((sum, h) => sum + (h.x2 - h.x1), 0);
      const isFullSpanBoundary = cutSpan >= compWidth * 0.85;
      if (!isFullSpanBoundary) continue;

      const prevInterior = bandInteriorXs[b - 1];
      const nextInterior = bandInteriorXs[b];

      if (!bandHasContent[b - 1] && prevInterior.length === 0) {
        cutBandIndices.push(b);
        continue;
      }
      if (!bandHasContent[b] && nextInterior.length === 0) {
        cutBandIndices.push(b);
        continue;
      }

      if (!areDividerSetsCompatible(prevInterior, nextInterior, 4.2)) {
        cutBandIndices.push(b);
      }
    }
    cutBandIndices.push(numBands);

    for (let s = 0; s < cutBandIndices.length - 1; s++) {
      const startBand = cutBandIndices[s];
      const endBand = cutBandIndices[s + 1];
      if (endBand <= startBand) continue;

      const subTop = allRowYs[startBand];
      const subBottom = allRowYs[endBand];

      let anyContent = false;
      let anyInteriorV = false;
      for (let b = startBand; b < endBand; b++) {
        if (bandHasContent[b]) anyContent = true;
        if (bandInteriorXs[b].length > 0) anyInteriorV = true;
      }
      if (!anyContent && !anyInteriorV && endBand - startBand > 1) continue;

      const subH = compH.filter((h) => h.y1 >= subTop - 3.5 && h.y1 <= subBottom + 3.5);
      const rawV = compV.filter((v) => Math.min(subBottom, v.y2) - Math.max(subTop, v.y1) >= 4);
      const subV = rawV.map((v) => ({
        ...v,
        y1: Math.max(subTop, v.y1),
        y2: Math.min(subBottom, v.y2),
      }));

      const sliceRows = clusterSortedValues(
        subH.map((h) => h.y1),
        3.5
      );
      const sliceCols = clusterSortedValues(
        subV.map((v) => v.x1),
        3.5
      );
      if (sliceRows.length < 2 || sliceCols.length < 2) continue;

      const sNumRows = sliceRows.length - 1;
      const sNumCols = sliceCols.length - 1;
      const sLeft = sliceCols[0];
      const sRight = sliceCols[sliceCols.length - 1];
      const sTop = sliceRows[0];
      const sBottom = sliceRows[sliceRows.length - 1];

      const sliceObj: RawSliceCandidate = {
        subH,
        subV,
        rawV,
        left: sLeft,
        right: sRight,
        top: sTop,
        bottom: sBottom,
        numRows: sNumRows,
        numCols: sNumCols,
      };

      if (sNumRows === 1) {
        singleRowPool.push(sliceObj);
      } else {
        multiRowSlices.push(sliceObj);
      }
    }
  }

  const commitBuilt = (
    built: TableCandidateMatch | null,
    srcHs: RulingSegment[],
    srcVs: RulingSegment[]
  ) => {
    if (!built) return;
    tables.push(built);
    built.consumedSegments.forEach((seg) => usedSegments.add(seg));
    built.consumedImageIndices.forEach((idx) => usedImageIndices.add(idx));
    srcHs.forEach((h) => consumedRulings.add(h));
    srcVs.forEach((v) => consumedRulings.add(v));
  };

  // 1. Build all multi-row slices directly
  for (const slice of multiRowSlices) {
    const built = buildSingleTableFromGrid(
      slice.subH,
      slice.subV,
      lines,
      usedSegments,
      images,
      usedImageIndices,
      fillRects,
      vectorGraphicBoxes,
      false
    );
    commitBuilt(built, slice.subH, slice.rawV);
  }

  // 2. Group horizontally co-banded single-row slices (e.g. 5 separate boxes or split card cells)
  const visitedSingle = new Set<number>();
  const sortedSingles = [...singleRowPool].sort((a, b) => a.top - b.top || a.left - b.left);

  for (let i = 0; i < sortedSingles.length; i++) {
    if (visitedSingle.has(i)) continue;
    const seed = sortedSingles[i];
    const wSeed = seed.right - seed.left;
    const hSeed = seed.bottom - seed.top;
    if (wSeed < 18 || hSeed < 14) continue;

    // Exclude huge standalone boxes (over 45% page area when 1x1)
    if (
      seed.numCols === 1 &&
      (wSeed >= pageWidthPt * 0.85 || (wSeed * hSeed) / Math.max(1, pageWidthPt * pageHeightPt) >= 0.45)
    ) {
      continue;
    }

    const groupIndices = [i];
    visitedSingle.add(i);

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < sortedSingles.length; j++) {
        if (visitedSingle.has(j)) continue;
        const cand = sortedSingles[j];
        const wC = cand.right - cand.left;
        const hC = cand.bottom - cand.top;
        if (
          cand.numCols === 1 &&
          (wC >= pageWidthPt * 0.85 || (wC * hC) / Math.max(1, pageWidthPt * pageHeightPt) >= 0.45)
        ) {
          continue;
        }

        const alignedWithMember = groupIndices.some((gi) => {
          const m = sortedSingles[gi];
          const mH = Math.max(1, m.bottom - m.top);
          const ovY = Math.min(m.bottom, cand.bottom) - Math.max(m.top, cand.top);
          const xGap = Math.max(cand.left - m.right, m.left - cand.right);
          const xOverlap = Math.min(m.right, cand.right) - Math.max(m.left, cand.left);
          return (
            Math.abs(m.top - cand.top) <= 18 &&
            Math.abs(m.bottom - cand.bottom) <= 18 &&
            ovY >= Math.min(mH, hC) * 0.62 &&
            xOverlap <= 8 &&
            xGap <= 34
          );
        });
        if (alignedWithMember) {
          visitedSingle.add(j);
          groupIndices.push(j);
          changed = true;
        }
      }
    }

    const members = groupIndices.map((idx) => sortedSingles[idx]).sort((a, b) => a.left - b.left);

    if (members.length === 1) {
      const m = members[0];
      if (m.numCols >= 2) {
        const built = buildSingleTableFromGrid(
          m.subH,
          m.subV,
          lines,
          usedSegments,
          images,
          usedImageIndices,
          fillRects,
          vectorGraphicBoxes,
          false
        );
        commitBuilt(built, m.subH, m.rawV);
      }
      // Isolated 1x1 boxes are NOT turned into 1x1 tables
      continue;
    }

    // Merge co-banded members horizontally into a unified bordered row grid
    const commonTop = Math.min(...members.map((m) => m.top));
    const commonBottom = Math.max(...members.map((m) => m.bottom));
    const mergedH: RulingSegment[] = [];
    const mergedV: RulingSegment[] = [];
    const allSrcH: RulingSegment[] = [];
    const allSrcV: RulingSegment[] = [];

    for (let mi = 0; mi < members.length; mi++) {
      const m = members[mi];
      m.subH.forEach((h) => allSrcH.push(h));
      m.rawV.forEach((v) => allSrcV.push(v));

      let adjLeft = m.left;
      let adjRight = m.right;
      if (mi > 0) {
        const prev = members[mi - 1];
        const gap = m.left - prev.right;
        if (gap >= -4 && gap <= 34) {
          adjLeft = (prev.right + m.left) / 2;
        }
      }
      if (mi + 1 < members.length) {
        const next = members[mi + 1];
        const gap = next.left - m.right;
        if (gap >= -4 && gap <= 34) {
          adjRight = (m.right + next.left) / 2;
        }
      }

      mergedH.push(
        { x1: adjLeft, y1: commonTop, x2: adjRight, y2: commonTop, orientation: 'h' },
        { x1: adjLeft, y1: commonBottom, x2: adjRight, y2: commonBottom, orientation: 'h' }
      );
      mergedV.push(
        { x1: adjLeft, y1: commonTop, x2: adjLeft, y2: commonBottom, orientation: 'v' },
        { x1: adjRight, y1: commonTop, x2: adjRight, y2: commonBottom, orientation: 'v' }
      );
      // Preserve any internal vertical dividers within a member slice
      for (const v of m.subV) {
        if (v.x1 > m.left + 4.5 && v.x1 < m.right - 4.5) {
          mergedV.push({ x1: v.x1, y1: commonTop, x2: v.x1, y2: commonBottom, orientation: 'v' });
        }
      }
    }

    const built = buildSingleTableFromGrid(
      mergedH,
      mergedV,
      lines,
      usedSegments,
      images,
      usedImageIndices,
      fillRects,
      vectorGraphicBoxes,
      false
    );
    commitBuilt(built, allSrcH, allSrcV);
  }

  // 3. Unify an upper-page right-side boxed table (e.g. QR / Old Photo / Paste Current Photo)
  //    with co-banded unboxed left-side text columns (e.g. Col 1 Elector + Col 2 Serial No.)
  const pageTextMinX = lines.length > 0 ? Math.min(...lines.map((l) => l.x)) : 40;
  for (const tMatch of tables) {
    if (tMatch.block.type !== 'table') continue;
    if (tMatch.bounds.top > pageHeightPt * 0.45) continue;
    const gapOnLeft = tMatch.bounds.left - pageTextMinX;
    if (gapOnLeft < 85 || tMatch.block.colWidthsPt.length > 4) continue;

    const leftSegs: TextSegment[] = [];
    for (const line of lines) {
      if (line.y < tMatch.bounds.top - 10 || line.y > tMatch.bounds.bottom + 10) continue;
      for (const seg of line.segments) {
        if (usedSegments.has(seg)) continue;
        if (seg.endX <= tMatch.bounds.left + 6 && seg.x >= pageTextMinX - 6) {
          leftSegs.push(seg);
        }
      }
    }
    if (leftSegs.length < 2) continue;

    const leftRegionLeft = Math.min(pageTextMinX, ...leftSegs.map((s) => s.x));
    const leftRegionRight = tMatch.bounds.left;
    const splitX = splitWideFirstColumnByX(leftSegs, leftRegionLeft, leftRegionRight);

    const prependCols: number[] = [];
    const prependCells: TableCellData[] = [];
    const rowSpan = tMatch.block.rows.length > 1 ? tMatch.block.rows.length : undefined;

    if (splitX !== null) {
      const c1Segs = leftSegs.filter((s) => (s.x + s.endX) / 2 < splitX);
      const c2Segs = leftSegs.filter((s) => (s.x + s.endX) / 2 >= splitX);
      const c1W = Math.max(40, splitX - leftRegionLeft);
      const c2W = Math.max(40, leftRegionRight - splitX);
      prependCols.push(c1W, c2W);
      const cell1 = buildCellContentFromSegments(c1Segs, leftRegionLeft, splitX);
      const cell2 = buildCellContentFromSegments(c2Segs, splitX, leftRegionRight);
      if (rowSpan) {
        cell1.rowSpan = rowSpan;
        cell2.rowSpan = rowSpan;
      }
      prependCells.push(cell1, cell2);
    } else {
      const c1W = Math.max(50, leftRegionRight - leftRegionLeft);
      prependCols.push(c1W);
      const cell1 = buildCellContentFromSegments(leftSegs, leftRegionLeft, leftRegionRight);
      if (rowSpan) cell1.rowSpan = rowSpan;
      prependCells.push(cell1);
    }

    tMatch.block.colWidthsPt = [...prependCols, ...tMatch.block.colWidthsPt];
    if (tMatch.block.rows.length > 0) {
      tMatch.block.rows[0].cells = [...prependCells, ...tMatch.block.rows[0].cells];
      tMatch.block.compact = tMatch.block.colWidthsPt.length >= 4 || tMatch.block.compact;
    }
    tMatch.bounds.left = leftRegionLeft;
    leftSegs.forEach((seg) => {
      usedSegments.add(seg);
      tMatch.consumedSegments.add(seg);
    });
  }

  // Compute fully-consumed line indices (lines whose every segment was consumed by a table)
  lines.forEach((line, idx) => {
    if (line.segments.length > 0 && line.segments.every((seg) => usedSegments.has(seg))) {
      usedLineIndices.add(idx);
    }
  });

  return { tables, usedSegments, usedLineIndices, usedImageIndices, consumedRulings };
}

/**
 * Use unconsumed standalone horizontal strokes to mark text underlines or synthesize fill-in blank lines.
 */
function applyInlineVectorUnderlinesAndBlanks(
  lines: VisualLine[],
  usedLineIndices: Set<number>,
  rulings: RulingSegment[],
  consumedRulings: Set<RulingSegment>
): void {
  const unusedH = rulings.filter(
    (r) => r.orientation === 'h' && !consumedRulings.has(r) && r.x2 - r.x1 >= 14
  );
  if (unusedH.length === 0) return;

  for (const h of unusedH) {
    const hLen = h.x2 - h.x1;
    let bestLineIdx = -1;
    let bestDy = Infinity;

    for (let li = 0; li < lines.length; li++) {
      if (usedLineIndices.has(li)) continue;
      const line = lines[li];
      // Baseline sits at or slightly above horizontal fill/underline rule
      const dy = h.y1 - line.y;
      if (dy >= -3.5 && dy <= 8.5 && Math.abs(dy) < bestDy) {
        bestDy = Math.abs(dy);
        bestLineIdx = li;
      }
    }

    if (bestLineIdx === -1) continue;
    const targetLine = lines[bestLineIdx];

    // Check if ruling underlines existing text segment(s)
    let overlapsExistingText = false;
    for (const seg of targetLine.segments) {
      const overlap = Math.min(seg.endX, h.x2) - Math.max(seg.x, h.x1);
      if (overlap >= Math.min(12, (seg.endX - seg.x) * 0.6)) {
        overlapsExistingText = true;
        seg.runs.forEach((r) => {
          r.underline = true;
        });
      }
    }

    if (!overlapsExistingText && hLen >= 18 && hLen <= 480) {
      // Check that no segment already covers the empty fill-in zone
      const blocked = targetLine.segments.some(
        (seg) => Math.min(seg.endX, h.x2) - Math.max(seg.x, h.x1) > 6
      );
      if (!blocked) {
        const dashCount = Math.max(6, Math.min(48, Math.round(hLen / 5.2)));
        const blankText = '_'.repeat(dashCount);
        targetLine.segments.push({
          x: h.x1,
          endX: h.x2,
          y: targetLine.y,
          fontSize: targetLine.fontSize,
          text: blankText,
          runs: [{ text: blankText, fontSizePt: targetLine.fontSize }],
        });
      }
    }

    lines[bestLineIdx] = makeSingleColumnLine(targetLine.segments);
  }
}

const LIST_MARKER_SEG_RE = /^\s*(?:\d+[.)]|\([a-zA-Z0-9]{1,4}\)|[a-zA-Z][.)]|[•●▪◦\-*–—])\s*$/;

/**
 * Detect borderless aligned column tables among non-consumed lines.
 */
function buildAlignedTableIfValid(runOfLines: VisualLine[]): DocBlock | null {
  if (runOfLines.length < 2) return null;
  const multiSegRows = runOfLines.filter((l) => l.segments.length >= 2);
  if (multiSegRows.length < 2) return null;

  // Guard 1: Never turn numbered/bulleted document lists with hanging indents or numbered fill-in questions into tables
  const listRowsCount = multiSegRows.filter(
    (l) =>
      l.segments.length >= 2 &&
      (LIST_MARKER_SEG_RE.test(l.segments[0].text) ||
        (LINE_BULLET_RE.test(l.text) && l.segments.slice(1).every((s) => /^[._]+$/.test(s.text))))
  ).length;
  if (listRowsCount >= 1 && (listRowsCount / multiSegRows.length >= 0.4 || runOfLines.length <= 2)) {
    return null;
  }

  // Guard 2: Against misclassifying wrapped 2-column prose as a table
  const segCounts = multiSegRows.map((l) => l.segments.length);
  const maxSegs = Math.max(...segCounts);
  if (maxSegs === 2) {
    const avgCharsPerSeg =
      multiSegRows.reduce((s, l) => s + l.segments.reduce((ss, sg) => ss + sg.text.length, 0), 0) /
      Math.max(1, multiSegRows.reduce((s, l) => s + l.segments.length, 0));
    if (avgCharsPerSeg > 34 && runOfLines.length >= 4) {
      return null;
    }
  }

  const allStarts = runOfLines.flatMap((l) => l.segments.map((s) => s.x));
  const anchors = clusterSortedValues(allStarts, 18);
  if (anchors.length < 2 || anchors.length > 10) return null;

  const colHits = new Array(anchors.length).fill(0);
  const assignedRows: Array<Array<TextSegment[]>> = [];

  for (const line of runOfLines) {
    const rowBuckets: Array<TextSegment[]> = Array.from({ length: anchors.length }, () => []);
    for (const seg of line.segments) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < anchors.length; c++) {
        const d = Math.abs(seg.x - anchors[c]);
        if (d < bestDist) {
          bestDist = d;
          bestCol = c;
        }
      }
      if (bestDist > 34 && anchors.length >= 2) {
        for (let c = 0; c < anchors.length; c++) {
          const nextAnchor = c + 1 < anchors.length ? anchors[c + 1] : Infinity;
          if (seg.x >= anchors[c] - 20 && seg.endX < nextAnchor - 6) {
            bestCol = c;
            break;
          }
        }
      }
      rowBuckets[bestCol].push(seg);
      colHits[bestCol]++;
    }
    assignedRows.push(rowBuckets);
  }

  const activeCols = colHits.filter((cnt) => cnt >= 2).length;
  if (activeCols < 2) return null;

  const keepColIndices = colHits
    .map((cnt, idx) => (cnt > 0 ? idx : -1))
    .filter((idx) => idx !== -1);
  if (keepColIndices.length < 2) return null;

  const colMaxWidth: number[] = keepColIndices.map((colIdx, idx) => {
    let maxW = 40;
    for (const row of assignedRows) {
      for (const seg of row[colIdx]) {
        maxW = Math.max(maxW, seg.endX - seg.x + 14);
      }
    }
    if (idx + 1 < keepColIndices.length) {
      const nextAnchorX = anchors[keepColIndices[idx + 1]];
      const curAnchorX = anchors[colIdx];
      maxW = Math.max(maxW, nextAnchorX - curAnchorX);
    }
    return maxW;
  });

  // Detect side-by-side form field / signature rows (containing dotted/underscore blanks) so we keep them borderless
  const hasFormFillBlanks = runOfLines.some((l) => /[._]{4,}/.test(l.text));

  const rows: TableRowData[] = assignedRows.map((row, rowIdx) => {
    let boldChars = 0;
    let totalChars = 0;
    const cells: TableCellData[] = keepColIndices.map((colIdx) => {
      const segs = row[colIdx];
      if (segs.length === 0) {
        return { paragraphs: [{ align: 'left', runs: [{ text: '' }] }] };
      }
      const runs: StyledRun[] = [];
      segs.forEach((seg, sIdx) => {
        if (sIdx > 0) runs.push({ text: ' ', fontSizePt: seg.fontSize });
        for (const r of seg.runs) {
          const len = r.text.replace(/\s+/g, '').length;
          totalChars += len;
          if (r.bold) boldChars += len;
          runs.push(r);
        }
      });
      return {
        paragraphs: [{ align: 'left', runs }],
        isHeader: !hasFormFillBlanks && rowIdx === 0,
      };
    });
    const isHeader = !hasFormFillBlanks && rowIdx === 0 && totalChars > 0 && boldChars / totalChars >= 0.7;
    if (isHeader) {
      cells.forEach((c) => {
        c.isHeader = true;
      });
    }
    return { cells, isHeader };
  });

  return {
    type: 'table',
    colWidthsPt: colMaxWidth,
    rows,
    hasBorders: !hasFormFillBlanks,
    compact: hasFormFillBlanks,
    yTop: runOfLines[0].y,
  };
}

/**
 * Detect whether a list of lines forms a 2-column (or 3-column) side-by-side prose layout
 * with a clean vertical gutter, and split into: top banner, column 1, column 2, bottom band.
 */
function splitMultiColumnRegion(
  lines: VisualLine[],
  regionLeft: number,
  regionRight: number,
  depth = 0
): VisualLine[][] {
  if (depth >= 2 || lines.length < 7) return [lines];
  const width = regionRight - regionLeft;
  if (width < 220) return [lines];

  const centerX = (regionLeft + regionRight) / 2;
  const candidateSegs: TextSegment[] = [];
  for (const line of lines) {
    for (const seg of line.segments) {
      const segWidth = seg.endX - seg.x;
      const crossesCenterBanner =
        line.segments.length === 1 && seg.x < centerX - 8 && seg.endX > centerX + 8;
      if (segWidth < width * 0.54 && !crossesCenterBanner) {
        candidateSegs.push(seg);
      }
    }
  }
  if (candidateSegs.length < 8) return [lines];

  const searchStart = Math.floor(regionLeft + width * 0.25);
  const searchEnd = Math.ceil(regionRight - width * 0.25);
  let bestGutterStart = -1;
  let bestGutterEnd = -1;
  let curStart = -1;

  for (let x = searchStart; x <= searchEnd; x++) {
    let hits = 0;
    for (const seg of candidateSegs) {
      if (seg.x <= x && seg.endX >= x) hits++;
    }
    if (hits === 0) {
      if (curStart === -1) curStart = x;
    } else {
      if (curStart !== -1 && x - curStart > bestGutterEnd - bestGutterStart) {
        bestGutterStart = curStart;
        bestGutterEnd = x;
      }
      curStart = -1;
    }
  }
  if (curStart !== -1 && searchEnd - curStart > bestGutterEnd - bestGutterStart) {
    bestGutterStart = curStart;
    bestGutterEnd = searchEnd;
  }

  const gutterWidth = bestGutterEnd - bestGutterStart;
  const gutterMid = (bestGutterStart + bestGutterEnd) / 2;
  if (gutterWidth < 12 || Math.abs(gutterMid - centerX) > width * 0.22) {
    return [lines];
  }

  let leftProseLines = 0;
  let rightProseLines = 0;
  const columnYStartCandidates: number[] = [];
  const columnYEndCandidates: number[] = [];

  for (const line of lines) {
    const spansAcross = line.segments.some((s) => s.x < gutterMid - 8 && s.endX > gutterMid + 8);
    if (spansAcross) continue;
    const leftSegs = line.segments.filter((s) => s.endX <= gutterMid + 2);
    const rightSegs = line.segments.filter((s) => s.x >= gutterMid - 2);
    const hasLeftNonFill = leftSegs.some((ls) => !/[._]{4,}/.test(ls.text) && ls.text.length >= 16);
    const hasRightNonFill = rightSegs.some((rs) => !/[._]{4,}/.test(rs.text) && rs.text.length >= 16);
    if (hasLeftNonFill && hasRightNonFill) {
      columnYStartCandidates.push(line.y);
      columnYEndCandidates.push(line.y);
    }
    for (const ls of leftSegs) {
      if (!/[._]{4,}/.test(ls.text) && ls.text.length >= 18) leftProseLines++;
    }
    for (const rs of rightSegs) {
      if (!/[._]{4,}/.test(rs.text) && rs.text.length >= 18) rightProseLines++;
    }
  }

  if (leftProseLines < 4 || rightProseLines < 4 || columnYStartCandidates.length < 4) {
    return [lines];
  }

  const colTopY = Math.min(...columnYStartCandidates) - 4;
  const colBottomY = Math.max(...columnYEndCandidates) + 4;

  const topBanner: VisualLine[] = [];
  const leftLines: VisualLine[] = [];
  const rightLines: VisualLine[] = [];
  const bottomBanner: VisualLine[] = [];

  for (const line of lines) {
    if (line.y < colTopY) {
      topBanner.push(line);
      continue;
    }
    if (line.y > colBottomY) {
      bottomBanner.push(line);
      continue;
    }
    const spansAcross = line.segments.some((s) => s.x < gutterMid - 10 && s.endX > gutterMid + 10);
    if (spansAcross) {
      leftLines.push(line);
      continue;
    }
    const lSegs = line.segments.filter((s) => s.endX <= gutterMid + 2);
    const rSegs = line.segments.filter((s) => s.x >= gutterMid - 2);

    if (lSegs.length > 0) {
      leftLines.push(makeSingleColumnLine(lSegs));
    }
    if (rSegs.length > 0) {
      rightLines.push(makeSingleColumnLine(rSegs));
    }
  }

  const result: VisualLine[][] = [];
  if (topBanner.length > 0) result.push(topBanner);
  if (leftLines.length > 0) result.push(leftLines);
  if (rightLines.length > 0) result.push(rightLines);
  if (bottomBanner.length > 0) result.push(bottomBanner);
  return result.length > 0 ? result : [lines];
}

const LINE_BULLET_RE = /^(\s*[•●▪◦\-*]|\s*\d+(?:\.\d+)?[.)]|\s*\([a-zA-Z0-9]{1,4}\)|\s*[a-zA-Z][.)])\s+/;

function convertLinesToBlocks(
  lines: VisualLine[],
  bodyFontSize: number,
  regionLeft: number,
  regionRight: number,
  compactPage: boolean
): DocBlock[] {
  const blocks: DocBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for borderless aligned table run (2+ consecutive multi-segment lines)
    const isNumberedInlineBlank =
      LINE_BULLET_RE.test(line.text) &&
      line.segments.length === 2 &&
      /^[._]+$/.test(line.segments[1].text);
    if (line.segments.length >= 2 && !isNumberedInlineBlank) {
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].segments.length >= 2 &&
        !(
          LINE_BULLET_RE.test(lines[j].text) &&
          lines[j].segments.length === 2 &&
          /^[._]+$/.test(lines[j].segments[1].text)
        ) &&
        lines[j].y - lines[j - 1].y < 42
      ) {
        j++;
      }
      if (j - i >= 2) {
        const candidateRun = lines.slice(i, j);
        const tableBlock = buildAlignedTableIfValid(candidateRun);
        if (tableBlock) {
          blocks.push(tableBlock);
          i = j;
          continue;
        }
      }
    }

    const align = detectAlignment(line.x, line.endX, regionLeft, regionRight);
    const wordsCount = countWords(line.text);
    const isCenteredSeparator =
      align === 'center' && /^(?:OR|AND)$/i.test(line.text.trim());

    if (isCenteredSeparator) {
      blocks.push({
        type: 'paragraph',
        align: 'center',
        runs: line.runs.map((r) => ({ ...r, bold: true })),
        spaceBeforePt: 6,
        spaceAfterPt: 6,
        yTop: line.y,
      });
      i++;
      continue;
    }

    const isLargerH1 = line.fontSize >= bodyFontSize * 1.45 && wordsCount <= 16;
    const isLargerH2 = line.fontSize >= bodyFontSize * 1.2 && wordsCount <= 18;
    const isStandaloneBoldHeading =
      line.isBoldOnly &&
      wordsCount <= 12 &&
      line.fontSize >= bodyFontSize * 0.98 &&
      !/[.,;:]$/.test(line.text) &&
      !LINE_BULLET_RE.test(line.text) &&
      (i === 0 || line.y - lines[i - 1].y >= line.fontSize * 1.32) &&
      (i === lines.length - 1 || lines[i + 1].y - line.y >= line.fontSize * 1.28);

    if (isLargerH1 || isLargerH2 || isStandaloneBoldHeading) {
      const level: 1 | 2 | 3 = isLargerH1 ? 1 : isLargerH2 ? 2 : 3;
      const headingRuns = line.runs.map((r) => ({ ...r }));
      const startY = line.y;
      while (
        i + 1 < lines.length &&
        Math.abs(lines[i + 1].fontSize - line.fontSize) < 1.2 &&
        lines[i + 1].y - lines[i].y <= line.fontSize * 1.45 &&
        countWords(lines[i + 1].text) <= 12 &&
        lines[i + 1].isBoldOnly === line.isBoldOnly &&
        !LINE_BULLET_RE.test(lines[i + 1].text)
      ) {
        i++;
        headingRuns.push({ text: ' ', fontSizePt: lines[i].fontSize });
        headingRuns.push(...lines[i].runs.map((r) => ({ ...r })));
      }
      blocks.push({
        type: 'heading',
        level,
        align,
        runs: headingRuns,
        yTop: startY,
      });
      i++;
      continue;
    }

    // Build paragraph by merging consecutive wrapped body lines (including hanging-indent list continuations)
    const paraLines: VisualLine[] = [line];
    const startedAsBullet = LINE_BULLET_RE.test(line.text);
    const regionWidth = Math.max(40, regionRight - regionLeft);

    while (i + 1 < lines.length) {
      const prevL = lines[i];
      const nextL = lines[i + 1];

      // Break if upcoming lines look like a borderless multi-column table
      if (nextL.segments.length >= 2 && i + 2 < lines.length && lines[i + 2].segments.length >= 2) {
        const nextRunValid = buildAlignedTableIfValid(lines.slice(i + 1, i + 3));
        if (nextRunValid) break;
      }

      const dy = nextL.y - prevL.y;
      const expectedLineStep = Math.max(prevL.fontSize, nextL.fontSize) * 1.45;
      const nextIsHeading =
        nextL.fontSize >= bodyFontSize * 1.2 ||
        (nextL.isBoldOnly &&
          countWords(nextL.text) <= 10 &&
          !/[.,;:]$/.test(nextL.text) &&
          !LINE_BULLET_RE.test(nextL.text));
      const nextIsBullet = LINE_BULLET_RE.test(nextL.text);
      const nextIsOrSep =
        detectAlignment(nextL.x, nextL.endX, regionLeft, regionRight) === 'center' &&
        /^(?:OR|AND)$/i.test(nextL.text.trim());
      const nextAlign = detectAlignment(nextL.x, nextL.endX, regionLeft, regionRight);

      const prevFillRatio = (prevL.endX - regionLeft) / regionWidth;
      const prevEndedEarly = prevFillRatio < 0.72 && /[.!?:]$/.test(prevL.text);
      const isHangingContinuation =
        startedAsBullet &&
        !nextIsBullet &&
        nextL.x >= line.x - 2 &&
        nextL.x <= (line.segments[1]?.x ?? line.x + 36) + 10;
      const alignCompatible = nextAlign === align || isHangingContinuation;

      if (
        dy > expectedLineStep * 1.25 ||
        dy < -5 ||
        nextIsHeading ||
        nextIsBullet ||
        nextIsOrSep ||
        !alignCompatible ||
        prevEndedEarly
      ) {
        break;
      }
      paraLines.push(nextL);
      i++;
    }

    const runs: StyledRun[] = [];
    paraLines.forEach((pl, idx) => {
      if (idx > 0) {
        const prevTxt = runs[runs.length - 1]?.text || '';
        if (/[A-Za-z]-$/.test(prevTxt) && /^[a-z]/.test(pl.text)) {
          runs[runs.length - 1].text = prevTxt.slice(0, -1);
        } else {
          runs.push({ text: ' ', fontSizePt: pl.fontSize });
        }
      }
      for (const r of pl.runs) {
        const last = runs[runs.length - 1];
        if (
          last &&
          Boolean(last.bold) === Boolean(r.bold) &&
          Boolean(last.italic) === Boolean(r.italic) &&
          Boolean(last.underline) === Boolean(r.underline) &&
          Math.abs((last.fontSizePt || bodyFontSize) - (r.fontSizePt || bodyFontSize)) < 0.6
        ) {
          last.text += r.text;
        } else {
          runs.push({ ...r });
        }
      }
    });

    const indentPt = Math.max(0, paraLines[0].x - regionLeft);
    blocks.push({
      type: 'paragraph',
      align,
      runs,
      indentPt: indentPt > 16 && align === 'left' ? Math.min(72, Math.round(indentPt)) : 0,
      spaceAfterPt: compactPage ? 3.5 : 6,
      compact: compactPage,
      yTop: paraLines[0].y,
    });
    i++;
  }

  return blocks;
}

export async function extractDigitalPage(
  page: PDFPageProxy,
  pageNumber: number
): Promise<PageConversionResult> {
  const viewport = page.getViewport({ scale: 1 });
  const pageWidthPt = viewport.width;
  const pageHeightPt = viewport.height;

  const textContent = await page.getTextContent({ includeMarkedContent: false });
  const styles = textContent.styles || {};

  const glyphs: RawGlyphItem[] = [];
  let charCount = 0;

  for (const rawItem of textContent.items) {
    if (!('str' in rawItem)) continue;
    const str = sanitizeXmlChars(rawItem.str || '');
    if (str.length === 0) continue;
    if (str.trim().length === 0) continue;

    const tx = Util.transform(viewport.transform, rawItem.transform);
    const fontSize = Math.max(6, Math.min(96, Math.hypot(tx[0], tx[1]) || rawItem.height || 11));
    const x = tx[4];
    const y = tx[5];
    const width = Math.max(0, rawItem.width);

    const styleObj = styles[rawItem.fontName];
    const { bold, italic } = parseFontFlags(rawItem.fontName, styleObj?.fontFamily);

    charCount += str.replace(/\s+/g, '').length;
    glyphs.push({
      str,
      x,
      y,
      endX: x + width,
      width,
      fontSize,
      bold,
      italic,
      hasEOL: Boolean(rawItem.hasEOL),
    });
  }

  const { rulings, fillRects, vectorGraphicBoxes, images } = await extractVectorRulingsAndImages(
    page,
    viewport.transform,
    pageWidthPt,
    pageHeightPt,
    true
  );

  const vRulings = rulings.filter((r) => r.orientation === 'v');
  const visualLines = buildVisualLines(glyphs, vRulings);
  if (visualLines.length === 0 && images.length === 0) {
    return {
      pageNumber,
      modeUsed: 'empty',
      widthPt: pageWidthPt,
      heightPt: pageHeightPt,
      blocks: [],
      wordCount: 0,
      extractedCharCount: 0,
    };
  }

  const bodyFontSize = visualLines.length > 0 ? computeBodyFontSize(visualLines) : 11;
  const pageMinX = visualLines.length > 0 ? Math.min(...visualLines.map((l) => l.x)) : 40;
  const pageMaxX = visualLines.length > 0 ? Math.max(...visualLines.map((l) => l.endX)) : pageWidthPt - 40;
  const pageMinY = visualLines.length > 0 ? Math.min(...visualLines.map((l) => l.y - l.fontSize)) : 36;
  const pageMaxY = visualLines.length > 0 ? Math.max(...visualLines.map((l) => l.y + 4)) : pageHeightPt - 36;

  // 1. Extract hierarchical bordered vector-ruled tables (and consume internal images & segments)
  const { tables: borderedTables, usedSegments, usedLineIndices, usedImageIndices, consumedRulings } =
    detectBorderedTables(visualLines, rulings, images, fillRects, vectorGraphicBoxes, pageWidthPt, pageHeightPt);

  // Filter visualLines for partial segment consumption (e.g. left text outside a right-side card table)
  const workingLines = visualLines.map((line, idx) => {
    if (usedLineIndices.has(idx)) return line;
    const leftoverSegs = line.segments.filter((seg) => !usedSegments.has(seg));
    if (leftoverSegs.length === line.segments.length) return line;
    if (leftoverSegs.length === 0) {
      usedLineIndices.add(idx);
      return line;
    }
    return makeSingleColumnLine(leftoverSegs);
  });

  // 2. Preserve standalone inline horizontal fill-in blanks and text underlines
  applyInlineVectorUnderlinesAndBlanks(workingLines, usedLineIndices, rulings, consumedRulings);

  // 2b. Borderless upper-page multi-column strip fallback (when top photo/QR/text strip lacks drawn boxes)
  const upperImages = images
    .map((img, idx) => ({ img, idx }))
    .filter(({ img, idx }) => !usedImageIndices.has(idx) && img.yTop < pageHeightPt * 0.42 && img.heightPt >= 26);

  if (upperImages.length >= 1) {
    const bandTop = Math.min(...upperImages.map((u) => u.img.yTop)) - 14;
    const bandBottom = Math.max(...upperImages.map((u) => u.img.yTop + u.img.heightPt)) + 16;
    const coveredByExistingTable = borderedTables.some(
      (t) => Math.min(bandBottom, t.bounds.bottom) - Math.max(bandTop, t.bounds.top) > 15
    );
    if (!coveredByExistingTable) {
      const bandLineIndices: number[] = [];
      workingLines.forEach((l, li) => {
        if (!usedLineIndices.has(li) && l.y >= bandTop && l.y <= bandBottom) {
          bandLineIndices.push(li);
        }
      });
      const bandSegs = bandLineIndices.flatMap((li) => workingLines[li].segments);
      if (bandSegs.length >= 2 && bandLineIndices.length <= 14) {
        type UpperItem =
          | { kind: 'seg'; x1: number; x2: number; seg: TextSegment }
          | { kind: 'img'; x1: number; x2: number; img: ExtractedImage; idx: number };
        const items: UpperItem[] = [
          ...bandSegs.map((seg) => ({ kind: 'seg' as const, x1: seg.x, x2: seg.endX, seg })),
          ...upperImages.map((u) => ({
            kind: 'img' as const,
            x1: u.img.x,
            x2: u.img.x + u.img.widthPt,
            img: u.img,
            idx: u.idx,
          })),
        ].sort((a, b) => a.x1 - b.x1);

        const colGroups: Array<{ x1: number; x2: number; items: UpperItem[] }> = [];
        for (const it of items) {
          const last = colGroups[colGroups.length - 1];
          if (last && it.x1 <= last.x2 + 10) {
            last.x2 = Math.max(last.x2, it.x2);
            last.items.push(it);
          } else {
            colGroups.push({ x1: it.x1, x2: it.x2, items: [it] });
          }
        }
        const totalSpan = colGroups.length > 0 ? colGroups[colGroups.length - 1].x2 - colGroups[0].x1 : 0;
        if (colGroups.length >= 3 && totalSpan >= pageWidthPt * 0.58) {
          const stripColWidths: number[] = [];
          const stripCells: TableCellData[] = [];
          for (let ci = 0; ci < colGroups.length; ci++) {
            const g = colGroups[ci];
            const cellLeft = ci === 0 ? g.x1 : (colGroups[ci - 1].x2 + g.x1) / 2;
            const cellRight = ci + 1 < colGroups.length ? (g.x2 + colGroups[ci + 1].x1) / 2 : g.x2 + 6;
            stripColWidths.push(Math.max(24, cellRight - cellLeft));

            const cSegs = g.items
              .filter((it): it is Extract<UpperItem, { kind: 'seg' }> => it.kind === 'seg')
              .map((it) => it.seg);
            const cImgs = g.items
              .filter((it): it is Extract<UpperItem, { kind: 'img' }> => it.kind === 'img');
            const builtCell = buildCellContentFromSegments(cSegs, cellLeft, cellRight);
            if (cImgs.length > 0) {
              builtCell.images = cImgs.map((ciItem) => ({
                pngBytes: ciItem.img.pngBytes,
                widthPt: ciItem.img.widthPt,
                heightPt: ciItem.img.heightPt,
                align: 'center' as TextAlign,
              }));
              builtCell.vAlign = 'center';
              cImgs.forEach((ciItem) => usedImageIndices.add(ciItem.idx));
            }
            stripCells.push(builtCell);
          }

          bandLineIndices.forEach((li) => usedLineIndices.add(li));
          borderedTables.push({
            consumedSegments: new Set(bandSegs),
            consumedImageIndices: new Set(upperImages.map((u) => u.idx)),
            bounds: {
              left: colGroups[0].x1,
              right: colGroups[colGroups.length - 1].x2,
              top: bandTop,
              bottom: bandBottom,
            },
            block: {
              type: 'table',
              colWidthsPt: stripColWidths,
              rows: [
                {
                  cells: stripCells,
                  heightPt: Math.max(26, Math.round(bandBottom - bandTop)),
                },
              ],
              hasBorders: true,
              compact: stripColWidths.length >= 4,
              yTop: bandTop,
            },
          });
        }
      }
    }
  }

  const remainingLines = workingLines.filter((_, idx) => !usedLineIndices.has(idx));
  const remainingImages = images.filter((_, idx) => !usedImageIndices.has(idx));

  // 3. Detect multi-column prose layout among remaining lines
  const columnStreams = splitMultiColumnRegion(remainingLines, pageMinX, pageMaxX);
  const compactPage = borderedTables.length >= 2 || bodyFontSize <= 10.2;

  const textBlocks: DocBlock[] = [];
  for (const stream of columnStreams) {
    if (stream.length === 0) continue;
    const rLeft = Math.min(...stream.map((l) => l.x));
    const rRight = Math.max(...stream.map((l) => l.endX));
    textBlocks.push(...convertLinesToBlocks(stream, bodyFontSize, rLeft, rRight, compactPage));
  }

  const imageBlocks: DocBlock[] = remainingImages.map((img) => ({
    type: 'image',
    pngBytes: img.pngBytes,
    widthPt: img.widthPt,
    heightPt: img.heightPt,
    align: detectAlignment(img.x, img.x + img.widthPt, pageMinX, pageMaxX),
    yTop: img.yTop,
  }));

  const hasMultiColumns = columnStreams.length > 1;
  const finalBlocks: DocBlock[] = hasMultiColumns
    ? [...textBlocks, ...borderedTables.map((t) => t.block), ...imageBlocks]
    : [...textBlocks, ...borderedTables.map((t) => t.block), ...imageBlocks].sort(
        (a, b) => (a.yTop ?? 0) - (b.yTop ?? 0)
      );

  // Compute adaptive margins matching PDF layout bounds (clamped safely for dense forms)
  const contentMinX = Math.min(
    pageMinX,
    ...rulings.filter((r) => r.x1 > 10).map((r) => r.x1)
  );
  const contentMaxX = Math.max(
    pageMaxX,
    ...rulings.filter((r) => r.x2 < pageWidthPt - 10).map((r) => r.x2)
  );
  const contentMinY = Math.min(
    pageMinY,
    ...rulings.filter((r) => r.y1 > 10).map((r) => r.y1)
  );
  const contentMaxY = Math.max(
    pageMaxY,
    ...rulings.filter((r) => r.y2 < pageHeightPt - 10).map((r) => r.y2)
  );

  const clampMargin = (v: number) => Math.max(22, Math.min(50, Math.round(v)));
  const marginsPt: PageMarginsPt = {
    left: clampMargin(contentMinX - 2),
    right: clampMargin(pageWidthPt - contentMaxX - 2),
    top: clampMargin(contentMinY - 2),
    bottom: clampMargin(pageHeightPt - contentMaxY - 2),
  };

  const totalWords = visualLines.reduce((acc, l) => acc + countWords(l.text), 0);

  return {
    pageNumber,
    modeUsed: 'digital',
    widthPt: pageWidthPt,
    heightPt: pageHeightPt,
    marginsPt,
    blocks: finalBlocks,
    wordCount: totalWords,
    extractedCharCount: charCount,
  };
}
