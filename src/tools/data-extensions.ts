/**
 * Data Extension tools for SFMC MCP
 * Covers: list DEs, describe schema, query rows, upsert rows, delete rows, create DE
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SFMCRestClient } from "../rest-client.js";
import { SFMCSoapClient } from "../soap-client.js";

export function registerDataExtensionTools(
  server: McpServer,
  rest: SFMCRestClient,
  soap: SFMCSoapClient
): void {
  // ─── List Data Extensions ────────────────────────────────────────────────────
  server.tool(
    "sfmc_list_data_extensions",
    "List all Data Extensions in the account. Returns name, external key, and description.",
    {
      page: z.number().int().min(1).default(1).describe("Page number (1-based)"),
      pageSize: z.number().int().min(1).max(500).default(50).describe("Results per page (max 500)"),
    },
    async ({ page, pageSize }) => {
      const results = await soap.retrieve("DataExtension", [
        "Name",
        "CustomerKey",
        "Description",
        "IsSendable",
        "IsTestable",
        "CreatedDate",
        "ModifiedDate",
      ]);

      const start = (page - 1) * pageSize;
      const paginated = results.slice(start, start + pageSize);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: results.length,
                page,
                pageSize,
                data: paginated,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Describe Data Extension Schema ──────────────────────────────────────────
  server.tool(
    "sfmc_describe_data_extension",
    "Get the column schema for a specific Data Extension by its external key.",
    {
      externalKey: z.string().describe("The external key (CustomerKey) of the Data Extension"),
    },
    async ({ externalKey }) => {
      const columns = await soap.retrieve("DataExtensionField", [
        "Name",
        "FieldType",
        "MaxLength",
        "IsRequired",
        "IsPrimaryKey",
        "DefaultValue",
        "Ordinal",
      ], {
        property: "DataExtension.CustomerKey",
        operator: "equals",
        value: externalKey,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { externalKey, columns: columns.sort((a, b) => Number(a.Ordinal) - Number(b.Ordinal)) },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ─── Get DE Rows ──────────────────────────────────────────────────────────────
  server.tool(
    "sfmc_get_de_rows",
    "Query rows from a Data Extension. Supports filtering and pagination.",
    {
      externalKey: z.string().describe("External key of the Data Extension"),
      filter: z
        .string()
        .optional()
        .describe(
          'Optional REST filter expression, e.g. "Email eq \'user@example.com\'"'
        ),
      page: z.number().int().min(1).default(1).describe("Page number"),
      pageSize: z.number().int().min(1).max(2500).default(50).describe("Rows per page"),
    },
    async ({ externalKey, filter, page, pageSize }) => {
      const params: Record<string, string> = {
        $page: String(page),
        $pagesize: String(pageSize),
      };
      if (filter) params["$filter"] = filter;

      const data = await rest.get<{
        count: number;
        page: number;
        pageSize: number;
        items: Record<string, unknown>[];
      }>(
        `/data/v1/customobjectdata/key/${encodeURIComponent(externalKey)}/rowset`,
        params
      );

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // ─── Upsert DE Rows ───────────────────────────────────────────────────────────
  server.tool(
    "sfmc_upsert_de_rows",
    "Insert or update rows in a Data Extension. Uses the primary key(s) to determine upsert logic.",
    {
      externalKey: z.string().describe("External key of the Data Extension"),
      rows: z
        .array(z.record(z.unknown()))
        .describe("Array of row objects to upsert. Keys must match DE column names."),
    },
    async ({ externalKey, rows }) => {
      const result = await rest.post<{ requestId: string; responses: unknown[] }>(
        `/hub/v1/dataevents/key:${encodeURIComponent(externalKey)}/rowset`,
        rows
      );

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // ─── Delete DE Rows ───────────────────────────────────────────────────────────
  server.tool(
    "sfmc_delete_de_rows",
    "Delete rows from a Data Extension by primary key value(s).",
    {
      externalKey: z.string().describe("External key of the Data Extension"),
      primaryKeyValues: z
        .array(z.record(z.string()))
        .describe(
          'Array of objects containing primary key field names and values, e.g. [{"Email": "user@example.com"}]'
        ),
    },
    async ({ externalKey, primaryKeyValues }) => {
      const objects = primaryKeyValues.map((pkObj) => ({
        CustomerKey: externalKey,
        Keys: Object.entries(pkObj).map(([k, v]) => ({ Key: k, Value: v })),
      }));

      const xmlResult = await soap.delete("DataExtensionObject", objects);
      const { status, statusMessage } = soap.extractStatus(xmlResult);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status, statusMessage, deletedCount: primaryKeyValues.length }, null, 2),
          },
        ],
      };
    }
  );

  // ─── Create Data Extension ────────────────────────────────────────────────────
  server.tool(
    "sfmc_create_data_extension",
    "Create a new Data Extension with a defined column schema.",
    {
      name: z.string().describe("Name of the new Data Extension"),
      externalKey: z.string().optional().describe("Optional external key (auto-generated if omitted)"),
      description: z.string().optional().describe("Optional description"),
      isSendable: z.boolean().default(false).describe("Whether the DE can be used as a send audience"),
      sendableField: z
        .string()
        .optional()
        .describe('Column name mapped to subscriber key (required when isSendable is true, e.g. "Email")'),
      columns: z
        .array(
          z.object({
            name: z.string().describe("Column name"),
            fieldType: z
              .enum(["Text", "Number", "Date", "Boolean", "EmailAddress", "Phone", "Decimal", "Locale"])
              .describe("Column data type"),
            maxLength: z.number().int().optional().describe("Max length (for Text fields)"),
            isRequired: z.boolean().default(false),
            isPrimaryKey: z.boolean().default(false),
            defaultValue: z.string().optional(),
          })
        )
        .describe("Column definitions"),
    },
    async ({ name, externalKey, description, isSendable, sendableField, columns }) => {
      const fieldsXml = columns
        .map(
          (col) => `
          <Fields>
            <Field>
              <Name>${col.name}</Name>
              <FieldType>${col.fieldType}</FieldType>
              ${col.maxLength !== undefined ? `<MaxLength>${col.maxLength}</MaxLength>` : ""}
              <IsRequired>${col.isRequired}</IsRequired>
              <IsPrimaryKey>${col.isPrimaryKey}</IsPrimaryKey>
              ${col.defaultValue !== undefined ? `<DefaultValue>${col.defaultValue}</DefaultValue>` : ""}
            </Field>
          </Fields>`
        )
        .join("\n");

      const sendableXml =
        isSendable && sendableField
          ? `<IsSendable>true</IsSendable>
             <SendableDataExtensionField><Name>${sendableField}</Name></SendableDataExtensionField>
             <SendableSubscriberField><Name>Subscriber Key</Name></SendableSubscriberField>`
          : `<IsSendable>false</IsSendable>`;

      const customerKeyXml = externalKey ? `<CustomerKey>${externalKey}</CustomerKey>` : "";
      const descXml = description ? `<Description>${description}</Description>` : "";

      // Build the full SOAP body manually because DataExtension creation requires nested Fields
      const soapBody = `
        <CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
          <Objects xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <Name>${name}</Name>
            ${customerKeyXml}
            ${descXml}
            ${sendableXml}
            ${fieldsXml}
          </Objects>
        </CreateRequest>`;

      const xmlResult = await soap.callRaw("Create", soapBody);
      const { status, statusMessage } = soap.extractStatus(xmlResult);
      const newKey =
        soap.extractValue(xmlResult, "NewID") ??
        soap.extractValue(xmlResult, "ObjectID") ??
        "check SFMC for key";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status, statusMessage, objectId: newKey }, null, 2),
          },
        ],
      };
    }
  );
}
