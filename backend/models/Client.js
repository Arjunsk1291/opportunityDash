import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: true }
);

const clientSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    companyKey: { type: String, required: true, unique: true, index: true },
    domain: { type: String, default: '' },
    location: {
      city: { type: String, default: '' },
      country: { type: String, default: '' },
    },
    contacts: { type: [contactSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Client', clientSchema);
