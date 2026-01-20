import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = process.cwd();
  const env = loadEnv(mode, envDir, "");
  const defaultCustom = path.resolve(envDir, "src/utils/defaultCustom.js");
  const customModulePath = env.MAIN_IMPORT_CUSTOM_CODE;
  const resolvedCustomModule = customModulePath
    ? (path.isAbsolute(customModulePath)
      ? customModulePath
      : path.resolve(envDir, customModulePath))
    : defaultCustom;
  return {
    envDir,
    resolve: {
      alias: {
        "@custom": resolvedCustomModule,
      },
    },
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
