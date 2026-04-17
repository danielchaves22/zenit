import { INTEGRATIONS_CONFIG } from '../config';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type GmailMessageHeader = {
  name: string;
  value: string;
};

export type GmailMessagePayload = {
  mimeType?: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body?: {
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePayload[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePayload;
};

export type GmailWatchResponse = {
  historyId: string;
  expiration: string;
};

function assertGmailOAuthConfigured() {
  if (!INTEGRATIONS_CONFIG.gmailClientId || !INTEGRATIONS_CONFIG.gmailClientSecret || !INTEGRATIONS_CONFIG.gmailRedirectUri) {
    throw new Error('Configuracoes OAuth do Gmail ausentes (clientId/clientSecret/redirectUri).');
  }
}

async function parseResponse(response: Response): Promise<any> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export default class GmailClientService {
  static readonly scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
  ];

  static buildAuthUrl(state: string): string {
    assertGmailOAuthConfigured();

    const params = new URLSearchParams({
      client_id: INTEGRATIONS_CONFIG.gmailClientId,
      redirect_uri: INTEGRATIONS_CONFIG.gmailRedirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: this.scopes.join(' '),
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  static async exchangeCodeForTokens(code: string): Promise<GmailTokenResponse> {
    assertGmailOAuthConfigured();

    const body = new URLSearchParams({
      code,
      client_id: INTEGRATIONS_CONFIG.gmailClientId,
      client_secret: INTEGRATIONS_CONFIG.gmailClientSecret,
      redirect_uri: INTEGRATIONS_CONFIG.gmailRedirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await parseResponse(response);

    if (!response.ok || !data?.access_token) {
      throw new Error(`Falha ao trocar code por token (${response.status}): ${JSON.stringify(data)}`);
    }

    return data as GmailTokenResponse;
  }

  static async refreshAccessToken(refreshToken: string): Promise<GmailTokenResponse> {
    assertGmailOAuthConfigured();

    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: INTEGRATIONS_CONFIG.gmailClientId,
      client_secret: INTEGRATIONS_CONFIG.gmailClientSecret,
      grant_type: 'refresh_token'
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await parseResponse(response);

    if (!response.ok || !data?.access_token) {
      throw new Error(`Falha ao atualizar access token (${response.status}): ${JSON.stringify(data)}`);
    }

    return data as GmailTokenResponse;
  }

  static async getProfile(accessToken: string): Promise<{ emailAddress: string; historyId: string; messagesTotal: number; threadsTotal: number }> {
    const response = await fetch(`${GMAIL_API_BASE}/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseResponse(response);

    if (!response.ok || !data?.emailAddress) {
      throw new Error(`Falha ao obter profile do Gmail (${response.status}): ${JSON.stringify(data)}`);
    }

    return data;
  }

  static async listMessages(accessToken: string, params: { q?: string; maxResults?: number }) {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.maxResults) query.set('maxResults', String(params.maxResults));

    const response = await fetch(`${GMAIL_API_BASE}/messages?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(`Falha ao listar mensagens Gmail (${response.status}): ${JSON.stringify(data)}`);
    }

    return data as { messages?: Array<{ id: string; threadId: string }>; resultSizeEstimate?: number };
  }

  static async getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
    const response = await fetch(`${GMAIL_API_BASE}/messages/${encodeURIComponent(messageId)}?format=full`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await parseResponse(response);

    if (!response.ok || !data?.id) {
      throw new Error(`Falha ao obter mensagem Gmail (${response.status}): ${JSON.stringify(data)}`);
    }

    return data as GmailMessage;
  }

  static async startWatch(
    accessToken: string,
    topicName: string
  ): Promise<GmailWatchResponse | null> {
    if (!topicName) return null;

    const response = await fetch(`${GMAIL_API_BASE}/watch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topicName
      })
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(`Falha ao iniciar Gmail watch (${response.status}): ${JSON.stringify(data)}`);
    }

    return data as GmailWatchResponse;
  }
}

