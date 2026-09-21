const UPCOMING_SEED = [
  { title: 'Feature #12 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 12 },
  { title: 'Feature #13 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 13 },
  { title: 'Feature #14 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 14 },
  { title: 'Feature #15 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 15 },
  { title: 'Feature #17 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 17 },
  { title: 'Feature #18 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 18 },
  { title: 'Feature #21 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 21 },
  { title: 'Feature #23 — TBD', description: '', category: 'General', status: 'Planned', priority: 'Medium', sortOrder: 23 },
];

export const registerUpcomingRoutes = (app, deps) => {
  const { UpcomingFeature, verifyToken, isDatabaseReady, respondDatabaseUnavailable, isMasterOrAdmin, mapIdField } = deps;
  const ensureUpcomingSeed = async () => {
    if (await UpcomingFeature.countDocuments({}) === 0) await UpcomingFeature.insertMany(UPCOMING_SEED);
  };

  app.get('/api/upcoming', verifyToken, async (_req, res) => {
    try {
      if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
      await ensureUpcomingSeed();
      const items = await UpcomingFeature.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
      res.json({ success: true, items: items.map(mapIdField) });
    } catch (error) { res.status(500).json({ error: error?.message || 'Failed to fetch upcoming features' }); }
  });

  app.post('/api/upcoming', verifyToken, async (req, res) => {
    try {
      if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
      if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
      const { title, description = '', category = 'General', status = 'Planned', priority = 'Medium', sortOrder = 0 } = req.body || {};
      if (!String(title || '').trim()) return res.status(400).json({ error: 'Title is required' });
      const item = await UpcomingFeature.create({ title: String(title).trim(), description, category, status, priority, sortOrder: Number(sortOrder) || 0, updatedBy: req.user.email });
      res.json({ success: true, item: mapIdField(item.toObject()) });
    } catch (error) { res.status(500).json({ error: error?.message || 'Failed to create upcoming feature' }); }
  });

  app.put('/api/upcoming/:id', verifyToken, async (req, res) => {
    try {
      if (!isMasterOrAdmin(req)) return res.status(403).json({ error: 'Master/Admin only' });
      if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
      const { title, description, category, status, priority, sortOrder } = req.body || {};
      const update = {};
      if (title !== undefined) update.title = String(title).trim();
      if (description !== undefined) update.description = description;
      if (category !== undefined) update.category = category;
      if (status !== undefined) update.status = status;
      if (priority !== undefined) update.priority = priority;
      if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
      update.updatedBy = req.user.email;
      const item = await UpcomingFeature.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, item: mapIdField(item.toObject()) });
    } catch (error) { res.status(500).json({ error: error?.message || 'Failed to update upcoming feature' }); }
  });

  app.delete('/api/upcoming/:id', verifyToken, async (req, res) => {
    try {
      if (!['Master', 'MASTER'].includes(String(req.user?.role || ''))) return res.status(403).json({ error: 'Master only' });
      if (!isDatabaseReady()) return respondDatabaseUnavailable(res);
      await UpcomingFeature.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error?.message || 'Failed to delete upcoming feature' }); }
  });
};
