FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG FREEBIN_GIT_COMMIT
ENV FREEBIN_GIT_COMMIT=$FREEBIN_GIT_COMMIT
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
RUN mkdir /data && chown -R node:node /data /app
USER node
EXPOSE 8787
CMD ["node", "scripts/start-local.mjs"]
