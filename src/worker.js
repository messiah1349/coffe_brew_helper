import { SCHEMA_SQL } from "./schema.js";
import {
  RESPONSE_SCHEMA,
  SEED_BREWS,
  SEED_RECOMMENDATION,
  SEED_SETUP,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractModelText,
  normalizeBrew,
  normalizeRecommendation,
  normalizeSetup,
  parseModelJson,
  redact,
} from "./logic.js";

const SESSION_MESSAGE = "drawdown-session-v1";
const THINKING_LEVELS = new Set(["low", "medium", "high"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};

async function handleApi(request, env, url) {
  if (request.method === "POST" && url.pathname === "/api/login") return login(request, env, url);
  if (request.method === "POST" && url.pathname === "/api/logout") return logout(url);
  if (request.method === "GET" && url.pathname === "/api/me") return me(request, env);

  if (!(await isAuthed(request, env))) {
    return json({ error: "Sign in.", auth_required: true }, 401);
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/state") {
      const limit = url.searchParams.get("limit") === "50" ? 50 : 5;
      return json(await loadState(env, limit));
    }
    if (request.method === "PUT" && url.pathname === "/api/setup") return updateSetup(request, env);
    if (request.method === "POST" && url.pathname === "/api/brews") return createBrew(request, env);
    if (request.method === "DELETE") {
      const match = url.pathname.match(/^\/api\/brews\/(\d+)$/);
      if (match) return deleteBrew(env, Number(match[1]));
    }
    if (request.method === "POST" && url.pathname === "/api/recommend") return recommend(request, env);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    return json({ error: error.message || "Something went wrong." }, error.status || 500);
  }
}

function authEnabled(env) {
  return Boolean(env.APP_PASSWORD && String(env.APP_PASSWORD).length > 0);
}

async function me(request, env) {
  if (!(await isAuthed(request, env))) {
    return json({ error: "Sign in.", auth_required: true }, 401);
  }
  return json({ ok: true, auth_required: authEnabled(env) });
}

async function login(request, env, url) {
  if (!authEnabled(env)) return json({ ok: true, auth_required: false });
  try {
    const body = await readJson(request);
    const actual = await sha256Hex(String(body.password || ""));
    const expected = await sha256Hex(String(env.APP_PASSWORD));
    if (!safeEqual(actual, expected)) return json({ error: "Wrong password." }, 401);
    const token = await hmacHex(env.APP_PASSWORD, SESSION_MESSAGE);
    return json({ ok: true }, 200, {
      "set-cookie": sessionCookie(token, url.protocol === "https:"),
    });
  } catch (error) {
    return json({ error: error.message || "Could not sign in." }, error.status || 400);
  }
}

function logout(url) {
  return json({ ok: true }, 200, {
    "set-cookie": clearCookie(url.protocol === "https:"),
  });
}

async function isAuthed(request, env) {
  if (!authEnabled(env)) return true;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|; )drawdown_session=([^;]+)/);
  if (!match) return false;
  const expected = await hmacHex(env.APP_PASSWORD, SESSION_MESSAGE);
  return safeEqual(match[1], expected);
}

async function ensureReady(env) {
  if (!env.DB) {
    throw Object.assign(new Error("Database is not configured."), { status: 500 });
  }
  try {
    await env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'").first();
  } catch {
    for (const statement of SCHEMA_SQL.split(";").map((part) => part.trim()).filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
  }
  const seeded = await env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'").first();
  if (!seeded) await seed(env);
}

async function seed(env) {
  const setup = SEED_SETUP;
  const statements = [
    env.DB.prepare(`INSERT INTO setup (
      id, beans_name, variety, process, roast_level, roast_date, descriptors,
      brewer, filter_type, grinder, kettle, notes, change_note, change_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)`).bind(
      setup.beans_name,
      setup.variety,
      setup.process,
      setup.roast_level,
      setup.roast_date,
      setup.descriptors,
      setup.brewer,
      setup.filter_type,
      setup.grinder,
      setup.kettle,
      setup.notes,
      "2026-10-23T12:05:00.000Z",
    ),
    ...SEED_BREWS.map((brew) => brewInsert(env, brew)),
    env.DB.prepare(
      "INSERT INTO recommendations (created_at, model, reason, payload) VALUES (?, 'seed', 'seed', ?)",
    ).bind("2026-10-23T12:05:00.000Z", JSON.stringify(seedRecipe())),
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')"),
  ];
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'").first();
    if (!row) throw error;
  }
}

function seedRecipe() {
  const normalized = normalizeRecommendation(SEED_RECOMMENDATION);
  if (!normalized.ok) throw new Error(normalized.errors.join(" "));
  return normalized.value;
}

