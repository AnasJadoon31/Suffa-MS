FROM node:20-alpine AS build
WORKDIR /web
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must
# arrive as a build arg — a runtime env var only reaches server-side code.
ARG NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /web
ENV NODE_ENV=production
COPY --from=build /web/.next ./.next
COPY --from=build /web/node_modules ./node_modules
COPY --from=build /web/package.json ./package.json
COPY --from=build /web/public ./public
EXPOSE 3000
CMD ["npm", "start"]
