const TOKEN = "cj_token";
const USER = "cj_user";

export function getToken() {
  return localStorage.getItem(TOKEN);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER) || "null");
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(USER, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN);
  localStorage.removeItem(USER);
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || res.statusText);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
