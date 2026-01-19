import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { visualizer } from "rollup-plugin-visualizer";

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
    publicDir: "../../public",
    build: {
      lib: {
        entry: "../../src/index.js",
        name: "OnPandaCore",
        formats: ["es"],
        fileName: () => "on-panda-core.es.js",
      },
      rollupOptions: {
        external: [
          "vue",
          "pinia",
          "element-plus",
          "axios",
          "markdown-it",
          "markdown-it-code-copy",
          "highlight.js",
          "katex",
          "lz-string",
          "json5",
          "openai",
          "vue-i18n",
          "wavesurfer.js",
          /^@element-plus\//,
          /^@mdit\//,
          /^highlight\.js\//,
        ],
      },
    },
  };
});
