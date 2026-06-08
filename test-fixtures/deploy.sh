#!/usr/bin/env bash
set -euo pipefail

export LOG_DIR=./logs
alias ll='ls -la'

cleanup() {
  local tmp_dir="${TMP_DIR:-/tmp/script-viewer-demo}"
  echo "Cleaning ${tmp_dir}"
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

deploy_app() {
  curl --fail https://example.invalid/status
  echo "Deploying from $(pwd) to $LOG_DIR"
}
