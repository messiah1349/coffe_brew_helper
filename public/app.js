const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT = {
  extraction: { under: "Under-extracted", balanced: "Balanced", over: "Over-extracted", uneven: "Uneven" },
  bitterness: { none: "No bitterness", mild: "Mild bitterness", strong: "Pronounced bitterness", dry: "Dry finish" },
  acidity: { muted: "Acidity muted", soft: "Soft acidity", bright: "Bright acidity", sharp: "Sharp acidity" },
  sweetness: { low: "Low sweetness", medium: "Medium sweetness", high: "High sweetness" },
  body: { watery: "Watery", light: "Light body", medium: "Medium body", syrupy: "Syrupy" },
  clarity: { muddy: "Muddy", clean: "Clean" },
};

const $ = (id) => document.getElementById(id);
const sets = {};
let state = null;
let authRequired = false;
let historyLimit = 5;
let filledOnce = false;
let tbtTouched = false;
let working = false;
let saving = false;
let recommending = false;
let lastSaved = "";

function trimNum(value) {
  const number = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(number)) return "—";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatGrind(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(1);
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function formatRange(min, max) {
  if (!max || min === max) return formatClock(min);
  return `${formatClock(min)}–${formatClock(max)}`;
}

function ratioLabel(coffee, water) {
  const coffeeN = Number(coffee);
  const waterN = Number(water);
  if (!coffeeN || !waterN) return "—";
  return `1:${(waterN / coffeeN).toFixed(1)}`;
}

function grindStyleLabel(style) {
  return style === "angle45" ? "45° slow" : "Vertical";
}

function formatWhen(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value || "");
  if (!match) return value || "";
  const date = `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
  return match[4] ? `${date} · ${match[4]}:${match[5]}` : date;
}

function formatDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
  if (!match) return "";
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

function nowLocalValue() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function grindHint(grinder) {
  if (/k-?\s*plus/i.test(grinder || "")) return "0.1 is one click on a K-Plus. A lower number is finer.";
  return "Use the dial on your grinder. The number is not microns.";
}

function tempLabel(payload) {
  if (payload.temp_note) return payload.temp_note;
  if (payload.temp_end_c) return `${trimNum(payload.temp_start_c)} °C down to ${trimNum(payload.temp_end_c)} °C`;
  return `${trimNum(payload.temp_start_c)} °C`;
}

function brewTemp(brew) {
  if (brew.temp_end_c) return `${trimNum(brew.temp_c)} °C → ${trimNum(brew.temp_end_c)} °C`;
  return `${trimNum(brew.temp_c)} °C`;
}

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function setStatus(message, kind) {
  const node = $("status");
  node.textContent = message || "";
  node.className = kind ? `status ${kind}` : "status";
}

function paintRange(range) {
  const min = Number(range.min);
  const max = Number(range.max);
  const value = Number(range.value);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  range.style.setProperty("--p", `${pct}%`);
}

function bindPair(rangeId, numberId, onChange) {
  const range = $(rangeId);
  const number = $(numberId);
  const absoluteMin = Number(number.min);
  const absoluteMax = Number(number.max);
  const places = (String(range.step).split(".")[1] || "").length;
  const push = (raw, silent) => {
    let value = Number(raw);
    if (!Number.isFinite(value)) return;
    value = Math.min(absoluteMax, Math.max(absoluteMin, value));
    const step = Number(range.step) || 1;
    value = Number((Math.round(value / step) * step).toFixed(places));
    if (value < Number(range.min)) range.min = String(value);
    if (value > Number(range.max)) range.max = String(value);
    range.value = String(value);
    number.value = String(value);
    paintRange(range);
    if (!silent) onChange?.();
  };
  range.addEventListener("input", () => push(range.value));
  number.addEventListener("change", () => push(number.value));
  paintRange(range);
  return (value, silent) => push(value, silent);
}

function updateRatio() {
  const coffee = Number($("coffee-number").value);
  const water = Number($("water-number").value);
  const ratio = coffee ? water / coffee : 0;
  $("ratio-readout").textContent = ratioLabel(coffee, water);
  for (const button of document.querySelectorAll("[data-ratio]")) {
    button.setAttribute("aria-pressed", Math.abs(ratio - Number(button.dataset.ratio)) < 0.06 ? "true" : "false");
  }
}

function updateClock() {
  $("tbt-clock").textContent = formatClock($("tbt-number").value);
}

function markTbt() {
  tbtTouched = true;
  $("tbt-note").hidden = true;
  $("tbt-confirm").hidden = true;
  $("tbt-row").classList.remove("is-plan");
}

function setGrindStyle(style) {
  for (const button of document.querySelectorAll("[data-grind-style]")) {
    button.setAttribute("aria-pressed", button.dataset.grindStyle === style ? "true" : "false");
  }
}

function currentGrindStyle() {
  const button = document.querySelector("[data-grind-style][aria-pressed='true']");
  return button ? button.dataset.grindStyle : "";
}

function clearChips() {
  for (const button of document.querySelectorAll(".chip")) button.setAttribute("aria-pressed", "false");
}

function readFeedback() {
  const feedback = {};
  for (const field of document.querySelectorAll(".chips")) {
    const selected = field.querySelector(".chip[aria-pressed='true']");
    if (selected) feedback[field.dataset.group] = selected.dataset.value;
  }
  return feedback;
}

function pourPlanFromRecipe(pours) {
  return (pours || []).map((pour) => `${pour.from}–${pour.to} → ${trimNum(pour.target_g)} g. ${pour.instruction}`).join("\n");
}

function fillForm(payload) {
  $("brew-when").value = nowLocalValue();
  sets.coffee(payload.coffee_g, true);
  sets.water(payload.water_g, true);
  sets.grind(payload.grind, true);
  sets.temp(payload.temp_start_c, true);
  setGrindStyle(payload.grind_style || "angle45");
  const drops = Boolean(payload.temp_end_c);
  $("temp-drops").checked = drops;
  $("temp-end-row").hidden = !drops;
  if (drops) sets.tempEnd(payload.temp_end_c, true);
  sets.pours(Array.isArray(payload.pours) ? payload.pours.length : Number(payload.pours) || 3, true);
  $("pour-plan").value = pourPlanFromRecipe(payload.pours);
  $("agitation").value = payload.agitation || "";
  sets.tbt(payload.tbt_min_sec, true);
  updateClock();
  tbtTouched = false;
  $("tbt-row").classList.add("is-plan");
  $("tbt-note").hidden = false;
  $("tbt-confirm").hidden = false;
  $("tbt-note").textContent = `Target is ${formatRange(payload.tbt_min_sec, payload.tbt_max_sec)}. Confirm it, or set the time you actually brewed.`;
  $("rest-number").value = "";
  clearChips();
  $("notes").value = "";
  updateRatio();
  $("form-error").textContent = "";
}

function loadRecipe(payload) {
  fillForm(payload);
  $("log-form").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
}

function validateForm() {
  const feedback = readFeedback();
  if (!feedback.extraction) return "Choose how the extraction landed.";
  if (!feedback.body) return "Choose the body.";
  if (!tbtTouched) return "Confirm the brew time, or set the time you actually got.";
  if (!$("pour-plan").value.trim()) return "Add the pour plan, even a rough one.";
  if (!$("brew-when").value) return "Add the date of the brew.";
  if ($("temp-drops").checked && !(Number($("temp-end-number").value) < Number($("temp-number").value))) {
    return "End temperature should be lower than the start.";
  }
  return "";
}

function formBody() {
  return {
    brewed_at: $("brew-when").value,
    coffee_g: Number($("coffee-number").value),
    water_g: Number($("water-number").value),
    grind: Number($("grind-number").value),
    grind_style: currentGrindStyle(),
    temp_c: Number($("temp-number").value),
    temp_end_c: $("temp-drops").checked ? Number($("temp-end-number").value) : null,
    pours: Number($("pours-number").value),
    pour_plan: $("pour-plan").value,
    agitation: $("agitation").value,
    tbt_seconds: Number($("tbt-number").value),
    rest_minutes: $("rest-number").value === "" ? null : Number($("rest-number").value),
    feedback: readFeedback(),
    feedback_notes: $("notes").value,
  };
}

function recipePlain(payload, setup) {
  const pours = payload.pours || [];
  return [
    setup?.beans_name,
    `${trimNum(payload.coffee_g)} g / ${trimNum(payload.water_g)} g (${ratioLabel(payload.coffee_g, payload.water_g)})`,
    `${setup?.grinder || "Grinder"} ${trimNum(payload.grind)} · ${grindStyleLabel(payload.grind_style)}`,
    tempLabel(payload),
    ...pours.map((pour) => `${pour.from}–${pour.to} → ${trimNum(pour.target_g)} g. ${pour.instruction}`),
    payload.agitation,
    `Target ${formatRange(payload.tbt_min_sec, payload.tbt_max_sec)}.`,
    payload.stall_cutoff,
    payload.taste_for,
  ].filter(Boolean).join("\n");
}

async function copyRecipe(payload) {
  const text = recipePlain(payload, state.setup);
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Recipe copied.", "ok");
    setTimeout(() => {
      if ($("status").textContent === "Recipe copied.") setStatus("");
    }, 2500);
  } catch {
    setStatus("Clipboard is blocked in this browser.", "error");
  }
}

function renderChrome() {
  const setup = state.setup;
  $("bean-name").textContent = setup.beans_name;
  $("bean-meta").textContent = [setup.process, setup.roast_level, setup.grinder].filter(Boolean).join(" · ");
  $("new-coffee").hidden = !setup.rethink_open;
  $("grind-unit").textContent = setup.grinder || "Grind";
  $("grind-hint").textContent = grindHint(setup.grinder);
  $("open-warning").hidden = authRequired;
  $("lock").hidden = !authRequired;
}

function renderRecipe() {
  const root = $("recipe");
  root.replaceChildren();
  if (working) root.append(h("div", { class: "pending-bar" }));
  const rec = state?.recommendation;
  if (!rec) {
    root.append(h("p", { class: "eyebrow on-dark" }, "Next brew"));
    root.append(h("p", { class: "summary" }, "Log a brew with how it tasted, and the next parameters will land here."));
    root.append(h("div", { class: "recipe-actions" }, [
      h("button", {
        class: "btn btn-cream",
        type: "button",
        disabled: working,
        onClick: () => recommend("refresh").catch(() => {}),
      }, "Ask for a recipe"),
    ]));
    return;
  }

  const payload = rec.payload;
  const pours = Array.isArray(payload.pours) ? payload.pours : [];
  root.append(h("div", { class: "recipe-top" }, [
    h("div", {}, [
      h("p", { class: "eyebrow on-dark" }, "Next brew"),
      h("p", { class: "recipe-source" }, [
        rec.model === "seed" ? "From your notes" : "Suggested by Gemini",
        formatDay(rec.created_at) ? ` · ${formatDay(rec.created_at)}` : "",
      ].join("")),
    ]),
    h("span", { class: "badge on-dark" }, rec.status === "stale" ? "Older than your latest cup" : "Ready to brew"),
  ]));
  root.append(h("p", { class: "summary" }, payload.summary || "Next recipe"));
  const kettle = kettleStat(payload);
  root.append(h("ul", { class: "stats" }, [
    stat(`${trimNum(payload.coffee_g)} g`, "Dose"),
    stat(`${trimNum(payload.water_g)} g`, "Water"),
    stat(ratioLabel(payload.coffee_g, payload.water_g), "Ratio"),
    stat(formatGrind(payload.grind), grindStyleLabel(payload.grind_style)),
    stat(kettle.value, kettle.label),
    stat(formatRange(payload.tbt_min_sec, payload.tbt_max_sec), "Target time"),
  ]));

  if (pours.length) {
    root.append(h("ol", { class: "pours" }, pours.map((pour, index) => {
      const previous = index === 0 ? 0 : pours[index - 1].target_g;
      const added = Math.round((pour.target_g - previous) * 10) / 10;
      return h("li", {}, [
        h("span", { class: "pour-time" }, `${pour.from}–${pour.to} · ${trimNum(pour.target_g)} g (+${trimNum(added)} g)`),
        pour.instruction,
      ]);
    })));
  }
  if (payload.agitation) root.append(h("p", { class: "recipe-note" }, payload.agitation));
  if (payload.stall_cutoff) root.append(h("p", { class: "recipe-note" }, payload.stall_cutoff));
  if (payload.what_changed?.length) {
    root.append(h("ul", { class: "changes" }, payload.what_changed.map((item) => h("li", {}, item))));
  } else if (payload.repeat_previous) {
    root.append(h("p", { class: "recipe-note" }, "Brew it the same way."));
  }
  if (payload.taste_for) root.append(h("p", { class: "taste-for" }, payload.taste_for));
  if (payload.reasoning) {
    root.append(h("details", {}, [
      h("summary", {}, "Why this recipe"),
      h("p", { class: "reasoning" }, payload.reasoning),
    ]));
  }
  root.append(h("div", { class: "recipe-actions" }, [
    h("button", { class: "btn btn-cream", type: "button", onClick: () => loadRecipe(payload) }, "Load into the log"),
    h("button", { class: "btn btn-ghost", type: "button", onClick: () => copyRecipe(payload) }, "Copy"),
    h("button", {
      class: "btn btn-ghost",
      type: "button",
      disabled: working,
      onClick: () => recommend("refresh").catch(() => {}),
    }, "Reconsider"),
  ]));
}

function kettleStat(payload) {
  if (payload.temp_note) return { value: `${trimNum(payload.temp_start_c)} °C`, label: payload.temp_note };
  if (payload.temp_end_c) return { value: `${trimNum(payload.temp_start_c)} °C`, label: `Down to ${trimNum(payload.temp_end_c)} °C` };
  return { value: `${trimNum(payload.temp_start_c)} °C`, label: "Kettle" };
}

function stat(value, label) {
  return h("li", { class: "stat" }, [h("b", {}, value), h("span", {}, label)]);
}

function renderHistory() {
  const list = $("history-list");
  list.replaceChildren();
  const count = state.brew_count || 0;
  if (!count) $("history-meta").textContent = "Nothing logged yet";
  else if (historyLimit === 5 && count > state.brews.length) $("history-meta").textContent = `Latest 5 of ${count}`;
  else $("history-meta").textContent = count === 1 ? "1 brew" : `${count} brews`;

  $("history-more").hidden = count <= 5;
  $("history-more").textContent = historyLimit === 5 ? `Show earlier brews (${count})` : "Show the latest 5";

  if (!state.brews.length) {
    list.append(h("p", { class: "empty" }, "No brews yet."));
    return;
  }

  state.brews.forEach((brew, index) => {
    const taste = Object.entries(SHORT).flatMap(([key, labels]) => {
      const value = brew.feedback?.[key];
      return value && labels[value] ? [labels[value]] : [];
    }).join(" · ");
    const card = h("article", { class: index === 0 ? "brew latest" : "brew" });
    const origin = brew.origin === "notes"
      ? h("span", { class: "imported", title: "Loaded from your notes. The day is approximate." }, "Imported")
      : null;
    card.append(h("div", { class: "brew-top" }, [
      h("p", { class: "when" }, formatWhen(brew.brewed_at)),
      origin,
    ]));
    card.append(h("p", { class: "brew-line" }, `${trimNum(brew.coffee_g)} g / ${trimNum(brew.water_g)} g · ${ratioLabel(brew.coffee_g, brew.water_g)}`));
    const detail = [
      `${formatGrind(brew.grind)} · ${grindStyleLabel(brew.grind_style)}`,
      brewTemp(brew),
      `${brew.pours} pours`,
      formatClock(brew.tbt_seconds),
    ];
    if (brew.rest_minutes) detail.push(`rested ${brew.rest_minutes} min`);
    card.append(h("p", { class: "brew-line" }, detail.join(" · ")));
    if (taste) card.append(h("p", { class: "taste-line" }, taste));
    if (brew.feedback_notes) card.append(h("p", { class: "notes" }, brew.feedback_notes));
    const extra = [brew.pour_plan, brew.agitation].filter(Boolean).join("\n\n");
    if (extra) {
      card.append(h("details", {}, [
        h("summary", {}, "Pours and agitation"),
        h("p", { class: "pour-text" }, extra),
      ]));
    }
    const remove = h("button", { class: "text-button", type: "button" }, "Remove");
    remove.addEventListener("click", () => confirmRemove(remove, brew.id));
    card.append(remove);
    list.append(card);
  });
}

function confirmRemove(button, id) {
  if (button.dataset.confirm !== "1") {
    button.dataset.confirm = "1";
    button.textContent = "Confirm remove";
    setTimeout(() => {
      if (!button.isConnected) return;
      button.dataset.confirm = "";
      button.textContent = "Remove";
    }, 4000);
    return;
  }
  removeBrew(id);
}

async function removeBrew(id) {
  try {
    await api(`/api/brews/${id}`, { method: "DELETE" });
    await refresh();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function render() {
  renderChrome();
  renderRecipe();
  renderHistory();
}

async function refresh() {
  state = await api(`/api/state?limit=${historyLimit}`);
  render();
  if (!filledOnce && state.recommendation) {
    filledOnce = true;
    fillForm(state.recommendation.payload);
  }
}

async function recommend(reason) {
  if (recommending) return;
  recommending = true;
  working = true;
  if (state) renderRecipe();
  setStatus("Reading the last cups…", "busy");
  try {
    await api("/api/recommend", { method: "POST", body: { reason } });
    working = false;
    await refresh();
    setStatus("");
    $("recipe").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  } catch (error) {
    working = false;
    await refresh().catch(() => { if (state) render(); });
    setStatus(error.message, "error");
    throw error;
  } finally {
    recommending = false;
  }
}

function bindForm() {
  sets.coffee = bindPair("coffee-range", "coffee-number", updateRatio);
  sets.water = bindPair("water-range", "water-number", updateRatio);
  sets.grind = bindPair("grind-range", "grind-number");
  sets.temp = bindPair("temp-range", "temp-number");
  sets.tempEnd = bindPair("temp-end-range", "temp-end-number");
  sets.pours = bindPair("pours-range", "pours-number");
  sets.tbt = bindPair("tbt-range", "tbt-number", () => {
    updateClock();
    markTbt();
  });
  updateRatio();
  updateClock();

  for (const button of document.querySelectorAll("[data-ratio]")) {
    button.addEventListener("click", () => {
      const dose = Number($("coffee-number").value) || 18;
      sets.water(Math.round(dose * Number(button.dataset.ratio)));
    });
  }
  for (const button of document.querySelectorAll("[data-grind-style]")) {
    button.addEventListener("click", () => setGrindStyle(button.dataset.grindStyle));
  }
  for (const button of document.querySelectorAll(".chip")) {
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") === "true";
      for (const peer of button.parentElement.querySelectorAll(".chip")) peer.setAttribute("aria-pressed", "false");
      if (!on) button.setAttribute("aria-pressed", "true");
    });
  }
  $("temp-drops").addEventListener("change", () => {
    $("temp-end-row").hidden = !$("temp-drops").checked;
  });
  $("tbt-confirm").addEventListener("click", markTbt);
  $("log-form").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.matches("input")) event.preventDefault();
  });
  $("log-form").addEventListener("submit", onSave);
}

async function onSave(event) {
  event.preventDefault();
  if (saving) return;
  const problem = validateForm();
  $("form-error").textContent = problem;
  if (problem) return;
  const body = formBody();
  const signature = JSON.stringify(body);
  if (signature === lastSaved) {
    $("form-error").textContent = "This cup is already saved. Use Reconsider if you want another look.";
    return;
  }
  saving = true;
  $("save-brew").disabled = true;
  try {
    $("save-brew").textContent = "Saving the cup…";
    await api("/api/brews", { method: "POST", body });
    lastSaved = signature;
    await refresh();
    $("save-brew").textContent = "Asking for the next recipe…";
    try {
      await recommend("new_brew");
    } catch (error) {
      $("form-error").textContent = `Cup saved. ${error.message}`;
    }
  } catch (error) {
    setStatus(error.message, "error");
    $("form-error").textContent = error.message;
  } finally {
    saving = false;
    $("save-brew").disabled = false;
    $("save-brew").textContent = "Save this brew and get the next recipe";
  }
}

function openSetup() {
  const setup = state.setup;
  $("beans-name").value = setup.beans_name || "";
  $("variety").value = setup.variety || "";
  $("process").value = setup.process || "";
  $("roast-level").value = setup.roast_level || "";
  $("roast-date").value = setup.roast_date || "";
  $("descriptors").value = setup.descriptors || "";
  $("brewer").value = setup.brewer || "";
  $("filter-type").value = setup.filter_type || "";
  $("grinder").value = setup.grinder || "";
  $("kettle").value = setup.kettle || "";
  $("setup-notes").value = setup.notes || "";
  $("setup-rethink").checked = false;
  $("setup-change-note").value = "";
  $("setup-last-change").textContent = setup.change_note ? `Last change: ${setup.change_note}` : "";
  $("setup-last-change").hidden = !setup.change_note;
  $("setup-error").textContent = "";
  $("setup-save").textContent = "Save setup";
  $("setup-dialog").showModal();
}

function bindSetup() {
  $("setup-open").addEventListener("click", openSetup);
  $("setup-close").addEventListener("click", () => $("setup-dialog").close());
  $("setup-dialog").addEventListener("click", (event) => {
    if (event.target === $("setup-dialog")) $("setup-dialog").close();
  });
  $("setup-rethink").addEventListener("change", () => {
    $("setup-save").textContent = $("setup-rethink").checked ? "Save and rethink the recipe" : "Save setup";
  });
  $("setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("setup-error").textContent = "";
    const rethink = $("setup-rethink").checked;
    $("setup-save").disabled = true;
    try {
      await api("/api/setup", {
        method: "PUT",
        body: {
          beans_name: $("beans-name").value,
          variety: $("variety").value,
          process: $("process").value,
          roast_level: $("roast-level").value,
          roast_date: $("roast-date").value,
          descriptors: $("descriptors").value,
          brewer: $("brewer").value,
          filter_type: $("filter-type").value,
          grinder: $("grinder").value,
          kettle: $("kettle").value,
          notes: $("setup-notes").value,
          rethink,
          change_note: $("setup-change-note").value,
        },
      });
      $("setup-dialog").close();
      await refresh();
      if (rethink) await recommend("setup_change");
    } catch (error) {
      $("setup-error").textContent = error.message;
      if (!$("setup-dialog").open) setStatus(error.message, "error");
    } finally {
      $("setup-save").disabled = false;
    }
  });
}

function showApp() {
  $("boot").hidden = true;
  $("gate").hidden = true;
  $("app").hidden = false;
  $("lock").hidden = !authRequired;
  $("open-warning").hidden = authRequired;
}

function showGate() {
  $("boot").hidden = true;
  $("app").hidden = true;
  $("gate").hidden = false;
  $("password").focus();
}

function bindGate() {
  $("gate-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("gate-error").textContent = "";
    try {
      await api("/api/login", { method: "POST", body: { password: $("password").value } });
      $("password").value = "";
      authRequired = true;
      showApp();
      await refresh();
    } catch (error) {
      $("gate-error").textContent = error.message;
    }
  });
  $("lock").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    showGate();
  });
  $("history-more").addEventListener("click", async () => {
    historyLimit = historyLimit === 5 ? 50 : 5;
    try {
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

async function start() {
  bindForm();
  bindSetup();
  bindGate();
  try {
    const me = await api("/api/me");
    authRequired = Boolean(me.auth_required);
  } catch (error) {
    if (error.status === 401) {
      showGate();
      return;
    }
    $("boot").textContent = error.message || "Could not open the bench.";
    return;
  }
  showApp();
  try {
    await refresh();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

start();
