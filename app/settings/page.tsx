"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import IntegrationsSection from "@/components/IntegrationsSection";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";

type SettingsTab = "integrations";

const SETTINGS_MENU: { key: SettingsTab; labelKey: string; icon: JSX.Element }[] = [
  {
    key: "integrations",
    labelKey: "settings_integrations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [activeTab, setActiveTab] = useState<SettingsTab>("integrations");

  useEffect(() => {
    setLang(storage.getLang());
  }, []);

  return (
    <Layout>
      {/* Breadcrumb */}
      <div style={{ padding: "16px 0 0", fontSize: "13px", color: "#6B7280" }}>
        {getTranslation(lang, "settings")}
        <span style={{ margin: "0 8px" }}>&gt;</span>
        <span style={{ color: "#111827" }}>
          {getTranslation(lang, `settings_${activeTab}`)}
        </span>
      </div>

      <div style={{ display: "flex", gap: "0", marginTop: "16px", minHeight: "calc(100vh - 200px)" }}>
        {/* Left Sidebar */}
        <aside
          style={{
            width: "240px",
            minWidth: "240px",
            borderRight: "1px solid #E5E7EB",
            paddingRight: "0",
            background: "white",
            borderRadius: "8px 0 0 8px",
          }}
        >
          <div style={{ padding: "16px 0" }}>
            <p
              style={{
                padding: "0 20px 12px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {getTranslation(lang, "settings")}
            </p>

            {SETTINGS_MENU.map((item) => {
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 20px",
                    fontSize: "14px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#005BFF" : "#374151",
                    backgroundColor: isActive ? "#F0F6FF" : "transparent",
                    border: "none",
                    borderLeft: isActive ? "3px solid #005BFF" : "3px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "#F9FAFB";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <span style={{ opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                  {getTranslation(lang, item.labelKey)}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: "0 0 0 24px" }}>
          {activeTab === "integrations" && <IntegrationsSection />}
        </main>
      </div>
    </Layout>
  );
}
