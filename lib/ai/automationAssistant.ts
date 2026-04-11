import { buildAutomationDecisionRows, type AutomationDecisionRow } from "@/lib/automation/decisions";
import { loadAutomationSnapshot } from "@/lib/automation/snapshot";
import { generateAiText, isAiConfigured } from "@/lib/ai/openai";
import { getBusinessIsoDay } from "@/lib/date";
import path from "path";
import { readJsonFile } from "@/src/integrations/storage";
import { filterByEnabledConnections, getEnabledConnections } from "@/src/integrations/enabled";
import type { OrderEvent } from "@/src/pricing/types";

type Lang = "ru" | "uz";
const ORDERS_FILE = path.join(process.cwd(), "data", "canonical", "orders.json");

function normalizeLang(value?: string): Lang {
  return value === "uz" ? "uz" : "ru";
}

function isCancelledStatus(status?: string): boolean {
  if (!status) return false;
  const value = status.toLowerCase();
  return value.includes("cancel") || value.includes("cancelled") || value.includes("canceled") || value.includes("отмен");
}

async function loadSalesFacts() {
  const enabledConnections = await getEnabledConnections();
  const rawOrders = await readJsonFile<OrderEvent[]>(ORDERS_FILE, []);
  const orders = filterByEnabledConnections(rawOrders, enabledConnections);
  const today = getBusinessIsoDay();

  const todayOrders = orders.filter((o) => {
    const day = getBusinessIsoDay(o.date);
    return day === today && !isCancelledStatus(o.sourceStatus);
  });

  const todaySoldUnits = todayOrders.reduce((sum, o) => sum + Math.max(0, Math.floor(o.qty || 0)), 0);
  const bySku = new Map<string, number>();
  for (const order of todayOrders) {
    bySku.set(order.sku, (bySku.get(order.sku) || 0) + Math.max(0, Math.floor(order.qty || 0)));
  }
  const topTodaySkus = Array.from(bySku.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, qty]) => ({ sku, qty }));

  return {
    today,
    todayOrdersCount: todayOrders.length,
    todaySoldUnits,
    topTodaySkus,
  };
}

function isTodaySoldQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const uz = q.includes("bugun") && (q.includes("sot") || q.includes("necha dona") || q.includes("qancha"));
  const ru = q.includes("сегодня") && (q.includes("прод") || q.includes("сколько"));
  const en = q.includes("today") && (q.includes("sold") || q.includes("how many"));
  return uz || ru || en;
}

function isSellingRelevantRow(row: AutomationDecisionRow): boolean {
  return row.dailySales > 0 || row.adStatus === "active" || row.spend7d > 0 || row.conversions7d > 0;
}

function topWaste(rows: AutomationDecisionRow[]): AutomationDecisionRow | null {
  const risky = rows.filter((r) => r.wasteFlag);
  if (risky.length === 0) return null;
  return risky.sort((a, b) => b.spendToday - a.spendToday)[0];
}

function topList(rows: AutomationDecisionRow[], kind: "pause" | "reduce", limit = 3): string[] {
  return rows
    .filter((r) => r.decision === kind)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, limit)
    .map((r) => r.sku);
}

function templateSummary(rows: AutomationDecisionRow[], lang: Lang): string[] {
  const pause = rows.filter((r) => r.decision === "pause");
  const reduce = rows.filter((r) => r.decision === "reduce");
  const noScale = rows.filter((r) => r.decision === "no_scale");
  const reorder = rows.filter((r) => r.daysLeft !== Infinity && r.daysLeft <= 7);
  const waste = topWaste(rows);

  if (lang === "uz") {
    const lines = [
      `Bugun ${pause.length} ta SKU bo'yicha reklama to'xtatish tavsiya qilindi.`,
      `Bugun ${reduce.length} ta SKU bo'yicha reklama byudjetini 30% kamaytirish tavsiya qilindi.`,
      `${noScale.length} ta SKU uchun reklama oshirilmasdan, barqaror rejimda qoldiriladi.`,
      `${reorder.length} ta SKU yaqin kunlarda tugashi mumkin, shuning uchun oldindan to'ldirish kerak.`,
    ];
    if (waste) lines.push(`Eng xavfli kampaniya hozir ${waste.sku}: bugun xarajat yuqori, natija past.`);
    const topPause = topList(rows, "pause");
    if (topPause.length > 0) lines.push(`Birinchi navbatdagi xavfli SKUlar: ${topPause.join(", ")}.`);
    return lines.slice(0, 7);
  }

  const lines = [
    `Сегодня для ${pause.length} SKU рекомендована остановка рекламы.`,
    `Сегодня для ${reduce.length} SKU рекомендовано снижение рекламного бюджета на 30%.`,
    `${noScale.length} SKU оставлены в стабильном режиме без масштабирования рекламы.`,
    `${reorder.length} SKU могут закончиться в ближайшие дни, по ним нужен ранний дозаказ.`,
  ];
  if (waste) lines.push(`Самая рискованная кампания сейчас у ${waste.sku}: расходы высокие, а результат слабый.`);
  const topPause = topList(rows, "pause");
  if (topPause.length > 0) lines.push(`Приоритетные рискованные SKU: ${topPause.join(", ")}.`);
  return lines.slice(0, 7);
}

