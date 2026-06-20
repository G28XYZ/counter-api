import {
  RETRY_INTERVAL_MS,
  enqueueOperation,
  fetchCurrentCounter,
  formatDate,
  getErrorMessage,
  readState,
  saveState,
  sendCounterOperation,
} from "./utils.js";
import { dom } from "./dom.js";

const channel =
  "BroadcastChannel" in window
    ? new BroadcastChannel("local-first-counter")
    : null;

let state = await readState();
let isSyncing = false;
let isNetworkSimulatedOffline = false;
let retryTimer = null;

const getIsOnline = () => navigator.onLine && !isNetworkSimulatedOffline;

/**
 * Обновляет видимый статус сети.
 */
const setNetworkStatus = (isOnline) => {
  dom.network.status.classList.toggle("offline", !isOnline);
  dom.network.label.textContent = isOnline
    ? "Онлайн"
    : isNetworkSimulatedOffline
      ? "Офлайн (тест)"
      : "Офлайн";
  dom.network.toggle.textContent = isNetworkSimulatedOffline
    ? "Вернуть online"
    : "Имитировать offline";
};

/**
 * Собирает текст статуса синхронизации по текущему состоянию.
 */
const getSyncStatusText = () => {
  const queueSize = state.pendingOperations.length;

  if (state.syncError) {
    return `Ошибка синхронизации: ${state.syncError}. В очереди: ${queueSize}`;
  }

  if (isSyncing) return `Синхронизация с API. В очереди: ${queueSize}`;
  if (queueSize > 0) return `Ожидает сети: ${queueSize}`;
  if (state.syncedAt) return `Синхронизировано: ${formatDate(state.syncedAt)}`;

  return "Сетевой запрос ещё не выполнялся";
};

/**
 * Отрисовывает текущее состояние в интерфейсе.
 */
const render = () => {
  dom.counter.value.textContent = state.count;
  dom.sync.updatedAt.textContent = state.updatedAt
    ? `Локально изменено: ${formatDate(state.updatedAt)}`
    : "Локальных изменений пока нет";
  dom.sync.remoteCount.textContent =
    state.remoteCount === null ? "нет ответа" : state.remoteCount;
  dom.sync.status.classList.toggle("error", Boolean(state.syncError));
  dom.sync.status.textContent = getSyncStatusText();
  dom.page.setTitle(`Счётчик: ${state.count}`);
};

/**
 * Обновляет состояние приложения, перерисовывает UI и при необходимости сообщает другим вкладкам.
 */
const persist = (nextState, shouldBroadcast = true) => {
  state = nextState;
  render();
  saveState(state).catch((error) => {
    state = {
      ...state,
      syncError: `Ошибка сохранения состояния: ${getErrorMessage(error)}`,
    };
    render();
  });

  if (shouldBroadcast && channel) {
    channel.postMessage(state);
  }
};

/**
 * Отменяет запланированную повторную попытку синхронизации.
 */
const clearSyncRetry = () => {
  if (!retryTimer) return;

  clearTimeout(retryTimer);
  retryTimer = null;
};

/**
 * Планирует повторную синхронизацию, пока есть ожидающие локальные операции.
 */
const scheduleSyncRetry = () => {
  clearSyncRetry();

  if (state.pendingOperations.length === 0) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncPending();
  }, RETRY_INTERVAL_MS);
};

/**
 * Добавляет локальную операцию в очередь и запускает синхронизацию.
 */
const enqueueSync = (operation) => {
  persist({
    ...state,
    pendingOperations: enqueueOperation(state.pendingOperations, operation),
    syncError: null,
  });
  syncPending();
};

/**
 * Применяет plus или minus локально до синхронизации с сервером.
 */
const updateCount = (delta, operation) => {
  persist({
    ...state,
    count: state.count + delta,
    updatedAt: new Date().toISOString(),
  });
  enqueueSync(operation);
};

/**
 * Сбрасывает локальный счетчик и добавляет reset в очередь для сервера.
 */
const resetCount = () => {
  persist({
    ...state,
    count: 0,
    updatedAt: new Date().toISOString(),
  });
  enqueueSync("reset");
};

/**
 * Забирает значение с сервера, если нет локальных операций для отправки.
 */
const syncRemoteCounter = async () => {
  const remoteCount = await fetchCurrentCounter();

  setNetworkStatus(getIsOnline());
  persist({
    ...state,
    count: state.pendingOperations.length === 0 ? remoteCount : state.count,
    remoteCount,
    syncedAt: new Date().toISOString(),
    syncError: null,
  });
};

/**
 * Отправляет следующую локальную операцию из очереди на сервер.
 */
const syncNextOperation = async () => {
  const [operation] = state.pendingOperations;
  const remoteCount = await sendCounterOperation(operation);
  const pendingOperations =
    state.pendingOperations[0] === operation
      ? state.pendingOperations.slice(1)
      : state.pendingOperations;

  setNetworkStatus(getIsOnline());
  persist({
    ...state,
    count: pendingOperations.length === 0 ? remoteCount : state.count,
    remoteCount,
    syncedAt: new Date().toISOString(),
    pendingOperations,
    syncError: null,
  });
};

/**
 * Запускает цикл local-first синхронизации: получает значение или отправляет очередь.
 */
const syncPending = async () => {
  if (isSyncing) return;

  if (!getIsOnline()) {
    setNetworkStatus(false);
    scheduleSyncRetry();
    return;
  }

  clearSyncRetry();
  isSyncing = true;
  render();

  try {
    if (state.pendingOperations.length === 0) {
      await syncRemoteCounter();
    }

    while (state.pendingOperations.length > 0 && getIsOnline()) {
      await syncNextOperation();
    }
  } catch (error) {
    persist({
      ...state,
      syncError: getErrorMessage(error),
    });
    setNetworkStatus(false);
    scheduleSyncRetry();
  } finally {
    isSyncing = false;
    render();

    if (state.pendingOperations.length > 0) {
      scheduleSyncRetry();
    }
  }
};

/**
 * Реагирует на события online/offline и запускает или откладывает синхронизацию.
 */
const updateNetworkStatus = () => {
  const isOnline = getIsOnline();
  setNetworkStatus(isOnline);

  if (isOnline) {
    syncPending();
  } else {
    scheduleSyncRetry();
  }
};

const toggleNetworkSimulation = () => {
  isNetworkSimulatedOffline = !isNetworkSimulatedOffline;
  updateNetworkStatus();
};

dom.counter.increment.addEventListener("click", () => updateCount(1, "plus"));
dom.counter.decrement.addEventListener("click", () => updateCount(-1, "minus"));
dom.counter.reset.addEventListener("click", resetCount);
dom.network.toggle.addEventListener("click", toggleNetworkSimulation);

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("focus", syncPending);
window.addEventListener("pageshow", syncPending);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncPending();
  }
});

channel?.addEventListener("message", (event) => {
  persist(event.data, false);
});

render();
updateNetworkStatus();
syncPending();
