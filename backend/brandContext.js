import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';

export const BRAND_KEYS = ['avenir_intl', 'avenir_oilfield'];
export const DEFAULT_BRAND_KEY = 'avenir_intl';

const storage = new AsyncLocalStorage();

export function normalizeBrandKey(value) {
  const key = String(value || '').trim().toLowerCase();
  return BRAND_KEYS.includes(key) ? key : DEFAULT_BRAND_KEY;
}

export function runWithBrandContext(brandKey, fn) {
  return storage.run({ brandKey: normalizeBrandKey(brandKey) }, fn);
}

export function getActiveBrandKey() {
  return normalizeBrandKey(storage.getStore()?.brandKey);
}

export function brandCollection(baseName) {
  return `${baseName}__${getActiveBrandKey()}`;
}

export function applyBrandPlugin(schema, options = {}) {
  const brandField = options.brandField || 'brandKey';
  const includeUniqueIndex = options.includeUniqueIndex !== false;

  schema.add({
    [brandField]: { type: String, enum: BRAND_KEYS, default: DEFAULT_BRAND_KEY, index: true },
  });

  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'distinct', 'deleteMany', 'deleteOne', 'updateMany', 'updateOne'], function scopeBrandFilter() {
    const filter = this.getFilter?.() || {};
    const brandKey = getActiveBrandKey();
    if (!Object.prototype.hasOwnProperty.call(filter, brandField)) {
      this.setQuery({ ...filter, [brandField]: brandKey });
    }
  });

  schema.pre('save', function setBrandField(next) {
    if (!this[brandField]) this[brandField] = getActiveBrandKey();
    next();
  });

  if (includeUniqueIndex) {
    schema.index({ [brandField]: 1, createdAt: -1 });
  }

  schema.statics.forBrand = function forBrand(brandKey) {
    const key = normalizeBrandKey(brandKey);
    return this.find({ [brandField]: key });
  };
}

export function brandModel(modelName, schema, collectionName) {
  const scopedModelName = `${modelName}__${getActiveBrandKey()}`;
  return mongoose.models[scopedModelName] || mongoose.model(scopedModelName, schema, collectionName);
}
