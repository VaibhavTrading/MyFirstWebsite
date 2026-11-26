import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
  type FileChild,
  type ISectionOptions,
} from 'docx';
import type { DocBlock, PageConversionResult, StyledRun, TextAlign } from './types';

function mapAlignment(align: TextAlign) {
  switch (align) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
}

function mapVerticalAlign(vAlign?: 'top' | 'center' | 'bottom') {
  switch (vAlign) {
    case 'center':
      return VerticalAlignTable.CENTER;
    case 'bottom':
      return VerticalAlignTable.BOTTOM;
    default:
      return VerticalAlignTable.TOP;
  }
}

function buildTextRuns(runs: StyledRun[], forceBold?: boolean, defaultSizePt = 11): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) {
        out.push(new TextRun({ break: 1 }));
      }
      if (part.length > 0 || parts.length === 1) {
        const sizePt = Math.max(6.5, Math.min(48, r.fontSizePt || defaultSizePt));
        out.push(
          new TextRun({
            text: part,
            bold: forceBold ?? Boolean(r.bold),
            italics: Boolean(r.italic),
            underline: r.underline ? { type: UnderlineType.SINGLE } : undefined,
            size: Math.round(sizePt * 2), // Word half-points
            color: r.colorHex,
            font: 'Calibri',
          })
        );
      }
    });
  }
  if (out.length === 0) {
    out.push(new TextRun({ text: '' }));
  }
  return out;
}

function ptToTwips(pt: number): number {
  return Math.max(120, Math.round(pt * 20));
}

function ptToPx(pt: number): number {
  // Standard Word 96 DPI display transformation: 1 pt = 96 / 72 px
  return Math.max(8, Math.round((pt * 96) / 72));
}

