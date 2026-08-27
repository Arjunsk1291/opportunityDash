import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';
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
  },
  { timestamps: true }
);

applyBrandPlugin(clientSchema, { includeUniqueIndex: false });

export default brandModel('Client', clientSchema, brandCollection('clients'));
