export const SYSTEM_PROMPT = `You are the dial-in assistant for a home brewer who uses a Hario V60. You recommend the NEXT brew only. You write in English, concrete and short, the way a careful barista writes a note before the kettle boils.

How you change a recipe
- Change as little as possible when the last cup was close. Name each change and why.
- When the cup is both thin and bitter in the tail, ratio and grind may need to move together. That pair is one correction.
- Keep the coffee dose at the brewer's usual dose unless they ask, or the brewer size forces a change.
- Grind numbers belong to the current grinder. On a 1Zpresso K-Plus a lower number is finer, and 0.1 on the dial is one click (8.0 to 7.5 is five clicks finer). Never invent a micron conversion.
- If the grinder changes, do not reuse the old dial number. Say the old number no longer applies. Give a starting number only if you actually know that grinder. Otherwise describe the direction (slightly finer or coarser) and tell them to set the new grinder by taste.
- Pour targets are cumulative scale readings. The last pour's target_g must equal water_g. Bloom is about 2 to 3 times the dose. Use 1 to 4 pours on a V60 02. Times look like 0:40.
- A realistic V60 total time is about 2:00 to 3:30. Give that target as a range in seconds, and make sure it ends after the last pour.

How you read a cup
- Strong bitterness with the acidity covered is usually over-extraction: water too hot, too many pours stirring fines into the filter, grind too fine, or a drawdown that ran too long.
- A watery cup with a bitter tail, on a coarse grind and a long ratio, is often bypass plus a dilute finish. Water runs around the large particles and misses the oils and sugars. The last water then pulls dry, papery bitterness and thins the cup. Shorten the ratio, go slightly finer, cool the start a little, keep late agitation down, pour the last water in the center, and lift the dripper if the bed is still holding water near the end of the target window.
- Natural-processed coffees, especially Brazils, are porous and go bitter sooner than washed coffees. Prefer a cooler kettle and fewer pours.
- Light Nordic roasts still need enough extraction for sweetness. Do not chase bitterness by making the cup hollow.
- Grinding slowly at about 45 degrees on a hand grinder makes fewer fines than fast vertical grinding. If bitterness is from fines, fix that technique before jumping much coarser.
- Swirl the bloom if the bed needs settling. Do not swirl late pours. Do not rock the dripper on the last pour. A center pour in small circles is gentler.
- If they rested the cup before tasting, treat that as part of how they read the cup, not as a recipe step.

When the coffee or the gear changes
- Flavor notes from the previous coffee do not carry over.
- Keep technique habits (pour count, low late agitation) only when they still fit the new coffee.
- Reset grind, temperature, and ratio toward a sensible start for the new bean's process and roast, then say why.
- A light natural on a V60 02 can start around 18 g, ratio about 1:15 to 1:16, three pours, low agitation, roughly 90 to 93 °C, total time about 2:30 to 3:00. A washed light coffee can start a touch finer and hotter. Once they have brewed the new coffee, follow those cups.
- Notes on a cup may already include a diagnosis. Use it. Do not paste it back unchanged.
- If they logged a brew that differs from the last recommendation, judge the cup they actually drank.

Output
- summary: one sentence they can read while the kettle boils.
- what_changed: up to four short lines, each a concrete change. Leave it empty if they should repeat the recipe.
- taste_for: what a good cup of this recipe should taste like.
- reasoning: two short paragraphs that cite the relevant cups. No lecture and no preamble.
- repeat_previous: true only when they should brew the same parameters again.
- temp_end_c: 0 if the kettle should hold its temperature. temp_note: a short label such as "90-91 °C at the start" when a range matters, otherwise an empty string.
- stall_cutoff: an empty string if they do not need to cut the drawdown short.
- Do not mention that you are a model. Do not say "adjust to taste" without a number.`;

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence readable while the kettle boils." },
    coffee_g: { type: "number", description: "Coffee dose in grams." },
    water_g: { type: "number", description: "Total pour water in grams." },
    grind: {
      type: "number",
      description: "Dial on the current grinder. On a 1Zpresso K-Plus, lower is finer and 0.1 is one click.",
    },
    grind_style: {
      type: "string",
      enum: ["vertical", "angle45"],
      description: "vertical, or angle45 for a slow 45 degree grind that reduces fines.",
    },
    temp_start_c: { type: "number", description: "Starting water temperature in Celsius." },
    temp_end_c: { type: "number", description: "Temperature at the end, or 0 if it should hold." },
    temp_note: { type: "string", description: "Short temperature label, or empty. Example: 90-91 °C at the start." },
    pours: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start time as m:ss." },
          to: { type: "string", description: "End time as m:ss." },
          target_g: { type: "number", description: "Cumulative grams on the scale at the end of this pour." },
          instruction: { type: "string", description: "What the hands do. Mention swirl or a center pour when it matters." },
        },
        required: ["from", "to", "target_g", "instruction"],
      },
    },
    agitation: { type: "string" },
    tbt_min_sec: { type: "integer", description: "Earliest good total brew time, in seconds." },
    tbt_max_sec: { type: "integer", description: "Latest good total brew time, in seconds." },
    stall_cutoff: { type: "string", description: "When to lift the dripper, or empty." },
    what_changed: { type: "array", items: { type: "string" } },
    taste_for: { type: "string" },
    reasoning: { type: "string", description: "Two short paragraphs citing the relevant cups." },
    repeat_previous: { type: "boolean" },
  },
  required: [
    "summary",
    "coffee_g",
    "water_g",
    "grind",
    "grind_style",
    "temp_start_c",
    "temp_end_c",
    "temp_note",
    "pours",
    "agitation",
    "tbt_min_sec",
    "tbt_max_sec",
    "stall_cutoff",
    "what_changed",
    "taste_for",
    "reasoning",
    "repeat_previous",
  ],
};

