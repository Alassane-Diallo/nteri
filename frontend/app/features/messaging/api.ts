const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface ApiUser {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  avatar: string;
  presence: string;
  lastSeen: string | null;
}

export interface ApiMessage {
  id: string;
  chatId: string;
  authorId: string;
  body: string;
  sentAt: string;
  kind: "text" | "system";
}

export interface ApiConversation {
  id: string;
  kind: "direct" | "group";
  name: string;
  title: string;
  avatar: string;
  memberIds: string[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessage: ApiMessage | null;
  unread: number;
  isOnline: boolean;
}

export interface ApiAuthResponse {
  user: ApiUser;
  csrfToken: string;
}

export interface ApiMessagePage {
  messages: ApiMessage[];
  hasMore: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  name: string;
  phone: string;
  password: string;
}

export type SocketStatus = "connecting" | "online" | "offline";

export type InboxEvent =
  | {
      type: "message.created";
      conversationId: string;
      message: ApiMessage;
      unread: number;
    }
  | { type: "conversation.created"; conversationId: string }
  | { type: "pong" }
  | { type: "error"; detail: string };

interface ApiErrorBody {
  detail?: unknown;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  fields: Record<string, unknown> | null;

  constructor(
    status: number,
    message: string,
    fields: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstMessage(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) {
        return message;
      }
    }
    return null;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const message = firstMessage(item);
      if (message) {
        return message;
      }
    }
  }

  return null;
}

function errorFromResponse(status: number, body: unknown): ApiError {
  if (isRecord(body)) {
    const payload = body as ApiErrorBody;
    if (typeof payload.detail === "string") {
      return new ApiError(status, payload.detail, null);
    }

    return new ApiError(
      status,
      firstMessage(body) ?? "La demande n’a pas pu aboutir.",
      body,
    );
  }

  return new ApiError(status, "La demande n’a pas pu aboutir.");
}

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

function storeCsrfToken(token: string): void {
  csrfToken = token;
}

export async function refreshCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  if (csrfRequest) {
    return csrfRequest;
  }

  csrfRequest = (async () => {
    let response: Response;

    try {
      response = await fetch(apiUrl("/api/auth/csrf/"), {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch {
      throw new ApiError(
        0,
        "Le serveur N’Teri est injoignable. Vérifiez votre connexion.",
      );
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw errorFromResponse(response.status, body);
    }
    if (!isRecord(body) || typeof body.csrfToken !== "string") {
      throw new ApiError(500, "Réponse de sécurité invalide.");
    }

    storeCsrfToken(body.csrfToken);

    return body.csrfToken;
  })().finally(() => {
    csrfRequest = null;
  });

  return csrfRequest;
}

function isUnsafe(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

async function requestOnce<T>(
  path: string,
  method: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (isUnsafe(method)) {
    headers["X-CSRFToken"] = await refreshCsrfToken();
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "Le serveur N’Teri est injoignable. Vérifiez votre connexion.",
    );
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw errorFromResponse(response.status, payload);
  }

  return payload as T;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? "GET";

  try {
    return await requestOnce<T>(path, method, options.body, options.signal);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && isUnsafe(method)) {
      csrfToken = null;
      return requestOnce<T>(path, method, options.body, options.signal);
    }
    throw error;
  }
}

export const authApi = {
  async me(): Promise<ApiUser> {
    return request<ApiUser>("/api/auth/me/");
  },

  async login(payload: LoginPayload): Promise<ApiAuthResponse> {
    const response = await request<ApiAuthResponse>("/api/auth/login/", {
      method: "POST",
      body: payload,
    });
    storeCsrfToken(response.csrfToken);

    return response;
  },

  async register(payload: RegisterPayload): Promise<ApiAuthResponse> {
    const response = await request<ApiAuthResponse>("/api/auth/register/", {
      method: "POST",
      body: payload,
    });
    storeCsrfToken(response.csrfToken);

    return response;
  },

  async logout(): Promise<void> {
    try {
      await request<void>("/api/auth/logout/", { method: "POST" });
    } finally {
      csrfToken = null;
    }
  },
};

export const chatApi = {
  async contacts(): Promise<ApiUser[]> {
    return request<ApiUser[]>("/api/contacts/");
  },

  async conversations(): Promise<ApiConversation[]> {
    return request<ApiConversation[]>("/api/conversations/");
  },

  async messages(
    conversationId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<ApiMessagePage> {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 100));
    if (options.before) {
      params.set("before", options.before);
    }

    return request<ApiMessagePage>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/?${params.toString()}`,
    );
  },

  async sendMessage(conversationId: string, body: string): Promise<ApiMessage> {
    return request<ApiMessage>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/`,
      { method: "POST", body: { body } },
    );
  },

  async markRead(conversationId: string): Promise<void> {
    await request<{ unread: number }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/read/`,
      { method: "POST", body: {} },
    );
  },

  async createDirect(contactId: string): Promise<ApiConversation> {
    return request<ApiConversation>("/api/conversations/", {
      method: "POST",
      body: { kind: "direct", memberIds: [contactId] },
    });
  },

  async createGroup(name: string, memberIds: string[]): Promise<ApiConversation> {
    return request<ApiConversation>("/api/conversations/", {
      method: "POST",
      body: { kind: "group", name, memberIds },
    });
  },
};

function websocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) {
    return explicit;
  }

  const base = new URL(
    import.meta.env.VITE_API_URL || window.location.origin,
    window.location.origin,
  );
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws/inbox/";
  base.search = "";
  base.hash = "";

  return base.toString();
}

export function connectInbox(
  onEvent: (event: InboxEvent) => void,
  onStatus: (status: SocketStatus) => void,
  onUnauthorized?: () => void,
): () => void {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") {
    return () => undefined;
  }

  let socket: WebSocket | null = null;
  let heartbeat: number | null = null;
  let reconnectTimer: number | null = null;
  let attempts = 0;
  let closed = false;

  const clearHeartbeat = () => {
    if (heartbeat !== null) {
      window.clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) {
      return;
    }

    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
    attempts += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  };

  const openSocket = () => {
    if (closed) {
      return;
    }

    onStatus("connecting");
    try {
      socket = new WebSocket(websocketUrl());
    } catch {
      onStatus("offline");
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      onStatus("online");
      clearHeartbeat();
      heartbeat = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25_000);
    };

    socket.onmessage = (message) => {
      try {
        const event: unknown = JSON.parse(String(message.data));
        if (isRecord(event) && typeof event.type === "string") {
          onEvent(event as InboxEvent);
        }
      } catch {
        // Un message illisible est ignoré : le prochain événement reste valide.
      }
    };

    socket.onerror = () => {
      socket?.close();
    };

    socket.onclose = (event) => {
      clearHeartbeat();
      socket = null;
      onStatus("offline");
      if (closed) {
        return;
      }
      if (event.code === 4401) {
        closed = true;
        onUnauthorized?.();
        return;
      }
      scheduleReconnect();
    };
  };

  openSocket();

  return () => {
    closed = true;
    clearHeartbeat();
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    socket?.close();
  };
}
