import mongoose from 'mongoose';

const hfCandidateSchema = new mongoose.Schema({
  fullName: { type: String, required: true, index: true },
  email: { type: String, default: '', index: true },
  phone: { type: String, default: '' },
  currentLocation: { type: String, default: '' },
  nationality: { type: String, default: '' },
  disciplineId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfDiscipline', default: null, index: true },
  officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfOffice', default: null, index: true },
  locationPreference: { type: String, enum: ['UAE', 'India', 'Either', ''], default: '' },
  yearsExperience: { type: Number, default: null },
  currentEmployer: { type: String, default: '' },
  currentPosition: { type: String, default: '' },
  currentSalary: { type: Number, default: null },
  expectedSalary: { type: Number, default: null },
  offeredSalary: { type: Number, default: null },
  currency: { type: String, default: '' },
  noticePeriod: { type: String, default: '' },
  source: { type: String, default: '' },
  status: { type: String, enum: ['new', 'reviewing', 'interview', 'offer', 'hired', 'rejected'], default: 'new', index: true },
  assignedTo: { type: String, default: '', index: true }, // email
  createdBy: { type: String, default: '', index: true }, // email
  extracted: { type: mongoose.Schema.Types.Mixed, default: {} }, // json blob
  rawText: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

hfCandidateSchema.index({ fullName: 'text', email: 'text', currentEmployer: 'text' });

export default mongoose.model('HfCandidate', hfCandidateSchema);

