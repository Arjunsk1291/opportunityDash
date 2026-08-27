import mongoose from 'mongoose';
import { brandCollection, brandModel } from '../brandContext.js';
import { applyBrandPlugin } from '../brandContext.js';

const opportunityManualUpdateSchema = new mongoose.Schema(
  {
    opportunityRefNo: { type: String, required: true },
    refKey: { type: String, required: true, unique: true, index: true },
    adnocRftNo: { type: String, default: '' },
    tenderName: { type: String, default: '' },
    opportunityClassification: { type: String, default: '' },
    clientName: { type: String, default: '' },
    groupClassification: { type: String, default: '' },
    internalLead: { type: String, default: '' },
    opportunityValue: { type: Number, default: null },
    avenirStatus: { type: String, default: '' },
    opportunityValueSheetSnapshot: { type: Number, default: null },
    dateTenderReceived: { type: String, default: '' },
    tenderPlannedSubmissionDate: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

applyBrandPlugin(opportunityManualUpdateSchema, { includeUniqueIndex: false });

export default brandModel('OpportunityManualUpdate', opportunityManualUpdateSchema, brandCollection('opportunity_manual_updates'));
