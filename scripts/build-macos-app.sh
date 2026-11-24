#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_NAME="Pr8note"
APP="$ROOT/build/$APP_NAME.app"

echo "▸ 1/4 · Compilation de l'interface web"
npm run build

echo "▸ 2/4 · Préparation du bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp -R "$ROOT/dist/." "$APP/Contents/Resources/web/"

echo "▸ 3/4 · Compilation de la coque native macOS"
swiftc -O \
  -framework Cocoa \
  -framework WebKit \
  "$ROOT/macos/main.swift" \
  -o "$APP/Contents/MacOS/$APP_NAME"

echo "▸ 4/4 · Icône et métadonnées"
if command -v swift >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  ICONSET="$ROOT/build/AppIcon.iconset"
  rm -rf "$ICONSET"
  mkdir -p "$ICONSET"
  swift "$ROOT/macos/IconGen.swift" "$ROOT/build/icon-1024.png" >/dev/null
  for SIZE in 16 32 128 256 512; do
    sips -z "$SIZE" "$SIZE" "$ROOT/build/icon-1024.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
    DOUBLE=$((SIZE * 2))
    sips -z "$DOUBLE" "$DOUBLE" "$ROOT/build/icon-1024.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
  done
  sips -z 1024 1024 "$ROOT/build/icon-1024.png" --out "$ICONSET/icon_512x512@2x.png" >/dev/null
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
else
  echo "  ⚠ Swift ou iconutil indisponible : icône personnalisée ignorée."
fi

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>fr</string>
  <key>CFBundleDisplayName</key>
  <string>Pr8note</string>
  <key>CFBundleExecutable</key>
  <string>Pr8note</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>fr.pr8note.client</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Pr8note</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.education</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Pr8note — client scolaire indépendant</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSSupportsAutomaticGraphicsSwitching</key>
  <true/>
</dict>
</plist>
PLIST

printf 'APPL????' > "$APP/Contents/PkgInfo"

# Ad-hoc signature: makes the local .app launch without quarantine friction.
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || echo "  ⚠ Signature ad-hoc ignorée."

echo ""
echo "✅ Application prête : $APP"
echo "   Ouvre-la avec : open \"$APP\""
