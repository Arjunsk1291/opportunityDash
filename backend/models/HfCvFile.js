import mongoose from 'mongoose';

const hfCvFileSchema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'HfCandidate', required: true, index: true },
  storagePath: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  uploadedBy: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('HfCvFile', hfCvFileSchema);

