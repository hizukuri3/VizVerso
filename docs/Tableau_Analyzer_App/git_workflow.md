# Git Workflow
- **Branches**: `main` (stable, no direct push). Use `feature/`, `fix/`, `test/`, `refactor/`.
- **Commits**: Use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
- **PRs**: Create PR to `main`. Ensure all tests (`npm run test`) and lint pass. All CI checks must be green before merge.
