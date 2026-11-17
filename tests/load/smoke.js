import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m", target: Number(__ENV.VUS || 20) },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};
const base = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
export default function () {
  const response = http.get(`${base}/`, { tags: { name: "homepage" } });
  check(response, { "homepage returns 200": (r) => r.status === 200 });
  sleep(1);
}
