"use client";

import { useState, useEffect, useCallback } from "react";
import { AffiliateNetworkManager } from "./affiliate-network-manager";

export interface AffiliateNetworkConfig {
  id: string;
  site_id: string;
  network: string;
  publisher_id: string;
  api_key_ref: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  meta: {
    network: string;
    name: string;
    description: string;
    bestFor: string;
    baseUrl: string;
    requiresApiKey: boolean;
    envKeyName: string;
  } | null;
}

export interface AvailableNetwork {
  network: string;
  name: string;
  description: string;
  bestFor: string;
  baseUrl: string;
  requiresApiKey: boolean;
  envKeyName: string;
}

export default function AffiliateNetworksPage() {
  const [configured, setConfigured] = useState<AffiliateNetworkConfig[]>([]);
  const [available, setAvailable] = useState<AvailableNetwork[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/affiliate-networks");
      if (res.ok) {
        const data = await res.json();
        setConfigured(data.configured);
        setAvailable(data.available);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Affiliate Networks</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your affiliate network integrations — CJ Affiliate, PartnerStack, Admitad
        </p>
      </div>

      <AffiliateNetworkManager
        configured={configured}
        available={available}
        loading={loading}
        onRefresh={fetchData}
      />
    </div>
  );
}
