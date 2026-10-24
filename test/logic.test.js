import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCHEMA_SQL } from "../src/schema.js";
import {
  SEED_BREWS,
  SEED_RECOMMENDATION,
  SEED_SETUP,
  SYSTEM_PROMPT,
  buildUserPrompt,
  extractModelText,
  formatClock,
  normalizeBrew,
  normalizeRecommendation,
  normalizeSetup,
  parseModelJson,
  ratioLabel,
} from "../src/logic.js";

test("migration matches the schema the worker can create", () => {
  const file = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  assert.equal(file.trim(), SCHEMA_SQL.trim());
});

test("formats the two logged cups the way the notes describe them", () => {
  assert.equal(formatClock(195), "3:15");
  assert.equal(formatClock(170), "2:50");
  assert.equal(ratioLabel(18, 290), "1:16.1");
  assert.equal(ratioLabel(18, 260), "1:14.4");
});

test("the imported next recipe is a valid recommendation", () => {
  const result = normalizeRecommendation(SEED_RECOMMENDATION);
  assert.equal(result.ok, true, result.errors.join(" "));
  assert.equal(result.value.pours.at(-1).target_g, 260);
  assert.equal(result.value.grind_style, "angle45");
  assert.equal(result.value.temp_end_c, null);
});

test("a last pour that misses the target water is snapped or rejected", () => {
  const close = structuredClone(SEED_RECOMMENDATION);
  close.pours[2].target_g = 255;
  const snapped = normalizeRecommendation(close);
  assert.equal(snapped.ok, true, snapped.errors.join(" "));
  assert.equal(snapped.value.pours.at(-1).target_g, 260);

  const far = structuredClone(SEED_RECOMMENDATION);
  far.pours[2].target_g = 200;
  const rejected = normalizeRecommendation(far);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /260/);
});

test("a logged cup needs extraction, body, and a pour plan", () => {
  const missing = normalizeBrew({
    brewed_at: "2026-10-24T09:30",
    coffee_g: 18,
    water_g: 260,
    grind: 7.5,
    grind_style: "angle45",
    temp_c: 91,
    pours: 3,
    pour_plan: "",
    tbt_seconds: 150,
    feedback: { extraction: "over" },
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(" "), /body/);
  assert.match(missing.errors.join(" "), /pour plan/i);

  const ok = normalizeBrew({
    brewed_at: "2026-10-24T09:30",
    coffee_g: 18,
    water_g: 260,
    grind: 7.5,
    grind_style: "45°",
    temp_c: 91,
    pours: 3,
    pour_plan: "Bloom, then two pours.",
    agitation: "",
    tbt_seconds: 150,
    rest_minutes: 5,
    feedback: { extraction: "balanced", body: "syrupy", acidity: "bright" },
    feedback_notes: "Sweet.",
  });
  assert.equal(ok.ok, true, ok.errors.join(" "));
  assert.equal(ok.value.grind_style, "angle45");
  assert.equal(ok.value.agitation, "Standard");
});

test("a new bag requires a change note and a typo fix does not stamp one", () => {
  const vague = normalizeSetup({
    ...SEED_SETUP,
    rethink: true,
    change_note: " ",
    change_at: "2026-10-24T08:00:00.000Z",
  });
  assert.equal(vague.ok, false);

  const kept = normalizeSetup(
    { ...SEED_SETUP, rethink: false, change_note: "ignore me" },
    { change_note: "Earlier bag", change_at: "2026-10-20T00:00:00.000Z" },
  );
  assert.equal(kept.ok, true, kept.errors.join(" "));
  assert.equal(kept.value.change_note, "Earlier bag");
});

test("the prompt carries the bitter watery cup and a new coffee", () => {
  const prompt = buildUserPrompt({
    setup: {
      ...SEED_SETUP,
      change_note: "New bag: washed Ethiopia, roasted yesterday.",
      change_at: "2026-10-24T08:00:00.000Z",
    },
    brews: SEED_BREWS,
    recommendation: {
      created_at: "2026-10-23T12:05:00.000Z",
      payload: SEED_RECOMMENDATION,
    },
    reason: "setup_change",
    brewCount: 2,
  });
  assert.match(prompt, /washed Ethiopia/);
  assert.match(prompt, /watery body/);
  assert.match(prompt, /not been brewed yet/);
  assert.match(prompt, /K-Plus/);
  assert.match(SYSTEM_PROMPT, /bypass/i);
});

test("thought text is ignored and fenced JSON still parses", () => {
  const text = extractModelText({
    candidates: [{
      content: {
        parts: [
          { thought: true, text: "hidden" },
          { text: "```json\n{\"summary\":\"Next\"}\n```" },
        ],
      },
    }],
  });
  assert.equal(parseModelJson(text).summary, "Next");
  assert.doesNotMatch(text, /hidden/);
});
