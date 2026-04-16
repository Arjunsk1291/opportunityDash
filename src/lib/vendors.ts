import ExcelJS from 'exceljs';
import { downloadWorkbook, getFirstWorksheet, loadWorkbookFromArrayBuffer, worksheetToObjects } from '@/lib/excelWorkbook';

export type AgreementStatus = 'NDA' | 'Association Agreement' | 'Pending';

export type VendorData = {
  id: string;
  companyName: string;
  primaryIndustries: string[];
  confirmedServices: string[];
  confirmedTechStack: string[];
  nonSpecializedTechStack: string[];
  sampleProjects: string[];
  certifications: string[];
  partners: string[];
  companySize: string;
  sources: string[];
  focusArea: string;
  ndaStatus: string;
  associationAgreementStatus: string;
  agreementStatus: AgreementStatus;
  agreementDocuments: string[];
  contactPerson: string;
  emails: string[];
};

export type VendorImportPreview = {
  newVendors: VendorData[];
  skippedDuplicates: string[];
};

export const VENDOR_IMPORT_HEADERS = [
  'Company Name',
  'Focus Area',
  'NDA Status',
  'Association Agreement Status',
  'Company Size',
  'Contact Person',
  'Emails',
  'Primary Industries',
  'Confirmed Services',
  'Confirmed Tech Stack',
  'Non-Specialized Tech',
  'Sample Projects',
  'Certifications',
  'Partners',
  'Sources',
] as const;
const MAX_VENDOR_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_VENDOR_IMPORT_ROWS = 5000;

const splitCommaSeparated = (value: unknown): string[] =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();

export const normalizeCompanyName = (value: string): string =>
  toTitleCase(String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());

const normalizeAgreementStatus = (value: unknown): AgreementStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'nda') return 'NDA';
  if (normalized === 'association agreement' || normalized === 'association') return 'Association Agreement';
  return 'Pending';
};

const inferAgreementStatus = (ndaStatus: string, associationAgreementStatus: string): AgreementStatus => {
  const nda = String(ndaStatus || '').toLowerCase();
  const association = String(associationAgreementStatus || '').toLowerCase();
  const positive = ['yes', 'y', 'signed', 'active', 'done', 'completed'];
  if (positive.some((token) => nda.includes(token))) return 'NDA';
  if (positive.some((token) => association.includes(token))) return 'Association Agreement';
  return 'Pending';
};

const sanitizeVendor = (vendor: VendorData): VendorData => ({
  ...vendor,
  companyName: normalizeCompanyName(vendor.companyName),
  primaryIndustries: vendor.primaryIndustries.map((item) => item.trim()).filter(Boolean),
  confirmedServices: vendor.confirmedServices.map((item) => item.trim()).filter(Boolean),
  confirmedTechStack: vendor.confirmedTechStack.map((item) => item.trim()).filter(Boolean),
  nonSpecializedTechStack: vendor.nonSpecializedTechStack.map((item) => item.trim()).filter(Boolean),
  sampleProjects: vendor.sampleProjects.map((item) => item.trim()).filter(Boolean),
  certifications: vendor.certifications.map((item) => item.trim()).filter(Boolean),
  partners: vendor.partners.map((item) => item.trim()).filter(Boolean),
  sources: vendor.sources.map((item) => item.trim()).filter(Boolean),
  agreementDocuments: vendor.agreementDocuments.map((item) => item.trim()).filter(Boolean),
  emails: vendor.emails.map((item) => item.trim()).filter(Boolean),
  focusArea: String(vendor.focusArea || '').trim(),
  ndaStatus: String(vendor.ndaStatus || '').trim(),
  associationAgreementStatus: String(vendor.associationAgreementStatus || '').trim(),
  companySize: String(vendor.companySize || '').trim(),
  contactPerson: String(vendor.contactPerson || '').trim(),
  agreementStatus: normalizeAgreementStatus(vendor.agreementStatus),
});

export const getVendorFieldValues = (vendor: VendorData): string[] => [
  vendor.companyName,
  vendor.focusArea,
  vendor.ndaStatus,
  vendor.associationAgreementStatus,
  vendor.agreementStatus,
  vendor.companySize,
  vendor.contactPerson,
  ...vendor.primaryIndustries,
  ...vendor.confirmedServices,
  ...vendor.confirmedTechStack,
  ...vendor.nonSpecializedTechStack,
  ...vendor.sampleProjects,
  ...vendor.certifications,
  ...vendor.partners,
  ...vendor.sources,
  ...vendor.emails,
  ...vendor.agreementDocuments,
].map((value) => String(value || ''));

export const getVendorSearchBlob = (vendor: VendorData): string => getVendorFieldValues(vendor).join(' ').toLowerCase();

export const scoreVendorAgainstTerms = (vendor: VendorData, terms: string[]) => {
  const fields = getVendorFieldValues(vendor).map((value) => value.toLowerCase());
  let relevance = 0;
  let matchCount = 0;
  const normalizedTerms = terms.map((term) => term.toLowerCase()).filter(Boolean);

  normalizedTerms.forEach((term) => {
    const matchingFields = fields.filter((field) => field.includes(term));
    relevance += matchingFields.length;
    if (matchingFields.length > 0) {
      matchCount += 1;
    }
  });

  return {
    relevance,
    matchCount,
    matches: normalizedTerms.every((term) => fields.some((field) => field.includes(term))),
  };
};