function buildTableBlock(
  block: Extract<DocBlock, { type: 'table' }>,
  printableWidthPt: number,
  printableHeightPt: number
): Table {
  const totalRawWidthPt = block.colWidthsPt.reduce((a, b) => a + b, 0) || printableWidthPt;
  // Scale near-full-width tables cleanly to printableWidthPt; keep narrow sub-tables (e.g. DOB box) faithful to PDF width
  const targetWidthPt =
    totalRawWidthPt >= printableWidthPt * 0.72
      ? printableWidthPt
      : Math.min(printableWidthPt, Math.max(120, totalRawWidthPt));
  const scaleFactor = targetWidthPt / totalRawWidthPt;

  const colWidthsTwips = block.colWidthsPt.map((w) =>
    Math.max(180, Math.round(w * scaleFactor * 20))
  );
  const targetTotalTwips = Math.round(targetWidthPt * 20);
  const rawSumTwips = colWidthsTwips.reduce((a, b) => a + b, 0);
  if (colWidthsTwips.length > 0 && rawSumTwips > 0 && Math.abs(rawSumTwips - targetTotalTwips) > 4) {
    // Re-normalize proportionally while keeping 180 twips floor
    const ratio = targetTotalTwips / rawSumTwips;
    for (let i = 0; i < colWidthsTwips.length; i++) {
      colWidthsTwips[i] = Math.max(180, Math.round(colWidthsTwips[i] * ratio));
    }
  }
  const totalTableTwips = colWidthsTwips.reduce((a, b) => a + b, 0);
  const numGridCols = colWidthsTwips.length;

  // Track occupied slots when rowSpan > 1 so we pass exact grid-aligned cells to docx
  const occupied: boolean[][] = Array.from({ length: block.rows.length }, () =>
    new Array(numGridCols).fill(false)
  );

  const compact = Boolean(block.compact);
  const cellMarginV = compact ? 42 : 70;
  const cellMarginH = compact ? 70 : 100;

  const tableRows = block.rows.map((rowData, rowIdx) => {
    let colPtr = 0;
    const cells: TableCell[] = [];

    for (const cellData of rowData.cells) {
      while (colPtr < numGridCols && occupied[rowIdx][colPtr]) {
        colPtr++;
      }
      if (colPtr >= numGridCols) break;

      const cSpan = Math.max(1, Math.min(cellData.colSpan || 1, numGridCols - colPtr));
      const rSpan = Math.max(1, Math.min(cellData.rowSpan || 1, block.rows.length - rowIdx));

      for (let dr = 0; dr < rSpan; dr++) {
        for (let dc = 0; dc < cSpan; dc++) {
          if (rowIdx + dr < block.rows.length && colPtr + dc < numGridCols) {
            occupied[rowIdx + dr][colPtr + dc] = true;
          }
        }
      }

      let cellTwips = 0;
      for (let dc = 0; dc < cSpan; dc++) {
        cellTwips += colWidthsTwips[colPtr + dc] || 360;
      }
      const cellMaxWidthPt = Math.max(14, cellTwips / 20 - (cellMarginH * 2) / 20 - 4);

      const cellChildren: Paragraph[] = [];

      // Add cell text paragraphs
      const hasNonEmptyText = cellData.paragraphs.some((p) =>
        p.runs.some((r) => r.text.trim().length > 0)
      );
      if (hasNonEmptyText || !cellData.images || cellData.images.length === 0) {
        for (const p of cellData.paragraphs) {
          cellChildren.push(
            new Paragraph({
              alignment: mapAlignment(p.align),
              spacing: {
                before: compact ? 10 : 20,
                after: compact ? 10 : 20,
                line: compact ? 230 : 250,
              },
              children: buildTextRuns(p.runs, cellData.isHeader ? true : undefined, compact ? 9.5 : 10.5),
            })
          );
        }
      }

      // Add cell-embedded images (e.g., QR code, Old Photo, Current Photo)
      if (cellData.images && cellData.images.length > 0) {
        for (const img of cellData.images) {
          let wPt = img.widthPt;
          let hPt = img.heightPt;
          if (wPt > cellMaxWidthPt) {
            const ratio = cellMaxWidthPt / wPt;
            wPt *= ratio;
            hPt *= ratio;
          }
          if (hPt > printableHeightPt * 0.45) {
            const ratio = (printableHeightPt * 0.45) / hPt;
            wPt *= ratio;
            hPt *= ratio;
          }
          cellChildren.push(
            new Paragraph({
              alignment: mapAlignment(img.align || 'center'),
              spacing: { before: 20, after: 20 },
              children: [
                new ImageRun({
                  data: img.pngBytes,
                  type: 'png',
                  transformation: {
                    width: ptToPx(wPt),
                    height: ptToPx(hPt),
                  },
                }),
              ],
            })
          );
        }
      }

      if (cellChildren.length === 0) {
        cellChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      }

      const shadingFill = cellData.shadingHex
        ? cellData.shadingHex
        : rowData.isHeader && !compact
        ? 'EEF2FF'
        : undefined;

      cells.push(
        new TableCell({
          width: {
            size: cellTwips,
            type: WidthType.DXA,
          },
          columnSpan: cSpan > 1 ? cSpan : undefined,
          rowSpan: rSpan > 1 ? rSpan : undefined,
          verticalAlign: mapVerticalAlign(cellData.vAlign),
          margins: {
            top: cellMarginV,
            bottom: cellMarginV,
            left: cellMarginH,
            right: cellMarginH,
          },
          shading: shadingFill
            ? { fill: shadingFill, type: ShadingType.CLEAR, color: 'auto' }
            : undefined,
          children: cellChildren,
        })
      );

      colPtr += cSpan;
    }

    if (cells.length === 0) {
      cells.push(
        new TableCell({
          width: { size: totalTableTwips, type: WidthType.DXA },
          columnSpan: numGridCols > 1 ? numGridCols : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
        })
      );
    }

    return new TableRow({
      tableHeader: Boolean(rowData.isHeader),
      cantSplit: true,
      height:
        rowData.heightPt && rowData.heightPt >= 12
          ? { value: Math.round(Math.min(240, rowData.heightPt) * 20), rule: HeightRule.ATLEAST }
          : undefined,
      children: cells,
    });
  });

  const hasBorders = block.hasBorders !== false;
  const borderSpec = hasBorders
    ? {
        style: BorderStyle.SINGLE,
        size: 4,
        color: '475569',
      }
    : {
        style: BorderStyle.NONE,
        size: 0,
        color: 'auto',
      };

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: totalTableTwips, type: WidthType.DXA },
    columnWidths: colWidthsTwips,
    borders: {
      top: borderSpec,
      bottom: borderSpec,
      left: borderSpec,
      right: borderSpec,
      insideHorizontal: borderSpec,
      insideVertical: borderSpec,
    },
    rows: tableRows,
  });
}

