#!/usr/bin/env bash
set -euo pipefail

marimo export html-wasm notebooks/demo_marimo.py -o marimo_dist --mode edit
