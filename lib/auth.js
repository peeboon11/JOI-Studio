// Shared by middleware (edge) and route handlers (node): Web Crypto works in both.
export const COOKIE = "joi_auth";

// The cookie holds a hash of the password, so changing APP_PASSWORD logs everyone out.
export async function authToken() {
  const data = new TextEncoder().encode(`joi-script-studio:${process.env.APP_PASSWORD}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
