import mongoose from 'mongoose';

const approvalSchema = new mongoose.Schema(
  {
    opportunityId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.model('Approval', approvalSchema);
