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
**Learning:** `Permissions-Policy` is not part of the Helmet v7 core middleware. While some community packages or future versions might include it, it should be set manually or via a dedicated middleware to ensure presence. Incorrectly assuming it's a function on the `helmet` object causes runtime crashes.
**Prevention:** Always verify the existence of specific middleware functions when working with security libraries. Use manual `res.setHeader` for headers not yet supported by standard middleware.
