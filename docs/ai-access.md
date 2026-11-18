# Letting an AI assistant work on the site

The Gin Cabinet can be updated by an AI assistant such as Claude. It can add
gins and distilleries, record bottles and levels, upload photos, and write
recipes and articles. It uses an **API key** that you create and can revoke
at any time.

## What a key can and can't do

A key acts as the admin who created it, with three limits:

| | |
| --- | --- |
| **Nothing goes live by itself** | New gins and tonics stay private. Articles, reviews, recipes and guide pages stay drafts. A key can't publish, schedule or make anything public, and it can't add a quick review to something already on the site (quick reviews have no draft stage). You publish in the admin. |
| **Person-only areas** | Accounts and people, passwords, 2FA, recovery codes, trusted browsers and API keys always need a person signed in. |
| **Everything is logged** | Every change appears in the audit log with "via API key: *name*". |

Edits to things that are already public still go live straight away, just
as they do when you edit them yourself.

## Creating a key

1. Admin → **Settings** → **API keys** (admins only).
2. Give it a name (e.g. "Claude") and choose how long it works (30 days to
   1 year).
3. Press **Create API key**. The key starts with `gck_` and is shown **once**:
   copy it into your password manager or straight into the app that will use
   it.

Only a fingerprint (SHA-256 hash) of the key is stored, so the database and
its backups never contain a usable key. **Revoke** stops a key at once.

## Connecting Claude (MCP)

MCP (Model Context Protocol) is the standard way to give Claude tools. The
site's MCP server is at:

```
https://thegincabinet.com/api/v1/mcp
```

It offers these tools:

| Tool | What it does |
| --- | --- |
| `site_guide` | The rules above and how common jobs are done. |
| `list_endpoints` | Every API call, filtered by a word ("gin", "bottle", "blog"…). |
| `describe_endpoint` | The fields one call takes and returns. |
| `call_api` | Make a call, as the key. Every rule applies. |
| `upload_image_from_url` | Fetch a photo from an https address into the media library. |
| `upload_image` | Add a photo sent as base64 text. |

**Claude Code** (the command line):

```bash
claude mcp add --transport http gin-cabinet https://thegincabinet.com/api/v1/mcp \
  --header "Authorization: Bearer gck_YOUR_KEY"
```

**Claude app** (claude.ai, desktop or phone): Settings → Connectors → *Add
custom connector*. Use the address **with the key in it**, which the API keys
page shows next to the new key:

```
https://thegincabinet.com/api/v1/mcp/k/gck_YOUR_KEY
```

Treat that address like a password. The API hides keys in its access log
(they appear as `gck_…`), but anyone who sees the full address can use the
key until you revoke it.

**Without MCP** (scripts, other tools): send the key as a header to any admin
call:

```bash
curl -H "Authorization: Bearer gck_YOUR_KEY" https://thegincabinet.com/api/v1/admin/gins
```

## How it's built

* `apps/api/app/models/auth.py` (`ApiKey`) and `services/api_keys.py`: the
  keys (migration 0025).
* `apps/api/app/api/deps.py`: the sign-in check. A `Bearer gck_…` header
  makes the request act as the key's admin. `CurrentPerson…` refuses keys;
  `forbid_key_publishing()` guards each place where something goes public.
* `apps/api/app/api/routes/admin_api_keys.py`: create, list, revoke.
* `apps/api/app/mcp_gateway.py`: the MCP server, inside the API. Its tools
  call the API in-process with the same key, so there is no way around the
  rules. The photo-from-URL tool only fetches https addresses on the public
  internet (not the server's own network), up to 15 MB.
* `apps/web/app/juniper/settings/ApiKeysPanel.tsx`: the Settings tab.
