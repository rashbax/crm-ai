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
}

interface RevenueChartProps {
  data: ChartDataPoint[];
  lang?: "ru" | "uz";
  metric?: "revenue" | "orders";
}

// Format currency for tooltip
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("ru-RU", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Custom tooltip
const CustomTooltip = ({ active, payload, lang, metric }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-xs font-medium text-text-main mb-1">{data.date}</p>
        {metric === "orders" ? (
          <p className="text-sm font-semibold text-primary">
            {data.orders} {lang === "ru" ? "шт" : "dona"}
          </p>
        ) : (
          <p className="text-sm font-semibold text-primary">
            {formatCurrency(data.revenue)} ₽
          </p>
        )}
        <p className="text-xs text-text-muted">
          {data.orders} {lang === "ru" ? "заказов" : "buyurtma"}
        </p>
      </div>
    );
  }
  return null;
};

export function RevenueChart({ data, lang = "ru", metric = "revenue" }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-background rounded-lg">
        <p className="text-text-muted text-sm">
          {lang === "ru" ? "Нет данных для отображения" : "Ma'lumot yo'q"}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            stroke="#6B7280"
            style={{ fontSize: "12px" }}
            tickMargin={8}
          />
          <YAxis
            stroke="#6B7280"
            style={{ fontSize: "12px" }}
            tickFormatter={(value) =>
              metric === "orders" ? `${Math.round(Number(value))}` : `${(Number(value) / 1000).toFixed(0)}k`
            }
            tickMargin={8}
          />
          <Tooltip content={<CustomTooltip lang={lang} metric={metric} />} />
          <Line
            type="monotone"
            dataKey={metric === "orders" ? "orders" : "revenue"}
            stroke="#005BFF"
            strokeWidth={2}
            dot={{ fill: "#005BFF", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