function decisionHumanText(row: AutomationDecisionRow, lang: Lang): string {
  if (lang === "uz") {
    if (row.decision === "pause") return "reklamani to'xtatish";
    if (row.decision === "reduce") return "reklama byudjetini kamaytirish";
    if (row.decision === "no_scale") return "reklamani oshirmaslik";
    return "hozircha o'zgarishsiz qoldirish";
  }
  if (row.decision === "pause") return "остановить рекламу";
  if (row.decision === "reduce") return "снизить рекламный бюджет";
  if (row.decision === "no_scale") return "не масштабировать рекламу";
  return "оставить без изменений";
}

function templateExplain(row: AutomationDecisionRow, lang: Lang): string {
  if (lang === "uz") {
    const spendPart = row.spendToday > 0
      ? "Bugun reklama xarajati bor, shu sabab nazorat kuchaytirildi."
      : "Bugun reklama xarajati past, qaror asosan qoldiq holatiga tayandi.";

    return `Bu SKU bo'yicha qaror: ${decisionHumanText(row, lang)}. Sababi, hozirgi qoldiq sotuv tezligiga nisbatan xavfli zonaga kirgan. ${spendPart} AI faqat izoh beradi, bajarishni engine qiladi.`;
  }

  const spendPart = row.spendToday > 0
    ? "Сегодня по рекламе есть расход, поэтому контроль усилен."
    : "Сегодня рекламный расход низкий, решение в основном основано на остатке.";

  return `По этому SKU принято решение: ${decisionHumanText(row, lang)}. Причина в том, что текущий остаток находится в риск-зоне относительно скорости продаж. ${spendPart} AI только объясняет, выполнение делает engine.`;
}

