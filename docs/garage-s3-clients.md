# Connecting rclone and an ElysiaJS backend to Garage S3

This guide matches the `garage.toml` and `docker-compose.yml` in this repo (Garage `v2.4.1`, single node).

## 1. Connection parameters

| Setting | Value | Source |
|---|---|---|
| Endpoint (from your machine) | `http://localhost:3900` | compose `ports: 3900-3904` |
| Endpoint (from a container on the compose network) | `http://garage:3900` | compose service name `garage` |
| Region | `garage` | `[s3_api] s3_region` |
| Addressing | **path-style** (`http://host:3900/<bucket>/<key>`) | see note below |
| Credentials | Garage access key ID (`GK...`) + secret key | `garage key create` |

> Path-style is required. Virtual-hosted style (`<bucket>.s3.garage.localhost`) only works if you set up wildcard DNS, and this repo does not.

Do not use the admin port `3903` or the web port `3902` for S3 traffic.

## 2. Create a bucket and an access key

Run these from the repo directory. The stack must be up (`docker compose up -d`) and the layout must already be applied.

```bash
alias garage='docker compose exec garage /garage'

garage bucket create ticket-jobs-attachment-files
garage key create mes-system-s3-bucket
garage bucket allow --read --write ticket-jobs-attachment-files --key mes-system-s3-bucket

# Check the grant: the key must be listed with "RW"
garage bucket info ticket-jobs-attachment-files

# Show the key ID and the secret
garage key info mes-system-s3-bucket --show-secret
```

Put the credentials in a `.env` file that is **git-ignored**. Never put them in this doc:

```dotenv
S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_BUCKET=ticket-jobs-attachment-files
S3_ACCESS_KEY_ID=GK...
S3_SECRET_ACCESS_KEY=...
```

Add `--owner` to `bucket allow` only if the client must delete the bucket or change its website config.

## 3. rclone

### Option A: config file

Run `rclone config file` to find your config path, then add:

```ini
[garage]
type = s3
provider = Other
access_key_id = GK...
secret_access_key = ...
endpoint = http://localhost:3900
region = garage
force_path_style = true
acl = private
no_check_bucket = true
```

### Option B: environment variables only (nothing is written to disk)

```bash
export RCLONE_CONFIG_GARAGE_TYPE=s3
export RCLONE_CONFIG_GARAGE_PROVIDER=Other
export RCLONE_CONFIG_GARAGE_ENDPOINT=http://localhost:3900
export RCLONE_CONFIG_GARAGE_REGION=garage
export RCLONE_CONFIG_GARAGE_FORCE_PATH_STYLE=true
export RCLONE_CONFIG_GARAGE_ACL=private
export RCLONE_CONFIG_GARAGE_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_GARAGE_ACCESS_KEY_ID=GK...
export RCLONE_CONFIG_GARAGE_SECRET_ACCESS_KEY=...
```

### Test it

```bash
rclone lsd garage:                                   # lists buckets the key can see
echo hello > /tmp/hello.txt
rclone copy /tmp/hello.txt garage:ticket-jobs-attachment-files/test/
rclone ls  garage:ticket-jobs-attachment-files/test/  # "6 hello.txt"
rclone cat garage:ticket-jobs-attachment-files/test/hello.txt
rclone delete garage:ticket-jobs-attachment-files/test/
```

Other useful commands: `rclone sync ./local garage:<bucket>/path` and `rclone mount garage:<bucket> ~/mnt` (mount needs macFUSE on macOS).

## 4. ElysiaJS (Bun)

Bun has a built-in S3 client (`Bun.S3Client`), so you don't need to install another package:

```bash
bun create elysia my-api && cd my-api   # or use an existing Elysia project
```

`src/s3.ts`:

```ts
import { S3Client } from "bun";

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,          // http://localhost:3900 or http://garage:3900
  region: process.env.S3_REGION ?? "garage",
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  virtualHostedStyle: false,                  // path-style (the default)
});
```

`src/index.ts`:

```ts
import { Elysia, t } from "elysia";
import { s3 } from "./s3";

new Elysia()
  // Upload: the raw request body becomes the object
  .put("/files/*", async ({ params, request }) => {
    const key = params["*"];
    await s3.write(key, await request.arrayBuffer(), {
      type: request.headers.get("content-type") ?? "application/octet-stream",
    });
    return { key };
  })
  // Download: streams the object back through the backend
  .get("/files/*", async ({ params, set }) => {
    const file = s3.file(params["*"]);
    if (!(await file.exists())) return (set.status = 404), "Not found";
    return new Response(file.stream(), { headers: { "content-type": file.type } });
  })
  // Presigned GET URL: lets a client download straight from Garage
  .get("/url/*", ({ params, query }) => ({
    url: s3.presign(params["*"], { expiresIn: query.expiresIn ?? 3600 }),
  }), { query: t.Object({ expiresIn: t.Optional(t.Numeric()) }) })
  .delete("/files/*", async ({ params }) => {
    await s3.delete(params["*"]);
    return { deleted: params["*"] };
  })
  .listen(3000);
```

