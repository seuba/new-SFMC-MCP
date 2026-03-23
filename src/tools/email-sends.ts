/**
 * Email Sends & Campaigns tools for SFMC MCP
 * Covers: list emails, triggered sends, fire sends, schedule sends, send status
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SFMCRestClient } from "../rest-client.js";
import { SFMCSoapClient } from "../soap-client.js";

export function registerEmailSendTools(
  server: McpServer,
  rest: SFMCRestClient,
  soap: SFMCSoapClient
): void {
  // ─── List Email Assets ────────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_emails",
    "List email assets from Content Builder.",
    {
      page: z.number().int().min(1).default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(50).default(20).describe("Results per page"),
      nameFilter: z.string().optional().describe("Optional: filter by name (partial match)"),
    },
    async ({ page, pageSize, nameFilter }) => {
      const params: Record<string, string> = {
        $page: String(page),
        $pagesize: String(pageSize),
        $orderBy: "modifiedDate DESC",
        "$filter": `assetType.name eq 'htmlemail'${nameFilter ? ` and name like '%25${encodeURIComponent(nameFilter)}%25'` : ""}`,
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
          assetType: { name: string };
          modifiedDate: string;
          createdDate: string;
        }>;
      }>("/asset/v1/content/assets", params);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── List Triggered Send Definitions ─────────────────────────────────────────
  server.tool(
    "sfmc_list_triggered_send_definitions",
    "List all Triggered Send Definitions (TSDs) in the account.",
    {
      status: z
        .enum(["Active", "Inactive", "Deleted"])
        .optional()
        .describe("Filter by status"),
    },
    async ({ status }) => {
      const filter = status
        ? { property: "TriggeredSendStatus", operator: "equals" as const, value: status }
        : undefined;

      const results = await soap.retrieve(
        "TriggeredSendDefinition",
        ["Name", "CustomerKey", "Description", "TriggeredSendStatus", "Email.ID", "FromName", "FromAddress", "SendClassification.CustomerKey"],
        filter
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ count: results.length, items: results }, null, 2) }],
      };
    }
  );

  // ─── Fire Triggered Send ──────────────────────────────────────────────────────
  server.tool(
    "sfmc_fire_triggered_send",
    "Send a transactional/triggered email to one or more subscribers via a Triggered Send Definition.",
    {
      triggeredSendKey: z.string().describe("CustomerKey of the Triggered Send Definition"),
      subscribers: z
        .array(
          z.object({
            emailAddress: z.string().email().describe("Recipient email address"),
            subscriberKey: z.string().optional().describe("Subscriber key (defaults to email if omitted)"),
            attributes: z
              .record(z.string())
              .optional()
              .describe("Personalization attributes as key-value pairs"),
          })
        )
        .min(1)
        .describe("One or more subscribers to send to"),
    },
    async ({ triggeredSendKey, subscribers }) => {
      const subscribersXml = subscribers
        .map((sub) => {
          const attrsXml = sub.attributes
            ? Object.entries(sub.attributes)
                .map(
                  ([k, v]) => `
              <Attribute>
                <Name>${k}</Name>
                <Value>${v}</Value>
              </Attribute>`
                )
                .join("\n")
            : "";

          return `
          <Subscribers>
            <EmailAddress>${sub.emailAddress}</EmailAddress>
            <SubscriberKey>${sub.subscriberKey ?? sub.emailAddress}</SubscriberKey>
            ${attrsXml ? `<Attributes>${attrsXml}</Attributes>` : ""}
          </Subscribers>`;
        })
        .join("\n");

      const soapBody = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="TriggeredSend" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <TriggeredSendDefinition>
              <CustomerKey>${triggeredSendKey}</CustomerKey>
            </TriggeredSendDefinition>
            ${subscribersXml}
          </Objects>
        </CreateRequest>`;

      const xmlResult = await soap.callRaw("Create", soapBody);
      const { status, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status,
                statusMessage,
                recipientCount: subscribers.length,
                triggeredSendKey,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Get Send Status / Job ─────────────────────────────────────────────────
  server.tool(
    "sfmc_get_send_status",
    "Get the status and summary metrics of an email send job by its ID.",
    {
      sendId: z.string().describe("The numeric send job ID"),
    },
    async ({ sendId }) => {
      const results = await soap.retrieve(
        "Send",
        [
          "ID",
          "EmailName",
          "Subject",
          "Status",
          "SentDate",
          "NumberSent",
          "NumberDelivered",
          "NumberBounced",
          "NumberErrors",
          "UniqueOpens",
          "UniqueClicks",
          "NumberUnsubscribed",
        ],
        { property: "ID", operator: "equals", value: sendId }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(results[0] ?? { error: "Send not found" }, null, 2) }],
      };
    }
  );

  // ─── List Send Jobs ────────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_send_jobs",
    "List recent email send jobs with their delivery statistics.",
    {
      status: z
        .enum(["Complete", "Sending", "Scheduled", "Cancelled", "Error"])
        .optional()
        .describe("Filter by send status"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
    },
    async ({ status, limit }) => {
      const filter = status
        ? { property: "Status", operator: "equals" as const, value: status }
        : undefined;

      const results = await soap.retrieve(
        "Send",
        [
          "ID",
          "EmailName",
          "Subject",
          "Status",
          "SentDate",
          "NumberSent",
          "NumberDelivered",
          "UniqueOpens",
          "UniqueClicks",
        ],
        filter
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { count: Math.min(results.length, limit), items: results.slice(0, limit) },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Start/Pause Triggered Send Definition ─────────────────────────────────
  server.tool(
    "sfmc_update_triggered_send_status",
    "Start or pause a Triggered Send Definition.",
    {
      triggeredSendKey: z.string().describe("CustomerKey of the Triggered Send Definition"),
      action: z.enum(["start", "pause"]).describe("Whether to start or pause the definition"),
    },
    async ({ triggeredSendKey, action }) => {
      const newStatus = action === "start" ? "Active" : "Inactive";
      const xmlResult = await soap.update("TriggeredSendDefinition", [
        {
          CustomerKey: triggeredSendKey,
          TriggeredSendStatus: newStatus,
        },
      ]);

      const { status, statusMessage } = soap.extractStatus(xmlResult);
      return {
        content: [
          { type: "text", text: JSON.stringify({ status, statusMessage, newStatus }, null, 2) },
        ],
      };
    }
  );
}
