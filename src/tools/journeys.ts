/**
 * Journey Builder tools for SFMC MCP
 * Covers: list journeys, get journey detail, fire entry event, get run statistics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SFMCRestClient } from "../rest-client.js";
import { SFMCSoapClient } from "../soap-client.js";

export function registerJourneyTools(
  server: McpServer,
  rest: SFMCRestClient,
  _soap: SFMCSoapClient
): void {
  // ─── List Journeys ────────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_journeys",
    "List all journeys in Journey Builder with their status and basic metadata.",
    {
      status: z
        .enum(["Draft", "Published", "ScheduledToPublish", "Stopped", "Deleted"])
        .optional()
        .describe("Filter by journey status"),
      page: z.number().int().min(1).default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(50).default(20).describe("Results per page"),
      nameSearch: z.string().optional().describe("Optional partial name search"),
    },
    async ({ status, page, pageSize, nameSearch }) => {
      const params: Record<string, string> = {
        $page: String(page),
        $pagesize: String(pageSize),
        mostRecentVersionOnly: "true",
      };
      if (status) params.status = status;
      if (nameSearch) params.nameSearch = nameSearch;

      const data = await rest.get<{
        count: number;
        page: number;
        pageSize: number;
        items: Array<{
          id: string;
          name: string;
          description: string;
          version: number;
          status: string;
          createdDate: string;
          modifiedDate: string;
          entryMode: string;
          definitionType: string;
          stats?: {
            currentPopulation: number;
            cumulativePopulation: number;
          };
        }>;
      }>("/interaction/v1/interactions", params);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Get Journey Detail ───────────────────────────────────────────────────
  server.tool(
    "sfmc_get_journey",
    "Get full details of a Journey including its version, activities, and entry/exit criteria.",
    {
      journeyId: z.string().describe("The GUID of the journey"),
      version: z
        .number()
        .int()
        .optional()
        .describe("Specific version to retrieve (omit for latest)"),
    },
    async ({ journeyId, version }) => {
      const path = version
        ? `/interaction/v1/interactions/${journeyId}?versionNumber=${version}`
        : `/interaction/v1/interactions/${journeyId}`;

      const data = await rest.get<Record<string, unknown>>(path);

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Fire Journey Entry Event ─────────────────────────────────────────────
  server.tool(
    "sfmc_fire_entry_event",
    "Inject a contact into a journey by firing its entry event. Use this to trigger API-entry journeys.",
    {
      eventDefinitionKey: z
        .string()
        .describe(
          "The EventDefinitionKey of the Journey entry event (found in the journey's trigger settings)"
        ),
      contactKey: z
        .string()
        .describe("The unique contact/subscriber key of the person to inject"),
      data: z
        .record(z.unknown())
        .optional()
        .describe("Optional: custom data payload passed to the journey for personalization"),
    },
    async ({ eventDefinitionKey, contactKey, data }) => {
      const payload = {
        ContactKey: contactKey,
        EventDefinitionKey: eventDefinitionKey,
        Data: data ?? {},
      };

      const result = await rest.post<{
        eventInstanceId: string;
        contactKey: string;
        eventDefinitionKey: string;
      }>("/interaction/v1/events", payload);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── Bulk Fire Entry Events ────────────────────────────────────────────────
  server.tool(
    "sfmc_bulk_fire_entry_events",
    "Inject multiple contacts into a journey at once using the batch event API.",
    {
      eventDefinitionKey: z
        .string()
        .describe("The EventDefinitionKey of the Journey entry event"),
      contacts: z
        .array(
          z.object({
            contactKey: z.string().describe("Unique contact/subscriber key"),
            data: z.record(z.unknown()).optional().describe("Per-contact data payload"),
          })
        )
        .min(1)
        .max(100)
        .describe("Contacts to inject (max 100 per call)"),
    },
    async ({ eventDefinitionKey, contacts }) => {
      const events = contacts.map((c) => ({
        ContactKey: c.contactKey,
        EventDefinitionKey: eventDefinitionKey,
        Data: c.data ?? {},
      }));

      // SFMC batch event endpoint
      const result = await rest.post<{ eventInstanceIds: string[] }>(
        "/interaction/v1/events/async",
        { items: events }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── Get Journey Run Statistics ────────────────────────────────────────────
  server.tool(
    "sfmc_get_journey_stats",
    "Get population statistics for a journey (current population, cumulative, exits, errors).",
    {
      journeyId: z.string().describe("The GUID of the journey"),
      version: z.number().int().optional().describe("Journey version (omit for latest)"),
    },
    async ({ journeyId, version }) => {
      const versionParam = version ? `?versionNumber=${version}` : "";
      const data = await rest.get<Record<string, unknown>>(
        `/interaction/v1/interactions/${journeyId}/statistics${versionParam}`
      );

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── List Event Definitions ────────────────────────────────────────────────
  server.tool(
    "sfmc_list_event_definitions",
    "List all Journey Builder event definitions (entry events / API events).",
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
          id: string;
          name: string;
          eventDefinitionKey: string;
          type: string;
          dataExtensionId: string;
          isVisibleInPicker: boolean;
          createdDate: string;
          modifiedDate: string;
        }>;
      }>("/interaction/v1/eventDefinitions", {
        $page: String(page),
        $pagesize: String(pageSize),
      });

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Stop / Publish Journey ────────────────────────────────────────────────
  server.tool(
    "sfmc_update_journey_status",
    "Stop or publish a Journey.",
    {
      journeyId: z.string().describe("The GUID of the journey"),
      action: z.enum(["publish", "stop"]).describe("Action to perform on the journey"),
      version: z.number().int().optional().describe("Journey version number to target"),
    },
    async ({ journeyId, action, version }) => {
      const versionParam = version ? `?versionNumber=${version}` : "";

      let result: Record<string, unknown>;

      if (action === "publish") {
        result = await rest.post<Record<string, unknown>>(
          `/interaction/v1/interactions/publishAsync/${journeyId}${versionParam}`,
          {}
        );
      } else {
        result = await rest.post<Record<string, unknown>>(
          `/interaction/v1/interactions/stop/${journeyId}${versionParam}`,
          {}
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
