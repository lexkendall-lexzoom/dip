#!/usr/bin/env bash
set -euo pipefail

git add content/venues/*
git add images/venues/* 2>/dev/null || true
git commit -m "Add venues + DipScores"
git push
