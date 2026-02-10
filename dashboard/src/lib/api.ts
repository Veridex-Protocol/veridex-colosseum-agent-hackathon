export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

export interface ActivityEntry {
  id: string;
  timestamp: number;
  type: "discovery" | "payment" | "tool_call" | "proof";
  agent?: string;
  tool?: string;
  protocol?: string;
  amountUSD?: number;
  solanaProof?: string;
  data?: Record<string, unknown>;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  priceUSD: number;
  category: string;
}

export interface Stats {
  totalPayments: number;
  totalRevenue: string;
  uniqueAgents: number;
  protocols: Record<string, number>;
  activityCount: number;
  uptime: number;
}

export interface AgentStatus {
  hasCredentials: boolean;
  createdAt?: number;
  revokedAt?: number;
  dailyLimitUSD?: number;
  perTransactionLimitUSD?: number;
}

export async function fetchTools(): Promise<Tool[]> {
  const res = await fetch(`${API_URL}/api/v1/tools`);
  const data = await res.json();
  return data.tools;
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_URL}/api/v1/stats`);
  return res.json();
}

export async function fetchActivity(): Promise<ActivityEntry[]> {
  const res = await fetch(`${API_URL}/api/v1/activity`);
  return res.json();
}

export async function fetchAgentStatus(): Promise<AgentStatus> {
  const res = await fetch(`${API_URL}/api/v1/agent/status`);
  return res.json();
}

export async function setAgentCredentials(wallet: unknown, session: unknown) {
  const res = await fetch(`${API_URL}/api/v1/agent/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, session }),
  });
  return res.json();
}

export async function revokeAgentCredentials() {
  const res = await fetch(`${API_URL}/api/v1/agent/credentials`, {
    method: "DELETE",
  });
  return res.json();
}
