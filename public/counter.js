import {
  RETRY_INTERVAL_MS,
  STORAGE_KEY,
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

let state = readState();
let isSyncing = false;
let retryTimer = null;

const setNetworkStatus = (isOnline) => {
  dom.network.status.classList.toggle("offline", !isOnline);
  dom.network.label.textContent = isOnline ? "Онлайн" : "Офлайн";
};

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

const persist = (nextState, shouldBroadcast = true) => {
  state = nextState;
  saveState(state);
  render();

  if (shouldBroadcast && channel) {
    channel.postMessage(state);
  }
};

const clearSyncRetry = () => {
  if (!retryTimer) return;

  clearTimeout(retryTimer);
  retryTimer = null;
};

const scheduleSyncRetry = () => {
  clearSyncRetry();

  if (state.pendingOperations.length === 0) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncPending();
  }, RETRY_INTERVAL_MS);
};

const enqueueSync = (operation) => {
  persist({
    ...state,
    pendingOperations: enqueueOperation(state.pendingOperations, operation),
    syncError: null,
  });
  syncPending();
};

const updateCount = (delta, operation) => {
  persist({
    ...state,
    count: state.count + delta,
    updatedAt: new Date().toISOString(),
  });
  enqueueSync(operation);
};

const resetCount = () => {
  persist({
    ...state,
    count: 0,
    updatedAt: new Date().toISOString(),
  });
  enqueueSync("reset");
};

const syncRemoteCounter = async () => {
  const remoteCount = await fetchCurrentCounter();

  setNetworkStatus(true);
  persist({
    ...state,
    count: state.pendingOperations.length === 0 ? remoteCount : state.count,
    remoteCount,
    syncedAt: new Date().toISOString(),
    syncError: null,
  });
};

const syncNextOperation = async () => {
  const [operation] = state.pendingOperations;
  const remoteCount = await sendCounterOperation(operation);
  const pendingOperations =
    state.pendingOperations[0] === operation
      ? state.pendingOperations.slice(1)
      : state.pendingOperations;

  setNetworkStatus(true);
  persist({
    ...state,
    count: pendingOperations.length === 0 ? remoteCount : state.count,
    remoteCount,
    syncedAt: new Date().toISOString(),
    pendingOperations,
    syncError: null,
  });
};

const syncPending = async () => {
  if (isSyncing) return;

  if (!navigator.onLine) {
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

    while (state.pendingOperations.length > 0 && navigator.onLine) {
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

const updateNetworkStatus = () => {
  const isOnline = navigator.onLine;
  setNetworkStatus(isOnline);

  if (isOnline) {
    syncPending();
  } else {
    scheduleSyncRetry();
  }
};

dom.counter.increment.addEventListener("click", () => updateCount(1, "plus"));
dom.counter.decrement.addEventListener("click", () => updateCount(-1, "minus"));
dom.counter.reset.addEventListener("click", resetCount);

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
window.addEventListener("focus", syncPending);
window.addEventListener("pageshow", syncPending);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    syncPending();
  }
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;

  state = readState();
  render();
});

channel?.addEventListener("message", (event) => {
  persist(event.data, false);
});

render();
updateNetworkStatus();
syncPending();
