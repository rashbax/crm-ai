"use client";

import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { storage } from "@/lib/storage";
import { getTranslation } from "@/lib/translations";
import type { Language } from "@/types";
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  SearchInput,
  Button,
  StatusPill,
  Badge,
  Chip,
} from "@/components/ui";

// CRM types
type MessageType = "question" | "discount" | "review" | "complaint" | "order";
type MessageStatus = "new" | "replied" | "closed";
type Marketplace = "Ozon" | "Wildberries";

interface CustomerMessage {
  id: string;
  customer: string;
  type: MessageType;
  message: string;
  marketplace: Marketplace;
  date: string;
  status: MessageStatus;
  tags: string[];
  orderId?: string;
}

// Generate mock customer messages
const generateMockMessages = (): CustomerMessage[] => {
  const types: MessageType[] = ["question", "discount", "review", "complaint", "order"];
  const statuses: MessageStatus[] = ["new", "replied", "closed"];
  const marketplaces: Marketplace[] = ["Ozon", "Wildberries"];
  const customers = [
    "Олег Кузнецов",
    "Мария Смирнова",
    "Алексей Петров",
    "Елена Дмитриева",
    "Иван Михайлов",
    "Светлана Борисова",
    "Дмитрий Соколов",
    "Анна Волкова",
  ];

  const messageTemplates = {
    question: [
      "Когда будет доставка?",
      "Есть ли размер L в наличии?",
      "Как вернуть товар?",
      "Какой состав у этой футболки?",
    ],
    discount: [
      "Можно скидку на следующий заказ?",
      "Есть ли акции сейчас?",
      "Дайте промокод, пожалуйста",
      "Можете сделать скидку 10%?",
    ],
    review: [
      "Отличный товар! Спасибо!",
      "Размер маломерит, будьте внимательны",
      "Качество супер, быстрая доставка",
      "Не подошел размер, но товар хороший",
    ],
    complaint: [
      "Товар пришел с браком",
      "Не та расцветка",
      "Курьер был грубым",
      "Упаковка помята",
    ],
    order: [
      "Вопрос по заказу #54821",
      "Где мой заказ?",
      "Изменить адрес доставки",
      "Отменить заказ",
    ],
  };

  const tags = [
    ["Срочно", "Ozon"],
    ["Скидка", "VIP"],
    ["Новый клиент"],
    ["Повторный"],
    ["Негатив"],
    ["Позитив"],
  ];

  const messages: CustomerMessage[] = [];
  const today = new Date();

  for (let i = 0; i < 25; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const status = i < 8 ? "new" : statuses[Math.floor(Math.random() * statuses.length)];
    const messageDate = new Date(today.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    
    messages.push({
      id: `MSG-${2000 + i}`,
      customer: customers[Math.floor(Math.random() * customers.length)],
      type,
      message: messageTemplates[type][Math.floor(Math.random() * messageTemplates[type].length)],
      marketplace: marketplaces[Math.floor(Math.random() * marketplaces.length)],
      date: messageDate.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      status,
      tags: tags[Math.floor(Math.random() * tags.length)],
      orderId: type === "order" ? `#${54800 + Math.floor(Math.random() * 50)}` : undefined,
    });
  }

  return messages.sort((a, b) => {
    if (a.status === "new" && b.status !== "new") return -1;
    if (a.status !== "new" && b.status === "new") return 1;
    return 0;
  });
};

export default function CRMPage() {
  const [lang, setLang] = useState<Language>("ru");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MessageType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MessageStatus | "all">("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [messagesPerPage] = useState(10);
  const [selectedMessage, setSelectedMessage] = useState<CustomerMessage | null>(null);
  
  const [allMessages] = useState<CustomerMessage[]>(generateMockMessages());

  useEffect(() => {
    setLang(storage.getLang());
  }, []);

  // Filter messages
  const filteredMessages = allMessages.filter(message => {
    const matchesSearch = 
      message.customer.toLowerCase().includes(search.toLowerCase()) ||
      message.message.toLowerCase().includes(search.toLowerCase()) ||
      message.id.toLowerCase().includes(search.toLowerCase());
    
    const matchesType = typeFilter === "all" || message.type === typeFilter;
    const matchesStatus = statusFilter === "all" || message.status === statusFilter;
    const matchesMarketplace = marketplaceFilter === "all" || message.marketplace === marketplaceFilter;
    
    return matchesSearch && matchesType && matchesStatus && matchesMarketplace;
  });

  // Pagination
  const indexOfLastMessage = currentPage * messagesPerPage;
  const indexOfFirstMessage = indexOfLastMessage - messagesPerPage;
  const currentMessages = filteredMessages.slice(indexOfFirstMessage, indexOfLastMessage);
  const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);

  // Counts
  const statusCounts = {
    all: allMessages.length,
    new: allMessages.filter(m => m.status === "new").length,
    replied: allMessages.filter(m => m.status === "replied").length,
    closed: allMessages.filter(m => m.status === "closed").length,
  };

  const typeCounts = {
    question: allMessages.filter(m => m.type === "question").length,
    discount: allMessages.filter(m => m.type === "discount").length,
    review: allMessages.filter(m => m.type === "review").length,
    complaint: allMessages.filter(m => m.type === "complaint").length,
    order: allMessages.filter(m => m.type === "order").length,
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleResetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setMarketplaceFilter("all");
    setCurrentPage(1);
  };

  const getTypeName = (type: MessageType): string => {
    const names = {
      question: lang === "ru" ? "Вопрос" : "Savol",
      discount: lang === "ru" ? "Скидка" : "Chegirma",
      review: lang === "ru" ? "Отзыв" : "Sharh",
      complaint: lang === "ru" ? "Жалоба" : "Shikoyat",
      order: lang === "ru" ? "Заказ" : "Buyurtma",
    };
    return names[type];
  };

  const getTypeIcon = (type: MessageType): string => {
    const icons = {
      question: "❓",
      discount: "💰",
      review: "⭐",
      complaint: "⚠️",
      order: "📦",
    };
    return icons[type];
  };

  return (
    <Layout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {getTranslation(lang, "crm_title")}
          </h1>
          <p className="page-subtitle">
            {getTranslation(lang, "crm_subtitle")}
          </p>
        </div>
        <Button variant="primary">
          {lang === "ru" ? "Новое сообщение" : "Yangi xabar"}
        </Button>
      </div>

      {/* Filters & Search Toolbar */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[250px]">
              <SearchInput
                placeholder={lang === "ru" ? "Поиск по клиентам, сообщениям..." : "Mijoz, xabarlar bo'yicha qidirish..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Type Filter */}
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as MessageType | "all")}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">
                  {lang === "ru" ? "Все типы" : "Barcha turlar"} ({allMessages.length})
                </option>
                <option value="question">
                  ❓ {getTypeName("question")} ({typeCounts.question})
                </option>
                <option value="discount">
                  💰 {getTypeName("discount")} ({typeCounts.discount})
                </option>
                <option value="review">
                  ⭐ {getTypeName("review")} ({typeCounts.review})
                </option>
                <option value="complaint">
                  ⚠️ {getTypeName("complaint")} ({typeCounts.complaint})
                </option>
                <option value="order">
                  📦 {getTypeName("order")} ({typeCounts.order})
                </option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as MessageStatus | "all")}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">
                  {lang === "ru" ? "Все статусы" : "Barcha statuslar"} ({statusCounts.all})
                </option>
                <option value="new">
                  {lang === "ru" ? "Новые" : "Yangi"} ({statusCounts.new})
                </option>
                <option value="replied">
                  {lang === "ru" ? "Отвечено" : "Javob berilgan"} ({statusCounts.replied})
                </option>
                <option value="closed">
                  {lang === "ru" ? "Закрыто" : "Yopilgan"} ({statusCounts.closed})
                </option>
              </select>
            </div>

            {/* Marketplace Filter */}
            <div>
              <select
                value={marketplaceFilter}
                onChange={(e) => setMarketplaceFilter(e.target.value as Marketplace | "all")}
                className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">
                  {lang === "ru" ? "Все площадки" : "Barcha platformalar"}
                </option>
                <option value="Ozon">Ozon</option>
                <option value="Wildberries">Wildberries</option>
              </select>
            </div>

            {/* Reset Button */}
            {(search || typeFilter !== "all" || statusFilter !== "all" || marketplaceFilter !== "all") && (
              <div>
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  {lang === "ru" ? "Сбросить" : "Tozalash"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Results Summary */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {lang === "ru" 
            ? `Показано ${currentMessages.length} из ${filteredMessages.length} сообщений`
            : `${currentMessages.length} dan ${filteredMessages.length} ta xabar ko'rsatilmoqda`
          }
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="danger">
            {lang === "ru" ? "Новые" : "Yangi"}: {statusCounts.new}
          </Badge>
          <Badge variant="default">
            {lang === "ru" ? "Всего" : "Jami"}: {filteredMessages.length}
          </Badge>
        </div>
      </div>

      {/* Messages Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{lang === "ru" ? "ID" : "ID"}</TableHead>
              <TableHead>{lang === "ru" ? "Тип" : "Turi"}</TableHead>
              <TableHead>{lang === "ru" ? "Клиент" : "Mijoz"}</TableHead>
              <TableHead>{lang === "ru" ? "Сообщение" : "Xabar"}</TableHead>
              <TableHead>{lang === "ru" ? "Площадка" : "Platforma"}</TableHead>
              <TableHead>{lang === "ru" ? "Дата" : "Sana"}</TableHead>
              <TableHead>{lang === "ru" ? "Статус" : "Status"}</TableHead>
              <TableHead>{lang === "ru" ? "Действия" : "Amallar"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentMessages.length > 0 ? (
              currentMessages.map((message) => (
                <TableRow 
                  key={message.id}
                  className={message.status === "new" ? "bg-primary-soft/20" : ""}
                >
                  <TableCell className="font-medium">{message.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getTypeIcon(message.type)}</span>
                      <span className="text-xs text-text-muted">{getTypeName(message.type)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium text-sm">{message.customer}</div>
                      {message.orderId && (
                        <div className="text-xs text-text-muted">{message.orderId}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs">
                      <p className="text-sm truncate">{message.message}</p>
                      {message.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {message.tags.map((tag, idx) => (
                            <Chip key={idx} className="text-xs px-2 py-0">
                              {tag}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{message.marketplace}</TableCell>
                  <TableCell className="text-xs text-text-muted">{message.date}</TableCell>
                  <TableCell>
                    <StatusPill status={message.status}>
                      {lang === "ru" 
                        ? message.status === "new" ? "Новое" : message.status === "replied" ? "Отвечено" : "Закрыто"
                        : message.status === "new" ? "Yangi" : message.status === "replied" ? "Javob berilgan" : "Yopilgan"
                      }
                    </StatusPill>
                  </TableCell>
                  <TableCell>
                    <button 
                      onClick={() => setSelectedMessage(message)}
                      className="text-primary hover:text-primary-dark text-sm font-medium"
                    >
                      {lang === "ru" ? "Ответить" : "Javob berish"}
                    </button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                  {lang === "ru" 
                    ? "Сообщения не найдены. Попробуйте изменить фильтры."
                    : "Xabarlar topilmadi. Filtrlarni o'zgartirib ko'ring."
                  }
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-muted">
                {lang === "ru" 
                  ? `Страница ${currentPage} из ${totalPages}`
                  : `${currentPage}-sahifa, jami ${totalPages} ta`
                }
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  {lang === "ru" ? "Назад" : "Orqaga"}
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-1 rounded text-sm ${
                        page === currentPage
                          ? "bg-primary text-white font-medium"
                          : "hover:bg-background text-text-main"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  {lang === "ru" ? "Вперёд" : "Oldinga"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">
              ❓ {getTypeName("question")}
            </p>
            <p className="text-2xl font-bold text-primary">
              {typeCounts.question}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">
              💰 {getTypeName("discount")}
            </p>
            <p className="text-2xl font-bold text-warning">
              {typeCounts.discount}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">
              ⭐ {getTypeName("review")}
            </p>
            <p className="text-2xl font-bold text-success">
              {typeCounts.review}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">
              ⚠️ {getTypeName("complaint")}
            </p>
            <p className="text-2xl font-bold text-danger">
              {typeCounts.complaint}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-muted mb-1">
              📦 {getTypeName("order")}
            </p>
            <p className="text-2xl font-bold text-text-main">
              {typeCounts.order}
            </p>
          </div>
        </Card>
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMessage(null)}
        >
          <Card 
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-text-main">
                    {getTypeIcon(selectedMessage.type)} {getTypeName(selectedMessage.type)}
                  </h2>
                  <p className="text-sm text-text-muted">{selectedMessage.id} • {selectedMessage.date}</p>
                </div>
                <button 
                  onClick={() => setSelectedMessage(null)}
                  className="text-text-muted hover:text-text-main"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Клиент" : "Mijoz"}</p>
                  <p className="font-semibold">{selectedMessage.customer}</p>
                </div>

                <div>
                  <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Площадка" : "Platforma"}</p>
                  <p>{selectedMessage.marketplace}</p>
                </div>

                {selectedMessage.orderId && (
                  <div>
                    <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Заказ" : "Buyurtma"}</p>
                    <p className="font-mono text-primary">{selectedMessage.orderId}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-text-muted mb-1">{lang === "ru" ? "Сообщение" : "Xabar"}</p>
                  <div className="bg-background p-4 rounded-lg">
                    <p>{selectedMessage.message}</p>
                  </div>
                </div>

                {selectedMessage.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted mb-2">{lang === "ru" ? "Теги" : "Teglar"}</p>
                    <div className="flex gap-2">
                      {selectedMessage.tags.map((tag, idx) => (
                        <Badge key={idx} variant="primary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-text-muted mb-2">{lang === "ru" ? "Ваш ответ" : "Javobingiz"}</p>
                  <textarea
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={lang === "ru" ? "Напишите ответ..." : "Javob yozing..."}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setSelectedMessage(null)}>
                    {lang === "ru" ? "Отмена" : "Bekor qilish"}
                  </Button>
                  <Button variant="primary">
                    {lang === "ru" ? "Отправить ответ" : "Javob yuborish"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
