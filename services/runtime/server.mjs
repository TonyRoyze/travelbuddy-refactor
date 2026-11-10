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
// Missing APNs configuration disables push without stopping the web service.
const pushWorker = spawn("node_modules/.bin/tsx", ["services/push/worker.ts"], {
  stdio: "inherit",
});
pushWorker.on("error", () =>
  console.error("Could not start the iPhone push worker."),
);
let stopping = false;
pushWorker.on("exit", (code) => {
  if (!stopping && code !== 0) stop(1);
});

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [...services, pushWorker]) child.kill("SIGTERM");
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 40000).unref();
}

function probe(port, path) {
  return new Promise((resolve) => {
    const request = httpRequest(
      { hostname: "127.0.0.1", port, path, method: "GET" },
      (response) => {
        response.resume();
        resolve(
          (response.statusCode ?? 500) >= 200 &&
            (response.statusCode ?? 500) < 300,
        );
      },
    );
    request.setTimeout(1000, () => request.destroy());
    request.on("error", () => resolve(false));
  });
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

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/livez" || path === "/healthz") {
    res
      .writeHead(stopping ? 503 : 200, { "content-type": "text/plain" })
      .end(stopping ? "stopping" : "ok");
    return;
  }
  if (path === "/readyz") {
    const ready =
      !stopping &&
      (await Promise.all([
        probe(5174, "/profile-media/health"),
        probe(5175, "/payments-api/health"),
      ]).then((results) => results.every(Boolean)));
    res
      .writeHead(ready ? 200 : 503, { "content-type": "text/plain" })
      .end(ready ? "ready" : "starting");
    return;
  }

  const upstreamPort = path.startsWith("/profile-media/")
    ? 5174
    : path.startsWith("/payments-api/")
      ? 5175
      : undefined;
  if (upstreamPort) {
    const proxy = httpRequest(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.setTimeout(55000, () =>
      proxy.destroy(new Error("Upstream timed out")),
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("Application service unavailable");
    });
    req.pipe(proxy);
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  let filePath = normalize(join(root, decodedPath));
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
