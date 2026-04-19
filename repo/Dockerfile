# Shared multi-target Dockerfile for ClinicOps.
#
# Build the backend image:   docker build --target backend -t clinicops-backend .
# Build the frontend image:  docker build --target frontend -t clinicops-frontend .
#
# docker-compose.yml uses `target: backend` / `target: frontend` to select a stage.

FROM node:20-alpine AS backend
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install
COPY backend/src ./src
COPY backend/tests ./tests
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["npm", "start"]

FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src ./src
COPY frontend/tests ./tests
ENV API_PROXY=http://backend:4000
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
