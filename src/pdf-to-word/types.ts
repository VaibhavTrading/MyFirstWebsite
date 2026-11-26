export type ConversionMode = 'auto' | 'digital' | 'ocr';
export type OcrLanguage = 'eng' | 'hin' | 'eng+hin';
export type PageClassification = 'digital' | 'scanned' | 'empty';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface StyledRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSizePt?: number;
  colorHex?: string;
}

export interface TableCellImage {
  pngBytes: Uint8Array;
  widthPt: number;
  heightPt: number;
  align?: TextAlign;
}

export interface TableCellData {
  paragraphs: {
    align: TextAlign;
    runs: StyledRun[];
  }[];
  images?: TableCellImage[];
  isHeader?: boolean;
  colSpan?: number;
  rowSpan?: number;
  vAlign?: 'top' | 'center' | 'bottom';
  shadingHex?: string;
}

export interface TableRowData {
  cells: TableCellData[];
  isHeader?: boolean;
  heightPt?: number;
}

export type DocBlock =
  | {
      type: 'heading';
      level: 1 | 2 | 3;
      align: TextAlign;
      runs: StyledRun[];
      yTop?: number;
    }
  | {
      type: 'paragraph';
      align: TextAlign;
      runs: StyledRun[];
      spaceBeforePt?: number;
      spaceAfterPt?: number;
      indentPt?: number;
      bulletLevel?: number;
      compact?: boolean;
      yTop?: number;
    }
  | {
      type: 'table';
      colWidthsPt: number[];
      rows: TableRowData[];
      hasBorders?: boolean;
      compact?: boolean;
      yTop?: number;
    }
  | {
      type: 'image';
      pngBytes: Uint8Array;
      widthPt: number;
      heightPt: number;
      align: TextAlign;
      yTop?: number;
    };

export interface PageMarginsPt {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PageConversionResult {
  pageNumber: number;
  modeUsed: 'digital' | 'ocr' | 'empty';
  widthPt: number;
  heightPt: number;
  marginsPt?: PageMarginsPt;
  blocks: DocBlock[];
  wordCount: number;
  extractedCharCount: number;
  ocrConfidence?: number;
  lowConfidenceWarning?: boolean;
}

export type ProgressPhase =
  | 'validating'
  | 'analyzing'
  | 'downloading-model'
  | 'extracting'
  | 'ocr'
  | 'packaging'
  | 'done'
  | 'cancelled';

export interface ConversionProgress {
  phase: ProgressPhase;
  currentPage: number;
  totalPages: number;
  overallPercent: number;
  modelPercent?: number;
  message: string;
  pageMode?: 'digital' | 'ocr' | 'empty';
}

export interface ConversionSummary {
  blob: Blob;
  fileName: string;
  totalPages: number;
  digitalPages: number;
  ocrPages: number;
  emptyPages: number;
  totalWords: number;
  averageOcrConfidence: number | null;
  hasLowConfidenceWarning: boolean;
  elapsedMs: number;
}

export interface ConvertPdfOptions {
  mode: ConversionMode;
  ocrLanguage: OcrLanguage;
  password?: string;
  onPasswordPrompt?: (reason: 'need' | 'incorrect') => Promise<string | null>;
  onProgress?: (progress: ConversionProgress) => void;
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  constructor(message = 'Conversion cancelled by user.') {
    super(message);
    this.name = 'CancelledError';
  }
}

export class PasswordRequiredError extends Error {
  reason: 'need' | 'incorrect';
  constructor(reason: 'need' | 'incorrect' = 'need', message?: string) {
    super(
      message ||
        (reason === 'incorrect'
          ? 'Incorrect password for this protected PDF.'
          : 'This PDF is password-protected. Please enter the password to unlock and convert it.')
    );
    this.name = 'PasswordRequiredError';
    this.reason = reason;
  }
}

export class InvalidPdfError extends Error {
  constructor(message = 'The selected file is not a valid or readable PDF document.') {
    super(message);
    this.name = 'InvalidPdfError';
  }
}
