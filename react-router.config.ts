import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  future: {},
  prerender: async () => [],
  presets: [vercelPreset()],
  ssr: true,
} satisfies Config;
