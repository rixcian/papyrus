#!/usr/bin/env sh
# Regenerates the tiny audio fixtures in src/test/fixtures/audio. Needs ffmpeg; the output is
# committed, so tests and CI don't.
set -eu
out="$(dirname "$0")/../src/test/fixtures/audio"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
q="-hide_banner -loglevel error -y"

ffmpeg $q -f lavfi -i "color=c=0x336699:s=64x64:d=1" -frames:v 1 "$tmp/cover.png"

tone() { ffmpeg $q -f lavfi -i "sine=frequency=$1:sample_rate=22050:duration=$2" "$tmp/$3"; }

# Three mp3 Tracks of one album, given out of order; track 1 carries the cover.
tone 440 4 a.wav
tone 550 4 b.wav
tone 660 4 c.wav
mp3() {
  ffmpeg $q -i "$tmp/$1" $3 -ac 1 -b:a 32k \
    -metadata album="The Quiet Shore" -metadata album_artist="Ada Lindqvist" \
    -metadata artist="Ada Lindqvist" -metadata date=2019 -metadata genre=Fiction \
    -metadata title="$4" -metadata track="$5/3" -id3v2_version 3 "$out/$2"
}
mp3 a.wav 01-arrival.mp3 "" "Arrival" 1
ffmpeg $q -i "$out/01-arrival.mp3" -i "$tmp/cover.png" -map 0:a -map 1:v -c copy \
  -id3v2_version 3 -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
  "$tmp/01.mp3" && mv "$tmp/01.mp3" "$out/01-arrival.mp3"
mp3 b.wav 02-the-lighthouse.mp3 "" "The Lighthouse" 2
mp3 c.wav 03-departure.mp3 "" "Departure" 3

# One m4b with three Chapters.
tone 330 9 long.wav
cat > "$tmp/meta.txt" <<META
;FFMETADATA1
title=Northern Lights
album=Northern Lights
artist=Bo Ekdahl
album_artist=Bo Ekdahl
genre=Nonfiction
date=2021
[CHAPTER]
TIMEBASE=1/1000
START=0
END=3000
title=Opening
[CHAPTER]
TIMEBASE=1/1000
START=3000
END=6000
title=Middle
[CHAPTER]
TIMEBASE=1/1000
START=6000
END=9000
title=Closing
META
ffmpeg $q -i "$tmp/long.wav" -i "$tmp/meta.txt" -map_metadata 1 -map_chapters 1 \
  -ac 1 -c:a aac -b:a 24k -f mp4 "$out/northern-lights.m4b"

# An mp3 with no tags at all.
ffmpeg $q -i "$tmp/a.wav" -ac 1 -b:a 32k -map_metadata -1 -write_xing 1 "$out/untagged-recording.mp3"
