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
  introRow: number;
  introColumn: number;
  headerRow: number;
  headerBackgroundColor: string;
  headerTextColor: string;
  titleColor: string;
  introColor: string;
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
  introRow: 2,
  introColumn: 3,
  headerRow: 4,
  headerBackgroundColor: '#1d4ed8',
  headerTextColor: '#ffffff',
  titleColor: '#0f172a',
  introColor: '#475569',
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
  introRow: normalizeInteger(input?.introRow, DEFAULT_EXPORT_TEMPLATE.introRow, 1, 24),
  introColumn: normalizeInteger(input?.introColumn, DEFAULT_EXPORT_TEMPLATE.introColumn, 1, 12),
  headerRow: normalizeInteger(input?.headerRow, DEFAULT_EXPORT_TEMPLATE.headerRow, 2, 30),
  headerBackgroundColor: normalizeColor(input?.headerBackgroundColor, DEFAULT_EXPORT_TEMPLATE.headerBackgroundColor),
  headerTextColor: normalizeColor(input?.headerTextColor, DEFAULT_EXPORT_TEMPLATE.headerTextColor),
  titleColor: normalizeColor(input?.titleColor, DEFAULT_EXPORT_TEMPLATE.titleColor),
  introColor: normalizeColor(input?.introColor, DEFAULT_EXPORT_TEMPLATE.introColor),
});