Run it and test (Bun loads `.env` automatically):

```bash
bun run src/index.ts
curl -X PUT --data-binary @/tmp/hello.txt -H 'content-type: text/plain' localhost:3000/files/test/hello.txt
curl localhost:3000/files/test/hello.txt             # hello
curl -s "$(curl -s localhost:3000/url/test/hello.txt | jq -r .url)"   # hello, served directly by Garage
curl -X DELETE localhost:3000/files/test/hello.txt
```

For multipart form uploads, use `body: t.Object({ file: t.File() })` and pass the file to `s3.write(key, body.file)`.

### Not using Bun? AWS SDK v3

```ts
import { S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "garage",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
```

## 5. The MES backend's own file routes

The backend exposes two routes beside the GraphQL endpoint. Both require a
valid `Authorization: Bearer <session token>` — the same check
`GET /api/v1/exports/:id` uses — and both stream bytes through the backend, so
the browser never sees a storage credential.

| Route | Purpose |
|---|---|
| `POST /api/v1/files` | Multipart bulk upload. Many files in one request, each validated before it is written |
| `GET /api/v1/files/<key>` | Streaming download, inline by default and `?download=1` for `Content-Disposition: attachment` |

Key layout: `tasks/<taskId>/<uuid>-<sanitized filename>`, with the key stored in
the attachment row's `url` (see `backend/src/storage/s3.ts`).

```bash
# Upload several files at once (the response reports each file's outcome)
curl -X POST http://localhost:3001/api/v1/files \
  -H "Authorization: Bearer $TOKEN" \
  -F "taskId=<task-uuid>" \
  -F "files=@photo.png" \
  -F "files=@report.pdf" \
  -F "files=@sheet.xlsx"

# Stream one back for inline display
curl http://localhost:3001/api/v1/files/tasks/<task-uuid>/<key> \
  -H "Authorization: Bearer $TOKEN"

# ...or force a download
curl "http://localhost:3001/api/v1/files/tasks/<task-uuid>/<key>?download=1" \
  -H "Authorization: Bearer $TOKEN"
```

Accepted formats are wide — images, video, audio, PDF, Office
(`docx`/`xlsx`/`pptx`/`doc`/`xls`/`ppt`), text/CSV/Markdown/JSON and archives
— and office documents are download-only (nothing converts them server-side).
Rejected per file: an executable extension (`exe dll bat cmd sh msi scr com`
and similar), a declared MIME type that disagrees with the file's extension, a
file over `MES_UPLOAD_MAX_FILE_BYTES` (default 25 MB), a zero-byte file, and a
request carrying more than `MES_UPLOAD_MAX_FILES_PER_REQUEST` files (default
20).

**No presigned browser uploads.** The presign caveat above still applies, and
`POST /api/v1/files` must reference the ticket the files belong to, which a
client-side key cannot be trusted to invent.

**Range requests.** `GET /api/v1/files/<key>` forwards a `Range` header to the
store so video can be seeked. If Garage declines the range, media still plays —
it just buffers from the start.

## 6. Which endpoint to use

- **Backend runs on your machine** (`bun run`): use `S3_ENDPOINT=http://localhost:3900`.
- **Backend runs in Docker**: add it to this compose file, or attach it to the same network (`docker network ls`, then `networks: [garagehq_default]` with `external: true`). Then use `S3_ENDPOINT=http://garage:3900`.
- **Presigned URLs**: the URL contains the endpoint host it was signed with. A URL signed for `garage:3900` cannot be opened from a browser on your machine. Sign with an endpoint the client can reach. Each hostname gives a different signature, so you cannot change the host in the URL afterwards.

## 7. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `SignatureDoesNotMatch` / `AuthorizationHeaderMalformed` | Region is not `garage` (often the default `us-east-1`) | Set `region = garage` / `S3_REGION=garage` |
| DNS error for `ticket-jobs-attachment-files.localhost` or similar | Client uses virtual-hosted style | rclone: `force_path_style = true`. Bun: `virtualHostedStyle: false`. AWS SDK: `forcePathStyle: true` |
| `AccessDenied` / `403` | Key has no grant on the bucket | `garage bucket allow --read --write <bucket> --key <key>` |
| `InvalidAccessKeyId` | Wrong or deleted key ID | `garage key list` |
| `connection refused` on `garage:3900` | Client is outside the compose network | Use `localhost:3900` instead, or join the network (section 5) |
| `connection refused` on `localhost:3900` | Stack is down | `docker compose ps`, `docker compose logs garage` |
| rclone `BucketAlreadyExists` / 403 on copy | rclone tries to create the bucket | `no_check_bucket = true` |

> **Security note:** `garage.toml` stores `rpc_secret`, `admin_token` and `metrics_token` in plain text, and `docker-compose.yml` repeats the admin token. Do not commit these files to a public repo. If they were ever exposed, rotate the values with `openssl rand -hex 32`.
