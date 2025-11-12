#!/bin/bash
set -e

echo "=== Building MCPaC ==="

# Get version from package.json
VERSION=$(cat package.json | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')
echo "Version: $VERSION"

# Prepare dist directory
rm -rf dist
mkdir -p dist

echo ""
echo "Building for multiple platforms..."

# Linux x64
echo "  • Linux x64..."
bun build --compile --target=bun-linux-x64 --minify ./src/cli.ts \
  --outfile "dist/mcpac-$VERSION-linux-x64"

# Linux ARM64
echo "  • Linux ARM64..."
bun build --compile --target=bun-linux-arm64 --minify ./src/cli.ts \
  --outfile "dist/mcpac-$VERSION-linux-arm64"

# macOS Intel
echo "  • macOS Intel..."
bun build --compile --target=bun-darwin-x64 --minify ./src/cli.ts \
  --outfile "dist/mcpac-$VERSION-darwin-x64"

# macOS Apple Silicon
echo "  • macOS Apple Silicon..."
bun build --compile --target=bun-darwin-arm64 --minify ./src/cli.ts \
  --outfile "dist/mcpac-$VERSION-darwin-arm64"

# Windows
echo "  • Windows x64..."
bun build --compile --target=bun-windows-x64 --minify ./src/cli.ts \
  --outfile "dist/mcpac-$VERSION-windows-x64"

echo ""
echo "=== Build Complete ==="
echo ""
echo "Built files:"
ls -lh dist/

# Generate checksums
echo ""
echo "Generating checksums..."
cd dist
sha256sum mcpac-* > SHA256SUMS 2>/dev/null || shasum -a 256 mcpac-* > SHA256SUMS
cd ..

echo ""
echo "✓ All builds completed successfully"
