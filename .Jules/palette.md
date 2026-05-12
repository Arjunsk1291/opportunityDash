## 2025-05-12 - Accessible Tooltips Implementation
**Learning:** Found that Radix UI Tooltips require a `TooltipProvider` at the root (which is already present in `App.tsx`) for functional tooltips across components. Native `title` attributes are common but less accessible and visually inconsistent with modern design systems.
**Action:** Use `Tooltip` with keyboard shortcut hints (`<kbd>`) for global actions to enhance discoverability and accessibility. Avoid re-declaring `TooltipProvider` in subcomponents if it's already at the root.
