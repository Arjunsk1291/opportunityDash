export interface ExportTemplateConfig {
  sheetName: string;
  title: string;
  introText: string;
  showLogo: boolean;
  logoDataUrl: string;
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

export const normalizeExportTemplate = (input?: Partial<ExportTemplateConfig> | null): ExportTemplateConfig => ({
  sheetName: String(input?.sheetName || DEFAULT_EXPORT_TEMPLATE.sheetName).trim() || DEFAULT_EXPORT_TEMPLATE.sheetName,
  title: String(input?.title || DEFAULT_EXPORT_TEMPLATE.title).trim() || DEFAULT_EXPORT_TEMPLATE.title,
  introText: String(input?.introText || DEFAULT_EXPORT_TEMPLATE.introText).trim(),
  showLogo: input?.showLogo ?? DEFAULT_EXPORT_TEMPLATE.showLogo,
  logoDataUrl: String(input?.logoDataUrl || '').trim(),
  headerBackgroundColor: normalizeColor(input?.headerBackgroundColor, DEFAULT_EXPORT_TEMPLATE.headerBackgroundColor),
  headerTextColor: normalizeColor(input?.headerTextColor, DEFAULT_EXPORT_TEMPLATE.headerTextColor),
  titleColor: normalizeColor(input?.titleColor, DEFAULT_EXPORT_TEMPLATE.titleColor),
  introColor: normalizeColor(input?.introColor, DEFAULT_EXPORT_TEMPLATE.introColor),
});
