/**
 * SFMC OAuth 2.0 Client Credentials Authentication
 * Handles token acquisition and automatic refresh.
 */

export interface SFMCAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Tenant-specific subdomain, e.g. "mc.s50xxxxxxxxxxxxxxxx" */
  subdomain: string;
  /** Optional: target MID (account ID) for parent/child BU scenarios */
  accountId?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  soap_instance_url: string;
  rest_instance_url: string;
}

export class SFMCAuth {
  private config: SFMCAuthConfig;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private soapInstanceUrl: string | null = null;
  private restInstanceUrl: string | null = null;

  constructor(config: SFMCAuthConfig) {
    this.config = config;
  }

  /** Returns a valid access token, refreshing if necessary */
  async getToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }
    await this.refreshToken();
    return this.accessToken!;
  }

  /** Returns the REST base URL for this tenant */
  async getRestUrl(): Promise<string> {
    if (!this.restInstanceUrl) {
      await this.refreshToken();
    }
    return this.restInstanceUrl!;
  }

  /** Returns the SOAP endpoint URL for this tenant */
  async getSoapUrl(): Promise<string> {
    if (!this.soapInstanceUrl) {
      await this.refreshToken();
    }
    return this.soapInstanceUrl!;
  }

  private async refreshToken(): Promise<void> {
    const authUrl = `https://${this.config.subdomain}.auth.marketingcloudapis.com/v2/token`;

    const body: Record<string, string> = {
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };

    if (this.config.accountId) {
      body.account_id = this.config.accountId;
    }

    const response = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `SFMC authentication failed (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    // Subtract 60 s buffer to avoid edge cases at expiry
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
    this.soapInstanceUrl = data.soap_instance_url + "Service.asmx";
    this.restInstanceUrl = data.rest_instance_url.replace(/\/$/, "");
  }
}