function brewInsert(env, brew) {
  return env.DB.prepare(`INSERT INTO brews (
    id, brewed_at, created_at, coffee_g, water_g, grind, grind_style, temp_c, temp_end_c,
    pours, pour_plan, agitation, tbt_seconds, rest_minutes, feedback_json, feedback_notes, origin
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    brew.id,
    brew.brewed_at,
    brew.created_at,
    brew.coffee_g,
    brew.water_g,
    brew.grind,
    brew.grind_style,
    brew.temp_c,
    brew.temp_end_c,
    brew.pours,
    brew.pour_plan,
    brew.agitation,
    brew.tbt_seconds,
    brew.rest_minutes,
    JSON.stringify(brew.feedback),
    brew.feedback_notes,
    brew.origin,
  );
}

async function loadState(env, limit) {
  await ensureReady(env);
  const setupRow = await env.DB.prepare("SELECT * FROM setup WHERE id = 1").first();
  if (!setupRow) throw new Error("Coffee setup is missing.");
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM brews").first();
  const brewRows = await env.DB.prepare(
    "SELECT * FROM brews ORDER BY brewed_at DESC, id DESC LIMIT ?",
  ).bind(limit).all();
  const latestCreated = await env.DB.prepare(
    "SELECT created_at FROM brews ORDER BY created_at DESC LIMIT 1",
  ).first();
  const recRow = await env.DB.prepare(
    "SELECT * FROM recommendations ORDER BY id DESC LIMIT 1",
  ).first();

  const setup = mapSetup(setupRow);
  setup.rethink_open = Boolean(
    setup.change_at && (!latestCreated || setup.change_at > latestCreated.created_at),
  );

  let recommendation = null;
  if (recRow) {
    const payload = parseJson(recRow.payload);
    if (payload) {
      const later = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM brews WHERE created_at > ?",
      ).bind(recRow.created_at).first();
      recommendation = {
        id: recRow.id,
        created_at: recRow.created_at,
        model: recRow.model,
        reason: recRow.reason,
        status: Number(later?.n || 0) > 0 ? "stale" : "ready",
        payload,
      };
    }
  }

  return {
    setup,
    brews: (brewRows.results || []).map(mapBrew),
    brew_count: Number(countRow?.n || 0),
    recommendation,
  };
}

async function updateSetup(request, env) {
  await ensureReady(env);
  const body = await readJson(request);
  const current = mapSetup(await env.DB.prepare("SELECT * FROM setup WHERE id = 1").first()) || {};
  const input = { ...body, updated_at: new Date().toISOString() };
  if (input.rethink) input.change_at = input.updated_at;
  const normalized = normalizeSetup(input, current);
  if (!normalized.ok) return json({ error: normalized.errors.join(" ") }, 400);
  const value = normalized.value;
  await env.DB.prepare(`INSERT INTO setup (
    id, beans_name, variety, process, roast_level, roast_date, descriptors,
    brewer, filter_type, grinder, kettle, notes, change_note, change_at, updated_at
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    beans_name = excluded.beans_name,
    variety = excluded.variety,
    process = excluded.process,
    roast_level = excluded.roast_level,
    roast_date = excluded.roast_date,
    descriptors = excluded.descriptors,
    brewer = excluded.brewer,
    filter_type = excluded.filter_type,
    grinder = excluded.grinder,
    kettle = excluded.kettle,
    notes = excluded.notes,
    change_note = excluded.change_note,
    change_at = excluded.change_at,
    updated_at = excluded.updated_at`).bind(
    value.beans_name,
    value.variety,
    value.process,
    value.roast_level,
    value.roast_date,
    value.descriptors,
    value.brewer,
    value.filter_type,
    value.grinder,
    value.kettle,
    value.notes,
    value.change_note,
    value.change_at,
    value.updated_at,
  ).run();
  return json({ ok: true });
}

async function createBrew(request, env) {
  await ensureReady(env);
  const normalized = normalizeBrew(await readJson(request));
  if (!normalized.ok) return json({ error: normalized.errors.join(" ") }, 400);
  const value = normalized.value;
  const result = await env.DB.prepare(`INSERT INTO brews (
    brewed_at, created_at, coffee_g, water_g, grind, grind_style, temp_c, temp_end_c,
    pours, pour_plan, agitation, tbt_seconds, rest_minutes, feedback_json, feedback_notes, origin
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`).bind(
    value.brewed_at,
    new Date().toISOString(),
    value.coffee_g,
    value.water_g,
    value.grind,
    value.grind_style,
    value.temp_c,
    value.temp_end_c,
    value.pours,
    value.pour_plan,
    value.agitation,
    value.tbt_seconds,
    value.rest_minutes,
    JSON.stringify(value.feedback),
    value.feedback_notes,
  ).run();
  return json({ id: result.meta?.last_row_id ?? null });
}

async function deleteBrew(env, id) {
  await ensureReady(env);
  const result = await env.DB.prepare("DELETE FROM brews WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return json({ error: "That brew is already gone." }, 404);
  return json({ ok: true });
}

async function recommend(request, env) {
  await ensureReady(env);
  if (!env.GEMINI_API_KEY) {
    return json({
      error: "Gemini is not configured. Add GEMINI_API_KEY to .dev.vars, or run wrangler secret put GEMINI_API_KEY.",
    }, 400);
  }

  const body = await readJson(request);
  const reason = ["new_brew", "setup_change", "refresh"].includes(body.reason) ? body.reason : "refresh";
  const state = await loadState(env, 20);
  const history = await env.DB.prepare(
    "SELECT * FROM brews ORDER BY brewed_at DESC, id DESC LIMIT 20",
  ).all();
  const brews = (history.results || []).map(mapBrew).reverse();
  const prompt = buildUserPrompt({
    setup: state.setup,
    brews,
    recommendation: state.recommendation,
    reason,
    brewCount: state.brew_count,
  });

  let recipe;
  let model;
  try {
    const drafted = await draftRecipe(env, prompt);
    recipe = drafted.recipe;
    model = drafted.model;
  } catch (error) {
    const status = error.status && error.status < 500 ? error.status : 502;
    return json({ error: error.message || "Could not get a recipe." }, status);
  }

  const createdAt = new Date().toISOString();
  const inserted = await env.DB.prepare(
    "INSERT INTO recommendations (created_at, model, reason, payload) VALUES (?, ?, ?, ?)",
  ).bind(createdAt, model, reason, JSON.stringify(recipe)).run();

  return json({
    recommendation: {
      id: inserted.meta?.last_row_id ?? null,
      created_at: createdAt,
      model,
      reason,
      status: "ready",
      payload: recipe,
    },
  });
}

async function draftRecipe(env, prompt) {
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  let rejection = [];
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let data;
    try {
      data = await callGemini(env, model, prompt, rejection);
    } catch (error) {
      throw error;
    }
    try {
      const parsed = parseModelJson(extractModelText(data));
      const normalized = normalizeRecommendation(parsed);
      if (!normalized.ok) {
        lastError = new Error(normalized.errors.join(" "));
        rejection = normalized.errors;
        continue;
      }
      return { recipe: normalized.value, model };
    } catch (error) {
      lastError = error;
      rejection = [error.message];
    }
  }
  throw new Error(redact(lastError?.message || "Could not get a recipe."));
}

async function callGemini(env, model, prompt, rejection) {
  const thinking = THINKING_LEVELS.has(env.GEMINI_THINKING) ? env.GEMINI_THINKING : "low";
  const text = rejection.length
    ? `${prompt}\n\n# Fix the previous draft\n${rejection.map((item) => `- ${item}`).join("\n")}\nReturn the corrected recipe.`
    : prompt;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: thinking },
            responseFormat: {
              text: {
                mimeType: "APPLICATION_JSON",
                schema: RESPONSE_SCHEMA,
              },
            },
          },
        }),
      },
    );
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Gemini took too long. Try again.");
    throw new Error("Could not reach Gemini.");
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = redact(data?.error?.message || response.statusText || "Gemini request failed.");
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error("Gemini rejected the API key."), { status: 400 });
    }
    if (response.status === 429) {
      throw Object.assign(new Error("Gemini is rate limiting. Wait a moment, then try again."), { status: 429 });
    }
    throw new Error(message);
  }
  return data;
}

