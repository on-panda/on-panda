import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "../../");
  const env = loadEnv(mode, envDir, "");
  const defaultCustom = path.resolve(envDir, "src/utils/defaultCustom.js");
  const customModulePath = env.CORE_IMPORT_CUSTOM_CODE;
  const resolvedCustomModule = customModulePath
    ? (path.isAbsolute(customModulePath)
      ? customModulePath
      : path.resolve(envDir, customModulePath))
    : defaultCustom;
  return {
    envDir,
    resolve: {
      alias: {
        "./utils/defaultCustom.js": resolvedCustomModule,
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
    publicDir: "../../public",
    build: {
      lib: {
        entry: "../../src/index.core.js",
        name: "OnPandaCore",
        formats: ["es"],
        fileName: () => "on-panda-core.es.js",
      },
      rollupOptions: {
        external: [
          "@element-plus/icons-vue",
          "@mdit/plugin-katex",
          /^@modelcontextprotocol\/sdk(?:\/.*)?$/,
          "axios",
          "element-plus",
          /^highlight\.js(?:\/.*)?$/,
          "json5",
          "katex",
          "lz-string",
          "markdown-it",
          "markdown-it-code-copy",
          "openai",
          "pinia",
          "vue",
          "vue-i18n",
          "wavesurfer.js",
        ],
      },
    },
  };
});
