import mongoose from 'mongoose';
import { brandCollection, brandModel, getActiveBrandKey } from '../brandContext.js';

export const PQ_TENANTS = [
  'avenir_abudhabi',
  'avenir_india',
  'bcts_dubai',
  'bcts_abudhabi',
  'avenir_energy',
  'avenir_oilfield',
  'lauren',
];

const pqActivitySchema = new mongoose.Schema(
  {
    tenant: { type: String, default: 'avenir_abudhabi', index: true },
    sNo: { type: Number, default: 0 },
    referenceId: { type: String, default: '', trim: true, maxlength: 200 },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['Prequalified', 'Registered', 'Registration on Process'], default: 'Registration on Process' },
    workgroup: { type: String, default: '', trim: true, maxlength: 120 },
    registeredEmail: { type: String, default: '', trim: true, maxlength: 200 },
    userId: { type: String, default: '-', trim: true, maxlength: 200 },
    password: { type: String, default: '', trim: false, maxlength: 500 },
    link: { type: String, default: '-', trim: true, maxlength: 800 },
    imageLink: { type: String, default: '', trim: true, maxlength: 1200 },
    contactPerson: { type: String, default: '', trim: true, maxlength: 120 },
    renewalDate: { type: Date, default: null },
    lastUpdateDate: { type: Date, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    enquiries: { type: String, default: '', trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// We don't set a hardcoded collection here anymore.
// The factory function below will handle it.

const models = {};

export const getPqModel = (tenant) => {
  const normalized = String(tenant || 'avenir_abudhabi').toLowerCase();

  const collectionMap = {
    avenir_abudhabi: 'Avenir_abudhabi_PQ',
    avenir_india: 'Avenir_india_PQ',
    bcts_dubai: 'BCTS_DUBAI_PQ',
    bcts_abudhabi: 'BCTS_ABUDHABII_PQ',
    avenir_energy: 'AVENIR_ENERGY_PQ',
    avenir_oilfield: 'AVENIR_OILFIELD_PQ',
    lauren: 'LAUREN_PQ',
  };

  const collectionName = brandCollection(collectionMap[normalized] || 'pq_activities_others');
  const modelName = `PqActivity_${collectionName}`;

  if (models[modelName]) return models[modelName];

  const schema = pqActivitySchema.clone();
  schema.index({ tenant: 1, company: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  schema.index({ tenant: 1, lastUpdateDate: -1, updatedAt: -1, company: 1 });
  schema.index({ tenant: 1, company: 'text', registeredEmail: 'text' });

  models[modelName] = brandModel(modelName, schema, collectionName);
  return models[modelName];
};

export default brandModel('PqActivity', pqActivitySchema, brandCollection(`pq_activities__${getActiveBrandKey()}`));