function mapSetup(row) {
  if (!row) return null;
  return {
    beans_name: row.beans_name,
    variety: row.variety,
    process: row.process,
    roast_level: row.roast_level,
    roast_date: row.roast_date,
    descriptors: row.descriptors,
    brewer: row.brewer,
    filter_type: row.filter_type,
    grinder: row.grinder,
    kettle: row.kettle,
    notes: row.notes,
    change_note: row.change_note,
    change_at: row.change_at,
    updated_at: row.updated_at,
  };
}

function mapBrew(row) {
  return {
    id: row.id,
    brewed_at: row.brewed_at,
    created_at: row.created_at,
    coffee_g: row.coffee_g,
    water_g: row.water_g,
    grind: row.grind,
    grind_style: row.grind_style,
    temp_c: row.temp_c,
    temp_end_c: row.temp_end_c,
    pours: row.pours,
    pour_plan: row.pour_plan,
    agitation: row.agitation,
    tbt_seconds: row.tbt_seconds,
    rest_minutes: row.rest_minutes,
    feedback: parseJson(row.feedback_json) || {},
    feedback_notes: row.feedback_notes,
    origin: row.origin,
  };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100000) throw Object.assign(new Error("That request is too large."), { status: 413 });
  const text = await request.text();
  if (text.length > 100000) throw Object.assign(new Error("That request is too large."), { status: 413 });
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("The request was not valid JSON."), { status: 400 });
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function sessionCookie(token, secure) {
  const parts = [
    `drawdown_session=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=2592000",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(secure) {
  const parts = ["drawdown_session=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(digest);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return hex(signature);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
