import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    buckets: {
      uploads: { access: "private" },
      profiles: { access: "private" },
      packages: { access: "private" },
    },
  },
});
