import { spawnSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "apps/web"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWMIND_STATIC_EXPORT: "true",
      NEXT_PUBLIC_API_URL: "",
      NEXT_PUBLIC_WS_URL: "",
    },
  },
);
if (result.status) process.exit(result.status);
await rm("dist", { recursive: true, force: true });
await cp("apps/web/out", "dist", { recursive: true });
