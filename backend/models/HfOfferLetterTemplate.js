import mongoose from 'mongoose';

const hfOfferLetterTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfOffice', default: null, index: true },
  subject: { type: String, required: true, default: '' },
  bodyHtml: { type: String, required: true, default: '' },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

hfOfferLetterTemplateSchema.index({ name: 1, officeId: 1 }, { unique: true });

export default mongoose.model('HfOfferLetterTemplate', hfOfferLetterTemplateSchema);

