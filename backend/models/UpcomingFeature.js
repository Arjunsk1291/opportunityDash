import mongoose from 'mongoose';

const upcomingFeatureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'General' },
    status: { type: String, enum: ['Planned', 'In Progress', 'Done'], default: 'Planned' },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    sortOrder: { type: Number, default: 0 },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

upcomingFeatureSchema.index({ sortOrder: 1, createdAt: 1 });

export default mongoose.model('UpcomingFeature', upcomingFeatureSchema);