function blockToFileChild(block: DocBlock, printableWidthPt: number, printableHeightPt: number): FileChild {
  if (block.type === 'heading') {
    const level =
      block.level === 1
        ? HeadingLevel.HEADING_1
        : block.level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
    const defaultSize = block.level === 1 ? 16 : block.level === 2 ? 13 : 11;
    return new Paragraph({
      heading: level,
      alignment: mapAlignment(block.align),
      spacing: { before: 100, after: 60 },
      children: buildTextRuns(block.runs, true, defaultSize),
    });
  }

  if (block.type === 'paragraph') {
    const compact = Boolean(block.compact);
    return new Paragraph({
      alignment: mapAlignment(block.align),
      indent: block.indentPt ? { left: Math.round(block.indentPt * 20) } : undefined,
      spacing: {
        before: block.spaceBeforePt ? Math.round(block.spaceBeforePt * 20) : 0,
        after: block.spaceAfterPt !== undefined ? Math.round(block.spaceAfterPt * 20) : compact ? 50 : 90,
        line: compact ? 240 : 264,
      },
      children: buildTextRuns(block.runs, undefined, 11),
    });
  }

  if (block.type === 'image') {
    let wPt = block.widthPt;
    let hPt = block.heightPt;
    if (wPt > printableWidthPt) {
      const ratio = printableWidthPt / wPt;
      wPt *= ratio;
      hPt *= ratio;
    }
    if (hPt > printableHeightPt * 0.85) {
      const ratio = (printableHeightPt * 0.85) / hPt;
      wPt *= ratio;
      hPt *= ratio;
    }

    return new Paragraph({
      alignment: mapAlignment(block.align),
      spacing: { before: 60, after: 60 },
      children: [
        new ImageRun({
          data: block.pngBytes,
          type: 'png',
          transformation: {
            width: ptToPx(wPt),
            height: ptToPx(hPt),
          },
        }),
      ],
    });
  }

  return buildTableBlock(block, printableWidthPt, printableHeightPt);
}

export async function buildDocxBlob(pages: PageConversionResult[], sourceTitle = 'Converted PDF Document'): Promise<Blob> {
  const sections: ISectionOptions[] = [];

  let currentGroup: PageConversionResult[] = [];
  const groups: PageConversionResult[][] = [];

  for (const page of pages) {
    const prev = currentGroup[currentGroup.length - 1];
    const prevMargins = prev?.marginsPt;
    const curMargins = page.marginsPt;
    const marginsDiffer =
      prevMargins &&
      curMargins &&
      (Math.abs(prevMargins.left - curMargins.left) > 12 ||
        Math.abs(prevMargins.top - curMargins.top) > 12);

    if (
      prev &&
      (Math.abs(prev.widthPt - page.widthPt) > 15 ||
        Math.abs(prev.heightPt - page.heightPt) > 15 ||
        marginsDiffer)
    ) {
      groups.push(currentGroup);
      currentGroup = [page];
    } else {
      currentGroup.push(page);
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    const sample = group[0];
    const widthPt = Math.max(200, sample.widthPt || 595);
    const heightPt = Math.max(200, sample.heightPt || 842);
    const isLandscape = widthPt > heightPt;

    // Derive tightest safe margins across pages in the section group
    const mTop = Math.max(20, Math.min(54, ...group.map((p) => p.marginsPt?.top ?? 48)));
    const mBottom = Math.max(20, Math.min(54, ...group.map((p) => p.marginsPt?.bottom ?? 48)));
    const mLeft = Math.max(20, Math.min(54, ...group.map((p) => p.marginsPt?.left ?? 48)));
    const mRight = Math.max(20, Math.min(54, ...group.map((p) => p.marginsPt?.right ?? 48)));

    const printableWidthPt = Math.max(120, widthPt - (mLeft + mRight));
    const printableHeightPt = Math.max(120, heightPt - (mTop + mBottom));

    const children: FileChild[] = [];
    group.forEach((page, pageIdxInGroup) => {
      if (pageIdxInGroup > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new PageBreak()],
          })
        );
      }

      if (page.blocks.length === 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '' })],
          })
        );
      } else {
        page.blocks.forEach((blk, blkIdx) => {
          // OOXML rule: Word merges two immediately adjacent <w:tbl> elements unless a <w:p> sits between them.
          const prevBlk = blkIdx > 0 ? page.blocks[blkIdx - 1] : null;
          if (blk.type === 'table' && prevBlk && prevBlk.type === 'table') {
            children.push(
              new Paragraph({
                spacing: { before: 20, after: 40, line: 80 },
                children: [new TextRun({ text: '', size: 4 })],
              })
            );
          }
          children.push(blockToFileChild(blk, printableWidthPt, printableHeightPt));
        });
      }
    });

    sections.push({
      properties: {
        page: {
          size: {
            width: ptToTwips(widthPt),
            height: ptToTwips(heightPt),
            orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
          },
          margin: {
            top: Math.round(mTop * 20),
            bottom: Math.round(mBottom * 20),
            left: Math.round(mLeft * 20),
            right: Math.round(mRight * 20),
          },
        },
      },
      children,
    });
  }

  if (sections.length === 0) {
    sections.push({
      children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
    });
  }

  const doc = new Document({
    creator: 'SMART VLE TOOL',
    title: sourceTitle,
    description: 'Converted locally in-browser from PDF to editable Word (.docx)',
    sections,
  });

  return Packer.toBlob(doc);
}
