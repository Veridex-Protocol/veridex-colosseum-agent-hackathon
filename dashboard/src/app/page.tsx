"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { fetchStats, fetchTools, type Stats, type Tool } from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";

const TYPE_ICONS: Record<string, string> = {
  discovery: "🔍",
  payment: "💰",
  tool_call: "🔧",
  proof: "⛓️",
};

const TYPE_COLORS: Record<string, string> = {
  discovery: "text-blue-400",
  payment: "text-green-400",
  tool_call: "text-yellow-400",
  proof: "text-purple-400",
};

export default function DashboardPage() {
  const { status: wsStatus, activity } = useWebSocket();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    fetchTools().then(setTools).catch(() => {});
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const liveStats = useMemo(() => {
    const payments = activity.filter((a) => a.type === "payment").length;
    const proofs = activity.filter((a) => a.type === "proof").length;
    const agents = new Set(activity.map((a) => a.agent).filter(Boolean)).size;
    const revenue = activity
      .filter((a) => a.type === "payment")
      .reduce((sum, a) => sum + (a.amountUSD || 0), 0);
    return {
      payments: stats?.totalPayments ?? payments,
      revenue: stats ? parseFloat(stats.totalRevenue) : revenue,
      proofs,
      agents: stats?.uniqueAgents ?? agents,
    };
  }, [activity, stats]);

  const protocols = useMemo(() => {
    if (stats?.protocols) return stats.protocols;
    return activity
      .filter((a) => a.protocol)
      .reduce(
        (acc, a) => {
          acc[a.protocol!] = (acc[a.protocol!] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
  }, [activity, stats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Agent Dashboard</h1>
          <p className="text-muted text-sm mt-1">
            Real-time view of autonomous agent payments and on-chain proofs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                wsStatus === "connected"
                  ? "bg-success"
                  : wsStatus === "connecting"
                    ? "bg-warning animate-pulse-dot"
                    : "bg-danger animate-pulse-dot"
              }`}
            />
            <span
              className={
                wsStatus === "connected"
                  ? "text-success"
                  : wsStatus === "connecting"
                    ? "text-warning"
                    : "text-danger"
              }
            >
              {wsStatus === "connected"
                ? "Live"
                : wsStatus === "connecting"
                  ? "Connecting..."
                  : "Disconnected"}
            </span>
          </span>
          <Link
            href="/setup"
            className="bg-accent hover:bg-accent-light text-white text-sm px-4 py-2 rounded-lg transition"
          >
            Setup Wallet
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Payments",
            value: liveStats.payments,
            color: "text-foreground",
          },
          {
            label: "Revenue (USD)",
            value: `$${liveStats.revenue.toFixed(4)}`,
            color: "text-success",
          },
          {
            label: "On-Chain Proofs",
            value: liveStats.proofs,
            color: "text-purple-400",
          },
          {
            label: "Unique Agents",
            value: liveStats.agents,
            color: "text-accent-light",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-card-border rounded-xl p-5"
          >
            <p className="text-muted text-sm">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Protocol Breakdown + Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-3">Payment Protocols</h3>
          <div className="space-y-2">
            {Object.keys(protocols).length > 0 ? (
              Object.entries(protocols).map(([name, count]) => (
                <div
                  key={name}
                  className="flex justify-between p-2 rounded bg-background/50"
                >
                  <span className="text-sm">{name.toUpperCase()}</span>
                  <span className="text-sm font-mono text-accent-light">
                    {count as number} txns
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted text-sm">No payments yet</p>
            )}
          </div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-3">Available Tools</h3>
          <div className="space-y-2">
            {tools.length > 0 ? (
              tools.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded bg-background/50"
                >
                  <div>
                    <span className="font-medium text-sm">{t.name}</span>
                    <p className="text-xs text-muted">
                      {t.description.slice(0, 60)}
                    </p>
                  </div>
                  <span className="text-success text-sm font-mono">
                    ${t.priceUSD}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted text-sm">Loading...</p>
            )}
          </div>
        </div>
      </div>

      {/* Live Activity Feed */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Live Activity Feed</h3>
          <span className="text-xs text-muted font-mono">
            {activity.length} events
          </span>
        </div>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {activity.length > 0 ? (
            activity.map((entry, i) => (
              <div
                key={entry.id || i}
                className={`flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-card-border/50 ${
                  i === 0 ? "animate-fade-in" : ""
                }`}
              >
                <span className="text-xl">
                  {TYPE_ICONS[entry.type] || "📋"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium ${TYPE_COLORS[entry.type] || ""}`}
                    >
                      {entry.type}
                    </span>
                    {entry.tool && (
                      <span className="text-xs bg-card border border-card-border px-2 py-0.5 rounded">
                        {entry.tool}
                      </span>
                    )}
                    {entry.protocol && (
                      <span className="text-xs bg-accent/20 text-accent-light px-2 py-0.5 rounded">
                        {entry.protocol}
                      </span>
                    )}
                    {entry.amountUSD != null && (
                      <span className="text-xs text-success">
                        ${entry.amountUSD.toFixed(4)}
                      </span>
                    )}
                    {entry.solanaProof && (
                      <a
                        href={`https://explorer.solana.com/tx/${entry.solanaProof}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:underline text-xs"
                      >
                        [on-chain ↗]
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted font-mono mt-1">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                    {entry.agent && ` · ${entry.agent}`}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted text-sm text-center py-8">
              Waiting for agent activity...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
