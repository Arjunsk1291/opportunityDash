import mongoose from 'mongoose';

const hfDisciplineSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

hfDisciplineSchema.index({ name: 1 }, { unique: true });

export default mongoose.model('HfDiscipline', hfDisciplineSchema);

