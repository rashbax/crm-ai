"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import type { AutomationMode, AutomationStats, AutomationDecision } from "@/types/automation";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  CardSubtitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  StatusPill,
  MetricMain,
  MetricLabel,
} from "@/components/ui";
import {
  processBatch,
  calculateStockStatus,
  calculateDaysUntilStockout,
  calculateTotalSavings,
} from "@/lib/automation-engine";
import { DEFAULT_AUTOMATION_RULES, getActiveRules } from "@/lib/automation-rules";
import type { StockItem, AdCampaign } from "@/types/automation";

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Generate mock stock data
const generateMockStock = (): StockItem[] => {
  const products = [
    { name: "Футболка oversize Rubi&Jons", sku: "RJ-001-BLK-M" },
    { name: "Толстовка с капюшоном", sku: "RJ-002-WHT-L" },
    { name: "Спортивные брюки", sku: "RJ-003-GRY-M" },
    { name: "Рюкзак 25L", sku: "RJ-004-BLK-OS" },
    { name: "Кроссовки беговые", sku: "RJ-005-WHT-42" },
    { name: "Бейсболка", sku: "RJ-006-BLK-OS" },
    { name: "Носки спортивные", sku: "RJ-007-WHT-M" },
    { name: "Шорты летние", sku: "RJ-008-BLU-L" },
    { name: "Куртка ветровка", sku: "RJ-009-BLK-XL" },
    { name: "Перчатки", sku: "RJ-010-GRY-L" },
  ];

  const marketplaces: ("Ozon" | "Wildberries")[] = ["Ozon", "Wildberries"];
  
  return products.map((p, i) => {
    const qty = i === 0 ? 150 : i === 1 ? 350 : i === 2 ? 750 : i === 3 ? 1200 : Math.floor(Math.random() * 1500);
    const dailySales = Math.floor(Math.random() * 50) + 10;
    
    return {
      id: `STK-${1000 + i}`,
      sku: p.sku,
      name: p.name,
      marketplace: marketplaces[i % 2],
      qty,
      dailySales,
      rop: Math.floor(dailySales * 7 + 50),
      leadTime: 7,
      safetyStock: 50,
      lastUpdated: new Date().toISOString(),
      status: calculateStockStatus(qty, dailySales),
    };
  });
};

// Generate mock ads
const generateMockAds = (): AdCampaign[] => {
  return [
    {
      id: "AD-001",
      sku: "RJ-001-BLK-M",
      name: "Футболка Campaign",
      platform: "Ozon",
      status: "active",
      dailyBudget: 500,
      currentBudget: 500,
      spendToday: 320,
      impressions: 12500,
      clicks: 380,
      conversions: 15,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: "AD-002",
      sku: "RJ-002-WHT-L",
      name: "Толстовка Campaign",
      platform: "Wildberries",
      status: "active",
      dailyBudget: 600,
      currentBudget: 600,
      spendToday: 450,
      impressions: 15200,
      clicks: 420,
      conversions: 18,
      lastUpdated: new Date().toISOString(),
    },
  ];
};

