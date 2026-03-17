FROM node:20-slim

# Install ffmpeg, yt-dlp dependencies, and unzip for deno
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-dejavu-core \
    python3 \
    python3-pip \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install deno (required by yt-dlp for YouTube extraction)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Install yt-dlp (always latest — YouTube changes bot detection frequently)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && yt-dlp --version \
    && deno --version

# Auto-update yt-dlp on container start (startup script handles this)
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create temp directories
RUN mkdir -p /tmp/frames /tmp/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the app (via start.sh which auto-updates yt-dlp first)
CMD ["/app/start.sh"]
