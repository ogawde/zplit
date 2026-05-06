#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> generate-lockfile with Rust 1.79 (lock format v3)"
rustup run 1.79.0 cargo generate-lockfile

echo "==> pin transitive crates for Solana's older Cargo + stable IDL build"
rustup run 1.79.0 cargo update -p blake3 --precise 1.5.5
rustup run 1.79.0 cargo update -p proc-macro-crate@3.5.0 --precise 3.2.0
rustup run 1.79.0 cargo update -p indexmap --precise 2.3.0
rustup run 1.79.0 cargo update -p unicode-segmentation --precise 1.10.1
rustup run 1.79.0 cargo update -p serde_json --precise 1.0.140

echo "==> done. Run: anchor test"
