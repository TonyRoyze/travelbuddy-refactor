# Commit and deployment workflow

- Keep each change on a descriptively named `feature/<name>` branch. Do not commit directly to `main` or `dev`.
- Before starting or syncing work, fetch both remotes (`origin` = `https://github.com/shalinda/travelbuddy`, `tony` = `https://github.com/TonyRoyze/travelbuddy-refactor`), pull/merge any upstream updates from `origin/dev`, and run the project checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `node scripts/test-telemetry.mjs`, `pnpm build`) to verify nothing breaks.
- Commit the complete requested change on `feature/<name>`, then push the feature branch to the `tony` remote: `git push -u tony feature/<name>`.
- After the feature branch is pushed and verified:
  - Merge it into `origin/dev` (`shalinda/travelbuddy`, branch `dev`) and push `origin dev` so upstream `dev` stays up to date.
  - Mirror/merge the same verified commit into `tony/main` (`TonyRoyze/travelbuddy-refactor`, branch `main`) and push `tony main`.
- Preserve the feature branch and report the feature commit SHA, the `origin/dev` commit SHA, and the final `tony/main` commit SHA.
- The `tony/main` push triggers the image publishing workflow. Wait for its checks and image publish to succeed before asking the user to roll out the image.
- For this deployment, the image is `ghcr.io/tonyroyze/travelbuddy-refactor:<tony-main-sha>`. Give the user the exact cluster rollout command:

  ```sh
  kubectl set image deployment/travelbuddy app=ghcr.io/tonyroyze/travelbuddy-refactor:<tony-main-sha> -n travelbuddy && kubectl rollout status deployment/travelbuddy -n travelbuddy
  ```

- Replace `<tony-main-sha>` with the full SHA of the pushed `tony/main` commit. Do not claim the cluster is updated; the user runs the command.
