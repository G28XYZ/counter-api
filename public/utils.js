import { createStore, get, set } from "./vendor/idb-keyval.js";

export const RETRY_INTERVAL_MS = 5000;

const STATE_KEY = "local-first-counter:v1";
const API_BASE_URL = "";
const API_ENDPOINTS = {
  current: `${API_BASE_URL}/api/counter`,
  plus: `${API_BASE_URL}/api/counter/plus`,
  minus: `${API_BASE_URL}/api/counter/minus`,
  reset: `${API_BASE_URL}/api/counter/reset`,
};
const OPERATIONS = ["plus", "minus", "reset"];
const counterStore = createStore("local-first-counter", "state");

/**
 * Создает начальное состояние local-first.
 */
export const createInitialState = () => ({
  count: 0,
  updatedAt: null,
  remoteCount: null,
  syncedAt: null,
  pendingOperations: [],
  syncError: null,
});

/**
 * Приводит состояние к безопасному виду перед использованием в UI.
 */
const normalizeState = (value) => ({
  count: Number.isFinite(value?.count) ? value.count : 0,
  updatedAt: value?.updatedAt || null,
  remoteCount: Number.isFinite(value?.remoteCount) ? value.remoteCount : null,
  syncedAt: value?.syncedAt || null,
  pendingOperations: Array.isArray(value?.pendingOperations)
    ? value.pendingOperations.filter((operation) =>
        OPERATIONS.includes(operation)
      )
    : [],
  syncError: value?.syncError || null,
});

/**
 * Читает сохраненное состояние через idb-keyval.
 */
export const readState = async () => {
  try {
    return normalizeState(await get(STATE_KEY, counterStore));
  } catch {
    return createInitialState();
  }
};

/**
 * Сохраняет текущее состояние приложения через idb-keyval.
 */
export const saveState = (state) => set(STATE_KEY, state, counterStore);

/**
 * Форматирует ISO-даты для русского интерфейса.
 */
export const formatDate = (value) => {
  if (!value) return "Изменений пока нет";

  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
};

/**
 * Преобразует неизвестную ошибку в читаемое сообщение.
 */
export const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "неизвестная ошибка";

/**
 * Добавляет операцию в очередь синхронизации; reset заменяет прошлые ожидающие действия.
 */
export const enqueueOperation = (pendingOperations, operation) =>
  operation === "reset" ? ["reset"] : [...pendingOperations, operation];

/**
 * Проверяет ответ API счетчика и возвращает числовое значение.
 */
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

/**
 * Загружает текущее значение счетчика с сервера.
 */
export const fetchCurrentCounter = async () => {
  const response = await fetch(API_ENDPOINTS.current, { cache: "no-store" });
  return readCounterValue(response, "GET /api/counter");
};

/**
 * Отправляет одну операцию из очереди на сервер и возвращает новое значение.
 */
export const sendCounterOperation = async (operation) => {
  const response = await fetch(API_ENDPOINTS[operation], {
    method: "POST",
    cache: "no-store",
  });

  return readCounterValue(response, `POST /api/counter/${operation}`);
};
