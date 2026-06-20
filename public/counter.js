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
 * Updates the visible network status badge.
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
 * Builds the sync status text from the current state and sync lifecycle.
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
 * Renders the current state into the UI.
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
 * Updates app state, re-renders the UI, and optionally broadcasts the update to other tabs.
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
 * Cancels a scheduled retry attempt.
 */
const clearSyncRetry = () => {
  if (!retryTimer) return;

  clearTimeout(retryTimer);
  retryTimer = null;
};

/**
 * Schedules another sync attempt while there are pending local operations.
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
 * Adds a local operation to the sync queue and starts synchronization.
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
 * Applies a plus or minus action locally before syncing it with the server.
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
 * Resets the local counter and queues a server reset operation.
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
 * Pulls the current server value when there are no local operations to push.
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
 * Pushes the next queued local operation to the server.
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
 * Runs the local-first sync loop: pull when idle, push queued operations when needed.
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
 * Reacts to browser online/offline events and starts or retries sync.
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
