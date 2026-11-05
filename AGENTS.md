# Commit and deployment workflow

- Keep each change on a descriptively named `feature/<name>` branch. Do not commit directly to `main`.
- Commit the complete requested change, then push the feature branch to the `tony` remote: `git push -u tony feature/<name>`.
- After the feature branch is pushed, merge it into `tony/main` and push `tony/main`. Preserve the feature branch and report both the feature commit and the final `tony/main` commit SHA.
- The `tony/main` push triggers the image publishing workflow. Wait for its checks and image publish to succeed before asking the user to roll out the image.
- For this deployment, the image is `ghcr.io/tonyroyze/travelbuddy-refactor:<tony-main-sha>`. Give the user the exact cluster rollout command:

  ```sh
  kubectl set image deployment/travelbuddy app=ghcr.io/tonyroyze/travelbuddy-refactor:<tony-main-sha> -n travelbuddy && kubectl rollout status deployment/travelbuddy -n travelbuddy
  ```

- Replace `<tony-main-sha>` with the full SHA of the pushed `tony/main` commit. Do not claim the cluster is updated; the user runs the command.
