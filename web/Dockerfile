FROM node:20-alpine AS build
WORKDIR /web
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
