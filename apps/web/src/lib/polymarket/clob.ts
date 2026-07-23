/**
 * Polymarket CLOB API client for order placement and position management.
 *
 * All calls happen client-side using credentials derived from the user's
 * wallet signature. Plebs backend never touches these credentials.
 */

import { type ClobCredentials } from "./auth";
import { createHmac } from "./hmac";

const CLOB_BASE = "https://clob.polymarket.com";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "GTC" | "FOK" | "GTD";

export type OrderParams = {
  tokenId: string;
  side: OrderSide;
  price: number;
  size: number;
  orderType?: OrderType;
  expiration?: number;
};

export type OrderResult = {
  success: boolean;
  orderId?: string;
  status?: string;
  errorMsg?: string;
};

export type OpenOrder = {
  id: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  size_matched: string;
  status: string;
  created_at: string;
};

export type TradeRecord = {
  id: string;
  asset_id: string;
  side: string;
  price: string;
  size: string;
  created_at: string;
  transaction_hash?: string;
};

async function clobFetch(
  creds: ClobCredentials,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : "";

  const sigPayload = `${timestamp}${method}${path}${bodyStr}`;
  const signature = await createHmac(creds.secret, sigPayload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "POLY_API_KEY": creds.apiKey,
    "POLY_SIGNATURE": signature,
    "POLY_TIMESTAMP": timestamp,
    "POLY_PASSPHRASE": creds.passphrase,
  };

  return fetch(`${CLOB_BASE}${path}`, {
    method,
    headers,
    body: body ? bodyStr : undefined,
  });
}

export async function createOrder(
  creds: ClobCredentials,
  params: OrderParams,
): Promise<OrderResult> {
  const body = {
    tokenID: params.tokenId,
    side: params.side,
    price: params.price.toString(),
    size: params.size.toString(),
    type: params.orderType ?? "GTC",
    ...(params.expiration ? { expiration: params.expiration } : {}),
  };

  const resp = await clobFetch(creds, "POST", "/order", body);
  const data = await resp.json();

  if (!resp.ok) {
    return {
      success: false,
      errorMsg: data.error || data.message || `HTTP ${resp.status}`,
    };
  }

  return {
    success: true,
    orderId: data.orderID || data.id,
    status: data.status || "LIVE",
  };
}

export async function cancelOrder(
  creds: ClobCredentials,
  orderId: string,
): Promise<boolean> {
  const resp = await clobFetch(creds, "DELETE", `/order/${orderId}`);
  return resp.ok;
}

export async function cancelAllOrders(
  creds: ClobCredentials,
): Promise<boolean> {
  const resp = await clobFetch(creds, "DELETE", "/orders");
  return resp.ok;
}

export async function getOpenOrders(
  creds: ClobCredentials,
): Promise<OpenOrder[]> {
  const resp = await clobFetch(creds, "GET", "/orders");
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

export async function getTradeHistory(
  creds: ClobCredentials,
  limit = 50,
): Promise<TradeRecord[]> {
  const resp = await clobFetch(creds, "GET", `/trades?limit=${limit}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

export async function getOrderBook(
  tokenId: string,
): Promise<{ bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> }> {
  const resp = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`);
  if (!resp.ok) return { bids: [], asks: [] };
  return resp.json();
}
