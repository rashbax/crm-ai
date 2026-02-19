/**
 * Integrations UI Copy
 * Professional CRM-style messaging - DO NOT MODIFY TEXT
 */

export const INTEGRATIONS_COPY = {
  // Add Integration
  addButton: {
    title: "Add integration",
    helper: "Connect a marketplace to start syncing orders, stock, ads, and prices into CRM AUTO.",
  },

  // Status Labels
  status: {
    connected: {
      label: "Connected",
      description: "Sync is active.",
    },
    disconnected: {
      label: "Disconnected",
      description: "Sync is paused. Data is kept (unless deleted).",
    },
    error: {
      label: "Error",
      description: "Sync failed. Fix credentials and try again.",
    },
  },

  // Disconnect Modal
  disconnect: {
    title: "Disconnect this integration?",
    bullets: [
      "Sync will stop for this marketplace.",
      "Your historical data will remain available in reports (unless you remove it later).",
      "You can reconnect anytime.",
    ],
    cancelButton: "Cancel",
    confirmButton: "Disconnect",
    successToast: "Integration disconnected. Sync paused.",
  },

  // Remove Modal - Step 1
  remove: {
    title: "Remove this integration?",
    body: "Choose what to do with existing data:",
    options: {
      keep: {
        label: "Keep historical data (recommended)",
        description: "Removes the connection, but keeps synced data for reports.",
      },
      delete: {
        label: "Delete all data from this integration",
        description: "Permanently deletes orders, stock, ads, and price history imported from this connection.",
      },
    },
    cancelButton: "Cancel",
    continueButton: "Continue",
    successToastKeep: "Integration removed. Historical data kept.",
  },

  // Remove Modal - Step 2 (Delete Confirmation)
  removeConfirm: {
    title: "Permanently delete data?",
    body: "This cannot be undone. This will delete:",
    items: [
      "Orders & revenue history",
      "Stock snapshots",
      "Ads spend & performance data",
      "Price history",
    ],
    note: "Only data from this integration will be deleted.",
    instruction: "Type DELETE to confirm.",
    placeholder: "Type DELETE",
    cancelButton: "Cancel",
    confirmButton: "Delete permanently",
    successToast: "Integration and data deleted permanently.",
  },

  // Reconnect/Fix
  reconnect: {
    buttonLabel: "Fix / Reconnect",
    helper: "Update credentials and test connection again.",
    testResults: {
      ok: "Connection successful.",
      invalid: "Invalid credentials. Please generate a new token and try again.",
      permission: "Permission missing: Ads scope not enabled.",
      rateLimit: "Rate limited. Try again in a few minutes.",
    },
  },

  // Data Coverage Toggles
  dataCoverage: {
    title: "Data to sync",
    helper: "Turn off data types you don't need to reduce API usage.",
    checkboxes: {
      orders: "Orders & revenue",
      stocks: "Stock & inventory",
      ads: "Ads spend & performance",
      prices: "Prices & discounts",
    },
    note: "Changes take effect on the next sync.",
  },

  // Empty States
  emptyState: {
    title: "No integrations connected",
    body: "Connect a marketplace to start seeing analytics and recommendations.",
    ctaLabel: "Go to Integrations",
    ctaHref: "/integrations",
    filterEmpty: "No marketplaces enabled. Enable at least one integration.",
  },
};