export default function AutomationPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [mode, setMode] = useState<AutomationMode>("dry_run");
  const [enabled, setEnabled] = useState(true);
  const [stockItems] = useState<StockItem[]>(generateMockStock());
  const [adCampaigns] = useState<AdCampaign[]>(generateMockAds());
  const [decisions, setDecisions] = useState<AutomationDecision[]>([]);
  const [lastCheck, setLastCheck] = useState<string>("");

  useEffect(() => {
    setLang(storage.getLang());
    runAutomationCheck();
  }, []);

  const runAutomationCheck = () => {
    const rules = getActiveRules();
    const newDecisions = processBatch(stockItems, rules, mode);
    setDecisions(newDecisions);
    setLastCheck(new Date().toLocaleTimeString('ru-RU'));
  };

  // Calculate stats
  const stats: AutomationStats = {
    totalProducts: stockItems.length,
    activeRules: DEFAULT_AUTOMATION_RULES.filter(r => r.enabled).length,
    todayDecisions: decisions.length,
    moneySaved: calculateTotalSavings(decisions, adCampaigns),
    criticalAlerts: stockItems.filter(s => s.status === "critical").length,
    pausedAds: decisions.filter(d => d.recommendedActions[0]?.action === "pause").length,
    reducedAds: decisions.filter(d => d.recommendedActions[0]?.action === "reduce").length,
    lastCheck: lastCheck,
  };

  const handleModeChange = (newMode: AutomationMode) => {
    setMode(newMode);
    // In real app, this would trigger automation re-evaluation
  };

  const handleExecuteDecision = (decisionId: string) => {
    // In real app, this would execute the action via API
    alert(lang === "ru" 
      ? `Решение ${decisionId} будет выполнено. В реальном приложении это вызовет API для управления рекламой.`
      : `Qaror ${decisionId} bajariladi. Haqiqiy ilovada bu reklama boshqaruvi API ni chaqiradi.`
    );
  };

  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {lang === "ru" ? "Автоматизация" : "Avtomatlashtirish"}
          </h1>
          <p className="page-subtitle">
            {lang === "ru" 
              ? "Автоматическое управление рекламой на основе остатков"
              : "Qoldiqlar asosida reklama boshqaruvi"
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={enabled ? "success" : "ghost"}
            onClick={() => setEnabled(!enabled)}
          >
            {enabled 
              ? (lang === "ru" ? "✓ Включено" : "✓ Yoqilgan")
              : (lang === "ru" ? "Выключено" : "O'chirilgan")
            }
          </Button>
          <Button variant="primary" onClick={runAutomationCheck}>
            {lang === "ru" ? "Проверить" : "Tekshirish"}
          </Button>
        </div>
      </div>

      {/* Mode Selector */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-text-main mb-1">
                {lang === "ru" ? "Режим работы" : "Ish rejimi"}
              </h3>
              <p className="text-sm text-text-muted">
                {mode === "manual" && (lang === "ru" 
                  ? "Показывает рекомендации, не выполняет действия автоматически"
                  : "Tavsiyalarni ko'rsatadi, avtomatik bajarmaydi"
                )}
                {mode === "dry_run" && (lang === "ru"
                  ? "Логирует решения, показывает что будет сделано (безопасный режим)"
                  : "Qarorlarni yozadi, nima qilinishini ko'rsatadi (xavfsiz rejim)"
                )}
                {mode === "auto" && (lang === "ru"
                  ? "Автоматически выполняет действия по правилам"
                  : "Qoidalar bo'yicha avtomatik bajaradi"
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={mode === "manual" ? "primary" : "ghost"}
                size="sm"
                onClick={() => handleModeChange("manual")}
              >
                {lang === "ru" ? "РУЧНОЙ" : "QOʻLDA"}
              </Button>
              <Button
                variant={mode === "dry_run" ? "primary" : "ghost"}
                size="sm"
                onClick={() => handleModeChange("dry_run")}
              >
                {lang === "ru" ? "ТЕСТОВЫЙ" : "TEST"}
              </Button>
              <Button
                variant={mode === "auto" ? "primary" : "ghost"}
                size="sm"
                onClick={() => handleModeChange("auto")}
              >
                {lang === "ru" ? "АВТО" : "AVTO"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Решения сегодня" : "Bugungi qarorlar"}</MetricLabel>
            <MetricMain className="text-primary">{stats.todayDecisions}</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "Требуют внимания" : "E'tibor talab qiladi"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Потенциальная экономия" : "Potensial tejamkorlik"}</MetricLabel>
            <MetricMain className="text-success">₽{formatCurrency(stats.moneySaved)}</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "За период до пополнения" : "To'ldirilgunga qadar"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Критические товары" : "Kritik mahsulotlar"}</MetricLabel>
            <MetricMain className="text-danger">{stats.criticalAlerts}</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "Требуют действий" : "Harakat talab qiladi"}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MetricLabel>{lang === "ru" ? "Активные правила" : "Aktiv qoidalar"}</MetricLabel>
            <MetricMain>{stats.activeRules}</MetricMain>
            <p className="text-xs text-text-muted mt-1">
              {lang === "ru" ? "Из 6 правил" : "6 qoidadan"}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Decisions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{lang === "ru" ? "Решения автоматизации" : "Avtomatlashtirish qarorlari"}</CardTitle>
              <CardSubtitle>
                {lang === "ru" 
                  ? `Последняя проверка: ${lastCheck || "Не проводилась"}`
                  : `Oxirgi tekshiruv: ${lastCheck || "O'tkazilmagan"}`
                }
              </CardSubtitle>
            </div>
            {stats.todayDecisions > 0 && (
              <Badge variant="danger">
                {stats.todayDecisions} {lang === "ru" ? "требуют внимания" : "e'tibor kerak"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {decisions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "ru" ? "SKU" : "SKU"}</TableHead>
                  <TableHead>{lang === "ru" ? "Товар" : "Mahsulot"}</TableHead>
                  <TableHead>{lang === "ru" ? "Остаток" : "Qoldiq"}</TableHead>
                  <TableHead>{lang === "ru" ? "Дней" : "Kunlar"}</TableHead>
                  <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
                  <TableHead>{lang === "ru" ? "Рекомендация" : "Tavsiya"}</TableHead>
                  <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((decision) => {
                  const topAction = decision.recommendedActions[0];
                  return (
                    <TableRow key={decision.id}>
                      <TableCell className="font-mono text-xs">{decision.sku}</TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate">{decision.productName}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${
                          decision.status === "critical" ? "text-danger" :
                          decision.status === "low" ? "text-warning" :
                          "text-text-main"
                        }`}>
                          {decision.currentQty}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {decision.daysLeft === Infinity ? "∞" : decision.daysLeft}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusPill status={decision.status}>
                          {lang === "ru" 
                            ? decision.status === "critical" ? "Критично" : decision.status === "low" ? "Низкий" : "Норма"
                            : decision.status === "critical" ? "Kritik" : decision.status === "low" ? "Past" : "Normal"
                          }
                        </StatusPill>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">
                            {topAction?.action === "pause" && "⏸️ " + (lang === "ru" ? "Остановить рекламу" : "Reklamani to'xtatish")}
                            {topAction?.action === "reduce" && "📉 " + (lang === "ru" ? "Снизить бюджет" : "Byudjetni kamaytirish")}
                            {topAction?.action === "resume" && "▶️ " + (lang === "ru" ? "Возобновить" : "Qayta boshlash")}
                          </div>
                          <div className="text-xs text-text-muted mt-1">
                            {topAction?.impact}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant={mode === "auto" ? "ghost" : "primary"}
                          size="sm"
                          onClick={() => handleExecuteDecision(decision.id)}
                          disabled={mode === "auto"}
                        >
                          {mode === "auto" 
                            ? (lang === "ru" ? "Авто" : "Avto")
                            : (lang === "ru" ? "Выполнить" : "Bajarish")
                          }
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-lg font-medium text-text-main mb-2">
                ✓ {lang === "ru" ? "Все товары в норме" : "Barcha mahsulotlar normal"}
              </p>
              <p className="text-sm text-text-muted">
                {lang === "ru" 
                  ? "Нет товаров, требующих внимания. Система работает нормально."
                  : "E'tibor talab qiladigan mahsulotlar yo'q. Tizim normal ishlayapti."
                }
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Active Rules Summary */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{lang === "ru" ? "Активные правила" : "Aktiv qoidalar"}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEFAULT_AUTOMATION_RULES.filter(r => r.enabled).map((rule) => (
              <div key={rule.id} className="p-4 bg-background rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-text-main">{rule.name}</h4>
                  <Badge variant="primary">P{rule.priority}</Badge>
                </div>
                <p className="text-sm text-text-muted mb-2">{rule.description}</p>
                <div className="text-xs text-text-muted">
                  {rule.action.type === "ads_pause" && "⏸️ Останавливает рекламу"}
                  {rule.action.type === "ads_reduce" && "📉 Снижает бюджет"}
                  {rule.action.type === "ads_resume" && "▶️ Возобновляет рекламу"}
                  {rule.action.type === "send_alert" && "🔔 Отправляет уведомление"}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </Layout>
  );
}
