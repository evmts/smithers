#!/bin/sh
# Requires librsvg (rsvg-convert); run from any directory.
set -eu
cd "$(dirname "$0")/.."
rsvg-convert --width 1200 --height 630 public/social-card.svg --output public/social-card.png
