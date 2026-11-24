var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var PORTAL_ORIGIN = "https://psn.monlycee.net";
var START_URL = `${PORTAL_ORIGIN}/oauth2/start?rd=${encodeURIComponent(`${PORTAL_ORIGIN}/`)}`;
var ALLOWED_HOSTS = /* @__PURE__ */ new Set(["psn.monlycee.net", "auth.monlycee.net"]);
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://petipotam17.github.io",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);
var REQUEST_TIMEOUT_MS = 18e3;
var MAX_REDIRECTS = 12;
var MAX_BODY_BYTES = 4096;
var RATE_WINDOW_MS = 10 * 6e4;
var RATE_MAX_ATTEMPTS = 10;
var BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Pr8note/1.0"
};
var attemptsByAddress = /* @__PURE__ */ new Map();
var LoginError = class extends Error {
  static {
    __name(this, "LoginError");
  }
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   */
  constructor(code, message, status = 400) {
    super(message);
    this.name = "LoginError";
    this.code = code;
    this.status = status;
  }
};
function decodeHtml(value) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}
__name(decodeHtml, "decodeHtml");
function stripTags(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
__name(stripTags, "stripTags");
function hasCaptcha(html) {
  return /g-recaptcha|h-captcha|hcaptcha|cf-turnstile|recaptcha|class="[^"]*captcha|id="[^"]*captcha/i.test(
    html
  );
}
__name(hasCaptcha, "hasCaptcha");
function hasOtp(html) {
  return /name="otp"|name="totp"|login-otp|kc-otp|one-time|authenticator|webauthn|passkey/i.test(html);
}
__name(hasOtp, "hasOtp");
function hasConsent(html) {
  return /kc-consent|id="kc-consent-form"|name="accept"|terms of service|conditions d.utilisation/i.test(
    html
  );
}
__name(hasConsent, "hasConsent");
function isLoginForm(html) {
  return /id="kc-form-login"|name="username"[\s\S]{0,1200}name="password"/i.test(html);
}
__name(isLoginForm, "isLoginForm");
function portalLooksBlocked(html) {
  return /imperva|incapsula|request unsuccessful|access denied|blocked by|security check|captcha/i.test(
    html
  );
}
__name(portalLooksBlocked, "portalLooksBlocked");
function parseLoginForm(html, pageUrl) {
  const formMatch = html.match(/<form[^>]*id=["']kc-form-login["'][^>]*>/i);
  if (!formMatch) return null;
  const tag = formMatch[0];
  const actionMatch = tag.match(/action=["']([^"']+)["']/i);
  if (!actionMatch) return null;
  let action;
  try {
    action = new URL(decodeHtml(actionMatch[1]), pageUrl).toString();
  } catch {
    return null;
  }
  const formStart = html.indexOf(formMatch[0]);
  const formEnd = html.indexOf("</form>", formStart);
  const formHtml = formEnd === -1 ? html.slice(formStart) : html.slice(formStart, formEnd);
  const fields = {};
  const inputPattern = /<input\b[^>]*>/gi;
  let input;
  while (input = inputPattern.exec(formHtml)) {
    const nameMatch = input[0].match(/\bname=["']([^"']+)["']/i);
    if (!nameMatch) continue;
    const valueMatch = input[0].match(/\bvalue=["']([^"']*)["']/i);
    fields[decodeHtml(nameMatch[1])] = valueMatch ? decodeHtml(valueMatch[1]) : "";
  }
  return {
    action,
    fields,
    captcha: hasCaptcha(formHtml),
    otp: hasOtp(formHtml),
    consent: hasConsent(formHtml)
  };
}
__name(parseLoginForm, "parseLoginForm");
function extractLoginError(html) {
  const candidates = [
    /id=["']kc-error-message["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i,
    /class=["'][^"']*(?:pf-v5-c-alert__title|kc-feedback-text|input-error-message)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p|h[1-6])>/i,
    /id=["']input-error-username["'][^>]*>([\s\S]*?)<\//i,
    /id=["']input-error-password["'][^>]*>([\s\S]*?)<\//i
  ];
  for (const pattern of candidates) {
    const match = html.match(pattern);
    const text = match ? stripTags(match[1]) : "";
    if (text) return text;
  }
  return "";
}
__name(extractLoginError, "extractLoginError");
function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,\s]+=)/g);
}
__name(getSetCookies, "getSetCookies");
var CookieJar = class _CookieJar {
  static {
    __name(this, "CookieJar");
  }
  constructor() {
    this.cookies = /* @__PURE__ */ new Map();
  }
  /** @param {string} url */
  static host(url) {
    return new URL(url).hostname.toLowerCase();
  }
  /**
   * @param {string} header
   * @param {string} requestUrl
   */
  addCookieHeader(header, requestUrl) {
    const parts = header.split(";");
    const first = parts.shift() || "";
    const equals = first.indexOf("=");
    if (equals <= 0) return;
    const name = first.slice(0, equals).trim();
    const value = first.slice(equals + 1).trim();
    if (!name) return;
    const host = _CookieJar.host(requestUrl);
    let domain = host;
    let path = "/";
    let hostOnly = true;
    let secure = false;
    let expiresAt = null;
    for (const part of parts) {
      const index = part.indexOf("=");
      const key2 = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase();
      const attr = index === -1 ? "" : part.slice(index + 1).trim();
      if (key2 === "domain" && attr) {
        domain = attr.replace(/^\./, "").toLowerCase();
        hostOnly = false;
      } else if (key2 === "path" && attr.startsWith("/")) {
        path = attr;
      } else if (key2 === "secure") {
        secure = true;
      } else if (key2 === "max-age") {
        const seconds = Number.parseInt(attr, 10);
        if (Number.isFinite(seconds)) expiresAt = Date.now() + seconds * 1e3;
      } else if (key2 === "expires" && expiresAt === null) {
        const parsed = Date.parse(attr);
        if (Number.isFinite(parsed)) expiresAt = parsed;
      }
    }
    if (!domain || !host.endsWith(domain) && host !== domain) return;
    if (!isAllowedHost(domain)) return;
    const key = `${domain}|${path}|${name}`;
    if (expiresAt !== null && expiresAt <= Date.now()) {
      this.cookies.delete(key);
      return;
    }
    this.cookies.set(key, { name, value, domain, path, hostOnly, secure, expiresAt });
    if (this.cookies.size > 80) {
      const oldest = this.cookies.keys().next().value;
      if (oldest) this.cookies.delete(oldest);
    }
  }
  /** @param {Response} response @param {string} requestUrl */
  absorb(response, requestUrl) {
    for (const header of getSetCookies(response.headers)) {
      this.addCookieHeader(header, requestUrl);
    }
  }
  /** @param {string} url */
  headerFor(url) {
    const host = _CookieJar.host(url);
    const path = new URL(url).pathname || "/";
    const secure = new URL(url).protocol === "https:";
    const matching = [];
    for (const cookie of this.cookies.values()) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= Date.now()) continue;
      if (cookie.secure && !secure) continue;
      if (cookie.hostOnly ? host !== cookie.domain : host !== cookie.domain && !host.endsWith(`.${cookie.domain}`)) {
        continue;
      }
      if (!path.startsWith(cookie.path)) continue;
      matching.push(cookie);
    }
    matching.sort((a, b) => b.path.length - a.path.length);
    return matching.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  }
  /** @param {string} name */
  has(name) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) return true;
    }
    return false;
  }
  /** @param {string} prefix */
  hasPrefix(prefix) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name.startsWith(prefix)) return true;
    }
    return false;
  }
  /** @param {string} name */
  get(name) {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === name) return cookie.value;
    }
    return "";
  }
  /** La session du portail est le cookie oauth2-proxy, pas le cookie Keycloak. */
  hasPortalSession() {
    for (const cookie of this.cookies.values()) {
      if (cookie.name === "_oauth2_proxy") return true;
      if (cookie.name.startsWith("_oauth2_proxy_") && !cookie.name.endsWith("_csrf")) return true;
    }
    return false;
  }
};
function isAllowedHost(host) {
  const normalized = host.toLowerCase().replace(/^\./, "");
  return ALLOWED_HOSTS.has(normalized) || normalized === "monlycee.net" || normalized.endsWith(".monlycee.net");
}
__name(isAllowedHost, "isAllowedHost");
function redactUrl(value) {
  try {
    const url = new URL(value);
    for (const key of ["code", "state", "session_code", "execution", "tab_id"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "\u2026");
    }
    return url.toString();
  } catch {
    return "URL invalide";
  }
}
__name(redactUrl, "redactUrl");
async function fetchFollowing(url, init, jar, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  let current = new URL(url);
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!isAllowedHost(current.hostname)) {
      throw new LoginError(
        "UNSUPPORTED_PROVIDER",
        "MonLyc\xE9e redirige vers un autre fournisseur d\u2019identit\xE9. Cette connexion n\u2019est pas prise en charge.",
        422
      );
    }
    const headers = new Headers(init.headers || {});
    const cookie = jar.headerFor(current.toString());
    if (cookie) headers.set("Cookie", cookie);
    if (method === "GET" || method === "HEAD") headers.delete("Content-Type");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(current.toString(), {
        ...init,
        method,
        body,
        headers,
        redirect: "manual",
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof LoginError) throw error;
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new LoginError(
        aborted ? "TIMEOUT" : "NETWORK",
        aborted ? "MonLyc\xE9e met trop de temps \xE0 r\xE9pondre. R\xE9essaie dans quelques instants." : "Impossible de joindre MonLyc\xE9e pour le moment. R\xE9essaie dans quelques instants.",
        502
      );
    } finally {
      clearTimeout(timer);
    }
    jar.absorb(response, current.toString());
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      let next;
      try {
        next = new URL(location, current);
      } catch {
        throw new LoginError("UNEXPECTED", "MonLyc\xE9e a renvoy\xE9 une redirection invalide.", 502);
      }
      if (response.status === 303 || response.status === 302 && method === "POST") {
        method = "GET";
        body = void 0;
      }
      current = next;
      continue;
    }
    return { response, finalUrl: current.toString() };
  }
  throw new LoginError(
    "TOO_MANY_REDIRECTS",
    "MonLyc\xE9e a interrompu la connexion (trop de redirections). R\xE9essaie dans quelques instants.",
    502
  );
}
__name(fetchFollowing, "fetchFollowing");
function readString(value, key) {
  const found = value?.[key];
  if (typeof found === "string" && found.trim()) return found.trim();
  if (typeof found === "number" && Number.isFinite(found)) return String(found);
  return "";
}
__name(readString, "readString");
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? (
    /** @type {Record<string, unknown>} */
    value
  ) : null;
}
__name(asRecord, "asRecord");
function pick(source, keys) {
  for (const key of keys) {
    const value = readString(source, key);
    if (value) return value;
  }
  return "";
}
__name(pick, "pick");
function capitalizePart(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
__name(capitalizePart, "capitalizePart");
function studentFromPayload(username, sources) {
  let firstName = "";
  let lastName = "";
  let fullName = "";
  let className = "";
  let level = "";
  let establishment = "";
  let city = "";
  let email = "";
  let subject = "";
  for (const source of sources) {
    if (!source) continue;
    firstName ||= pick(source, ["firstName", "firstname", "given_name", "givenName", "prenom", "pr\xE9nom"]);
    lastName ||= pick(source, ["lastName", "lastname", "family_name", "familyName", "nom", "surname"]);
    fullName ||= pick(source, ["displayName", "display_name", "fullName", "full_name", "name"]);
    className ||= pick(source, [
      "className",
      "class_name",
      "classe",
      "division",
      "class",
      "levelClass",
      "niveauClasse"
    ]);
    level ||= pick(source, ["level", "niveau", "grade", "profile", "profil"]);
    establishment ||= pick(source, [
      "establishment",
      "establishmentName",
      "etablissement",
      "\xE9tablissement",
      "school",
      "schoolName",
      "structureName",
      "organization",
      "tenant"
    ]);
    city ||= pick(source, ["city", "ville", "commune"]);
    email ||= pick(source, ["email", "mail", "courriel"]);
    subject ||= pick(source, ["sub", "subject", "id", "userId", "user_id", "preferred_username", "preferredUsername", "login", "username"]);
  }
  if (!firstName && fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    firstName = parts.shift() || "";
    lastName = parts.join(" ");
  }
  if (!firstName && username) {
    const local = username.includes("@") ? username.split("@")[0] : username;
    const parts = local.split(/[._-]/).filter(Boolean);
    firstName = capitalizePart(parts[0] || local);
    lastName = parts.slice(1).map(capitalizePart).join(" ");
  }
  if (!firstName) firstName = "\xC9l\xE8ve";
  if (!subject && username) subject = username;
  return {
    firstName,
    lastName,
    className: className || "Espace personnel",
    level: level || "Compte connect\xE9",
    establishment: establishment || "MonLyc\xE9e.net",
    city: city || "\xCEle-de-France",
    email,
    authMethod: "password",
    authLabel: "MonLyc\xE9e.net",
    subject
  };
}
__name(studentFromPayload, "studentFromPayload");
function parseIdentityPayload(payload, username) {
  const sources = [];
  const add = /* @__PURE__ */ __name((value) => {
    const record = asRecord(value);
    if (record && !sources.includes(record)) sources.push(record);
  }, "add");
  add(payload);
  const root = asRecord(payload);
  if (root) {
    const bases = [root, asRecord(root.data)].filter(Boolean);
    for (const base of bases) {
      for (const key of [
        "data",
        "user",
        "userInfo",
        "profile",
        "identity",
        "me",
        "account",
        "attributes",
        "result"
      ]) {
        add(base[key]);
      }
      for (const key of ["classes", "structures", "etablissements"]) {
        const list = base[key];
        if (Array.isArray(list)) add(asRecord(list[0]));
      }
    }
  }
  return studentFromPayload(username, sources);
}
__name(parseIdentityPayload, "parseIdentityPayload");
async function readIdentity(jar, username, fetchImpl = fetch) {
  const endpoints = [
    `${PORTAL_ORIGIN}/oauth2/userinfo`,
    `${PORTAL_ORIGIN}/directory/user/me`,
    `${PORTAL_ORIGIN}/directory/api/user/me`,
    `${PORTAL_ORIGIN}/user/me`
  ];
  for (const endpoint of endpoints) {
    try {
      const { response } = await fetchFollowing(
        endpoint,
        { method: "GET", headers: { Accept: "application/json" } },
        jar,
        { fetchImpl, maxRedirects: 4 }
      );
      if (!response.ok) continue;
      const text = (await response.text()).trim();
      if (!text || text.startsWith("<")) continue;
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        continue;
      }
      const student = parseIdentityPayload(payload, username);
      if (student) return student;
    } catch {
    }
  }
  return studentFromPayload(username, []);
}
__name(readIdentity, "readIdentity");
async function loginToMonlycee(username, password, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const startUrl = options.startUrl || START_URL;
  const jar = new CookieJar();
  const started = await fetchFollowing(
    startUrl,
    { method: "GET", headers: BROWSER_HEADERS },
    jar,
    { fetchImpl }
  );
  const loginHtml = await started.response.text();
  const form = parseLoginForm(loginHtml, started.finalUrl);
  if (!form) {
    if (hasCaptcha(loginHtml) || portalLooksBlocked(loginHtml)) {
      throw new LoginError(
        "CAPTCHA_REQUIRED",
        "MonLyc\xE9e demande une v\xE9rification anti-robot. Ouvre le portail officiel pour te connecter manuellement.",
        409
      );
    }
    throw new LoginError(
      "LOGIN_PAGE",
      "La page de connexion MonLyc\xE9e est inhabituelle. R\xE9essaie plus tard ou ouvre le portail officiel.",
      502
    );
  }
  if (form.captcha) {
    throw new LoginError(
      "CAPTCHA_REQUIRED",
      "MonLyc\xE9e demande une v\xE9rification anti-robot. Ouvre le portail officiel pour te connecter manuellement.",
      409
    );
  }
  if (form.otp) {
    throw new LoginError(
      "MFA_REQUIRED",
      "MonLyc\xE9e demande une v\xE9rification en deux \xE9tapes, non prise en charge ici. Ouvre le portail officiel.",
      409
    );
  }
  if (form.consent) {
    throw new LoginError(
      "CONSENT_REQUIRED",
      "MonLyc\xE9e demande une autorisation suppl\xE9mentaire. Ouvre le portail officiel pour l\u2019accepter.",
      409
    );
  }
  const fields = new URLSearchParams(form.fields);
  fields.set("username", username);
  fields.set("password", password);
  const posted = await fetchFollowing(
    form.action,
    {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: started.finalUrl
      },
      body: fields
    },
    jar,
    { fetchImpl }
  );
  const resultHtml = await posted.response.text();
  if (isLoginForm(resultHtml)) {
    const detail = extractLoginError(resultHtml);
    const lower = detail.toLowerCase();
    if (hasOtp(resultHtml) || /otp|two.factor|deux étapes|vérification/i.test(lower)) {
      throw new LoginError(
        "MFA_REQUIRED",
        "MonLyc\xE9e demande une v\xE9rification suppl\xE9mentaire. Ouvre le portail officiel pour te connecter.",
        409
      );
    }
    throw new LoginError(
      "INVALID_CREDENTIALS",
      "Identifiant ou mot de passe MonLyc\xE9e refus\xE9. V\xE9rifie-les et r\xE9essaie.",
      401
    );
  }
  if (hasConsent(resultHtml)) {
    throw new LoginError(
      "CONSENT_REQUIRED",
      "MonLyc\xE9e demande une autorisation suppl\xE9mentaire. Ouvre le portail officiel pour l\u2019accepter.",
      409
    );
  }
  if (!jar.hasPortalSession()) {
    const detail = extractLoginError(resultHtml);
    if (detail) {
      throw new LoginError("LOGIN_FAILED", `MonLyc\xE9e a refus\xE9 la connexion : ${detail}`, 401);
    }
    throw new LoginError(
      "NO_SESSION",
      "MonLyc\xE9e n\u2019a pas ouvert de session. V\xE9rifie tes identifiants ou ouvre le portail officiel.",
      401
    );
  }
  const student = await readIdentity(jar, username, fetchImpl);
  return { student, verifiedAt: (/* @__PURE__ */ new Date()).toISOString() };
}
__name(loginToMonlycee, "loginToMonlycee");
function rateLimited(address) {
  const now = Date.now();
  const history = (attemptsByAddress.get(address) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (history.length >= RATE_MAX_ATTEMPTS) {
    attemptsByAddress.set(address, history);
    return true;
  }
  history.push(now);
  attemptsByAddress.set(address, history);
  if (attemptsByAddress.size > 2e3) {
    for (const [key, times] of attemptsByAddress) {
      if (!times.some((time) => now - time < RATE_WINDOW_MS)) attemptsByAddress.delete(key);
    }
  }
  return false;
}
__name(rateLimited, "rateLimited");
function corsHeaders(origin) {
  if (!origin || origin !== "null" && !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
function jsonHeaders(headers = {}) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...headers
  };
}
__name(jsonHeaders, "jsonHeaders");
function errorResponse(error, headers) {
  if (error instanceof LoginError) {
    return new Response(JSON.stringify({ error: error.code, message: error.message }), {
      status: error.status,
      headers: jsonHeaders(headers)
    });
  }
  return new Response(
    JSON.stringify({
      error: "UNEXPECTED",
      message: "La connexion a \xE9chou\xE9 de fa\xE7on inattendue. R\xE9essaie dans quelques instants."
    }),
    { status: 500, headers: jsonHeaders(headers) }
  );
}
__name(errorResponse, "errorResponse");
var index_default = {
  /**
   * @param {Request} request
   */
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);
    if (request.method === "OPTIONS") {
      if (origin && !headers["Access-Control-Allow-Origin"]) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(JSON.stringify({ ok: true, service: "pr8note-auth" }), {
        status: 200,
        headers: jsonHeaders(headers)
      });
    }
    if (url.pathname !== "/api/monlycee/login") {
      return new Response(JSON.stringify({ error: "NOT_FOUND", message: "Route inconnue." }), {
        status: 404,
        headers: jsonHeaders(headers)
      });
    }
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "M\xE9thode non autoris\xE9e." }),
        { status: 405, headers: jsonHeaders(headers) }
      );
    }
    if (origin && origin !== "null" && !ALLOWED_ORIGINS.has(origin)) {
      return new Response(
        JSON.stringify({ error: "ORIGIN_NOT_ALLOWED", message: "Origine non autoris\xE9e." }),
        { status: 403, headers: jsonHeaders() }
      );
    }
    const address = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "local";
    if (rateLimited(address)) {
      return new Response(
        JSON.stringify({
          error: "RATE_LIMITED",
          message: "Trop de tentatives. Attends quelques minutes avant de r\xE9essayer."
        }),
        {
          status: 429,
          headers: { ...jsonHeaders(headers), "Retry-After": String(Math.ceil(RATE_WINDOW_MS / 1e3)) }
        }
      );
    }
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "BAD_CONTENT_TYPE", message: "Requ\xEAte invalide." }),
        { status: 415, headers: jsonHeaders(headers) }
      );
    }
    let raw;
    try {
      raw = await request.text();
    } catch {
      return new Response(JSON.stringify({ error: "BAD_REQUEST", message: "Requ\xEAte illisible." }), {
        status: 400,
        headers: jsonHeaders(headers)
      });
    }
    if (raw.length > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ error: "PAYLOAD_TOO_LARGE", message: "Requ\xEAte trop volumineuse." }),
        { status: 413, headers: jsonHeaders(headers) }
      );
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "BAD_JSON", message: "Requ\xEAte invalide." }), {
        status: 400,
        headers: jsonHeaders(headers)
      });
    }
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "BAD_REQUEST", message: "Requ\xEAte invalide." }), {
        status: 400,
        headers: jsonHeaders(headers)
      });
    }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return new Response(
        JSON.stringify({
          error: "MISSING_CREDENTIALS",
          message: "Renseigne ton identifiant et ton mot de passe MonLyc\xE9e."
        }),
        { status: 400, headers: jsonHeaders(headers) }
      );
    }
    if (username.length > 254 || password.length > 512) {
      return new Response(
        JSON.stringify({ error: "INVALID_CREDENTIALS", message: "Identifiants invalides." }),
        { status: 400, headers: jsonHeaders(headers) }
      );
    }
    try {
      const result = await loginToMonlycee(username, password);
      return new Response(
        JSON.stringify({
          student: result.student,
          verifiedAt: result.verifiedAt
        }),
        { status: 200, headers: jsonHeaders(headers) }
      );
    } catch (error) {
      if (error instanceof LoginError) {
        return errorResponse(error, headers);
      }
      if (typeof console !== "undefined" && console.error) {
        console.error("MonLyc\xE9e login failed:", {
          name: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : String(error),
          url: redactUrl(url.toString())
        });
      }
      return errorResponse(error, headers);
    }
  }
};

// ../../../../../Users/sauneufo/.npm/_npx/3750d4a998b75d79/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../Users/sauneufo/.npm/_npx/3750d4a998b75d79/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Rk49I2/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../../../../Users/sauneufo/.npm/_npx/3750d4a998b75d79/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Rk49I2/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  CookieJar,
  LoginError,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  extractLoginError,
  loginToMonlycee,
  parseIdentityPayload,
  parseLoginForm,
  studentFromPayload
};
//# sourceMappingURL=index.js.map
