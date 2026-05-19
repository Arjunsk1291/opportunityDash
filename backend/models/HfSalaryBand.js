import mongoose from 'mongoose';

const hfSalaryBandSchema = new mongoose.Schema({
  officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfOffice', required: true, index: true },
  disciplineId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfDiscipline', required: true, index: true },
  minYears: { type: Number, required: true, min: 0 },
  maxYears: { type: Number, required: true, min: 0 },
  grade: { type: String, required: true },
  salaryMin: { type: Number, required: true, min: 0 },
  salaryMid: { type: Number, required: true, min: 0 },
  salaryMax: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  effectiveFrom: { type: Date, required: true, default: Date.now },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

hfSalaryBandSchema.index({ officeId: 1, disciplineId: 1, effectiveFrom: -1 });

export default mongoose.model('HfSalaryBand', hfSalaryBandSchema);

