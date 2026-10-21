import { spawn } from "node:child_process";
const children = [
  spawn("pnpm", ["exec", "vite", "--host", "0.0.0.0"], { stdio: "inherit" }),
  spawn("pnpm", ["media:serve"], { stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill("SIGTERM"));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) =>
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  }),
);
