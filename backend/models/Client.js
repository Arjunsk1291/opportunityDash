import mongoose from 'mongoose';
import { brandCollection, brandModel, getActiveBrandKey } from '../brandContext.js';
import { applyBrandPlugin } from '../brandContext.js';

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: true }
);

const clientSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    companyKey: { type: String, required: true, unique: true, index: true },
    group: { type: String, default: '' },
    domain: { type: String, default: '' },
    location: {
      city: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    contacts: { type: [contactSchema], default: [] },
    entityKey: { type: String, enum: ['avenir_intl', 'avenir_oilfield'], default: () => getActiveBrandKey(), index: true },
  },
  { timestamps: true }
);

applyBrandPlugin(clientSchema, { includeUniqueIndex: false });

export default brandModel('Client', clientSchema, brandCollection('clients'));
