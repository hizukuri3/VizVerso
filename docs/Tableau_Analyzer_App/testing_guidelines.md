# Testing Guidelines
- **Env**: Run logic tests (`xmlParser`) in `node` (not `jsdom`) to ensure Web Worker compatibility. Use `jsdom` for UI tests only.
- **Worker**: No dependencies on `window`/`document`. Use `fast-xml-parser`.
- **UI for Automation**: Don't use `display: none` for file inputs; use `opacity-0` for programmatic access.
- **Verification**: Use `fetch` + JS injection for automated uploads instead of OS file dialogs.
- **E2E**: Use Playwright for real browser tests (UI -> Worker -> Graph flow).
