/**
 * Находит обязательный DOM-элемент и сразу сообщает об ошибке, если разметка и JS не совпадают.
 */
const getElement = (selector) => {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`DOM element not found: ${selector}`);
  }

  return element;
};

/**
 * DOM-ссылки, сгруппированные по частям интерфейса.
 */
export const dom = {
  counter: {
    value: getElement("#count"),
    increment: getElement("#increment"),
    decrement: getElement("#decrement"),
    reset: getElement("#reset"),
  },
  network: {
    status: getElement("#network-status"),
    label: getElement("#network-label"),
    toggle: getElement("#toggle-network"),
  },
  sync: {
    updatedAt: getElement("#updated-at"),
    remoteCount: getElement("#remote-count"),
    status: getElement("#sync-status"),
  },
  page: {
    setTitle(value) {
      document.title = value;
    },
  },
};
