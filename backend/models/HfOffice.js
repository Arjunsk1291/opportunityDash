import mongoose from 'mongoose';

const hfOfficeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  country: { type: String, required: true },
  currency: { type: String, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

hfOfficeSchema.index({ code: 1 }, { unique: true });

export default mongoose.model('HfOffice', hfOfficeSchema);

