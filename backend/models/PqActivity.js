import mongoose from 'mongoose';

export const PQ_TENANTS = [
  'avenir_abudhabi',
  'avenir_india',
  'bcts_dubai',
  'bcts_abudhabi',
  'avenir_energy',
] ;

const pqActivitySchema = new mongoose.Schema(
  {
    tenant: { type: String, default: 'avenir_abudhabi', index: true },
    sNo: { type: Number, default: 0 },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: ['Prequalified', 'Registered', 'Registration on Process'], default: 'Registration on Process' },
    registeredEmail: { type: String, default: '', trim: true, maxlength: 200 },
    userId: { type: String, default: '-', trim: true, maxlength: 200 },
    password: { type: String, default: '', trim: false, maxlength: 500 },
    link: { type: String, default: '-', trim: true, maxlength: 800 },
    contactPerson: { type: String, default: '', trim: true, maxlength: 120 },
    renewalDate: { type: Date, default: null },
    lastUpdateDate: { type: Date, default: null },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: 'pq_activities' },
);

pqActivitySchema.index({ tenant: 1, company: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
pqActivitySchema.index({ tenant: 1, lastUpdateDate: -1, updatedAt: -1, company: 1 });
pqActivitySchema.index({ tenant: 1, company: 'text', registeredEmail: 'text' });

export default mongoose.model('PqActivity', pqActivitySchema);
