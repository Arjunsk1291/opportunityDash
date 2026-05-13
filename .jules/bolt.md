## 2025-05-15 - [Bulk Write & Projection Optimization]
**Learning:** For collections with thousands of documents, replacing individual record saves with `bulkWrite` and using field projection to exclude heavy unused fields (like `rawGoogleData`) provides the most immediate and measurable performance boost.
**Action:** Always check for O(N) database loops in bulk processing routes and replace them with `bulkWrite`. Use projection on high-frequency fetch endpoints to keep payloads lean.
