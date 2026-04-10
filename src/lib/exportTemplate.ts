export type ExportHorizontalAlign = 'left' | 'center' | 'right';
export type ExportVerticalAlign = 'top' | 'middle' | 'bottom';

export interface ExportTemplateConfig {
  sheetName: string;
  title: string;
  introText: string;
  showLogo: boolean;
  logoDataUrl: string;
  logoRow: number;
  logoColumn: number;
  logoWidth: number;
  logoHeight: number;
  titleRow: number;
  titleColumn: number;
  titleRowSpan: number;
  titleColumnSpan: number;
  titleHorizontalAlign: ExportHorizontalAlign;
  titleVerticalAlign: ExportVerticalAlign;
  introRow: number;
  introColumn: number;
  introRowSpan: number;
  introColumnSpan: number;
  introHorizontalAlign: ExportHorizontalAlign;
  introVerticalAlign: ExportVerticalAlign;
  headerRow: number;
  headerColumn: number;
  headerHorizontalAlign: ExportHorizontalAlign;
  headerVerticalAlign: ExportVerticalAlign;
  headerBackgroundColor: string;
  headerTextColor: string;
  titleColor: string;
  introColor: string;
  columnWidths: number[];
  rowHeights: number[];
}

export const DEFAULT_EXPORT_TEMPLATE: ExportTemplateConfig = {
  sheetName: 'Opportunities',
  title: 'Opportunity Export',
  introText: 'Generated from the Avenir dashboard export.',
  showLogo: true,
  logoDataUrl: '',
  logoRow: 1,
  logoColumn: 1,
  logoWidth: 150,
  logoHeight: 46,
  titleRow: 1,
  titleColumn: 3,
  titleRowSpan: 1,
  titleColumnSpan: 4,
  titleHorizontalAlign: 'left',
  titleVerticalAlign: 'middle',
  introRow: 2,
  introColumn: 3,
  introRowSpan: 2,
  introColumnSpan: 5,
  introHorizontalAlign: 'left',
  introVerticalAlign: 'top',
  headerRow: 4,
  headerColumn: 1,
  headerHorizontalAlign: 'left',
  headerVerticalAlign: 'middle',
  headerBackgroundColor: '#1d4ed8',
  headerTextColor: '#ffffff',
  titleColor: '#0f172a',
  introColor: '#475569',
  columnWidths: Array.from({ length: 12 }, () => 18),
  rowHeights: Array.from({ length: 20 }, () => 24),
};

export const EXPORT_TEMPLATE_COLOR_FIELDS: Array<keyof Pick<
  ExportTemplateConfig,
  'headerBackgroundColor' | 'headerTextColor' | 'titleColor' | 'introColor'
>> = [
  'headerBackgroundColor',
  'headerTextColor',
  'titleColor',
  'introColor',
];

const normalizeColor = (value: unknown, fallback: string) => {
  const color = String(value || '').trim();
  return /^#([0-9a-f]{6})$/i.test(color) ? color.toUpperCase() : fallback;
};

const normalizeInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizeHorizontalAlign = (value: unknown, fallback: ExportHorizontalAlign): ExportHorizontalAlign => (
  value === 'center' || value === 'right' || value === 'left' ? value : fallback
);

const normalizeVerticalAlign = (value: unknown, fallback: ExportVerticalAlign): ExportVerticalAlign => (
  value === 'top' || value === 'middle' || value === 'bottom' ? value : fallback
);

const normalizeSizedArray = (value: unknown, fallback: number[], min: number, max: number) => {
  const source = Array.isArray(value) ? value : [];
  return fallback.map((item, index) => normalizeInteger(source[index], item, min, max));
};

