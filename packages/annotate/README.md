# @on-panda/annotate

A local server for annotating a directory of panda JSON files with the onPanda dialog editor. The sidebar lists files and provides **Next**, **Delete**, and **Save** controls. Saving or deleting a file moves its previous contents into a backup directory.

## Usage

```bash
npx @on-panda/annotate --web_config config.json5 --dir .
```

Open `http://localhost:8000/on-panda-annotate/`. The server listens on `0.0.0.0`, so it is also accessible through the host's network address.

The server has no user authentication. Because it listens on all interfaces and exposes write endpoints, run it only on a trusted network or behind an access-controlled reverse proxy.

| Option | Default | Meaning |
| --- | --- | --- |
| `--dir` | Current working directory | Directory containing the panda JSON files. |
| `--web_config` | Omitted | JSON5 configuration file. When omitted, the config endpoint returns `{}`. |
| `--port` | `8000` | HTTP port. |
| `--project_name` | Name of `--dir` | Project name shown at the top of the sidebar and returned by `get_json_list`. |
| `--help`, `-h` | | Print usage and exit. |

Relative paths for both `--dir` and `--web_config` are resolved against the working directory where the command is run. For example, to use the current directory with the default UI configuration on another port:

```bash
# prepare and cd to the dir of panda_jsons
npx @on-panda/annotate --port 8080
```

Opening the page to annotate.

- Clicking a file or **Next** loads it without saving the current edits.
- **Save** writes the current panda JSON, including its cache, and loads the next file. On the last file, it saves and stays there. Saved files remain in the list.
- **Delete** moves the current file to its backup directory and loads the next file. Deleting the last file selects the previous one if any remain.

## Web configuration

The configuration uses the parameter names from `DialogWithControlStateClosure`. For example, `web_config.json5` can contain apiConfigs:

```json
{
  "apiConfigs": [
    {
      "endpoint_name": "my-api",
      "client_config": {
        "base_url": "https://example.com/v1",
        "api_key": "YOUR_API_KEY",
      },
      "chat_config": {
        "model": "your-model-name",
        "top_logprobs": 20,
      },
    },
  ],
}
```

## HTTP API

The UI uses `/on-panda-annotate/` as the API prefix. For example, `get_json_list` is available at `/on-panda-annotate/get_json_list`. The same endpoints are also available at the origin root, such as `/get_json_list`.


| Method | Endpoint | Request body | Success response |
| --- | --- | --- | --- |
| GET / POST | `web_config.json5` | None | The parsed configuration itself, without a `data` wrapper. Both methods read the configuration; POST does not modify it. |
| POST | `get_json_list` | None | `{"project_name":"my-data","data":[{"id":"xxxx/xx.panda.json"}]}` |
| POST | `load_panda_json` | `{"id":"xxxx/xx.panda.json"}` | The panda JSON itself, without a `data` wrapper. |
| POST | `delete_panda_json` | `{"id":"xxxx/xx.panda.json"}` | `{"data":{"id":"xxxx/xx.panda.json"}}` |
| POST | `save_panda_json` | `{"id":"xxxx/xx.panda.json","data":{...}}` | `{"data":{"id":"xxxx/xx.panda.json"}}` |

For `save_panda_json`, `data` contains the complete panda JSON to write. The UI sends `{ id, data }`.


## File operations and backups

`get_json_list` scans `--dir` recursively on each request, collects regular files matching `*.panda*.json`. Directories named `panda_json_bin` are skipped, so backup files are not listed.

Deleting moves the file into a `panda_json_bin` directory beside it. The final `.json` is replaced with `.t<timestamp>.bin.panda.json`. For example:

```text
xxxx/xx.panda.json
  → xxxx/panda_json_bin/xx.panda.t2026-09-16-01_58_27.bin.panda.json
```

Saving an existing ID first moves the old file through the same backup operation, then writes the new JSON at the original path. To restore one, move it back to its original directory and filename. There is no restore endpoint.
