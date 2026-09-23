#!/bin/sh
set -eu

ANDROID_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ANDROID_CONFIG="${HOME:?}/.bubblewrap/config.json"
KEYSTORE_PATH="${HOME:?}/.bubblewrap/arcai-upload.keystore"
KEYSTORE_ACCOUNT="chat.askarc.android"
KEYCHAIN_SERVICE="ArcAI Android Upload Keystore Password"

if [ ! -f "$ANDROID_CONFIG" ]; then
  echo "Bubblewrap's local JDK and Android SDK configuration is missing." >&2
  exit 1
fi

JDK_ROOT=$(python3 -c 'import json, os, sys; print(json.load(open(sys.argv[1]))["jdkPath"])' "$ANDROID_CONFIG")
ANDROID_HOME=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["androidSdkPath"])' "$ANDROID_CONFIG")

if [ -x "$JDK_ROOT/Contents/Home/bin/java" ]; then
  JAVA_HOME="$JDK_ROOT/Contents/Home"
elif [ -x "$JDK_ROOT/bin/java" ]; then
  JAVA_HOME="$JDK_ROOT"
else
  echo "Bubblewrap's configured JDK does not contain java." >&2
  exit 1
fi
export JAVA_HOME ANDROID_HOME
ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_SDK_ROOT

if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "Android upload keystore is missing at $KEYSTORE_PATH" >&2
  exit 1
fi

KEYSTORE_PASSWORD=$(/usr/bin/security find-generic-password \
  -a "$KEYSTORE_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w)

if [ -z "$KEYSTORE_PASSWORD" ]; then
  echo "Android upload key password is missing from the login Keychain." >&2
  exit 1
fi

export ARCAI_ANDROID_KEYSTORE="$KEYSTORE_PATH"
export ARCAI_ANDROID_KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD"
export ARCAI_ANDROID_KEY_ALIAS=android
export ARCAI_ANDROID_KEY_PASSWORD="$KEYSTORE_PASSWORD"
unset KEYSTORE_PASSWORD

if [ "$#" -eq 0 ]; then
  set -- assembleRelease bundleRelease
fi

cd "$ANDROID_DIR"
exec ./gradlew "$@"