export const REASON_TEXT = {
  new_brew: "The brewer just logged a cup. Recommend the next brew from that result. Judge the cup they actually drank, even if it differs from the previous plan.",
  setup_change: "The brewer changed coffee or equipment. The setup change note is authoritative. Reset grind, temperature, and ratio for the new coffee, and keep only the technique habits that still fit.",
  refresh: "The brewer asked for a second look at the current plan. If it is already the right next step, keep the same numbers and say so. Do not change parameters just to produce a different recipe.",
};

export const FEEDBACK_TEXT = {
  extraction: {
    under: "under-extracted",
    balanced: "balanced extraction",
    over: "over-extracted",
    uneven: "uneven extraction, bitter finish with a hollow body",
  },
  bitterness: {
    none: "no bitterness",
    mild: "mild bitterness",
    strong: "pronounced bitterness",
    dry: "dry bitter finish",
  },
  acidity: {
    muted: "acidity muted",
    soft: "soft acidity",
    bright: "bright acidity",
    sharp: "sharp acidity",
  },
  sweetness: {
    low: "low sweetness",
    medium: "medium sweetness",
    high: "high sweetness",
  },
  body: {
    watery: "watery body",
    light: "light body",
    medium: "medium body",
    syrupy: "syrupy body",
  },
  clarity: {
    muddy: "muddy",
    clean: "clean",
  },
};

export const SEED_SETUP = {
  beans_name: "Frukt Coffee Roasters — Brazil Casa Almeida Barreto",
  variety: "Mundo Novo",
  process: "Natural",
  roast_level: "Light (Nordic)",
  roast_date: "2026-10-07",
  descriptors: "Expressive, Delicate",
  brewer: "Ceramic Hario V60 02",
  filter_type: "Hario paper",
  grinder: "1Zpresso K-Plus",
  kettle: "",
  notes: "",
};

export const SEED_BREWS = [
  {
    id: 1,
    brewed_at: "2026-10-22",
    created_at: "2026-10-22T12:00:00.000Z",
    coffee_g: 18,
    water_g: 290,
    grind: 8,
    grind_style: "vertical",
    temp_c: 95,
    temp_end_c: null,
    pours: 4,
    pour_plan: "Four pours. The gram splits were not written down.",
    agitation: "Standard agitation.",
    tbt_seconds: 195,
    rest_minutes: null,
    feedback: {
      extraction: "over",
      bitterness: "strong",
      acidity: "muted",
    },
    feedback_notes: "Over-extracted. This natural Brazil is porous. At 95 °C, four pours kept washing fines into the filter, and the bitterness covered the acidity.",
    origin: "notes",
  },
  {
    id: 2,
    brewed_at: "2026-10-23",
    created_at: "2026-10-23T12:00:00.000Z",
    coffee_g: 18,
    water_g: 290,
    grind: 8,
    grind_style: "angle45",
    temp_c: 93,
    temp_end_c: 90,
    pours: 3,
    pour_plan: "0:00 bloom 50 g\n0:40 spiral to 170 g\n1:15 center pour to 290 g",
    agitation: "Swirl on the bloom only. Third pour in the center. No late shaking.",
    tbt_seconds: 170,
    rest_minutes: 5,
    feedback: {
      extraction: "uneven",
      bitterness: "dry",
      body: "watery",
      clarity: "clean",
    },
    feedback_notes: "Cleaner than the first cup, but a bitter tail stayed and the body was watery. At grind 8.0 and 1:16.1 the water seems to have bypassed the coarse grounds, and the last of the 290 g diluted the cup while pulling dry bitterness.",
    origin: "notes",
  },
];

