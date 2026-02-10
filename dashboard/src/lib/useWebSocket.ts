"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { WS_URL, type ActivityEntry } from "./api";

type WSStatus = "connecting" | "connected" | "disconnected";

export function useWebSocket() {
  const [status, setStatus] = useState<WSStatus>("connecting");
  const [activity, setActivity] = useState<ActivityEntry[]>([] as ActivityEntry[]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("connected");

    ws.onclose = () => {
      setStatus("disconnected");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "init" && Array.isArray(data.activity)) {
          setActivity(data.activity);
        } else if (
          (data.type === "activity" || data.type === "proof") &&
          data.entry
        ) {
          setActivity((prev) => [data.entry, ...prev]);
        }
      } catch {
        // ignore parse errors
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, activity };
}
