export const STORAGE_KEY = "local-first-counter:v1";
export const RETRY_INTERVAL_MS = 5000;

const API_BASE_URL = "https://counter-api-nu.vercel.app";
const API_ENDPOINTS = {
  current: `${API_BASE_URL}/api/counter`,
  plus: `${API_BASE_URL}/api/counter/plus`,
  minus: `${API_BASE_URL}/api/counter/minus`,
  reset: `${API_BASE_URL}/api/counter/reset`,
};
const OPERATIONS = ["plus", "minus", "reset"];

export const createInitialState = () => ({
  count: 0,
  updatedAt: null,
  remoteCount: null,
  syncedAt: null,
  pendingOperations: [],
  syncError: null,
});

export const readState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createInitialState();

    const parsed = JSON.parse(stored);
    return {
      count: Number.isFinite(parsed.count) ? parsed.count : 0,
      updatedAt: parsed.updatedAt || null,
      remoteCount: Number.isFinite(parsed.remoteCount)
        ? parsed.remoteCount
        : null,
      syncedAt: parsed.syncedAt || null,
      pendingOperations: Array.isArray(parsed.pendingOperations)
        ? parsed.pendingOperations.filter((operation) =>
            OPERATIONS.includes(operation)
          )
        : [],
      syncError: parsed.syncError || null,
    };
  } catch {
    return createInitialState();
  }
};

export const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const formatDate = (value) => {
  if (!value) return "Изменений пока нет";

  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
};

export const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "неизвестная ошибка";

export const enqueueOperation = (pendingOperations, operation) =>
  operation === "reset" ? ["reset"] : [...pendingOperations, operation];

const readCounterValue = async (response, actionLabel) => {
  if (!response.ok) {
    throw new Error(`${actionLabel}: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Number.isFinite(data.value)) {
    throw new Error(`${actionLabel} вернул ответ без value`);
  }

  return data.value;
};

export const fetchCurrentCounter = async () => {
  const response = await fetch(API_ENDPOINTS.current, { cache: "no-store" });
  return readCounterValue(response, "GET /api/counter");
};

export const sendCounterOperation = async (operation) => {
  const response = await fetch(API_ENDPOINTS[operation], {
    method: "POST",
    cache: "no-store",
  });

  return readCounterValue(response, `POST /api/counter/${operation}`);
};