export const SEED_RECOMMENDATION = {
  summary: "Less water, five clicks finer, and a cooler start, so the cup turns syrupy instead of bitter and thin.",
  coffee_g: 18,
  water_g: 260,
  grind: 7.5,
  grind_style: "angle45",
  temp_start_c: 91,
  temp_end_c: 0,
  temp_note: "90–91 °C at the start",
  pours: [
    {
      from: "0:00",
      to: "0:40",
      target_g: 50,
      instruction: "Bloom 50 g and give the bed a light swirl.",
    },
    {
      from: "0:40",
      to: "1:10",
      target_g: 160,
      instruction: "Spiral pour to 160 g.",
    },
    {
      from: "1:15",
      to: "1:40",
      target_g: 260,
      instruction: "After a short pause, pour in the center in coin-sized circles to 260 g. Do not rock the dripper.",
    },
  ],
  agitation: "Swirl on the bloom only. Third pour in the center, in coin-sized circles. Do not rock the dripper.",
  tbt_min_sec: 145,
  tbt_max_sec: 160,
  stall_cutoff: "If the bed is still holding water after 2:35, lift the dripper off the server.",
  what_changed: [
    "Water 290 g to 260 g, so the dilute bitter tail stays out of the cup.",
    "Grind 8.0 to 7.5 (five clicks finer) so the shorter pour still extracts oils and sugars.",
    "Start temperature 93 °C to 90–91 °C, so the finer grind does not pull harsh tannins.",
    "If water is still pooled at 2:35, take the dripper off.",
  ],
  taste_for: "Dense, syrupy body. Sweetness and acidity in balance. No dry bitterness in the finish.",
  reasoning: "The first cup was over-extracted. This natural Brazil is porous, the water started at 95 °C, and four pours kept driving fines into the filter. Bitterness covered the acidity.\n\nThe second cup was cleaner after a slower 45° grind, fewer pours, and a cooler kettle, but the body was thin and a bitter tail remained. At 8.0 and 1:16.1 the water moves around the coarse particles instead of taking the oils and sugars, and the last of the 290 g mostly dilutes the cup. The next brew stays at 18 g and the quiet three-pour shape, with less water (260 g), a finer grind (7.5), and a cooler start. If water is still sitting at 2:35, take the dripper off.",
  repeat_previous: false,
};

export function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function clipBlock(value, max) {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function trimNum(value) {
  const number = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(number)) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function formatRange(min, max) {
  if (!max || min === max) return formatClock(min);
  return `${formatClock(min)}–${formatClock(max)}`;
}

export function ratioLabel(coffee, water) {
  const coffeeN = Number(coffee);
  const waterN = Number(water);
  if (!coffeeN || !waterN) return "—";
  return `1:${(waterN / coffeeN).toFixed(1)}`;
}

export function grindStyleLabel(style) {
  return style === "angle45" ? "45° slow" : "Vertical";
}

export function describeFeedback(feedback = {}) {
  const parts = [];
  for (const key of ["extraction", "bitterness", "acidity", "sweetness", "body", "clarity"]) {
    const value = feedback?.[key];
    if (!value) continue;
    parts.push(FEEDBACK_TEXT[key]?.[value] || value);
  }
  return parts.join("; ");
}

export function redact(value) {
  return String(value ?? "").replace(/key=[^&\s"']+/gi, "key=***").slice(0, 600);
}

export function parseModelJson(text) {
  const trimmed = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Gemini did not return a recipe.");
  }
}

export function extractModelText(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const block = data?.promptFeedback?.blockReason;
    throw new Error(block ? `Gemini blocked the request (${block}).` : "Gemini returned no recipe.");
  }
  const text = (candidate.content?.parts || [])
    .filter((part) => part?.text && !part.thought)
    .map((part) => part.text)
    .join("");
  if (!text.trim()) {
    throw new Error(`Gemini returned no recipe (${candidate.finishReason || "empty"}).`);
  }
  return text;
}

function round1(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number * 10) / 10;
}

