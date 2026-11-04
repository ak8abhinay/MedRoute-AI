const KEY = "medroute_my_request";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url, no padding

export const isValidToken = (t) => typeof t === "string" && TOKEN_PATTERN.test(t);

export const saveRequest = ({ token, reference }) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, reference: reference || null }));
  } catch {
    /* storage blocked - the link in the address bar still works */
  }
};

export const loadRequest = () => {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    return value && isValidToken(value.token) ? value : null;
  } catch {
    return null;
  }
};

export const clearRequest = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

// Accepts a full tracking link, a "#token" fragment, or the bare token.
export const extractToken = (input) => {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const candidate = trimmed.includes("#") ? trimmed.slice(trimmed.lastIndexOf("#") + 1) : trimmed;
  return isValidToken(candidate) ? candidate : null;
};