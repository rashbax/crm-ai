import type { Language } from "@/types";

type IntegrationsCopyShape = {
  page: {
    title: string;
    loading: string;
  };
  addButton: {
    title: string;
    helper: string;
  };
  toasts: {
    disconnectError: string;
    removeError: string;
    reconnectSuccess: string;
    syncSuccess: string;
    syncWarning: string;
    syncError: string;
    testError: string;
    connectSuccess: string;
    saveError: string;
  };
  labels: {
    lastSyncShort: string;
    sync: string;
    syncing: string;
    disconnect: string;
    reconnect: string;
    remove: string;
    cancel: string;
    next: string;
    back: string;
    saveAndConnect: string;
  };
  status: {
    connected: {
      label: string;
      description: string;
    };
    disconnected: {
      label: string;
      description: string;
    };
    error: {
      label: string;
      description: string;
    };
  };
  disconnect: {
    title: string;
    bullets: string[];
    cancelButton: string;
    confirmButton: string;
    successToast: string;
  };
  remove: {
    title: string;
    body: string;
    options: {
      keep: {
        label: string;
        description: string;
      };
      delete: {
        label: string;
        description: string;
      };
    };
    cancelButton: string;
    continueButton: string;
    successToastKeep: string;
  };
  removeConfirm: {
    title: string;
    body: string;
    items: string[];
    note: string;
    instruction: string;
    placeholder: string;
    cancelButton: string;
    confirmButton: string;
    successToast: string;
  };
  reconnect: {
    buttonLabel: string;
    helper: string;
    testResults: {
      ok: string;
      invalid: string;
      permission: string;
      rateLimit: string;
    };
  };
  dataCoverage: {
    title: string;
    helper: string;
    checkboxes: {
      orders: string;
      stocks: string;
      ads: string;
      prices: string;
    };
    note: string;
  };
  emptyState: {
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
    filterEmpty: string;
  };
  catalog: {
    title: string;
    allConnected: string;
  };
  wizard: {
    connectTitle: (marketplaceTitle: string) => string;
    step1: string;
    step3: string;
    testing: string;
    testConnection: string;
  };
  time: {
    justNow: string;
    minutesAgo: (m: number) => string;
    hoursAgo: (h: number) => string;
    daysAgo: (d: number) => string;
  };
};

