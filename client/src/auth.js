const TOKEN_KEY = "medroute_staff_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// api.js calls notifyUnauthorized() on any 401 from the backend; App
// registers a handler that drops back to the login screen.
let unauthorizedHandler = () => {};
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};
export const notifyUnauthorized = () => unauthorizedHandler();