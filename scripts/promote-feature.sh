#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this command inside the repository."
cd "$repo_root"

feature_branch="$(git branch --show-current)"
[[ "$feature_branch" == feature/* ]] || fail "Current branch '$feature_branch' is not a feature/* branch. Switch to your committed feature branch first."
[[ -z "$(git status --porcelain)" ]] || fail "Working tree is not clean. Commit or stash changes before promotion."
git remote get-url origin >/dev/null 2>&1 || fail "The 'origin' remote is not configured."
git remote get-url tony >/dev/null 2>&1 || fail "The 'tony' remote is not configured."

git fetch origin dev
git fetch tony main

tmp_worktree="$(mktemp -d "${TMPDIR:-/tmp}/travelbuddy-promote.XXXXXX")"
cleanup() {
  git worktree remove --force "$tmp_worktree" >/dev/null 2>&1 || true
  rmdir "$tmp_worktree" >/dev/null 2>&1 || true
}
trap cleanup EXIT

git worktree add --detach "$tmp_worktree" origin/dev
git -C "$tmp_worktree" merge --no-edit "$feature_branch"
git -C "$tmp_worktree" push origin HEAD:refs/heads/dev

# Refresh the mirror base after promoting to origin/dev, then apply the same
# feature commit to tony/main. A merge conflict stops here without rewriting it.
git fetch tony main
git -C "$tmp_worktree" fetch origin dev
git -C "$tmp_worktree" reset --hard tony/main
git -C "$tmp_worktree" merge --no-edit origin/dev
git -C "$tmp_worktree" push tony HEAD:refs/heads/main

printf "Promoted '%s' to origin/dev and synced origin/dev into tony/main.\n" "$feature_branch"
