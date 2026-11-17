// Preload before application imports so node:http ESM bindings are instrumented.
import { createRequire, syncBuiltinESMExports } from "node:module";
const require = createRequire(import.meta.url);
let sdk;
if (
  process.env.OTEL_ENABLED === "true" &&
  process.env.OTEL_SDK_DISABLED !== "true"
) {
  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const {
    HttpInstrumentation,
  } = require("@opentelemetry/instrumentation-http");
  const {
    RuntimeNodeInstrumentation,
  } = require("@opentelemetry/instrumentation-runtime-node");
  const {
    PeriodicExportingMetricReader,
  } = require("@opentelemetry/sdk-metrics");
  const {
    OTLPMetricExporter,
  } = require("@opentelemetry/exporter-metrics-otlp-proto");
  process.env.OTEL_SERVICE_NAME ||= "travelbuddy-web";
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ||= "http/protobuf";
  process.env.OTEL_LOGS_EXPORTER ||= "none";
  const probes = new Set([
    "/healthz",
    "/livez",
    "/readyz",
    "/profile-media/health",
    "/payments-api/health",
  ]);
  sdk = new NodeSDK({
    metricReaders:
      process.env.OTEL_METRICS_EXPORTER === "none"
        ? []
        : [
            new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter(),
              exportIntervalMillis: Number(
                process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10000,
              ),
            }),
          ],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          probes.has((req.url ?? "").split("?")[0]),
        ignoreOutgoingRequestHook: (req) =>
          probes.has((req.path ?? "").split("?")[0]),
        // Avoid exporting query strings (which can contain tokens) or user IDs in URLs.
        responseHook: (span) => {
          span.setAttribute("http.url", "[redacted]");
          span.setAttribute("http.target", "[redacted]");
          span.setAttribute("url.full", "[redacted]");
          span.setAttribute("url.path", "[redacted]");
          span.setAttribute("url.query", "[redacted]");
        },
      }),
      new RuntimeNodeInstrumentation(),
    ],
  });
  sdk.start();
  require("node:http");
  require("node:https");
  syncBuiltinESMExports();
  // Let each service drain its own HTTP server, then flush on natural exit.
  process.once("beforeExit", () => void shutdownTelemetry());
}
let shutdown;
export function shutdownTelemetry() {
  return (shutdown ??=
    sdk?.shutdown().catch((error) => {
      console.error("Telemetry shutdown failed", error.message);
    }) ?? Promise.resolve());
}
