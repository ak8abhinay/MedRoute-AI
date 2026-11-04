import { SERVICE_API_KEY } from "./config.js";

// The one place the simulator attaches its credential. Every HTTP call
// the simulator makes goes through this.
export const authedFetch = (url, options = {}) =>
  fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "x-api-key": SERVICE_API_KEY },
  });