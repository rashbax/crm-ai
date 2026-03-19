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
      return `Eng xavfli SKUlar (faqat aktiv sotuvdagilar):\n${risky
        .map((r) => `- ${r.sku}: qoldiq ${r.qty}, qaror ${r.decision.toUpperCase()}`)
        .join("\n")}`;
    }
    return `Самые рискованные SKU (только из активной продажи):\n${risky
      .map((r) => `- ${r.sku}: остаток ${r.qty}, решение ${r.decision.toUpperCase()}`)
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

export async function getAutomationAiSummary(langInput?: string) {
  const lang = normalizeLang(langInput);
  const snapshot = await loadAutomationSnapshot();
  const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);

  const facts = {
    totals: {
      skus: rows.length,
      pause: rows.filter((r) => r.decision === "pause").length,
      reduce: rows.filter((r) => r.decision === "reduce").length,
      noScale: rows.filter((r) => r.decision === "no_scale").length,
      keep: rows.filter((r) => r.decision === "keep").length,
    },
    top: rows.slice(0, 20).map((r) => ({
      sku: r.sku,
      qty: r.qty,
      daysLeft: r.daysLeft,
      spendToday: r.spendToday,
      convToday: r.conversionsToday,
      decision: r.decision,
    })),
  };

  const system =
    lang === "uz"
      ? "Siz marketplace assistentisiz. 5-7 punktli qisqa xulosa yozing. Oddiy inson tilida yozing. Formulalar, tenglamalar, kod, qisqartma-jargon ishlatmang. Faqat berilgan faktlar asosida yozing."
      : "Вы ассистент marketplace. Напишите 5-7 коротких пунктов простым человеческим языком. Без формул, без уравнений, без кода и без технического жаргона. Только по фактам из данных.";

  const prompt = `Data JSON:\n${JSON.stringify(facts)}\n\nReturn only bullet points.`;
  const aiText = await aiOrTemplateText(system, prompt);

  if (aiText) {
    const lines = aiText
      .split("\n")
      .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, "").trim())
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
  const row = rows.find((r) => r.sku === sku);

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
  const snapshot = await loadAutomationSnapshot();
  const rows = buildAutomationDecisionRows(snapshot.stockItems, snapshot.adCampaigns);
  const activeRows = rows.filter(isSellingRelevantRow);
  const salesFacts = await loadSalesFacts();

  if (isTodaySoldQuestion(question)) {
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

  const compactRows = rows.slice(0, 80).map((r) => ({
    sku: r.sku,
    qty: r.qty,
    daysLeft: r.daysLeft,
    spendToday: r.spendToday,
    convToday: r.conversionsToday,
    decision: r.decision,
    waste: r.wasteFlag,
  }));

  const system =
    lang === "uz"
      ? "Siz data Q&A assistentisiz. Faqat berilgan data asosida javob bering. Oddiy inson tilida yozing. Formulalar va texnik ifodalarni ishlatmang. Agar bir nechta SKU bo'lsa, javobni '-' bilan punktlar ko'rinishida bering. Faqat aktiv sotuvga aloqador SKUlarni xavf sifatida ko'rsating."
      : "Вы Q&A ассистент по данным. Отвечайте только на основе предоставленных данных. Пишите простым человеческим языком, без формул и техничных выражений. Если перечисляете несколько SKU, оформляйте ответ коротким списком с '-'. В рисках учитывайте только SKU с активным сигналом продаж.";

  const prompt = `Question: ${question}\n\nAutomation data JSON:\n${JSON.stringify(
    compactRows
  )}\n\nActive-selling rows JSON:\n${JSON.stringify(
    activeRows.slice(0, 80).map((r) => ({
      sku: r.sku,
      qty: r.qty,
      daysLeft: r.daysLeft,
      spendToday: r.spendToday,
      convToday: r.conversionsToday,
      decision: r.decision,
      waste: r.wasteFlag,
    }))
  )}\n\nSales facts JSON:\n${JSON.stringify(salesFacts)}`;

  const aiText = await aiOrTemplateText(system, prompt);

  if (aiText) {
    return { source: "ai" as const, answer: aiText };
  }

  return { source: "template" as const, answer: templateAsk(question, rows, lang, salesFacts) };
}
