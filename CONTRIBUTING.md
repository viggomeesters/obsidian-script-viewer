# Contributing

Script Viewer is a small read-only inspection plugin. Keep changes focused on local rendering, outline extraction, fixtures, tests, and documentation.

Before submitting a change, run:

```bash
npm run build
npx tsc --noEmit
npm test
```

Avoid adding runtime network access, clipboard access, file mutation, subprocess execution, code execution, permission changes, formatters, linters, or IDE-like behavior without a documented design decision.