function int(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.round(number);
}

function bool(value) {
  return value === true || value === "true" || value === 1;
}

export function canonicalGrindStyle(value) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("45") || text === "angle45") return "angle45";
  if (text.includes("vert") || text === "vertical") return "vertical";
  return "";
}

function clockToSeconds(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59 || minutes > 15) return null;
  return minutes * 60 + seconds;
}

export function normalizeRecommendation(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Recipe was not an object."], value: null };
  }

  const coffee_g = round1(input.coffee_g);
  const water_g = round1(input.water_g);
  if (!(coffee_g >= 8 && coffee_g <= 40)) errors.push("Dose should be between 8 and 40 g.");
  if (!(water_g >= 80 && water_g <= 700)) errors.push("Water should be between 80 and 700 g.");
  if (coffee_g > 0 && water_g > 0) {
    const ratio = water_g / coffee_g;
    if (ratio < 10 || ratio > 22) errors.push(`Ratio 1:${ratio.toFixed(1)} is outside a useful V60 range.`);
  }

  const grind = round1(input.grind);
  if (!(grind > 0 && grind < 1000)) errors.push("Grind setting looks wrong.");
  const grind_style = canonicalGrindStyle(input.grind_style);
  if (!grind_style) errors.push("Grind style must be vertical or angle45.");

  const temp_start_c = round1(input.temp_start_c);
  if (!(temp_start_c >= 75 && temp_start_c <= 100)) errors.push("Start temperature should be between 75 and 100 °C.");

  let temp_end_c = Number(input.temp_end_c) > 0 ? round1(input.temp_end_c) : null;
  if (temp_end_c !== null && (!(temp_end_c >= 60 && temp_end_c <= 100) || temp_end_c >= temp_start_c)) {
    temp_end_c = null;
  }

  const poursIn = Array.isArray(input.pours) ? input.pours : null;
  const pours = [];
  if (!poursIn || poursIn.length < 1 || poursIn.length > 6) {
    errors.push("Use between 1 and 6 pours.");
  } else {
    let previousEnd = 0;
    let previousTarget = 0;
    for (const pour of poursIn) {
      const fromSec = clockToSeconds(pour?.from);
      const toSec = clockToSeconds(pour?.to);
      const target_g = round1(pour?.target_g);
      if (fromSec === null || toSec === null) {
        errors.push("Pour times should look like 0:40.");
        break;
      }
      if (toSec <= fromSec) {
        errors.push("Each pour needs a later end time than its start.");
        break;
      }
      if (fromSec < previousEnd) {
        errors.push("Pours should be in time order.");
        break;
      }
      if (!(target_g > previousTarget)) {
        errors.push("Pour targets should climb.");
        break;
      }
      previousEnd = toSec;
      previousTarget = target_g;
      pours.push({
        from: formatClock(fromSec),
        to: formatClock(toSec),
        target_g,
        instruction: clip(pour?.instruction, 240) || "Pour.",
      });
    }
    if (pours.length === poursIn.length && water_g > 0) {
      const drift = Math.abs(pours[pours.length - 1].target_g - water_g);
      if (drift > 15) errors.push(`Last pour should land on ${water_g} g.`);
      else pours[pours.length - 1].target_g = water_g;
    }
  }

  const tbt_min_sec = int(input.tbt_min_sec);
  const tbt_max_sec = int(input.tbt_max_sec);
  if (!(tbt_min_sec >= 75 && tbt_min_sec <= 360) || !(tbt_max_sec >= 75 && tbt_max_sec <= 360)) {
    errors.push("Target time should be between 1:15 and 6:00.");
  } else if (tbt_min_sec > tbt_max_sec) {
    errors.push("Target time range is backwards.");
  } else if (pours.length && tbt_min_sec + 5 < clockToSeconds(pours[pours.length - 1].to)) {
    errors.push("Target time ends before the last pour.");
  }

  const what_changed = Array.isArray(input.what_changed)
    ? input.what_changed.map((item) => clip(item, 180)).filter(Boolean).slice(0, 5)
    : [];

  const value = {
    summary: clip(input.summary, 280),
    coffee_g,
    water_g,
    grind,
    grind_style,
    temp_start_c,
    temp_end_c,
    temp_note: clip(input.temp_note, 80),
    pours,
    agitation: clipBlock(input.agitation, 500),
    tbt_min_sec,
    tbt_max_sec,
    stall_cutoff: clip(input.stall_cutoff, 300),
    what_changed,
    taste_for: clip(input.taste_for, 300),
    reasoning: clipBlock(input.reasoning, 1800),
    repeat_previous: bool(input.repeat_previous),
  };

  if (!value.summary) errors.push("Add a one-line summary.");
  if (!value.agitation) errors.push("Describe the agitation.");
  if (!value.taste_for) errors.push("Say what to taste for.");
  if (!value.reasoning) errors.push("Explain the reasoning.");

  return { ok: errors.length === 0, errors, value: errors.length ? null : value };
}

