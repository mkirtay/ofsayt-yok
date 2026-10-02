#!/bin/bash
# Paylaşım görselleri (next/og) için Inter alt kümesi → src/server/og/ogFonts.generated.ts (base64 TTF, fonksiyona gömülü).
# Kaynak: google/fonts ofl/inter/Inter[opsz,wght].ttf (v4.001, OFL — src/styles/fonts/Inter-OFL.txt). Gerekenler: pip install fonttools
#
# - next/og (satori) değişken font ve woff2 okumaz → opsz 14'te sabit, iki statik ağırlık: 600 (metin) ve 800 (skor / başlık).
# - Aralık: sitenin önyüklenen inter-latin alt kümesiyle aynı (Basic Latin + Latin-1 + Latin Extended-A + ș ț ə …,
#   bkz. subset-inter.sh); diğer karakterler next/og'un gömülü yedek fontuna düşer.
set -euo pipefail
SRC=${1:?kullanım: subset-inter-og.sh <Inter[opsz,wght].ttf>}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/src/server/og/ogFonts.generated.ts"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

LATIN='U+0000,U+0020-007E,U+00A0-00AC,U+00AE-0148,U+014A-017F,U+018F,U+0218-021B,U+0259,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+2002,U+2009,U+200B,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2122,U+2191,U+2193,U+2212,U+FEFF'

for w in 600 800; do
  fonttools varLib.instancer "$SRC" opsz=14 wght=$w -o "$TMP/inter-$w.ttf"
  pyftsubset "$TMP/inter-$w.ttf" --unicodes="$LATIN" --layout-features='kern' \
    --no-hinting --desubroutinize --output-file="$TMP/inter-og-$w.ttf"
done

{
  echo "// ÜRETİLDİ: scripts/fonts/subset-inter-og.sh — elle düzenleme. Inter v4.001 (OFL), opsz 14, Latin alt kümesi."
  for w in 600 800; do
    echo "export const INTER_OG_${w}_BASE64 = '$(base64 < "$TMP/inter-og-$w.ttf" | tr -d '\n')';"
  done
} > "$OUT"
ls -l "$TMP"/inter-og-*.ttf "$OUT"
