import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const roundTrip = async (headers, rows) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Template');
  ws.addRow(headers);
  rows.forEach(row => ws.addRow(row));
  const bytes = await wb.xlsx.writeBuffer();
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(bytes);
  const matrix = [];
  read.worksheets[0].eachRow({ includeEmpty: true }, row => matrix.push(row.values.slice(1)));
  assert.deepEqual(matrix[0].map(normalize), headers.map(normalize));
  assert.equal(matrix.length, rows.length + 1);
  return matrix;
};

const opportunityHeaders = ['Year','Tender No','Tender Name','Tender Type','Client','GDS/GES','Date Tender Recd','Tender Due Date','Tender Submitted Date','Tender Result','Tender Status','Assigned Person','Tender Value','Avenir Status','ADNOC RFT No','Remarks/Reason'];
const opp = await roundTrip(opportunityHeaders, [[2026,'TEMPLATE-SAMPLE-001','Template sample tender','RFP','Sample Client LLC','GDS','2026-09-01','2026-09-30','','','Open','Sample Owner',100000,'Open','','Delete this sample row before upload']]);
const candidates = { ref:['tender no','ref no','ref no.','opportunity ref','avenir ref','avenir ref no'], name:['tender name','tender'], client:['client','client name'], value:['tender value','value','opportunity value'] };
for (const [field, values] of Object.entries(candidates)) assert.notEqual(opp[0].map(normalize).findIndex(h => values.includes(h)), -1, `opportunity ${field}`);

const potentialHeaders = ['Opportunity Ref No','Tender Name','Client','Vertical','SOW Link','Overview'];
const potential = await roundTrip(potentialHeaders, [['TEMPLATE-SAMPLE-001','Template sample tender','Sample Client LLC','GDS','https://example.com/sow','Delete this sample row before import']]);
assert.notEqual(potential[0].map(normalize).findIndex(h => ['opportunity ref no','ref no'].includes(h)), -1);

const pqHeaders = ['S.No','Reference ID','Company','Status','Workgroup','Registered Email','User ID (Portal)','Password(Portal)','Link(Portal)','Image Link','Enquiries','Renewal Date','Last Update','Notes'];
const pq = await roundTrip(pqHeaders, [[1,'PQ-REF-001','Sample Company LLC','Registration on Process','Procurement','ops@example.com','username','password','https://portal.example.com','https://example.com/logo.png','TEMPLATE SAMPLE','2027-09-30','2026-09-21','TEMPLATE SAMPLE']]);
for (const required of ['Reference ID','Company','Status','Renewal Date','Last Update','Notes']) assert.ok(pq[0].includes(required));

const vendorHeaders = ['Company Name','Focus Area','NDA Status','Association Agreement Status','Company Size','Contact Person','Emails','Primary Industries','Confirmed Services','Confirmed Tech Stack','Non-Specialized Tech','Sample Projects','Certifications','Partners','Sources'];
const vendors = await roundTrip(vendorHeaders, [['TEMPLATE SAMPLE - Gulf Engineering LLC','Engineering','Signed','Pending','51-200','Aisha Rahman','aisha@example.com','Energy, Oil & Gas','Engineering Design','AutoCAD, Primavera','','Refinery upgrade','ISO 9001','','Referral']]);
assert.equal(vendors[1][0], 'TEMPLATE SAMPLE - Gulf Engineering LLC');

const clientHeaders = ['Company Name','City','Country','Domain','First Name','Last Name','Email','Phone'];
const csv = [clientHeaders, ['Acme Corp','Dubai','UAE','acme.com','Sara','Ali','sara@acme.com','+971 50 000 0000']].map(row => row.join(',')).join('\n');
const parsed = csv.split(/\r?\n/).map(line => line.split(','));
assert.deepEqual(parsed[0], clientHeaders);
assert.equal(parsed[1][0], 'Acme Corp');
console.log('template round-trip regression passed');
