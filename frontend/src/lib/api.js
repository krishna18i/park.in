/**
 * Thin fetch wrapper around the Park.in API.
 *
 * Every failure arrives as an ApiError carrying the backend's `detail` string,
 * so screens can surface the real reason ("Slot A4 was just taken") instead of
 * a generic message.
 */

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const WS_URL = `${API_BASE.replace(/^http/, "ws")}/ws`;

const TOKEN_KEY = "parkin.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI returns validation errors as a list of objects; flatten to one line. */
function readDetail(body, status) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first?.msg) return String(first.msg).replace(/^Value error,\s*/, "");
  }
  return `Request failed (${status})`;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the server. Is the backend running on " + API_BASE + "?",
      0,
    );
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(readDetail(payload, response.status), response.status);
  return payload;
}

export const api = {
  // auth
  signup: (data) => request("/auth/signup", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),
  me: () => request("/auth/me"),

  // locations
  locations: () => request("/locations", { auth: false }),
  location: (id) => request(`/locations/${id}`, { auth: false }),
  slots: (id) => request(`/locations/${id}/slots`, { auth: false }),
  createLocation: (data) => request("/locations", { method: "POST", body: data }),
  deleteLocation: (id) => request(`/locations/${id}`, { method: "DELETE" }),

  // bookings
  createBooking: (data) => request("/bookings", { method: "POST", body: data }),
  myBookings: () => request("/bookings"),
  booking: (id) => request(`/bookings/${id}`),
  ticket: (id) => request(`/bookings/${id}/ticket`),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: "POST" }),
  checkIn: (id) => request(`/bookings/${id}/check-in`, { method: "POST" }),
  checkOut: (id) => request(`/bookings/${id}/check-out`, { method: "POST" }),

  // payments
  pay: (data) => request("/payments", { method: "POST", body: data }),

  // admin
  stats: () => request("/admin/stats"),
  allBookings: (status) => request(`/admin/bookings${status ? `?status=${status}` : ""}`),
  overrideSlot: (id, status) =>
    request(`/admin/slots/${id}`, { method: "PATCH", body: { status } }),
  verifyTicket: (code) => request("/admin/verify-ticket", { method: "POST", body: { code } }),
};