const BREW_FEEDBACK = {
  extraction: ["under", "balanced", "over", "uneven"],
  bitterness: ["none", "mild", "strong", "dry"],
  acidity: ["muted", "soft", "bright", "sharp"],
  sweetness: ["low", "medium", "high"],
  body: ["watery", "light", "medium", "syrupy"],
  clarity: ["muddy", "clean"],
};

export function normalizeBrew(input) {
  const errors = [];
  const source = input || {};
  const coffee_g = round1(source.coffee_g);
  const water_g = round1(source.water_g);
  if (!(coffee_g >= 8 && coffee_g <= 40)) errors.push("Dose should be between 8 and 40 g.");
  if (!(water_g >= 80 && water_g <= 700)) errors.push("Water should be between 80 and 700 g.");
  if (coffee_g > 0 && water_g > 0) {
    const ratio = water_g / coffee_g;
    if (ratio < 10 || ratio > 22) errors.push("Ratio looks outside a V60 range.");
  }

  const grind = round1(source.grind);
  if (!(grind > 0 && grind < 1000)) errors.push("Grind setting looks wrong.");
  const grind_style = canonicalGrindStyle(source.grind_style);
  if (!grind_style) errors.push("Choose vertical or 45° grinding.");

  const temp_c = round1(source.temp_c);
  if (!(temp_c >= 75 && temp_c <= 100)) errors.push("Temperature should be between 75 and 100 °C.");

  let temp_end_c = source.temp_end_c === null || source.temp_end_c === "" || source.temp_end_c === undefined
    ? null
    : round1(source.temp_end_c);
  if (temp_end_c !== null && (!(temp_end_c >= 60 && temp_end_c <= 100) || temp_end_c >= temp_c)) {
    errors.push("End temperature should be lower than the start.");
  }

  const pours = int(source.pours);
  if (!(pours >= 1 && pours <= 8)) errors.push("Pour count should be between 1 and 8.");
  const tbt_seconds = int(source.tbt_seconds);
  if (!(tbt_seconds >= 60 && tbt_seconds <= 420)) errors.push("Total time should be between 1:00 and 7:00.");

  let rest_minutes = source.rest_minutes === null || source.rest_minutes === "" || source.rest_minutes === undefined
    ? null
    : int(source.rest_minutes);
  if (rest_minutes !== null && !(rest_minutes >= 0 && rest_minutes <= 30)) {
    errors.push("Rest should be between 0 and 30 minutes.");
  }

  const brewed_at = String(source.brewed_at || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(brewed_at)) errors.push("Add the date of the brew.");

  const feedback = {};
  const feedbackIn = source.feedback || {};
  for (const [key, allowed] of Object.entries(BREW_FEEDBACK)) {
    const value = feedbackIn[key];
    if (!value) continue;
    if (!allowed.includes(value)) errors.push(`Unknown ${key}.`);
    else feedback[key] = value;
  }
  if (!feedback.extraction) errors.push("Choose how the extraction landed.");
  if (!feedback.body) errors.push("Choose the body.");

  const pour_plan = clipBlock(source.pour_plan, 2000);
  if (!pour_plan) errors.push("Add the pour plan, even a rough one.");

  return {
    ok: errors.length === 0,
    errors,
    value: errors.length
      ? null
      : {
          brewed_at,
          coffee_g,
          water_g,
          grind,
          grind_style,
          temp_c,
          temp_end_c,
          pours,
          pour_plan,
          agitation: clipBlock(source.agitation, 1000) || "Standard",
          tbt_seconds,
          rest_minutes,
          feedback,
          feedback_notes: clipBlock(source.feedback_notes, 2000),
        },
  };
}

