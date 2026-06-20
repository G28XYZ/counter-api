import { createStore, get, set } from "./vendor/idb-keyval.js";

export const RETRY_INTERVAL_MS = 5000;

const STATE_KEY = "local-first-counter:v1";
const API_BASE_URL = "https://counter-api-nu.vercel.app";
const API_ENDPOINTS = {
  current: `${API_BASE_URL}/api/counter`,
  plus: `${API_BASE_URL}/api/counter/plus`,
  minus: `${API_BASE_URL}/api/counter/minus`,
  reset: `${API_BASE_URL}/api/counter/reset`,
};
const OPERATIONS = ["plus", "minus", "reset"];
const counterStore = createStore("local-first-counter", "state");

/**
 * Creates the default local-first state.
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
 * Normalizes unsafe or stale state before the UI uses it.
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
 * Reads saved state through idb-keyval.
 */
export const readState = async () => {
  try {
    return normalizeState(await get(STATE_KEY, counterStore));
  } catch {
    return createInitialState();
  }
};

/**
 * Persists the current app state through idb-keyval.
 */
export const saveState = (state) => set(STATE_KEY, state, counterStore);

/**
 * Formats ISO dates for display in the Russian UI.
 */
export const formatDate = (value) => {
  if (!value) return "Изменений пока нет";

  return new Intl.DateTimeFormat("ru", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
};

/**
 * Converts unknown thrown values into a readable error message.
 */
export const getErrorMessage = (error) =>
  error instanceof Error ? error.message : "неизвестная ошибка";

/**
 * Adds an operation to the sync queue; reset replaces earlier pending actions.
 */
export const enqueueOperation = (pendingOperations, operation) =>
  operation === "reset" ? ["reset"] : [...pendingOperations, operation];

/**
 * Validates a counter API response and returns its numeric value.
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
 * Loads the current counter value from the server.
 */
export const fetchCurrentCounter = async () => {
  const response = await fetch(API_ENDPOINTS.current, { cache: "no-store" });
  return readCounterValue(response, "GET /api/counter");
};

/**
 * Sends one queued counter operation to the server and returns the new value.
 */
export const sendCounterOperation = async (operation) => {
  const response = await fetch(API_ENDPOINTS[operation], {
    method: "POST",
    cache: "no-store",
  });

  return readCounterValue(response, `POST /api/counter/${operation}`);
};
