#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
DIST_DIR="$SCRIPT_DIR/dist"
WORK_DIR="$(mktemp -d "/tmp/academic-center-macos.XXXXXX")"
APP_BUNDLE="$WORK_DIR/学业中心.app"
WIDGET_BUNDLE="$APP_BUNDLE/Contents/PlugIns/AcademicCenterWidget.appex"
APP_EXECUTABLE="$APP_BUNDLE/Contents/MacOS/AcademicCenter"
WIDGET_EXECUTABLE="$WIDGET_BUNDLE/Contents/MacOS/AcademicCenterWidget"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources" "$WIDGET_BUNDLE/Contents/MacOS" "$DIST_DIR"
cp "$SCRIPT_DIR/Resources/App-Info.plist" "$APP_BUNDLE/Contents/Info.plist"
cp "$SCRIPT_DIR/Resources/Widget-Info.plist" "$WIDGET_BUNDLE/Contents/Info.plist"

env TMPDIR=/tmp sips -s format icns "$PROJECT_DIR/public/icons/app-icon-512.png" --out "$APP_BUNDLE/Contents/Resources/AppIcon.icns" >/dev/null

build_binary() {
  local architecture="$1"
  local output="$2"
  shift 2
  xcrun swiftc \
    -swift-version 5 \
    -O \
    -parse-as-library \
    -module-cache-path "$WORK_DIR/ModuleCache-$architecture" \
    -target "${architecture}-apple-macos14.0" \
    -sdk "$SDK_PATH" \
    "$@" \
    -o "$output"
}

APP_ARM="$WORK_DIR/AcademicCenter-arm64"
APP_INTEL="$WORK_DIR/AcademicCenter-x86_64"
WIDGET_ARM="$WORK_DIR/AcademicCenterWidget-arm64"
WIDGET_INTEL="$WORK_DIR/AcademicCenterWidget-x86_64"

APP_SOURCES=("$SCRIPT_DIR"/Sources/App/*.swift)
WIDGET_SOURCES=("$SCRIPT_DIR"/Sources/Widget/*.swift)

build_binary arm64 "$APP_ARM" "${APP_SOURCES[@]}" -framework SwiftUI -framework AppKit -framework WebKit -framework UniformTypeIdentifiers
build_binary x86_64 "$APP_INTEL" "${APP_SOURCES[@]}" -framework SwiftUI -framework AppKit -framework WebKit -framework UniformTypeIdentifiers
lipo -create "$APP_ARM" "$APP_INTEL" -output "$APP_EXECUTABLE"

build_binary arm64 "$WIDGET_ARM" "${WIDGET_SOURCES[@]}" -application-extension -framework SwiftUI -framework WidgetKit
build_binary x86_64 "$WIDGET_INTEL" "${WIDGET_SOURCES[@]}" -application-extension -framework SwiftUI -framework WidgetKit
lipo -create "$WIDGET_ARM" "$WIDGET_INTEL" -output "$WIDGET_EXECUTABLE"

codesign --force --sign - --timestamp=none --entitlements "$SCRIPT_DIR/Resources/Widget.entitlements" "$WIDGET_BUNDLE"
codesign --force --sign - --timestamp=none --entitlements "$SCRIPT_DIR/Resources/App.entitlements" "$APP_BUNDLE"
codesign --verify --deep --strict "$APP_BUNDLE"

rm -rf "$DIST_DIR/学业中心.app"
cp -R "$APP_BUNDLE" "$DIST_DIR/学业中心.app"

DMG_ROOT="$WORK_DIR/dmg"
mkdir -p "$DMG_ROOT"
cp -R "$APP_BUNDLE" "$DMG_ROOT/学业中心.app"
ln -s /Applications "$DMG_ROOT/Applications"
rm -f "$DIST_DIR/AcademicCenter-macOS.dmg"
hdiutil create -volname "学业中心" -srcfolder "$DMG_ROOT" -ov -format UDZO "$DIST_DIR/AcademicCenter-macOS.dmg" >/dev/null

echo "Built: $DIST_DIR/AcademicCenter-macOS.dmg"
