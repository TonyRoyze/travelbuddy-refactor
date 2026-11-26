# Commit and deployment workflow

- Base feature branches on `main` and open pull requests against `main` in `TonyRoyze/travelbuddy-refactor`.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `node scripts/test-telemetry.mjs`, and `pnpm build` before merging changes.
- After a merge to `main`, the image workflow publishes `ghcr.io/tonyroyze/travelbuddy-refactor:<commit-sha>`. Use the full SHA of the merged commit when selecting an image for rollout.