function templateAsk(question: string, rows: AutomationDecisionRow[], lang: Lang, salesFacts: Awaited<ReturnType<typeof loadSalesFacts>>): string {
  const q = question.toLowerCase();
  const activeRows = rows.filter(isSellingRelevantRow);
  const risky = activeRows.filter((r) => r.decision === "pause").sort((a, b) => a.qty - b.qty).slice(0, 5);
  const near7 = activeRows.filter((r) => r.daysLeft !== Infinity && r.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  const waste = activeRows.filter((r) => r.wasteFlag).sort((a, b) => b.spendToday - a.spendToday).slice(0, 3);

  if (isTodaySoldQuestion(q)) {
    if (lang === "uz") {
      const top = salesFacts.topTodaySkus.length
        ? `\n- Top SKUlar: ${salesFacts.topTodaySkus.map((x) => `${x.sku} (${x.qty})`).join(", ")}`
        : "";
      return `Bugungi sotuv:\n- Jami sotilgan: ${salesFacts.todaySoldUnits} dona\n- Buyurtmalar soni: ${salesFacts.todayOrdersCount}${top}`;
    }
    const top = salesFacts.topTodaySkus.length
      ? `\n- Топ SKU: ${salesFacts.topTodaySkus.map((x) => `${x.sku} (${x.qty})`).join(", ")}`
      : "";
    return `Продажи за сегодня:\n- Продано: ${salesFacts.todaySoldUnits} шт\n- Количество заказов: ${salesFacts.todayOrdersCount}${top}`;
  }

  if (q.includes("xavf") || q.includes("risk") || q.includes("опас")) {
    if (risky.length === 0) return lang === "uz" ? "Hozircha kritik xavfdagi SKU yo'q." : "Сейчас нет SKU в критичной зоне.";
    if (lang === "uz") {
      return `Eng xavfli tovarlar (faqat aktiv sotuvdagilar):\n${risky
        .map((r) => `- ${r.sku}: qoldiq ${r.qty} dona, tavsiya — ${decisionHumanText(r, lang)}`)
        .join("\n")}`;
    }
    return `Самые рискованные товары (только из активной продажи):\n${risky
      .map((r) => `- ${r.sku}: остаток ${r.qty} шт., рекомендация — ${decisionHumanText(r, lang)}`)
      .join("\n")}`;
  }

  if (q.includes("7") || q.includes("tug") || q.includes("законч")) {
    if (near7.length === 0) return lang === "uz" ? "Yaqin 7 kunda tugashi kutilayotgan SKU topilmadi." : "SKU с риском окончания в ближайшие 7 дней не найдено.";
    if (lang === "uz") {
      return `Yaqin 7 kunda tugashi mumkin bo'lgan SKUlar:\n${near7
        .map((r) => `- ${r.sku}: taxminan ${Math.max(0, Math.round(r.daysLeft))} kun qoldi`)
        .join("\n")}`;
    }
    return `SKU с риском окончания в ближайшие 7 дней:\n${near7
      .map((r) => `- ${r.sku}: осталось примерно ${Math.max(0, Math.round(r.daysLeft))} дн`)
      .join("\n")}`;
  }

  if (q.includes("pul") || q.includes("spend") || q.includes("kampan") || q.includes("слив")) {
    if (waste.length === 0) return lang === "uz" ? "Bugun pul yeb qo'yayotgan kampaniya aniqlanmadi." : "Сегодня не обнаружено кампаний со сливом бюджета.";
    if (lang === "uz") {
      return `Eng ko'p pul yeyayotgan kampaniyalar:\n${waste
        .map((r) => `- ${r.sku}: bugun xarajat ${Math.round(r.spendToday)}, konversiya ${r.conversionsToday}`)
        .join("\n")}`;
    }
    return `Кампании с наибольшим риском перерасхода:\n${waste
      .map((r) => `- ${r.sku}: расход сегодня ${Math.round(r.spendToday)}, конверсии ${r.conversionsToday}`)
      .join("\n")}`;
  }

  return lang === "uz"
    ? "Savolni aniqroq yozing: bugungi sotuv, xavfli SKU, 7 kunda tugash yoki pul yeyayotgan kampaniya haqida so'rang."
    : "Уточните вопрос: про продажи сегодня, риск SKU, запас на 7 дней или кампании с перерасходом бюджета.";
}

async function aiOrTemplateText(system: string, prompt: string): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const text = await generateAiText({ system, prompt });
    return text.trim() || null;
  } catch (error) {
    console.error("AI call failed, fallback to template:", error);
    return null;
  }
}

function formatDaysLeft(daysLeft: number, lang: Lang): string {
  if (!Number.isFinite(daysLeft) || daysLeft > 365) return lang === "uz" ? "cheksiz" : "неограничен";
  if (daysLeft <= 0) return lang === "uz" ? "закончился" : "закончился";
  return `${Math.round(daysLeft)} ${lang === "uz" ? "kun" : "дн."}`;
}

