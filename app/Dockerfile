FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
ENV NODE_OPTIONS="--max-old-space-size=2048"
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=80
COPY --from=build /app/.output ./.output
EXPOSE 80
CMD ["node", ".output/server/index.mjs"]
