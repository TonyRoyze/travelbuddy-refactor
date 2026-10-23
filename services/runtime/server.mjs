import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT ?? 8080);
const services = [
  spawn("node_modules/.bin/tsx", ["services/profile-media/server.ts"], {
    stdio: "inherit",
  }),
  spawn("node_modules/.bin/tsx", ["services/payments/server.ts"], {
    stdio: "inherit",
  }),
];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of services) child.kill("SIGTERM");
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 5000).unref();
}

for (const child of services) {
  child.on("error", (error) => {
    console.error("Could not start an application service.", error);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }

  const upstreamPort = path.startsWith("/profile-media/")
    ? 5174
    : path.startsWith("/payments-api/")
      ? 5175
      : undefined;
  if (upstreamPort) {
    const proxy = httpRequest(
      { hostname: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: req.headers },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("Application service unavailable");
    });
    req.pipe(proxy);
    return;
  }

  let filePath = normalize(join(root, decodeURIComponent(path)));
  if (!filePath.startsWith(`${root}/`) && filePath !== root) {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory())
    filePath = join(filePath, "index.html");
  if (!existsSync(filePath) || !statSync(filePath).isFile())
    filePath = join(root, "index.html");
  res.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "application/octet-stream",
  );
  createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () =>
  console.log(`TravelBuddy listening on ${port}.`),
);
