import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      vue(),
      mode === "analyze" &&
        visualizer({
          open: true,
          gzipSize: true,
          brotliSize: true,
        }),
    ],
    build: {
      lib: {
        entry: "src/index.js",
        name: "OnPanda",
        formats: ["es", "umd"],
        fileName: (format) => `on-panda.${format}.js`,
      },
    },
  };
});
