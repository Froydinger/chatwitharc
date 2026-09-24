#!/bin/sh
set -eu

ANDROID_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$ANDROID_DIR/.." && pwd)

ARCAI_ANDROID_DISTRIBUTION=direct
export ARCAI_ANDROID_DISTRIBUTION
"$ANDROID_DIR/build-release.sh" assembleRelease

mkdir -p "$REPO_DIR/public/downloads"
install -m 644 "$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk" \
  "$REPO_DIR/public/downloads/ArcAI-Android-Beta.apk"
shasum -a 256 "$REPO_DIR/public/downloads/ArcAI-Android-Beta.apk"
