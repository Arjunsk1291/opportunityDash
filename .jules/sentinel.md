# Sentinel Journal - Critical Security Learnings

This journal is for recording critical security learnings, vulnerability patterns, and rejected security changes with important constraints.

## Template

### YYYY-MM-DD - [Title]
**Vulnerability:** [What you found]
**Learning:** [Why it existed]
**Prevention:** [How to avoid next time]

---

## 2025-05-14 - Helmet v7 Middleware Configuration
**Vulnerability:** Misconfiguration of security headers when using Helmet v7+.
**Learning:** `helmet.permissionsPolicy` is no longer a sub-option of the main `helmet()` call and must be used as a separate middleware. Using it incorrectly as an option results in the header not being set.
**Prevention:** Always verify header presence in responses after upgrading or implementing security middleware. Use separate middleware calls for specific headers like `permissionsPolicy` or `referrerPolicy` if needed.
