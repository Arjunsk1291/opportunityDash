## 2025-05-15 - [Bulk Write & Projection Optimization]
**Learning:** For collections with thousands of documents, replacing individual record saves with `bulkWrite` and using field projection to exclude heavy unused fields (like `rawGoogleData`) provides the most immediate and measurable performance boost.
**Action:** Always check for O(N) database loops in bulk processing routes and replace them with `bulkWrite`. Use projection on high-frequency fetch endpoints to keep payloads lean.

## 2025-05-22 - [Import & Tab Switching Optimization]
**Learning:** Replacing individual record saves in import loops with a single `bulkWrite` operation drastically improves data processing speed. Additionally, adding composite indexes that exactly match the sorting keys used in the frontend (e.g., tenant + multiple date fields) eliminates UI lag during tab/tenant transitions.
**Action:** Use `bulkWrite` with `upsert` and `$setOnInsert` for efficient data ingestion. Always verify that database indexes cover the specific sort order of the primary fetch queries to ensure smooth UI transitions.
