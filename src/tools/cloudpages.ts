/**
 * CloudPages tools for SFMC MCP
 * Uses the Content Builder Asset API (assetType = webpage / codesnippetblock)
 * and the MobilePush/CloudPages collection endpoints.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SFMCRestClient } from "../rest-client.js";
import { SFMCSoapClient } from "../soap-client.js";

/** Asset type IDs for CloudPages content */
const ASSET_TYPES = {
  webpage: 205,      // CloudPage / Landing Page
  microsite: 106,    // Microsite collection
  codesnippet: 220,  // Code Snippet block
} as const;

export function registerCloudPageTools(
  server: McpServer,
  rest: SFMCRestClient,
  _soap: SFMCSoapClient
): void {
  // ─── List CloudPages ───────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_cloudpages",
    "List CloudPages (landing pages) in Content Builder with their URLs and status.",
    {
      page: z.number().int().min(1).default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(50).default(20).describe("Results per page"),
      nameSearch: z.string().optional().describe("Optional partial name search"),
      status: z
        .enum(["active", "draft"])
        .optional()
        .describe("Filter by publish status"),
    },
    async ({ page, pageSize, nameSearch, status }) => {
      const filterParts = [`assetType.id eq ${ASSET_TYPES.webpage}`];
      if (nameSearch) filterParts.push(`name like '%25${nameSearch}%25'`);
      if (status === "active") filterParts.push("status.id eq 1");
      if (status === "draft") filterParts.push("status.id eq 4");

      const params: Record<string, string> = {
        $page: String(page),
        $pagesize: String(pageSize),
        $orderBy: "modifiedDate DESC",
        "$filter": filterParts.join(" and "),
      };

      const data = await rest.get<{
        count: number;
        page: number;
        pageSize: number;
        items: Array<{
          id: number;
          customerKey: string;
          name: string;
          description: string;
          status: { id: number; name: string };
          publishedDate: string;
          modifiedDate: string;
          createdDate: string;
          views: number;
          slots?: Record<string, unknown>;
        }>;
      }>("/asset/v1/content/assets", params);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Get CloudPage Detail ──────────────────────────────────────────────────
  server.tool(
    "sfmc_get_cloudpage",
    "Get the full details and content of a specific CloudPage by its asset ID.",
    {
      assetId: z.number().int().describe("Numeric asset ID of the CloudPage"),
    },
    async ({ assetId }) => {
      const data = await rest.get<Record<string, unknown>>(
        `/asset/v1/content/assets/${assetId}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Create CloudPage ──────────────────────────────────────────────────────
  server.tool(
    "sfmc_create_cloudpage",
    "Create a new CloudPage (landing page) in Content Builder.",
    {
      name: z.string().describe("Name for the CloudPage"),
      description: z.string().optional().describe("Optional description"),
      htmlContent: z.string().describe("Full HTML content for the page"),
      categoryId: z
        .number()
        .int()
        .optional()
        .describe("Content Builder folder/category ID to place the page in"),
    },
    async ({ name, description, htmlContent, categoryId }) => {
      const payload: Record<string, unknown> = {
        name,
        assetType: { id: ASSET_TYPES.webpage, name: "webpage" },
        views: {
          html: {
            content: htmlContent,
          },
        },
      };

      if (description) payload.description = description;
      if (categoryId) payload.category = { id: categoryId };

      const result = await rest.post<{ id: number; customerKey: string; name: string }>(
        "/asset/v1/content/assets",
        payload
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── Update CloudPage Content ──────────────────────────────────────────────
  server.tool(
    "sfmc_update_cloudpage",
    "Update the HTML content or name of an existing CloudPage.",
    {
      assetId: z.number().int().describe("Numeric asset ID of the CloudPage to update"),
      name: z.string().optional().describe("New name for the page"),
      htmlContent: z.string().optional().describe("New HTML content"),
    },
    async ({ assetId, name, htmlContent }) => {
      const payload: Record<string, unknown> = {};
      if (name) payload.name = name;
      if (htmlContent) {
        payload.views = { html: { content: htmlContent } };
      }

      const result = await rest.patch<{ id: number; name: string; modifiedDate: string }>(
        `/asset/v1/content/assets/${assetId}`,
        payload
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── List Microsites ───────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_microsites",
    "List microsite collections in Content Builder.",
    {
      page: z.number().int().min(1).default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(50).default(20).describe("Results per page"),
    },
    async ({ page, pageSize }) => {
      const data = await rest.get<{
        count: number;
        page: number;
        pageSize: number;
        items: Array<{
          id: number;
          name: string;
          customerKey: string;
          modifiedDate: string;
        }>;
      }>("/asset/v1/content/assets", {
        $page: String(page),
        $pagesize: String(pageSize),
        "$filter": `assetType.id eq ${ASSET_TYPES.microsite}`,
        $orderBy: "modifiedDate DESC",
      });

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Get CloudPage Analytics ───────────────────────────────────────────────
  server.tool(
    "sfmc_get_cloudpage_analytics",
    "Get view/engagement analytics for a CloudPage using the Tracking REST API.",
    {
      pageUrl: z
        .string()
        .url()
        .describe("The public URL of the CloudPage to retrieve analytics for"),
    },
    async ({ pageUrl }) => {
      // CloudPages analytics via the tracking/page endpoint
      const result = await rest.get<Record<string, unknown>>(
        "/hub/v1/pageviews/url",
        { url: encodeURIComponent(pageUrl) }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── List Content Builder Folders ─────────────────────────────────────────
  server.tool(
    "sfmc_list_content_folders",
    "List Content Builder category folders to find the right location for pages.",
    {
      parentId: z
        .number()
        .int()
        .optional()
        .describe("Parent folder ID to list children of (omit for root categories)"),
    },
    async ({ parentId }) => {
      const params: Record<string, string> = {
        $pagesize: "50",
      };
      if (parentId !== undefined) {
        params["$filter"] = `parentId eq ${parentId}`;
      }

      const data = await rest.get<{
        count: number;
        items: Array<{ id: number; name: string; parentId: number; description: string }>;
      }>("/asset/v1/content/categories", params);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
