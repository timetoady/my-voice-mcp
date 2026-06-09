FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package.json
COPY tsconfig.json tsconfig.json
RUN npm install --no-audit --no-fund
COPY src src
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist dist
EXPOSE 3000
CMD ["node", "dist/index.js", "http"]
