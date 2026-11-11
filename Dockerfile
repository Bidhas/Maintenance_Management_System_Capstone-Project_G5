# =============================================================================
# CMMS - production image (client + server in ONE container)
#
# The Express server already serves the built React app from ../../client/dist
# (see server/src/app.js), so one image / one Render service is all we need.
#
# Two stages:
#   1. client-build : installs ALL client dependencies (Vite is a dev dependency)
#                     and produces client/dist.  This stage is thrown away.
#   2. runtime      : installs ONLY the server's production dependencies and copies
#                     in the built client.  This is the image that actually runs.
#
# Build context = repository root.  Secrets are NEVER baked in: .dockerignore
# excludes every .env file, and all configuration arrives as environment
# variables set on Render (DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, ...).
# =============================================================================

# ---------- Stage 1: build the React client ----------
FROM node:24-alpine AS client-build
WORKDIR /app/client

# Copy only the manifests first so Docker can cache the (slow) install layer
# until package.json / package-lock.json actually change.
COPY client/package*.json ./

# "npm ci" is the reproducible install, but it needs a package-lock.json.
# If a lockfile is missing we fall back to "npm install" instead of failing.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY client/ ./
RUN npm run build            # writes /app/client/dist

# ---------- Stage 2: the image that actually runs ----------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package*.json ./
# --omit=dev keeps jest, supertest, oxlint etc. out of the production image
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY server/ ./

# app.js serves path.join(__dirname, '..', '..', 'client', 'dist').
# From /app/server/src that resolves to /app/client/dist, so copy it exactly there.
COPY --from=client-build /app/client/dist /app/client/dist

# Run as the unprivileged "node" user (never as root) and make sure it can write
# to the uploads folder.  NOTE: on Render's free plan this disk is temporary,
# so uploaded photos are lost on every redeploy/restart (see docs/DEPLOYMENT.md).
RUN mkdir -p /app/server/uploads && chown -R node:node /app
USER node

# Render injects PORT at runtime and server/src/config.js reads process.env.PORT.
# EXPOSE is documentation only; it does not force the port.
EXPOSE 5000
CMD ["node", "src/index.js"]
