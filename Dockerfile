FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
LABEL io.modelcontextprotocol.server.name="io.github.Cliftonz/tandoor-recipe-mcp"
ENV NODE_ENV=production \
    TANDOOR_MCP_TRANSPORT=http \
    TANDOOR_MCP_HTTP_HOST=0.0.0.0 \
    TANDOOR_MCP_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/build ./build
COPY LICENSE ./
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node","-e","if(process.env.TANDOOR_MCP_TRANSPORT!=='http')process.exit(0);fetch('http://127.0.0.1:'+(process.env.TANDOOR_MCP_HTTP_PORT||3737)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","build/index.js"]
