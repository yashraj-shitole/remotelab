FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/relay/package.json packages/relay/package.json
RUN npm ci --workspaces --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/relay packages/relay
RUN npm run build -w packages/shared && npm run build -w packages/relay

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/relay packages/relay
EXPOSE 8787
CMD ["node", "packages/relay/dist/server.js"]
