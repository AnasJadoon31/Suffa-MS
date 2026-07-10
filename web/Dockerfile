FROM node:20-alpine AS build
WORKDIR /web
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must
# arrive as a build arg — a runtime env var only reaches server-side code.
ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p public
RUN npm run build

FROM node:20-alpine
WORKDIR /web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# output: "standalone" (next.config.mjs) traces only the deps actually used at
# runtime into .next/standalone, so this image skips the full node_modules
# (~500MB) the non-standalone build would otherwise ship.
COPY --from=build /web/.next/standalone ./
COPY --from=build /web/.next/static ./.next/static
COPY --from=build /web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
