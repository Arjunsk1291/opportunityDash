import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    companyKey: { type: String, required: true, unique: true, index: true },
    primaryIndustries: { type: [String], default: [] },
    confirmedServices: { type: [String], default: [] },
    confirmedTechStack: { type: [String], default: [] },
    nonSpecializedTechStack: { type: [String], default: [] },
    sampleProjects: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    partners: { type: [String], default: [] },
    companySize: { type: String, default: '' },
    sources: { type: [String], default: [] },
    focusArea: { type: String, default: '' },
    ndaStatus: { type: String, default: '' },
    associationAgreementStatus: { type: String, default: '' },
    agreementStatus: {
      type: String,
      enum: ['NDA', 'Association Agreement', 'Pending'],
      default: 'Pending',
    },
    agreementDocuments: { type: [String], default: [] },
    contactPerson: { type: String, default: '' },
    emails: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Vendor', vendorSchema);
