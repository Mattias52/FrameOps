#!/bin/bash
# Auto-update yt-dlp on every container start to keep up with YouTube changes
echo "Updating yt-dlp..."
curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp 2>/dev/null && chmod a+rx /usr/local/bin/yt-dlp
echo "yt-dlp version: $(yt-dlp --version)"

# Start the app
exec node index.js