const parseVendorRow = (row: Record<string, unknown>): Omit<VendorData, 'id'> | null => {
  const companyName = normalizeCompanyName(String(row['Company Name'] || ''));
  if (!companyName) return null;
  const ndaStatus = String(row['NDA Status'] || '').trim();
  const associationAgreementStatus = String(row['Association Agreement Status'] || '').trim();
  const explicitAgreementStatus = String(row['Agreement Status'] || '').trim();

  return {
    companyName,
    focusArea: String(row['Focus Area'] || '').trim(),
    ndaStatus,
    associationAgreementStatus,
    agreementStatus: explicitAgreementStatus
      ? normalizeAgreementStatus(explicitAgreementStatus)
      : inferAgreementStatus(ndaStatus, associationAgreementStatus),
    agreementDocuments: splitCommaSeparated(row['Agreement Documents']),
    companySize: String(row['Company Size'] || '').trim(),
    contactPerson: String(row['Contact Person'] || '').trim(),
    emails: splitCommaSeparated(row['Emails']),
    primaryIndustries: splitCommaSeparated(row['Primary Industries']),
    confirmedServices: splitCommaSeparated(row['Confirmed Services']),
    confirmedTechStack: splitCommaSeparated(row['Confirmed Tech Stack']),
    nonSpecializedTechStack: splitCommaSeparated(row['Non-Specialized Tech']),
    sampleProjects: splitCommaSeparated(row['Sample Projects']),
    certifications: splitCommaSeparated(row['Certifications']),
    partners: splitCommaSeparated(row['Partners']),
    sources: splitCommaSeparated(row['Sources']),
  };
};

export const previewVendorImport = async (file: File, existingVendors: VendorData[]): Promise<VendorImportPreview> => {
  if (file.size > MAX_VENDOR_IMPORT_BYTES) {
    throw new Error('File too large. Maximum allowed size is 5MB.');
  }
  const name = String(file.name || '').toLowerCase();
  if (!name.endsWith('.xlsx')) {
    throw new Error('Only .xlsx files are supported.');
  }
  const buffer = await file.arrayBuffer();
  const workbook = await loadWorkbookFromArrayBuffer(buffer);
  const sheet = getFirstWorksheet(workbook);
  if (!sheet) throw new Error('No worksheet found in file.');
  const rows = worksheetToObjects(sheet, { headerRow: 1, maxRows: MAX_VENDOR_IMPORT_ROWS });
  if (rows.length > MAX_VENDOR_IMPORT_ROWS) {
    throw new Error(`Too many rows (${rows.length}). Limit is ${MAX_VENDOR_IMPORT_ROWS}.`);
  }

  const seen = new Set(existingVendors.map((vendor) => normalizeCompanyName(vendor.companyName).toLowerCase()));
  const newVendors: VendorData[] = [];
  const skippedDuplicates: string[] = [];

  rows.forEach((row) => {
    const parsed = parseVendorRow(row);
    if (!parsed) return;
    const normalizedName = normalizeCompanyName(parsed.companyName).toLowerCase();
    if (seen.has(normalizedName)) {
      skippedDuplicates.push(parsed.companyName);
      return;
    }
    seen.add(normalizedName);
    newVendors.push(sanitizeVendor({
      ...parsed,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `vendor-${Date.now()}-${newVendors.length}`,
    }));
  });

  return { newVendors, skippedDuplicates };
};

export const downloadVendorTemplate = () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendor Import Template');
  sheet.addRow([...VENDOR_IMPORT_HEADERS]);
  void downloadWorkbook(workbook, 'vendor-directory-template.xlsx');
};

export const exportVendors = (vendors: VendorData[]) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Vendors');
  sheet.addRow([
    'Company Name',
    'Focus Area',
    'NDA Status',
    'Association Agreement Status',
    'Company Size',
    'Contact Person',
    'Emails',
    'Primary Industries',
    'Confirmed Services',
    'Confirmed Tech Stack',
    'Non-Specialized Tech',
    'Sample Projects',
    'Certifications',
    'Partners',
    'Sources',
  ]);
  const rows = vendors.map((vendor) => ({
    'Company Name': vendor.companyName,
    'Focus Area': vendor.focusArea,
    'NDA Status': vendor.ndaStatus,
    'Association Agreement Status': vendor.associationAgreementStatus,
    'Company Size': vendor.companySize,
    'Contact Person': vendor.contactPerson,
    'Emails': vendor.emails.join(', '),
    'Primary Industries': vendor.primaryIndustries.join(', '),
    'Confirmed Services': vendor.confirmedServices.join(', '),
    'Confirmed Tech Stack': vendor.confirmedTechStack.join(', '),
    'Non-Specialized Tech': vendor.nonSpecializedTechStack.join(', '),
    'Sample Projects': vendor.sampleProjects.join(', '),
    Certifications: vendor.certifications.join(', '),
    Partners: vendor.partners.join(', '),
    Sources: vendor.sources.join(', '),
  }));
  rows.forEach((row) => {
    sheet.addRow([
      row['Company Name'],
      row['Focus Area'],
      row['NDA Status'],
      row['Association Agreement Status'],
      row['Company Size'],
      row['Contact Person'],
      row['Emails'],
      row['Primary Industries'],
      row['Confirmed Services'],
      row['Confirmed Tech Stack'],
      row['Non-Specialized Tech'],
      row['Sample Projects'],
      row.Certifications,
      row.Partners,
      row.Sources,
    ]);
  });
  void downloadWorkbook(workbook, `vendor-directory-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const parseCommaInput = (value: string) => splitCommaSeparated(value);
