# @on-panda/serve

A production server for the onPanda web application. It serves the same Vite production build as `pnpm preview`, including the server proxy middleware.

## Usage

```bash
npx @on-panda/serve --port 8080 --web_config config.json5
```

Open `http://localhost:8080/`. The server listens on `0.0.0.0`, so it is also accessible through the host's network address.

| Option | Default | Meaning |
| --- | --- | --- |
| `--web_config` | Omitted | JSON5 configuration file loaded by the web UI. When omitted, the config endpoint returns `{}`. |
| `--port` | `4173` | HTTP port. |
| `--help`, `-h` | | Print usage and exit. |

Relative paths for `--web_config` are resolved against the working directory where the command is run.

The server has no authentication. The web configuration is returned to browser clients, so its values should be treated as public.
