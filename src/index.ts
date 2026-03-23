#!/usr/bin/env node
/**
 * SFMC MCP Server — Main Entry Point
 *
 * Exposes Salesforce Marketing Cloud capabilities as MCP tools covering:
 *  - Data Extensions (CRUD)
 *  - Email Sends & Campaigns
 *  - Subscriber Management
 *  - Journey Builder
 *  - CloudPages
 *
 * Required environment variables:
 *   SFMC_CLIENT_ID       — OAuth 2.0 client ID
 *   SFMC_CLIENT_SECRET   — OAuth 2.0 client secret
 *   SFMC_SUBDOMAIN       — Tenant subdomain (e.g. mc.s50xxxxxxxxxxxxxxxx)
 *   SFMC_ACCOUNT_ID      — (optional) Target MID for parent/child BU setups
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SFMCAuth } from "./auth.js";
import { SFMCRestClient } from "./rest-client.js";
import { SFMCSoapClient } from "./soap-client.js";

import { registerDataExtensionTools } from "./tools/data-extensions.js";
import { registerEmailSendTools } from "./tools/email-sends.js";
import { registerSubscriberTools } from "./tools/subscribers.js";
import { registerJourneyTools } from "./tools/journeys.js";
import { registerCloudPageTools } from "./tools/cloudpages.js";

// ─── Validate required env vars ──────────────────────────────────────────────
const requiredEnvVars = ["SFMC_CLIENT_ID", "SFMC_CLIENT_SECRET", "SFMC_SUBDOMAIN"];
const missing = requiredEnvVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(
    `[sfmc-mcp] Missing required environment variables: ${missing.join(", ")}\n` +
    `Please set them before starting the server.\n` +
    `  SFMC_CLIENT_ID      — OAuth2 client ID from SFMC Installed Package\n` +
    `  SFMC_CLIENT_SECRET  — OAuth2 client secret from SFMC Installed Package\n` +
    `  SFMC_SUBDOMAIN      — Your tenant subdomain (e.g. mc.s50xxxxxxxxxxxxxxxx)\n` +
    `  SFMC_ACCOUNT_ID     — (optional) Target MID`
  );
  process.exit(1);
}

// ─── Initialise shared clients ────────────────────────────────────────────────
const auth = new SFMCAuth({
  clientId: process.env.SFMC_CLIENT_ID!,
  clientSecret: process.env.SFMC_CLIENT_SECRET!,
  subdomain: process.env.SFMC_SUBDOMAIN!,
  accountId: process.env.SFMC_ACCOUNT_ID,
});

const rest = new SFMCRestClient(auth);
const soap = new SFMCSoapClient(auth);

// ─── Create MCP server ────────────────────────────────────────────────────────
const server = new McpServer({
  name: "sfmc",
  version: "1.0.0",
});

// ─── Register tool groups ─────────────────────────────────────────────────────
registerDataExtensionTools(server, rest, soap);
registerEmailSendTools(server, rest, soap);
registerSubscriberTools(server, rest, soap);
registerJourneyTools(server, rest, soap);
registerCloudPageTools(server, rest, soap);

// ─── Start transport ──────────────────────────────────────────────────────────
const transport = new StdioServerTransport();

server.connect(transport).then(() => {
  console.error("[sfmc-mcp] Server started. Listening on stdio.");
}).catch((err: unknown) => {
  console.error("[sfmc-mcp] Failed to start:", err);
  process.exit(1);
});
