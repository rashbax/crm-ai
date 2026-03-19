"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";

const navItems = [
  { href: "/dashboard", key: "nav_main" },
  { href: "/tasks", key: "nav_tasks" },
  { href: "/responsibilities", key: "nav_responsibilities" },
  { href: "/orders", key: "nav_orders" },
  { href: "/products", key: "nav_products" },
  { href: "/automation", key: "nav_automation" },
  { href: "/prices", key: "nav_prices" },
  { href: "/finance", key: "nav_finance" },
  { href: "/analytics", key: "nav_analytics" },
  { href: "/integrations", key: "nav_integrations" },
  { href: "/crm", key: "nav_crm" },
  { href: "/promo", key: "nav_promo" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>("ru");

  useEffect(() => {
    setLang(storage.getLang());
  }, []);

  return (
    <nav className="main-nav">
      <div className="main-tabs">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`main-tab ${isActive ? "active" : ""}`}
            >
              {getTranslation(lang, item.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