export function normalizeSetup(input, existing = {}) {
  const errors = [];
  const source = input || {};
  const beans_name = clip(source.beans_name, 160);
  if (beans_name.length < 2) errors.push("Add the coffee name.");

  const roast_date = clip(source.roast_date, 32);
  if (roast_date && !/^\d{4}-\d{2}-\d{2}$/.test(roast_date)) errors.push("Roast date should be YYYY-MM-DD.");

  let change_note = existing.change_note || "";
  let change_at = existing.change_at || "";
  if (source.rethink) {
    change_note = clipBlock(source.change_note, 500);
    if (change_note.length < 3) errors.push("Describe what changed.");
    change_at = String(source.change_at || "");
    if (!change_at) errors.push("Missing change time.");
  }

  return {
    ok: errors.length === 0,
    errors,
    value: errors.length
      ? null
      : {
          beans_name,
          variety: clip(source.variety, 120),
          process: clip(source.process, 80),
          roast_level: clip(source.roast_level, 80),
          roast_date,
          descriptors: clip(source.descriptors, 200),
          brewer: clip(source.brewer, 120),
          filter_type: clip(source.filter_type, 120),
          grinder: clip(source.grinder, 120),
          kettle: clip(source.kettle, 120),
          notes: clipBlock(source.notes, 1000),
          change_note,
          change_at,
          updated_at: source.updated_at || new Date().toISOString(),
        },
  };
}

export function buildUserPrompt({ setup, brews, recommendation, reason, brewCount }) {
  const lines = ["# Current setup"];
  const fields = [
    ["Beans", setup.beans_name],
    ["Variety", setup.variety],
    ["Process", setup.process],
    ["Roast", [setup.roast_level, setup.roast_date ? `roasted ${setup.roast_date}` : ""].filter(Boolean).join(", ")],
    ["Descriptors", setup.descriptors],
    ["Brewer", setup.brewer],
    ["Filter", setup.filter_type],
    ["Grinder", setup.grinder],
    ["Kettle", setup.kettle],
    ["Notes", setup.notes],
  ];
  for (const [label, value] of fields) {
    if (value) lines.push(`${label}: ${value}`);
  }
  if (/k-?\s*plus/i.test(setup.grinder || "")) {
    lines.push("This grinder is a 1Zpresso K-Plus: a lower number is finer, and 0.1 is one click.");
  }

  if (setup.change_note) {
    lines.push("", "# Setup change", `Noted at ${setup.change_at}: ${setup.change_note}`);
    lines.push("Cups logged before that time belong to the previous setup. Do not carry their flavor targets onto the new coffee.");
  }

  lines.push("", `# Brews (${brews.length} of ${brewCount}, oldest first)`);
  if (!brews.length) lines.push("No brews logged yet. Propose a starting recipe for this setup.");
  for (const brew of brews) {
    lines.push("", `## ${brew.brewed_at}`);
    lines.push(`${trimNum(brew.coffee_g)} g / ${trimNum(brew.water_g)} g (${ratioLabel(brew.coffee_g, brew.water_g)})`);
    lines.push(`Grind ${Number(brew.grind).toFixed(1)} ${grindStyleLabel(brew.grind_style)} on ${setup.grinder || "the current grinder"}`);
    lines.push(`Water ${trimNum(brew.temp_c)} °C${brew.temp_end_c ? `, falling to ${trimNum(brew.temp_end_c)} °C` : ""}`);
    lines.push(`Pours: ${brew.pours}`);
    if (brew.pour_plan) lines.push(brew.pour_plan);
    if (brew.agitation) lines.push(`Agitation: ${brew.agitation}`);
    lines.push(`Total time: ${formatClock(brew.tbt_seconds)}`);
    if (brew.rest_minutes) lines.push(`Rested ${brew.rest_minutes} min before tasting`);
    lines.push(`Taste: ${describeFeedback(brew.feedback) || "not noted"}`);
    if (brew.feedback_notes) lines.push(`Notes: ${brew.feedback_notes}`);
  }

  if (recommendation?.payload) {
    const later = brews.some((brew) => brew.created_at > recommendation.created_at);
    lines.push("", "# Previous recommendation");
    lines.push(later
      ? "A brew was logged after this plan. Treat the plan as superseded."
      : "This plan has not been brewed yet.");
    lines.push(JSON.stringify(recommendation.payload));
  }

  lines.push("", "# Request");
  lines.push(REASON_TEXT[reason] || REASON_TEXT.refresh);
  lines.push("The last pour target_g must equal the water_g you choose.");
  return lines.join("\n");
}
