#!/bin/sh
# Terbitkan isi webapp/ ke GitHub Pages (cabang gh-pages). Jalankan dari akar repo setelah commit.
set -e
git push origin main
git subtree split --prefix webapp -b gh-pages-tmp >/dev/null
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp >/dev/null
echo "Terbit. GitHub Pages memperbarui dalam ±1 menit."
