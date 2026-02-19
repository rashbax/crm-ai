"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";

export default function PromoPage() {
  const [lang, setLang] = useState<Language>("ru");

  useEffect(() => {
    setLang(storage.getLang());
  }, []);

  return (
    <Layout>
      <div className="page-header mb-3.5">
        <div>
          <div className="text-xl font-semibold">
            {getTranslation(lang, "promo_title")}
          </div>
          <div className="text-[13px] text-[#6B7280]">
            {getTranslation(lang, "promo_subtitle")}
          </div>
        </div>
        <button className="rounded-full px-3.5 py-1.5 text-sm font-medium bg-[#005BFF] text-white hover:brightness-105">
          {getTranslation(lang, "promo_new_button")}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-6 mt-2">
        <p className="text-sm text-[#6B7280]">
          {getTranslation(lang, "promo_summary_text")}
        </p>
      </div>
    </Layout>
  );
}
