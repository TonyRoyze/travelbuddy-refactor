import { clearTimeout } from "node:timers";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const received = new Set();
const collector = createServer((req, res) => {
  let bytes = 0;
  req.on("data", (chunk) => {
    bytes += chunk.length;
  });
  req.on("end", () => {
    if (bytes) received.add(req.url);
    res.writeHead(200).end();
  });
});
await new Promise((resolve) => collector.listen(0, "127.0.0.1", resolve));
try {
  for (const enabled of ["false", "true"]) {
    received.clear();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "./services/telemetry/register.mjs",
        "--input-type=module",
        "-e",
        `import { createServer, get } from 'node:http';
       import { shutdownTelemetry } from './services/telemetry/register.mjs';
       const server = createServer((req, res) => res.end('ok'));
       await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
       await new Promise((resolve, reject) => {
         get('http://127.0.0.1:' + server.address().port + '/test?token=private', res => {
           res.resume(); res.on('end', resolve);
         }).on('error', reject);
       });
       await new Promise(resolve => server.close(resolve));
       await shutdownTelemetry();`,
      ],
      {
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          OTEL_ENABLED: enabled,
          OTEL_SDK_DISABLED: "false",
          OTEL_TRACES_EXPORTER: "otlp",
          OTEL_METRICS_EXPORTER: "otlp",
          OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", resolve);
    });
    clearTimeout(timer);
    assert.equal(code, 0, output);
    assert.deepEqual(
      [...received].sort(),
      enabled === "true" ? ["/v1/metrics", "/v1/traces"] : [],
    );
  }
  console.log(
    "Telemetry smoke test passed: opt-out is silent; opt-in exports traces and metrics.",
  );
} finally {
  collector.close();
}