export async function getAutomationAiSummary(langInput?: string) {
  const lang = normalizeLang(langInput);
  const snapshot = await loadAutomationSnapshot();
  const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);

  const pause = rows.filter((r) => r.decision === "pause");
  const reduce = rows.filter((r) => r.decision === "reduce");
  const noScale = rows.filter((r) => r.decision === "no_scale");
  const keep = rows.filter((r) => r.decision === "keep");
  const criticalStock = rows.filter((r) => Number.isFinite(r.daysLeft) && r.daysLeft <= 7);
  const wasteRows = rows.filter((r) => r.wasteFlag);

  // Priority items: pause decisions with active spend OR near-stockout — top 5 only
  const priorityItems = [
    ...pause.filter((r) => r.spendToday > 0 || r.conversionsToday > 0),
    ...pause.filter((r) => r.spendToday === 0 && r.conversionsToday === 0).slice(0, 3),
  ]
    .slice(0, 5)
    .map((r) => {
      if (lang === "uz") {
        return {
          artikul: r.sku,
          qoldiq_dona: r.qty,
          qoldiq_davom: formatDaysLeft(r.daysLeft, lang),
          ...(r.spendToday > 0 ? { bugun_xarajat: `${Math.round(r.spendToday)} so'm` } : {}),
          ...(r.conversionsToday > 0 ? { bugun_buyurtma: r.conversionsToday } : {}),
          tavsiya: "reklamani to'xtatish",
        };
      }
      return {
        артикул: r.sku,
        остаток_штук: r.qty,
        запас_на: formatDaysLeft(r.daysLeft, lang),
        ...(r.spendToday > 0 ? { расход_сегодня: `${Math.round(r.spendToday)} руб.` } : {}),
        ...(r.conversionsToday > 0 ? { заказы_сегодня: r.conversionsToday } : {}),
        рекомендация: "остановить рекламу",
      };
    });

  let system: string;
  let prompt: string;

  if (lang === "uz") {
    const facts = {
      umumiy_tovarlar: rows.length,
      reklamani_toxtatish_kerak: pause.length,
      budjeti_kamaytirish_kerak: reduce.length,
      masshtabsiz_qoldirish: noScale.length,
      ozgarishsiz: keep.length,
      ...(criticalStock.length > 0 ? { tez_tugaydi_7_kun: criticalStock.length } : {}),
      ...(wasteRows.length > 0 ? { budjet_sarflanmoqda_natijasiz: wasteRows.length } : {}),
      ...(priorityItems.length > 0 ? { birinchi_navbatdagi_tovarlar: priorityItems } : {}),
    };
    system = `Siz marketplace savdo assistentisiz. Quyidagi biznes ma'lumotlari asosida 5–7 ta qisqa xulosa yozing.
Qoidalar:
- Faqat o'zbek tilida, biznes uslubida yozing
- Texnik atamalar, inglizcha so'zlar va maydon nomlarini ASLO ishlatmang
- Nol ko'rsatkichlarni eslatmang
- Har bir xulosa — aniq raqam va harakat
- Ma'lumotlar tuzilmasini tavsiflamas, faqat biznes xulosasini yozing
- Oxirgi xulosa — rahbar uchun tavsiya`;
    prompt = `Biznes ma'lumotlari:\n${JSON.stringify(facts, null, 2)}\n\nFaqat biznes xulosalarini yozing.`;
  } else {
    const facts = {
      всего_товаров: rows.length,
      рекомендовано_остановить_рекламу: pause.length,
      рекомендовано_снизить_бюджет: reduce.length,
      оставить_без_масштабирования: noScale.length,
      без_изменений: keep.length,
      ...(criticalStock.length > 0 ? { заканчиваются_в_течение_7_дней: criticalStock.length } : {}),
      ...(wasteRows.length > 0 ? { слив_бюджета_без_конверсий: wasteRows.length } : {}),
      ...(priorityItems.length > 0 ? { приоритетные_товары: priorityItems } : {}),
    };
    system = `Вы бизнес-ассистент продавца на маркетплейсе. По приведённым данным напишите деловое резюме из 5–7 пунктов.
Требования:
- Деловой русский, понятный руководителю без технических знаний
- ЗАПРЕЩЕНО упоминать названия полей, JSON-ключи, английские слова
- ЗАПРЕЩЕНО описывать структуру данных — только бизнес-выводы
- Нулевые показатели не включайте
- Каждый пункт — конкретное число или факт
- Последний пункт — практическая рекомендация руководителю`;
    prompt = `Бизнес-данные:\n${JSON.stringify(facts, null, 2)}\n\nНапишите только бизнес-резюме, без описания данных.`;
  }

  const aiText = await aiOrTemplateText(system, prompt);

  if (aiText) {
    const lines = aiText
      .split("\n")
      .map((line) => line.replace(/^\s*[-*•]\s+|\s*\d+[.)]\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 7);

    if (lines.length > 0) return { source: "ai" as const, lines, rowsCount: rows.length };
  }

  return { source: "template" as const, lines: templateSummary(rows, lang), rowsCount: rows.length };
}

