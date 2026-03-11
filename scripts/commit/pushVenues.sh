#!/usr/bin/env bash
set -euo pipefail

git add content/venues/*
git add static/images/venues/*
git commit -m "Add venues + DipScores"
git push
