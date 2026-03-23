/**
 * SFMC SOAP API Client
 * Builds raw SOAP envelopes and parses XML responses.
 * Supports Retrieve, Create, Update, Delete, and Perform operations.
 */

import { SFMCAuth } from "./auth.js";

const SOAP_NS = "http://exacttarget.com/wsdl/partnerAPI";

export interface SoapFilter {
  property: string;
  operator:
    | "equals"
    | "notEquals"
    | "lessThan"
    | "lessThanOrEqual"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "isNull"
    | "isNotNull"
    | "between"
    | "IN"
    | "like";
  value?: string | string[];
}

export class SFMCSoapClient {
  constructor(private auth: SFMCAuth) {}

  /** Retrieve SFMC objects */
  async retrieve(
    objectType: string,
    properties: string[],
    filter?: SoapFilter
  ): Promise<Record<string, string>[]> {
    const propsXml = properties.map((p) => `<Properties>${p}</Properties>`).join("\n");
    const filterXml = filter ? this.buildFilter(filter) : "";

    const body = `
      <RetrieveRequestMsg xmlns="${SOAP_NS}">
        <RetrieveRequest>
          <ObjectType>${objectType}</ObjectType>
          ${propsXml}
          ${filterXml}
        </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const result = await this.call("Retrieve", body);
    return this.parseRetrieveResults(result);
  }

  /** Create one or more SFMC objects */
  async create(objectType: string, objects: Record<string, unknown>[]): Promise<string> {
    const objectsXml = objects
      .map(
        (obj) => `
        <Objects xsi:type="${objectType}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          ${this.objectToXml(obj)}
        </Objects>`
      )
      .join("\n");

    const body = `
      <CreateRequest xmlns="${SOAP_NS}">
        ${objectsXml}
      </CreateRequest>`;

    const result = await this.call("Create", body);
    return result;
  }

  /** Update one or more SFMC objects */
  async update(objectType: string, objects: Record<string, unknown>[]): Promise<string> {
    const objectsXml = objects
      .map(
        (obj) => `
        <Objects xsi:type="${objectType}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          ${this.objectToXml(obj)}
        </Objects>`
      )
      .join("\n");

    const body = `
      <UpdateRequest xmlns="${SOAP_NS}">
        ${objectsXml}
      </UpdateRequest>`;

    const result = await this.call("Update", body);
    return result;
  }

  /** Delete one or more SFMC objects */
  async delete(objectType: string, objects: Record<string, unknown>[]): Promise<string> {
    const objectsXml = objects
      .map(
        (obj) => `
        <Objects xsi:type="${objectType}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          ${this.objectToXml(obj)}
        </Objects>`
      )
      .join("\n");

    const body = `
      <DeleteRequest xmlns="${SOAP_NS}">
        ${objectsXml}
      </DeleteRequest>`;

    const result = await this.call("Delete", body);
    return result;
  }

  /** Perform an action on SFMC objects (e.g., start a triggered send) */
  async perform(
    actionName: string,
    objectType: string,
    objects: Record<string, unknown>[]
  ): Promise<string> {
    const objectsXml = objects
      .map(
        (obj) => `
        <Definitions xsi:type="${objectType}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          ${this.objectToXml(obj)}
        </Definitions>`
      )
      .join("\n");

    const body = `
      <PerformRequestMsg xmlns="${SOAP_NS}">
        <Action>${actionName}</Action>
        ${objectsXml}
      </PerformRequestMsg>`;

    const result = await this.call("Perform", body);
    return result;
  }

  /** Public raw SOAP call — supply the full content inside &lt;s:Body&gt; */
  async callRaw(action: string, bodyContent: string): Promise<string> {
    return this.call(action, bodyContent);
  }

  private async call(action: string, bodyContent: string): Promise<string> {
    const token = await this.auth.getToken();
    const soapUrl = await this.auth.getSoapUrl();

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">${action}</a:Action>
    <a:To s:mustUnderstand="1">${soapUrl}</a:To>
    <fueloauth xmlns="http://exacttarget.com">${token}</fueloauth>
  </s:Header>
  <s:Body>
    ${bodyContent}
  </s:Body>
</s:Envelope>`;

    const response = await fetch(soapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: action,
      },
      body: envelope,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`SFMC SOAP error (${response.status}): ${text}`);
    }

    this.checkSoapFault(text);
    return text;
  }

  private checkSoapFault(xml: string): void {
    if (xml.includes("<s:Fault>") || xml.includes("<soap:Fault>")) {
      const faultMatch = xml.match(/<faultstring[^>]*>(.*?)<\/faultstring>/s);
      throw new Error(
        `SFMC SOAP fault: ${faultMatch ? faultMatch[1] : "Unknown error"}`
      );
    }
  }

  private buildFilter(filter: SoapFilter): string {
    if (Array.isArray(filter.value)) {
      const valuesXml = filter.value
        .map((v) => `<Value>${this.escapeXml(v)}</Value>`)
        .join("\n");
      return `
        <Filter xsi:type="SimpleFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <Property>${filter.property}</Property>
          <SimpleOperator>${filter.operator}</SimpleOperator>
          ${valuesXml}
        </Filter>`;
    }

    return `
      <Filter xsi:type="SimpleFilterPart" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Property>${filter.property}</Property>
        <SimpleOperator>${filter.operator}</SimpleOperator>
        ${filter.value !== undefined ? `<Value>${this.escapeXml(String(filter.value))}</Value>` : ""}
      </Filter>`;
  }

  private objectToXml(obj: Record<string, unknown>): string {
    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === "object" && value !== null) {
          return `<${key}>${this.objectToXml(value as Record<string, unknown>)}</${key}>`;
        }
        return `<${key}>${this.escapeXml(String(value))}</${key}>`;
      })
      .join("\n");
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /** Parses <Results> blocks from a Retrieve response into plain objects */
  parseRetrieveResults(xml: string): Record<string, string>[] {
    const results: Record<string, string>[] = [];
    const resultBlocks = xml.match(/<Results>([\s\S]*?)<\/Results>/g) ?? [];
    for (const block of resultBlocks) {
      const obj: Record<string, string> = {};
      const props = block.match(/<(\w+)>([^<]*)<\/\1>/g) ?? [];
      for (const prop of props) {
        const match = prop.match(/<(\w+)>([^<]*)<\/\1>/);
        if (match) obj[match[1]] = match[2];
      }
      results.push(obj);
    }
    return results;
  }

  /** Extract a single text value from XML by tag name */
  extractValue(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
    return match?.[1];
  }

  /** Check overall status from SOAP response */
  extractStatus(xml: string): { status: string; statusMessage: string } {
    const status = this.extractValue(xml, "OverallStatus") ?? "Unknown";
    const statusMessage =
      this.extractValue(xml, "StatusMessage") ?? this.extractValue(xml, "StatusDetails") ?? "";
    return { status, statusMessage };
  }
}