export async function getAutomationAiExplanation(sku: string, langInput?: string) {
  const lang = normalizeLang(langInput);
  const snapshot = await loadAutomationSnapshot();
  const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);
  const directRow = rows.find((r) => r.sku === sku);
  const matchedAd = snapshot.adCampaigns.find((campaign) => campaign.sku === sku || campaign.resolvedSku === sku);
  const row = directRow || (matchedAd?.resolvedSku ? rows.find((r) => r.sku === matchedAd.resolvedSku) : undefined);

  if (!row) {
    return {
      source: "template" as const,
      explanation: lang === "uz" ? `Bu SKU topilmadi: ${sku}.` : `Этот SKU не найден: ${sku}.`,
    };
  }

  const system =
    lang === "uz"
      ? "Siz qarorni tushuntiruvchi assistentsiz. 2-4 gapda oddiy, tushunarli tilda yozing. Formulalar ishlatmang. Qarorni o'zgartirmang, faqat sababini ayting."
      : "Вы ассистент объяснения решения. Объясните в 2-4 предложениях простым языком, без формул. Не меняйте решение, только объясните причину.";
  const prompt = `Decision JSON:\n${JSON.stringify(row)}\n\nExplain naturally for a business owner.`;
  const aiText = await aiOrTemplateText(system, prompt);

  if (aiText) {
    return { source: "ai" as const, explanation: aiText };
  }

  return { source: "template" as const, explanation: templateExplain(row, lang) };
}

export async function getAutomationAiAnswer(question: string, langInput?: string) {
  const lang = normalizeLang(langInput);
  const salesFacts = await loadSalesFacts();

  // Quick template for simple "today sold" questions when AI is not configured
  if (isTodaySoldQuestion(question) && !isAiConfigured()) {
    if (lang === "uz") {
      const top = salesFacts.topTodaySkus.length
        ? `\n- Top SKUlar: ${salesFacts.topTodaySkus.map((x) => `${x.sku} (${x.qty})`).join(", ")}`
        : "";
      return {
        source: "template" as const,
        answer: `Bugungi sotuv:\n- Jami sotilgan: ${salesFacts.todaySoldUnits} dona\n- Buyurtmalar soni: ${salesFacts.todayOrdersCount}${top}`,
      };
    }
    const top = salesFacts.topTodaySkus.length
      ? `\n- Топ SKU: ${salesFacts.topTodaySkus.map((x) => `${x.sku} (${x.qty})`).join(", ")}`
      : "";
    return {
      source: "template" as const,
      answer: `Продажи за сегодня:\n- Продано: ${salesFacts.todaySoldUnits} шт\n- Количество заказов: ${salesFacts.todayOrdersCount}${top}`,
    };
  }

  // Load full CRM context for AI
  const { loadFullCrmContext } = await import("@/lib/ai/dataContext");
  const ctx = await loadFullCrmContext();

  const system =
    lang === "uz"
      ? `Siz CRM marketplace assistentisiz. Sizda barcha ma'lumotlar bor: sotuvlar, mahsulotlar, narxlar, qoldiqlar, reklama, vazifalar, hodisalar, tasdiqlar. Faqat berilgan data asosida javob bering. Oddiy inson tilida yozing. Formulalar ishlatmang. Agar ro'yxat bo'lsa '-' bilan yozing. Raqamlarni aniq keltiring. Javob ${lang === "uz" ? "o'zbek" : "rus"} tilida bo'lsin.`
      : `Вы CRM ассистент маркетплейса. У вас есть все данные: продажи, товары, цены, остатки, реклама, задачи, инциденты, одобрения. Отвечайте только на основе данных. Пишите простым языком, без формул. Списки оформляйте через '-'. Приводите конкретные цифры. Отвечайте на русском.`;

  const prompt = `Вопрос: ${question}\n\nПолные данные CRM:\n${JSON.stringify(ctx)}`;

  const aiText = await aiOrTemplateText(system, prompt);

  if (aiText) {
    return { source: "ai" as const, answer: aiText };
  }

  // Fallback to template if AI fails
  const snapshot = await loadAutomationSnapshot();
  const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);
  return { source: "template" as const, answer: templateAsk(question, rows, lang, salesFacts) };
}
