# sfmc-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for **Salesforce Marketing Cloud (SFMC)**. Connects Claude (and any MCP-compatible AI) to your SFMC instance via both the REST and SOAP APIs.

---

## Features

| Category | Tools |
|---|---|
| **Data Extensions** | List DEs, describe schema, query rows, upsert rows, delete rows, create DE |
| **Email Sends** | List emails, list/start/pause triggered send defs, fire triggered sends, check send job status |
| **Subscribers** | Get subscriber, upsert subscriber, unsubscribe, list lists, add/remove from list, bulk contact upsert |
| **Journey Builder** | List journeys, get journey detail, fire entry events (single & bulk), get run statistics, list event definitions, publish/stop journeys |
| **CloudPages** | List pages, get page detail, create/update page, list microsites, get analytics, list Content Builder folders |

---

## Prerequisites

- Node.js ≥ 18
- An SFMC **Installed Package** with API integration using OAuth 2.0 Client Credentials
- The package needs at minimum: `Email`, `List and Subscribers`, `Data Extensions`, `Journeys`, `Assets` scopes

---

## Setup

### 1. Install dependencies & build

```bash
cd sfmc-mcp
npm install
npm run build
```

### 2. Set environment variables

```bash
export SFMC_CLIENT_ID="your-client-id"
export SFMC_CLIENT_SECRET="your-client-secret"
export SFMC_SUBDOMAIN="mc.s50xxxxxxxxxxxxxxxx"   # your tenant subdomain
export SFMC_ACCOUNT_ID="123456"                  # optional: target MID
```

> **Finding your subdomain:** In SFMC Setup → Platform Tools → Apps → Installed Packages → your package → API Integration. The Authentication Base URI will show `https://<subdomain>.auth.marketingcloudapis.com`.

### 3. Register with Claude Desktop (or any MCP host)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "node",
      "args": ["/absolute/path/to/sfmc-mcp/dist/index.js"],
      "env": {
        "SFMC_CLIENT_ID": "your-client-id",
        "SFMC_CLIENT_SECRET": "your-client-secret",
        "SFMC_SUBDOMAIN": "mc.s50xxxxxxxxxxxxxxxx",
        "SFMC_ACCOUNT_ID": "123456"
      }
    }
  }
}
```

Restart Claude Desktop and the SFMC tools will appear automatically.

---

## Available MCP Tools

### Data Extensions

| Tool | Description |
|---|---|
| `sfmc_list_data_extensions` | List all DEs with name, key, description |
| `sfmc_describe_data_extension` | Get column schema for a DE by external key |
| `sfmc_get_de_rows` | Query rows with optional filtering and pagination |
| `sfmc_upsert_de_rows` | Insert or update rows (uses primary key) |
| `sfmc_delete_de_rows` | Delete rows by primary key values |
| `sfmc_create_data_extension` | Create a new DE with a custom column schema |

### Email Sends & Campaigns

| Tool | Description |
|---|---|
| `sfmc_list_emails` | List HTML email assets from Content Builder |
| `sfmc_list_triggered_send_definitions` | List Triggered Send Definitions |
| `sfmc_fire_triggered_send` | Send transactional emails to one or more subscribers |
| `sfmc_get_send_status` | Get delivery stats for a send job by ID |
| `sfmc_list_send_jobs` | List recent send jobs with delivery metrics |
| `sfmc_update_triggered_send_status` | Start or pause a Triggered Send Definition |

### Subscriber Management

| Tool | Description |
|---|---|
| `sfmc_get_subscriber` | Look up subscriber profile and status |
| `sfmc_upsert_subscriber` | Create or update a subscriber with attributes |
| `sfmc_unsubscribe` | Globally unsubscribe a contact |
| `sfmc_list_subscriber_lists` | List all subscriber lists |
| `sfmc_add_to_list` | Add subscribers to a list |
| `sfmc_remove_from_list` | Remove a subscriber from a list |
| `sfmc_bulk_upsert_contacts` | Bulk upsert up to 100 contacts via Contact Builder |

### Journey Builder

| Tool | Description |
|---|---|
| `sfmc_list_journeys` | List journeys with status and metadata |
| `sfmc_get_journey` | Get full journey definition with activities |
| `sfmc_fire_entry_event` | Inject a single contact into a journey |
| `sfmc_bulk_fire_entry_events` | Inject up to 100 contacts into a journey |
| `sfmc_get_journey_stats` | Get journey population statistics |
| `sfmc_list_event_definitions` | List all Journey Builder event definitions |
| `sfmc_update_journey_status` | Publish or stop a journey |

### CloudPages

| Tool | Description |
|---|---|
| `sfmc_list_cloudpages` | List CloudPages with status and metadata |
| `sfmc_get_cloudpage` | Get full details and content of a CloudPage |
| `sfmc_create_cloudpage` | Create a new CloudPage with HTML content |
| `sfmc_update_cloudpage` | Update the name or HTML content of a page |
| `sfmc_list_microsites` | List microsite collections |
| `sfmc_get_cloudpage_analytics` | Get view analytics for a CloudPage URL |
| `sfmc_list_content_folders` | Browse Content Builder folder structure |

---

## Development

```bash
# Run directly without building (uses tsx)
npm run dev

# Build TypeScript
npm run build

# Start compiled version
npm start
```

---

## Architecture

```
src/
├── index.ts           # MCP server entry point, wires everything together
├── auth.ts            # OAuth 2.0 Client Credentials with auto token refresh
├── rest-client.ts     # Generic SFMC REST API client
├── soap-client.ts     # SFMC SOAP API client with XML building/parsing
└── tools/
    ├── data-extensions.ts
    ├── email-sends.ts
    ├── subscribers.ts
    ├── journeys.ts
    └── cloudpages.ts
```

## Required SFMC API Scopes

When creating your Installed Package, ensure these scopes are granted:

- **Email**: Read, Write, Send
- **List and Subscribers**: Read, Write
- **Data Extensions**: Read, Write
- **Journeys**: Read, Write, Execute
- **Assets**: Read, Write, Publish

---

## License

MIT
