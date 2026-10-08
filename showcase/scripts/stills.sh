#!/usr/bin/env bash
# Usage: scripts/stills.sh <Composition> <outdir> <seconds...>  — renders preview stills for review.
comp=$1; out=$2; shift 2
mkdir -p "$out"
for s in "$@"; do
  f=$(node -e "console.log(Math.round($s*30))")
  npx remotion still src/index.ts "$comp" "$out/$comp-$(printf '%05.1f' $s).png" --frame=$f --log=error >/dev/null 2>&1 || echo "fail $s"
done
