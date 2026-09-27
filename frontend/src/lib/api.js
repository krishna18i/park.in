/**
 * Thin fetch wrapper around the Park.in API.
 *
 * Every failure arrives as an ApiError carrying the backend's `detail` string,
 * so screens can surface the real reason ("Slot A4 was just taken") instead of
 * a generic message.
 */

/**
 * Where the API lives.
 *
 * Deployed, the FastAPI process serves this bundle too, so the API is on our
 * own origin and the base is empty -- requests go to a relative `/api/...`.
 * That keeps one URL, no CORS, and no build-time host to keep in sync.
 *
 * `VITE_API_URL` still wins when it is set, which is how `npm run dev` reaches
 * the separate backend on :8000.
 */
const configuredBase = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const API_BASE =
  configuredBase || (import.meta.env.DEV ? "http://localhost:8000" : "");

/** Absolute origin the requests actually land on -- used for the WS URL and errors. */
export const API_ORIGIN =
  API_BASE || (typeof window === "undefined" ? "" : window.location.origin);

export const WS_URL = `${API_ORIGIN.replace(/^http/, "ws")}/ws`;

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
      "Cannot reach the server. Is the backend running on " + API_ORIGIN + "?",
      0,
    );
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(readDetail(payload, response.status), response.status);
  return payload;
}

export const api = {
  health: () => request("/health", { auth: false }),
  // auth
  signup: (data) => request("/auth/signup", { method: "POST", body: data, auth: false }),
  login: (data) => request("/auth/login", { method: "POST", body: data, auth: false }),
  googleLogin: (credential) =>
    request("/auth/google", { method: "POST", body: { credential }, auth: false }),
  googleConfig: () => request("/auth/google-config", { auth: false }),
  me: () => request("/auth/me"),

  // locations
  locations: () => request("/locations", { auth: false }),
  location: (id) => request(`/locations/${id}`, { auth: false }),
  slots: (id) => request(`/locations/${id}/slots`, { auth: false }),
  nearby: (id) => request(`/locations/${id}/nearby`, { auth: false }),
  places: (q) => request(`/locations/places?q=${encodeURIComponent(q)}`, { auth: false }),
  nearestBay: ({ q, lat, lng }) => {
    const params = new URLSearchParams({ q });
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    }
    return request(`/locations/nearest?${params}`, { auth: false });
  },
  nearbyBays: ({ q, lat, lng, vehicleKind = "standard" }) => {
    const params = new URLSearchParams({ q });
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    }
    params.set("vehicle_kind", vehicleKind);
    return request(`/locations/nearby-bays?${params}`, { auth: false });
  },
  predictOccupancy: (id) => request(`/locations/${id}/predict-occupancy`, { auth: false }),
  createLocation: (data) => request("/locations", { method: "POST", body: data }),
  updateLocation: (id, data) => request(`/locations/${id}`, { method: "PATCH", body: data }),
  updateValet: (id, data) => request(`/locations/${id}/valet`, { method: "PATCH", body: data }),
  updateLayout: (id, slots) =>
    request(`/locations/${id}/layout`, { method: "PATCH", body: { slots } }),
  deleteLocation: (id) => request(`/locations/${id}`, { method: "DELETE" }),

  // bookings
  createBooking: (data) => request("/bookings", { method: "POST", body: data }),
  myBookings: () => request("/bookings"),
  booking: (id) => request(`/bookings/${id}`),
  ticket: (id) => request(`/bookings/${id}/ticket`),
  cancelBooking: (id) => request(`/bookings/${id}/cancel`, { method: "POST" }),
  checkIn: (id) => request(`/bookings/${id}/check-in`, { method: "POST" }),
  checkOut: (id) => request(`/bookings/${id}/check-out`, { method: "POST" }),
  feedback: (id, data) => request(`/bookings/${id}/feedback`, { method: "POST", body: data }),
  updateFeedback: (id, data) => request(`/bookings/${id}/feedback`, { method: "PUT", body: data }),
  myFeedback: (id) => request(`/bookings/${id}/feedback`),

  // feedback
  feedbackOptions: () => request("/feedback/options", { auth: false }),
  locationFeedback: (id) => request(`/locations/${id}/feedback`, { auth: false }),
  adminFeedback: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value != null && value !== ""),
    ).toString();
    return request(`/feedback/admin${query ? `?${query}` : ""}`);
  },
  triageFeedback: (id, data) => request(`/feedback/admin/${id}`, { method: "PATCH", body: data }),

  // payments
  pay: (data) => request("/payments", { method: "POST", body: data }),
  paymentConfig: () => request("/payments/config", { auth: false }),
  paymentOrder: (data) => request("/payments/order", { method: "POST", body: data }),

  // admin
  stats: () => request("/admin/stats"),
  allBookings: (status) => request(`/admin/bookings${status ? `?status=${status}` : ""}`),
  overrideSlot: (id, status) =>
    request(`/admin/slots/${id}`, { method: "PATCH", body: { status } }),
  verifyTicket: (code) => request("/admin/verify-ticket", { method: "POST", body: { code } }),
  resetDemo: () => request("/admin/reset-demo", { method: "POST" }),

  // authenticated edge-sensor ingestion / authority audit
  sensorEvent: (data) => request("/iot/events", { method: "POST", body: data }),
  sensorEvents: (limit = 30) => request(`/iot/events?limit=${limit}`),
  allocations: (activeOnly = false) => request(`/governance/allocations?active_only=${activeOnly}`),
  createAllocation: (data) => request("/governance/allocations", { method: "POST", body: data }),
  revertAllocation: (id) => request(`/governance/allocations/${id}/revert`, { method: "POST" }),
  incidents: (status = "") => request(`/governance/incidents${status ? `?status=${status}` : ""}`),
  createIncident: (data) => request("/governance/incidents", { method: "POST", body: data }),
  resolveIncident: (id) => request(`/governance/incidents/${id}/resolve`, { method: "POST" }),
};
