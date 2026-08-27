import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';

const leadEmailMappingSchema = new mongoose.Schema(
  {
    leadNameKey: { type: String, required: true, index: true, unique: true },
    leadNameDisplay: { type: String, default: '' },
    leadEmail: { type: String, required: true },
    approvedBy: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default brandModel('LeadEmailMapping', leadEmailMappingSchema, brandCollection('lead_email_mappings'));
