/**
 * Client-side hook for enabled connections
 */

"use client";

import { useState, useEffect } from "react";

interface EnabledConnection {
  id: string;
  marketplaceId: string;
  name: string;
}

interface EnabledConnectionsResponse {
  mode: "live" | "demo";
  warnings: string[];
  enabledConnections: EnabledConnection[];
}

export function useEnabledConnections() {
  const [data, setData] = useState<EnabledConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnabledConnections = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/integrations/enabled");
      if (!response.ok) {
        throw new Error("Failed to fetch enabled connections");
      }
      const json = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnabledConnections();
  }, []);

  return {
    enabledConnections: data?.enabledConnections || [],
    mode: data?.mode || "demo",
    warnings: data?.warnings || [],
    loading,
    error,
    refetch: fetchEnabledConnections,
    hasConnections: (data?.enabledConnections.length || 0) > 0,
  };
}
