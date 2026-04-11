"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ChartDataPoint {
  date: string;
  revenue: number;
  orders: number;
  delivered?: number;
  deliveredRevenue?: number;
  prevDate?: string;
  prevRevenue?: number;
  prevOrders?: number;
}

interface PeriodLabel {
  start: string;
  end: string;
}

interface RevenueChartProps {
  data: ChartDataPoint[];
  lang?: "ru" | "uz";
  metric?: "revenue" | "orders";
  periodLabels?: {
    current: PeriodLabel;
    previous: PeriodLabel;
  };
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("ru-RU").format(value);
};

const WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const WEEKDAYS_UZ = ["yak", "du", "se", "cho", "pay", "ju", "sha"];
const MONTHS_RU = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
const MONTHS_UZ = ["yan", "fev", "mart", "apr", "may", "iyun", "iyul", "avg", "sen", "okt", "noy", "dek"];

const parseUTC = (iso: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const d = new Date(iso + "T12:00:00Z");
  return isNaN(d.getTime()) ? null : d;
};

const formatDayWeekday = (iso: string, lang: string): string => {
  const d = parseUTC(iso);
  if (!d) return iso;
  const weekdays = lang === "ru" ? WEEKDAYS_RU : WEEKDAYS_UZ;
  const months = lang === "ru" ? MONTHS_RU : MONTHS_UZ;
  return `${weekdays[d.getUTCDay()].charAt(0).toUpperCase() + weekdays[d.getUTCDay()].slice(1)}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

const formatShortDate = (iso: string, lang: string): string => {
  const d = parseUTC(iso);
  if (!d) return iso;
  const months = lang === "ru" ? MONTHS_RU : MONTHS_UZ;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

const formatDateRange = (start: string, end: string, lang: string): string => {
  return `${formatShortDate(start, lang)} – ${formatShortDate(end, lang)}`;
};

const formatXAxisDate = (iso: string, lang: string): string => {
  const d = parseUTC(iso);
  if (!d) return iso;
  const weekdays = lang === "ru" ? WEEKDAYS_RU : WEEKDAYS_UZ;
  return `${d.getUTCDate()}, ${weekdays[d.getUTCDay()]}`;
};

const CustomTooltip = ({ active, payload, lang, metric }: any) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const currentVal = metric === "orders" ? data.orders : data.revenue;
  const prevVal = metric === "orders" ? data.prevOrders : data.prevRevenue;
  const hasPrev = prevVal != null && prevVal >= 0 && data.prevDate;

  const unit = metric === "orders"
    ? (lang === "ru" ? "шт" : "dona")
    : "₽";
  const formatVal = (v: number) =>
    metric === "orders" ? `${formatNumber(v)} ${unit}` : `${formatNumber(v)} ${unit}`;

  // Difference
  let diff = 0;
  let diffPct = 0;
  if (hasPrev) {
    diff = currentVal - prevVal;
    diffPct = prevVal > 0 ? Math.round((diff / prevVal) * 100) : (currentVal > 0 ? 100 : 0);
  }

  const title = metric === "orders"
    ? (lang === "ru" ? "Заказано, шт" : "Buyurtmalar, dona")
    : (lang === "ru" ? "Заказано на сумму, ₽" : "Buyurtmalar summasi, ₽");

  return (
    <div className="bg-[#1a1a2e] text-white rounded-lg shadow-xl px-4 py-3 min-w-[260px]">
      <p className="text-xs text-gray-400 mb-3">{title}</p>

      {/* Current period row */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 bg-[#00A86B] inline-block rounded" />
          <span className="text-sm text-gray-300">{formatDayWeekday(data.date, lang)}</span>
        </div>
        <span className="text-sm font-bold text-white">{formatVal(currentVal)}</span>
      </div>

      {/* Previous period row */}
      {hasPrev && (
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 inline-block rounded opacity-50" style={{ backgroundImage: "repeating-linear-gradient(90deg, #00A86B 0, #00A86B 3px, transparent 3px, transparent 6px)", backgroundSize: "6px 2px" }} />
            <span className="text-sm text-gray-300">{formatDayWeekday(data.prevDate, lang)}</span>
          </div>
          <span className="text-sm font-bold text-white">{formatVal(prevVal)}</span>
        </div>
      )}

      {/* Difference row */}
      {hasPrev && (
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-600">
          <span className="text-sm text-gray-300">{lang === "ru" ? "Разница" : "Farq"}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{formatVal(Math.abs(diff))}</span>
            <span className={`text-sm font-semibold ${diff >= 0 ? "text-[#00C853]" : "text-[#FF5252]"}`}>
              {diff >= 0 ? "+" : ""}{diffPct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export function RevenueChart({ data, lang = "ru", metric = "revenue", periodLabels }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-background rounded-lg">
        <p className="text-text-muted text-sm">
          {lang === "ru" ? "Нет данных для отображения" : "Ma'lumot yo'q"}
        </p>
      </div>
    );
  }

  const hasPrevData = data.some((d) => (d.prevOrders || 0) > 0 || (d.prevRevenue || 0) > 0);
  const dataKey = metric === "orders" ? "orders" : "revenue";
  const prevDataKey = metric === "orders" ? "prevOrders" : "prevRevenue";

  return (
    <div>
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="date"
              stroke="#6B7280"
              style={{ fontSize: "11px" }}
              tickMargin={8}
              tickFormatter={(val) => formatXAxisDate(val, lang)}
            />
            <YAxis
              stroke="#6B7280"
              style={{ fontSize: "12px" }}
              tickFormatter={(value) => {
                const v = Number(value);
                if (metric === "orders") return `${Math.round(v)}`;
                if (v >= 1000000) return `${(v / 1000000).toFixed(1)} млн`;
                if (v >= 1000) return `${Math.round(v / 1000)} тыс.`;
                return `${Math.round(v)}`;
              }}
              tickMargin={8}
            />
            <Tooltip
              content={<CustomTooltip lang={lang} metric={metric} />}
              cursor={{ stroke: "#9CA3AF", strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            {/* Current period - solid green line */}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="#00A86B"
              strokeWidth={2}
              dot={{ fill: "#00A86B", r: 3 }}
              activeDot={{ r: 5, fill: "#00A86B", stroke: "#fff", strokeWidth: 2 }}
            />
            {/* Previous period - dashed green line */}
            {hasPrevData && (
              <Line
                type="monotone"
                dataKey={prevDataKey}
                stroke="#00A86B"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4, fill: "#00A86B", stroke: "#fff", strokeWidth: 2 }}
                opacity={0.4}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend like Ozon */}
      {periodLabels && (
        <div className="flex items-center gap-6 mt-3 px-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-0.5 bg-[#00A86B] rounded" />
            <span className="text-sm text-text-muted">
              {lang === "ru" ? "Текущий период" : "Joriy davr"}:{" "}
              {formatDateRange(periodLabels.current.start, periodLabels.current.end, lang)}
            </span>
          </div>
          {hasPrevData && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-0.5 rounded opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg, #00A86B 0, #00A86B 3px, transparent 3px, transparent 6px)" }} />
              <span className="text-sm text-text-muted">
                {lang === "ru" ? "Прошлый период" : "Oldingi davr"}:{" "}
                {formatDateRange(periodLabels.previous.start, periodLabels.previous.end, lang)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