export const INTEGRATIONS_COPY: Record<Language, IntegrationsCopyShape> = {
  ru: {
    page: {
      title: "Интеграции",
      loading: "Загрузка...",
    },
    addButton: {
      title: "Добавить интеграцию",
      helper: "Подключите маркетплейс для синхронизации заказов, остатков, рекламы и цен.",
    },
    toasts: {
      disconnectError: "Ошибка отключения интеграции",
      removeError: "Ошибка удаления интеграции",
      reconnectSuccess: "Интеграция переподключена",
      syncSuccess: "Синхронизация выполнена",
      syncWarning: "Синхронизация завершена с предупреждениями",
      syncError: "Ошибка синхронизации",
      testError: "Ошибка подключения",
      connectSuccess: "Интеграция подключена",
      saveError: "Ошибка сохранения интеграции",
    },
    labels: {
      lastSyncShort: "Синхр.:",
      sync: "Синхронизировать",
      syncing: "Синхронизация...",
      disconnect: "Отключить",
      reconnect: "Переподключить",
      remove: "Удалить",
      cancel: "Отмена",
      next: "Далее",
      back: "Назад",
      saveAndConnect: "Сохранить и подключить",
    },
    status: {
      connected: {
        label: "Подключено",
        description: "Синхронизация активна.",
      },
      disconnected: {
        label: "Отключено",
        description: "Синхронизация приостановлена. Данные сохранены.",
      },
      error: {
        label: "Ошибка",
        description: "Синхронизация не удалась. Проверьте доступы и повторите.",
      },
    },
    disconnect: {
      title: "Отключить интеграцию?",
      bullets: [
        "Синхронизация для этого маркетплейса остановится.",
        "Исторические данные останутся в отчетах (если не удалить позже).",
        "Вы сможете подключить интеграцию снова в любое время.",
      ],
      cancelButton: "Отмена",
      confirmButton: "Отключить",
      successToast: "Интеграция отключена. Синхронизация приостановлена.",
    },
    remove: {
      title: "Удалить интеграцию?",
      body: "Выберите, что сделать с существующими данными:",
      options: {
        keep: {
          label: "Оставить исторические данные (рекомендуется)",
          description: "Удаляет подключение, но сохраняет синхронизированные данные для отчетов.",
        },
        delete: {
          label: "Удалить все данные этой интеграции",
          description: "Безвозвратно удаляет историю заказов, остатков, рекламы и цен из этого подключения.",
        },
      },
      cancelButton: "Отмена",
      continueButton: "Продолжить",
      successToastKeep: "Интеграция удалена. Исторические данные сохранены.",
    },
    removeConfirm: {
      title: "Удалить данные навсегда?",
      body: "Это действие нельзя отменить. Будет удалено:",
      items: ["История заказов и выручки", "Снимки остатков", "Расходы и эффективность рекламы", "История цен"],
      note: "Будут удалены только данные этой интеграции.",
      instruction: "Введите DELETE для подтверждения.",
      placeholder: "Введите DELETE",
      cancelButton: "Отмена",
      confirmButton: "Удалить навсегда",
      successToast: "Интеграция и данные удалены навсегда.",
    },
    reconnect: {
      buttonLabel: "Исправить / переподключить",
      helper: "Обновите ключи доступа и проверьте подключение.",
      testResults: {
        ok: "Подключение успешно.",
        invalid: "Неверные ключи. Создайте новый токен и повторите.",
        permission: "Недостаточно прав: не включен доступ к рекламе.",
        rateLimit: "Слишком много запросов. Повторите через несколько минут.",
      },
    },
    dataCoverage: {
      title: "Какие данные синхронизировать",
      helper: "Отключите типы данных, которые вам не нужны, чтобы снизить нагрузку API.",
      checkboxes: {
        orders: "Заказы и выручка",
        stocks: "Остатки и склад",
        ads: "Реклама и эффективность",
        prices: "Цены и скидки",
      },
      note: "Изменения применятся при следующей синхронизации.",
    },
    emptyState: {
      title: "Нет подключенных интеграций",
      body: "Подключите маркетплейс, чтобы видеть аналитику и рекомендации.",
      ctaLabel: "Перейти в Интеграции",
      ctaHref: "/integrations",
      filterEmpty: "Нет включенных маркетплейсов. Включите хотя бы одну интеграцию.",
    },
    catalog: {
      title: "Выберите маркетплейс",
      allConnected: "Все доступные маркетплейсы уже подключены.",
    },
    wizard: {
      connectTitle: (marketplaceTitle: string) => `Подключить ${marketplaceTitle}`,
      step1: "Шаг 1: Введите ключи доступа",
      step3: "Шаг 3: Проверить подключение",
      testing: "Проверка...",
      testConnection: "Проверить подключение",
    },
    time: {
      justNow: "только что",
      minutesAgo: (m: number) => `${m} мин назад`,
      hoursAgo: (h: number) => `${h} ч назад`,
      daysAgo: (d: number) => `${d} дн назад`,
    },
  },
  uz: {
    page: {
      title: "Integratsiyalar",
      loading: "Yuklanmoqda...",
    },
    addButton: {
      title: "Integratsiya qo'shish",
      helper: "Buyurtma, qoldiq, reklama va narxlarni sinxronlash uchun marketpleysni ulang.",
    },
    toasts: {
      disconnectError: "Integratsiyani uzishda xato",
      removeError: "Integratsiyani o'chirishda xato",
      reconnectSuccess: "Integratsiya qayta ulandi",
      syncSuccess: "Sinxronizatsiya bajarildi",
      syncWarning: "Sinxronizatsiya ogohlantirishlar bilan tugadi",
      syncError: "Sinxronizatsiya xatosi",
      testError: "Ulanish xatosi",
      connectSuccess: "Integratsiya ulandi",
      saveError: "Integratsiyani saqlashda xato",
    },
    labels: {
      lastSyncShort: "Sinxr.:",
      sync: "Sinxronlash",
      syncing: "Sinxronlanmoqda...",
      disconnect: "Uzish",
      reconnect: "Qayta ulash",
      remove: "O'chirish",
      cancel: "Bekor qilish",
      next: "Keyingi",
      back: "Orqaga",
      saveAndConnect: "Saqlash va ulash",
    },
    status: {
      connected: {
        label: "Ulangan",
        description: "Sinxronizatsiya faol.",
      },
      disconnected: {
        label: "Uzilgan",
        description: "Sinxronizatsiya to'xtatilgan. Ma'lumotlar saqlanadi.",
      },
      error: {
        label: "Xato",
        description: "Sinxronizatsiya muvaffaqiyatsiz. Kalitlarni tekshirib qayta urinib ko'ring.",
      },
    },
    disconnect: {
      title: "Ushbu integratsiyani uzasizmi?",
      bullets: [
        "Bu marketpleys uchun sinxronizatsiya to'xtaydi.",
        "Tarixiy ma'lumotlar hisobotlarda saqlanadi (keyin o'chirmasangiz).",
        "Istalgan vaqtda qayta ulashingiz mumkin.",
      ],
      cancelButton: "Bekor qilish",
      confirmButton: "Uzish",
      successToast: "Integratsiya uzildi. Sinxronizatsiya to'xtatildi.",
    },
    remove: {
      title: "Ushbu integratsiyani o'chirasizmi?",
      body: "Mavjud ma'lumotlar bilan nima qilishni tanlang:",
      options: {
        keep: {
          label: "Tarixiy ma'lumotlarni saqlash (tavsiya etiladi)",
          description: "Ulanishni o'chiradi, lekin hisobotlar uchun sinxron ma'lumotlarni saqlaydi.",
        },
        delete: {
          label: "Ushbu integratsiyaning barcha ma'lumotlarini o'chirish",
          description: "Ushbu ulanishdan import qilingan buyurtma, qoldiq, reklama va narx tarixini butunlay o'chiradi.",
        },
      },
      cancelButton: "Bekor qilish",
      continueButton: "Davom etish",
      successToastKeep: "Integratsiya o'chirildi. Tarixiy ma'lumotlar saqlandi.",
    },
    removeConfirm: {
      title: "Ma'lumotlar butunlay o'chirilsinmi?",
      body: "Buni ortga qaytarib bo'lmaydi. Quyidagilar o'chadi:",
      items: ["Buyurtma va tushum tarixi", "Qoldiq snapshotlari", "Reklama xarajati va samaradorlik", "Narxlar tarixi"],
      note: "Faqat shu integratsiyaga tegishli ma'lumotlar o'chiriladi.",
      instruction: "Tasdiqlash uchun DELETE deb yozing.",
      placeholder: "DELETE deb yozing",
      cancelButton: "Bekor qilish",
      confirmButton: "Butunlay o'chirish",
      successToast: "Integratsiya va ma'lumotlar butunlay o'chirildi.",
    },
    reconnect: {
      buttonLabel: "Tuzatish / qayta ulash",
      helper: "Kirish kalitlarini yangilang va ulanishni qayta tekshiring.",
      testResults: {
        ok: "Ulanish muvaffaqiyatli.",
        invalid: "Noto'g'ri kalitlar. Yangi token yarating va qayta urinib ko'ring.",
        permission: "Ruxsat yetishmaydi: reklama huquqi yoqilmagan.",
        rateLimit: "So'rov limiti oshdi. Bir necha daqiqadan keyin urinib ko'ring.",
      },
    },
    dataCoverage: {
      title: "Sinxronlanadigan ma'lumotlar",
      helper: "API yuklamasini kamaytirish uchun kerak bo'lmagan turlarni o'chirib qo'ying.",
      checkboxes: {
        orders: "Buyurtmalar va tushum",
        stocks: "Qoldiq va ombor",
        ads: "Reklama va samaradorlik",
        prices: "Narxlar va chegirmalar",
      },
      note: "O'zgarishlar keyingi sinxronizatsiyada kuchga kiradi.",
    },
    emptyState: {
      title: "Ulangan integratsiyalar yo'q",
      body: "Analitika va tavsiyalarni ko'rish uchun marketpleys ulang.",
      ctaLabel: "Integratsiyalarga o'tish",
      ctaHref: "/integrations",
      filterEmpty: "Yoqilgan marketpleys yo'q. Kamida bittasini yoqing.",
    },
    catalog: {
      title: "Marketpleysni tanlang",
      allConnected: "Barcha mavjud marketpleyslar allaqachon ulangan.",
    },
    wizard: {
      connectTitle: (marketplaceTitle: string) => `${marketplaceTitle}ga ulash`,
      step1: "1-qadam: Kirish kalitlarini kiriting",
      step3: "3-qadam: Ulanishni tekshirish",
      testing: "Tekshirilmoqda...",
      testConnection: "Ulanishni tekshirish",
    },
    time: {
      justNow: "hozirgina",
      minutesAgo: (m: number) => `${m} daq oldin`,
      hoursAgo: (h: number) => `${h} soat oldin`,
      daysAgo: (d: number) => `${d} kun oldin`,
    },
  },
};
