FROM node:22-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --chown=app:app package.json package-lock.json /app/
RUN npm ci

COPY --chown=app:app . /app

# Weights stay out of git. This build step downloads the pinned 1.7.0 bundle
# onto the image, and Next serves it from this origin. Coolify runs the same
# Dockerfile, so there is no manual copy on the live app.
RUN node scripts/fetch-background-removal-assets.mjs
# Separate from the removal weights. Copies the pinned MediaPipe WASM and
# downloads the pinned Face Landmarker task file onto this origin.
RUN node scripts/fetch-face-check-assets.mjs
RUN npm run build && chown -R app:app /app

EXPOSE 3000

USER app
