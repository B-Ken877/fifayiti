#!/bin/bash
# FIFAYITI — HLS recording retention management.
#
# The livekit-egress HLS/DVR pipeline writes each broadcast session to
# /var/www/fifayiti/hls/<timestamp>/ (~1.1 GB per hour at 2.5 Mbps).
# These recordings are the future full-match-replay / highlights source,
# so we keep them as long as possible — but the VPS disk is limited.
#
# Policy:
#   1. Delete session folders older than 7 days.
#   2. If total size still exceeds the cap (6 GB), delete the OLDEST
#      sessions first until under the cap.
#   3. Never touch the folder of the CURRENTLY ACTIVE egress session.
#
# Run daily by cron (see setup below).

HLS_ROOT="/var/www/fifayiti/hls"
MAX_AGE_DAYS=7
MAX_TOTAL_KB=$((6 * 1024 * 1024))  # 6 GB
STATE_FILE="/var/www/fifayiti/db/hls-state.json"

[ -d "$HLS_ROOT" ] || exit 0

# Folder of the active session (protected from deletion)
ACTIVE_FOLDER=""
if [ -f "$STATE_FILE" ]; then
  ACTIVE_FOLDER=$(python3 -c "
import json
try:
    with open('$STATE_FILE') as f:
        print(json.load(f).get('folder', ''))
except Exception:
    print('')
" 2>/dev/null)
fi

# 1. Age-based cleanup
find "$HLS_ROOT" -maxdepth 1 -mindepth 1 -type d -mtime +$MAX_AGE_DAYS | while read -r dir; do
  if [ "$(readlink -f "$dir")" != "$(readlink -f "$ACTIVE_FOLDER")" ]; then
    echo "cleanup-hls: removing (age > ${MAX_AGE_DAYS}d): $dir"
    rm -rf "$dir"
  fi
done

# 2. Size-cap cleanup (oldest first)
total_kb() { du -s "$HLS_ROOT" 2>/dev/null | cut -f1; }

while [ "$(total_kb)" -gt "$MAX_TOTAL_KB" ]; do
  OLDEST=$(ls -1tr "$HLS_ROOT" 2>/dev/null | head -1)
  [ -z "$OLDEST" ] && break
  DIR="$HLS_ROOT/$OLDEST"
  if [ -n "$ACTIVE_FOLDER" ] && [ "$(readlink -f "$DIR")" = "$(readlink -f "$ACTIVE_FOLDER")" ]; then
    break  # never delete the active session
  fi
  echo "cleanup-hls: size cap exceeded, removing oldest: $DIR"
  rm -rf "$DIR"
done

# 3. Report
echo "cleanup-hls: total now $(du -sh "$HLS_ROOT" 2>/dev/null | cut -f1)"
