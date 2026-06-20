/**
 * Finds a required DOM element and fails fast when markup and JS are out of sync.
 */
const getElement = (selector) => {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`DOM element not found: ${selector}`);
  }

  return element;
};

/**
 * DOM references grouped by the part of the UI that uses them.
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
