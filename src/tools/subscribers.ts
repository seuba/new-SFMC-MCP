/**
 * Subscriber Management tools for SFMC MCP
 * Covers: get subscriber, upsert subscriber, unsubscribe, list subscriber lists, manage list membership
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SFMCRestClient } from "../rest-client.js";
import { SFMCSoapClient } from "../soap-client.js";

export function registerSubscriberTools(
  server: McpServer,
  rest: SFMCRestClient,
  soap: SFMCSoapClient
): void {
  // ─── Get Subscriber ────────────────────────────────────────────────────────
  server.tool(
    "sfmc_get_subscriber",
    "Retrieve a subscriber's profile and status by email address or subscriber key.",
    {
      identifier: z.string().describe("Email address or subscriber key to look up"),
      identifierType: z
        .enum(["EmailAddress", "SubscriberKey"])
        .default("EmailAddress")
        .describe("Whether the identifier is an email address or subscriber key"),
    },
    async ({ identifier, identifierType }) => {
      const results = await soap.retrieve(
        "Subscriber",
        [
          "EmailAddress",
          "SubscriberKey",
          "Status",
          "UnsubscribedDate",
          "CreatedDate",
          "ModifiedDate",
          "ID",
        ],
        {
          property: identifierType,
          operator: "equals",
          value: identifier,
        }
      );

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ found: false, identifier }, null, 2) }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ found: true, subscriber: results[0] }, null, 2) }],
      };
    }
  );

  // ─── Upsert Subscriber ─────────────────────────────────────────────────────
  server.tool(
    "sfmc_upsert_subscriber",
    "Create a new subscriber or update an existing one. Attributes are custom profile fields.",
    {
      emailAddress: z.string().email().describe("Subscriber's email address"),
      subscriberKey: z
        .string()
        .optional()
        .describe("Subscriber key (defaults to email address if omitted)"),
      status: z
        .enum(["Active", "Bounced", "Held", "Unsubscribed"])
        .default("Active")
        .describe("Subscriber status"),
      attributes: z
        .record(z.string())
        .optional()
        .describe("Custom profile attributes as key-value pairs"),
      listKeys: z
        .array(z.string())
        .optional()
        .describe("External keys of lists to add the subscriber to"),
    },
    async ({ emailAddress, subscriberKey, status, attributes, listKeys }) => {
      const attrsXml = attributes
        ? Object.entries(attributes)
            .map(
              ([k, v]) => `
            <Attributes>
              <Name>${k}</Name>
              <Value>${v}</Value>
            </Attributes>`
            )
            .join("\n")
        : "";

      const listsXml = listKeys
        ? listKeys
            .map(
              (key) => `
            <Lists>
              <ID>${key}</ID>
              <Status>Active</Status>
            </Lists>`
            )
            .join("\n")
        : "";

      const soapBody = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="Subscriber" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <EmailAddress>${emailAddress}</EmailAddress>
            <SubscriberKey>${subscriberKey ?? emailAddress}</SubscriberKey>
            <Status>${status}</Status>
            ${attrsXml}
            ${listsXml}
          </Objects>
        </CreateRequest>`;

      const xmlResult = await soap.callRaw("Create", soapBody);
      const { status: soapStatus, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: soapStatus,
                statusMessage,
                emailAddress,
                subscriberKey: subscriberKey ?? emailAddress,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Unsubscribe ──────────────────────────────────────────────────────────
  server.tool(
    "sfmc_unsubscribe",
    "Set a subscriber's status to Unsubscribed (global opt-out).",
    {
      emailAddress: z.string().email().describe("Email address of the subscriber to unsubscribe"),
      subscriberKey: z.string().optional().describe("Subscriber key (defaults to email)"),
    },
    async ({ emailAddress, subscriberKey }) => {
      const xmlResult = await soap.update("Subscriber", [
        {
          EmailAddress: emailAddress,
          SubscriberKey: subscriberKey ?? emailAddress,
          Status: "Unsubscribed",
        },
      ]);

      const { status, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status, statusMessage, emailAddress }, null, 2),
          },
        ],
      };
    }
  );

  // ─── List Subscriber Lists ─────────────────────────────────────────────────
  server.tool(
    "sfmc_list_subscriber_lists",
    "List all subscriber lists in the account.",
    {
      listType: z
        .enum(["Public", "Private", "Salesforce", "GlobalUnsubscribe", "Master"])
        .optional()
        .describe("Filter by list type"),
    },
    async ({ listType }) => {
      const filter = listType
        ? { property: "ListClassification", operator: "equals" as const, value: listType }
        : undefined;

      const results = await soap.retrieve(
        "List",
        ["ID", "ListName", "Description", "ListClassification", "Type", "SubscriberCount", "CreatedDate"],
        filter
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: results.length, lists: results }, null, 2),
          },
        ],
      };
    }
  );

  // ─── Add Subscriber to List ────────────────────────────────────────────────
  server.tool(
    "sfmc_add_to_list",
    "Add one or more subscribers to a specific list.",
    {
      listId: z.string().describe("Numeric ID of the target list"),
      subscribers: z
        .array(
          z.object({
            emailAddress: z.string().email(),
            subscriberKey: z.string().optional(),
          })
        )
        .min(1)
        .describe("Subscribers to add to the list"),
    },
    async ({ listId, subscribers }) => {
      const subscriberObjectsXml = subscribers
        .map(
          (sub) => `
          <Objects xsi:type="Subscriber" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <EmailAddress>${sub.emailAddress}</EmailAddress>
            <SubscriberKey>${sub.subscriberKey ?? sub.emailAddress}</SubscriberKey>
            <Lists>
              <ID>${listId}</ID>
              <Status>Active</Status>
            </Lists>
          </Objects>`
        )
        .join("\n");

      const soapBody = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          ${subscriberObjectsXml}
        </CreateRequest>`;

      const xmlResult = await soap.callRaw("Create", soapBody);
      const { status, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { status, statusMessage, addedCount: subscribers.length, listId },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Remove Subscriber from List ──────────────────────────────────────────
  server.tool(
    "sfmc_remove_from_list",
    "Remove a subscriber from a specific list (sets list status to Unsubscribed).",
    {
      listId: z.string().describe("Numeric ID of the list"),
      emailAddress: z.string().email().describe("Email address of the subscriber"),
      subscriberKey: z.string().optional().describe("Subscriber key (defaults to email)"),
    },
    async ({ listId, emailAddress, subscriberKey }) => {
      const soapBody = `
        <UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="Subscriber" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <EmailAddress>${emailAddress}</EmailAddress>
            <SubscriberKey>${subscriberKey ?? emailAddress}</SubscriberKey>
            <Lists>
              <ID>${listId}</ID>
              <Status>Unsubscribed</Status>
            </Lists>
          </Objects>
        </UpdateRequest>`;

      const xmlResult = await soap.callRaw("Update", soapBody);

      const { status, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status, statusMessage, emailAddress, listId }, null, 2),
          },
        ],
      };
    }
  );

  // ─── Bulk Import Subscribers via REST ─────────────────────────────────────
  server.tool(
    "sfmc_bulk_upsert_contacts",
    "Bulk upsert contacts into SFMC Contact Builder using the REST Contacts API.",
    {
      contacts: z
        .array(
          z.object({
            contactKey: z.string().describe("Unique contact key (usually email or CRM ID)"),
            attributeSets: z
              .array(
                z.object({
                  name: z.string().describe('Attribute set name, e.g. "Email Addresses"'),
                  items: z.array(z.record(z.string())).describe("Attribute key-value records"),
                })
              )
              .describe("Attribute sets to populate"),
          })
        )
        .min(1)
        .max(100)
        .describe("Contacts to upsert (max 100 per call)"),
    },
    async ({ contacts }) => {
      const payload = {
        items: contacts.map((c) => ({
          contactKey: c.contactKey,
          attributeSets: c.attributeSets.map((as) => ({
            name: as.name,
            items: as.items,
          })),
        })),
      };

      const result = await rest.post<{ requestServiceMessageID: string; responseDateTime: string }>(
        "/contacts/v1/contacts/actions/setcontactattributes",
        payload
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
