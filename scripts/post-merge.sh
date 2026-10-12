#!/usr/bin/env bash
set -euo pipefail

install_if_manifests_changed() {
  local project_dir="$1"
  local project_name="$2"
  local install_state="$project_dir/node_modules/.package-lock.json"

  if [[ ! -f "$project_dir/package.json" || ! -f "$project_dir/package-lock.json" ]]; then
    echo "Skipping $project_name: no npm lockfile and manifest pair."
    return 0
  fi

  if [[ ! -f "$install_state" \
    || "$project_dir/package.json" -nt "$install_state" \
    || "$project_dir/package-lock.json" -nt "$install_state" ]]; then
    echo "Installing locked dependencies for $project_name."
    npm --prefix "$project_dir" ci --no-audit --no-fund
  else
    echo "Dependencies unchanged for $project_name; skipping install."
  fi
}

install_if_manifests_changed "." "workspace"
install_if_manifests_changed \
  "_replit_archive/replit_cleanup_20260508_065004/large_artifacts/artifacts/test" \
  "component preview artifact"