export const normalizeExportTemplate = (input?: Partial<ExportTemplateConfig> | null): ExportTemplateConfig => ({
  sheetName: String(input?.sheetName || DEFAULT_EXPORT_TEMPLATE.sheetName).trim() || DEFAULT_EXPORT_TEMPLATE.sheetName,
  title: String(input?.title || DEFAULT_EXPORT_TEMPLATE.title).trim() || DEFAULT_EXPORT_TEMPLATE.title,
  introText: String(input?.introText || DEFAULT_EXPORT_TEMPLATE.introText).trim(),
  showLogo: input?.showLogo ?? DEFAULT_EXPORT_TEMPLATE.showLogo,
  logoDataUrl: String(input?.logoDataUrl || '').trim(),
  logoRow: normalizeInteger(input?.logoRow, DEFAULT_EXPORT_TEMPLATE.logoRow, 1, 20),
  logoColumn: normalizeInteger(input?.logoColumn, DEFAULT_EXPORT_TEMPLATE.logoColumn, 1, 12),
  logoWidth: normalizeInteger(input?.logoWidth, DEFAULT_EXPORT_TEMPLATE.logoWidth, 40, 360),
  logoHeight: normalizeInteger(input?.logoHeight, DEFAULT_EXPORT_TEMPLATE.logoHeight, 20, 180),
  titleRow: normalizeInteger(input?.titleRow, DEFAULT_EXPORT_TEMPLATE.titleRow, 1, 20),
  titleColumn: normalizeInteger(input?.titleColumn, DEFAULT_EXPORT_TEMPLATE.titleColumn, 1, 12),
  titleRowSpan: normalizeInteger(input?.titleRowSpan, DEFAULT_EXPORT_TEMPLATE.titleRowSpan, 1, 6),
  titleColumnSpan: normalizeInteger(input?.titleColumnSpan, DEFAULT_EXPORT_TEMPLATE.titleColumnSpan, 1, 12),
  titleHorizontalAlign: normalizeHorizontalAlign(input?.titleHorizontalAlign, DEFAULT_EXPORT_TEMPLATE.titleHorizontalAlign),
  titleVerticalAlign: normalizeVerticalAlign(input?.titleVerticalAlign, DEFAULT_EXPORT_TEMPLATE.titleVerticalAlign),
  introRow: normalizeInteger(input?.introRow, DEFAULT_EXPORT_TEMPLATE.introRow, 1, 24),
  introColumn: normalizeInteger(input?.introColumn, DEFAULT_EXPORT_TEMPLATE.introColumn, 1, 12),
  introRowSpan: normalizeInteger(input?.introRowSpan, DEFAULT_EXPORT_TEMPLATE.introRowSpan, 1, 8),
  introColumnSpan: normalizeInteger(input?.introColumnSpan, DEFAULT_EXPORT_TEMPLATE.introColumnSpan, 1, 12),
  introHorizontalAlign: normalizeHorizontalAlign(input?.introHorizontalAlign, DEFAULT_EXPORT_TEMPLATE.introHorizontalAlign),
  introVerticalAlign: normalizeVerticalAlign(input?.introVerticalAlign, DEFAULT_EXPORT_TEMPLATE.introVerticalAlign),
  headerRow: normalizeInteger(input?.headerRow, DEFAULT_EXPORT_TEMPLATE.headerRow, 2, 30),
  headerColumn: normalizeInteger(input?.headerColumn, DEFAULT_EXPORT_TEMPLATE.headerColumn, 1, 12),
  headerHorizontalAlign: normalizeHorizontalAlign(input?.headerHorizontalAlign, DEFAULT_EXPORT_TEMPLATE.headerHorizontalAlign),
  headerVerticalAlign: normalizeVerticalAlign(input?.headerVerticalAlign, DEFAULT_EXPORT_TEMPLATE.headerVerticalAlign),
  headerBackgroundColor: normalizeColor(input?.headerBackgroundColor, DEFAULT_EXPORT_TEMPLATE.headerBackgroundColor),
  headerTextColor: normalizeColor(input?.headerTextColor, DEFAULT_EXPORT_TEMPLATE.headerTextColor),
  titleColor: normalizeColor(input?.titleColor, DEFAULT_EXPORT_TEMPLATE.titleColor),
  introColor: normalizeColor(input?.introColor, DEFAULT_EXPORT_TEMPLATE.introColor),
  columnWidths: normalizeSizedArray(input?.columnWidths, DEFAULT_EXPORT_TEMPLATE.columnWidths, 8, 48),
  rowHeights: normalizeSizedArray(input?.rowHeights, DEFAULT_EXPORT_TEMPLATE.rowHeights, 16, 80),
});
