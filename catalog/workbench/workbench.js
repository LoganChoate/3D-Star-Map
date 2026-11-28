"use strict";

const byId = (id) => document.getElementById(id);
const format = new Intl.NumberFormat();
const words = (value) => value.replaceAll("-", " ");
const form = byId("search-form");
const status = byId("status");
const dossier = byId("dossier");
const panes = [...document.querySelectorAll("[data-view]")];
const state = { view: "objects", options: null, filter: {}, history: [null], page: 0, next: null };
let searchRequest;
let detailRequest;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(route, params, signal) {
  const query = new URLSearchParams(params);
  const response = await fetch("/api/" + route + "?" + query, { signal });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? "The local request failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}

function fill(id, values) {
  const select = byId(id);
  for (const [key, text] of Object.entries(values)) select.add(new Option(text, key));
}

function asOptions(values) {
  return Object.fromEntries(values.map((value) => [value, words(value)]));
}

function printStatus(kind, message) {
  status.dataset.state = kind;
  status.textContent = message;
}

function updatePaging() {
  byId("previous").disabled = state.page === 0;
  byId("next").disabled = !state.next;
}

function renderTable(rows, view) {
  const mount = byId("results-table");
  mount.replaceChildren();
  if (rows.length === 0) return;
  const table = element("table");
  const head = table.createTHead().insertRow();
  const headings = view === "objects"
    ? ["Object", "Orbital evidence", "Physical data", "Asset metadata"]
    : ["Product", "Target", "Resolution", "Readiness"];
  for (const heading of headings) {
    const th = element("th", heading);
    th.scope = "col";
    head.append(th);
  }
  const tbody = table.createTBody();
  for (const record of rows) {
    const row = tbody.insertRow();
    const first = row.insertCell();
    const open = element("button", record.name ?? record.title, "result-name");
    open.type = "button";
    open.addEventListener("click", () => openDossier(view, record.id));
    first.append(open, element("span", view === "objects" ? words(record.kind) + " · " + record.id : words(record.kind), "detail-value"));
    if (view === "objects") {
      const orbit = row.insertCell();
      orbit.append(element("span", state.options.orbitTypes[record.orbit]));
      if (record.evidence_date) orbit.append(element("span", record.evidence_date + " · " + words(record.date_basis), "detail-value"));
      if (state.options.scienceReviewLoaded && !["unchecked", "missing"].includes(record.validity)) {
        orbit.append(element("span", state.options.reviewLabels[record.validity], "detail-value"));
      }
      row.insertCell().append(element("span", record.physical ? "Source linked" : "Unknown", record.physical ? "known" : ""));
      row.insertCell().append(element("span", record.asset ? "Source linked" : "Unknown", record.asset ? "known" : ""));
    } else {
      row.insertCell().textContent = record.target;
      row.insertCell().textContent = record.resolution === null ? "Unknown" : format.format(record.resolution) + " m/px";
      row.insertCell().textContent = words(record.readiness);
    }
  }
  const scroll = element("div", undefined, "table-scroll");
  scroll.append(table);
  mount.append(scroll);
}

async function search() {
  searchRequest?.abort();
  const controller = new AbortController();
  searchRequest = controller;
  const view = state.view;
  const params = { ...state.filter };
  if (state.history[state.page]) params.cursor = state.history[state.page];
  byId("results-heading").textContent = view === "objects" ? "Objects" : "Source assets";
  printStatus("loading", "Searching the local release…");
  byId("page-label").textContent = "";
  state.next = null;
  byId("previous").disabled = true;
  byId("next").disabled = true;
  byId("results-table").replaceChildren();
  try {
    const result = await request(view, params, controller.signal);
    if (searchRequest !== controller) return;
    state.next = result.nextCursor;
    renderTable(result.items, view);
    const count = result.items.length;
    printStatus(count ? "ready" : "empty", count
      ? format.format(count) + (count === 1 ? " result on this page" : " results on this page")
      : "No results match this search and these filters.");
    byId("page-label").textContent = count ? "Page " + (state.page + 1) : "";
  } catch (error) {
    if (error.name === "AbortError") return;
    printStatus(error.status === 409 ? "stale" : "error",
      (error.status === 409 ? "Catalog changed. " : "Search error. ") + error.message);
  }
  updatePaging();
}

function apply() {
  if (!state.options) return;
  state.filter = Object.fromEntries([...new FormData(form)].filter(([, value]) => value.trim()));
  state.history = [null];
  state.page = 0;
  search();
}

function activate(view) {
  state.view = view;
  for (const pane of panes) {
    if (pane.dataset.view === view) pane.setAttribute("aria-current", "page");
    else pane.removeAttribute("aria-current");
  }
  byId("object-filters").hidden = byId("object-filters").disabled = view !== "objects";
  byId("asset-filters").hidden = byId("asset-filters").disabled = view !== "assets";
  byId("query").placeholder = view === "objects" ? "Search by name, alias, designation, or ID" : "Search product title or ID";
  byId("query").value = "";
  apply();
}

function facts(items) {
  const dl = element("dl", undefined, "fact-grid");
  for (const [label, value] of items) {
    const item = element("div");
    item.append(element("dt", label), element("dd", value ?? "Unknown"));
    dl.append(item);
  }
  return dl;
}

function section(parent, title, nodes) {
  if (!nodes.length) return;
  const box = element("section", undefined, "dossier-section");
  box.append(element("h3", title), ...nodes);
  parent.append(box);
}

function list(values) {
  const ul = element("ul");
  for (const value of values) {
    const li = element("li");
    li.append(value);
    ul.append(li);
  }
  return ul;
}

function external(url, title) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const link = element("a", title);
    link.href = parsed.href;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    return link;
  } catch {
    return null;
  }
}

function rawDetails(label, value) {
  const details = element("details");
  details.append(element("summary", label), element("pre", JSON.stringify(value, null, 2)));
  return details;
}

function renderDossier(view, record) {
  const mount = byId("dossier-content");
  byId("dossier-kind").textContent = words(record.kind);
  byId("dossier-title").textContent = record.name ?? record.title;
  mount.replaceChildren();
  if (view === "assets") {
    mount.append(facts([
      ["Product or collection ID", record.id], ["Target", record.target], ["Coverage", record.coverage],
      ["Resolution", record.resolution === null ? null : format.format(record.resolution) + " m/px"],
      ["File size", record.size === null ? null : format.format(record.size) + " bytes"],
      ["Rights", words(record.rights)], ["Readiness", words(record.readiness)],
      ["Local file", {
        "verified-local": "Verified copy on this workstation",
        "unregistered": "No verified local copy registered",
        "missing": "Registered copy missing",
        "invalid": "Local copy failed verification",
      }[record.localAvailability.status]],
    ]));
    const links = [external(record.url, "Open archive metadata"), external(record.file_url, "Open source file")].filter(Boolean);
    section(mount, "Source links", links.length ? [list(links)] : []);
    if (record.scientificReview) {
      const review = record.scientificReview;
      const meta = review.metadata;
      const reviewed = [element("p", review.verification), facts([
        ["Interpretation", words(review.classification)], ["Instrument", meta.instrument],
        ["Projection", meta.projection], ["Registration", meta.registration], ["Units", meta.units],
        ["Observed footprint", meta.footprint], ["Product ID", meta.productId], ["Version", meta.version],
      ])];
      if (review.unresolvedVerticalUnits) reviewed.push(element("p", review.unresolvedVerticalUnits));
      reviewed.push(rawDetails("Full scientific metadata", review));
      section(mount, "Scientific metadata review", reviewed);
    }
    section(mount, "Provenance", [rawDetails("Source metadata", record.details)]);
    return;
  }
  mount.append(facts([
    ["Stable ID", record.id], ["Orbital evidence", state.options.orbitTypes[record.orbit]],
    ["Source date", record.evidence_date ? record.evidence_date + " · " + words(record.date_basis) : null],
    ["Position validity", state.options.reviewLabels[record.validity]],
    ["Physical data", record.physical], ["Populations", record.populations.map(words).join(", ") || null],
  ]));
  if (record.scientificReview) {
    const review = record.scientificReview;
    const window = record.positionWindow;
    const reviewed = [facts([
      ["Method", review.method], ["Reference center", review.centerId], ["Reference frame", review.frame],
      ["Time scale", review.timeScale],
      ["Checked epochs (JD)", review.exactEpochsJd?.join(", ")],
      ["GP solution epoch (UTC)", review.solutionEpochUtc],
      ["Element epoch (JD TDB)", review.solutionEpochJdTdb],
      ["Offline validity", {
        "inside-model-window": "Within the model window; position is an estimate",
        "outside-model-window": "Outside the model window; current position withheld",
        "historical-samples": "Validated at the listed historical epochs",
        "estimate-only": "Dated estimate limited to the stated epoch window",
        "validation-withheld": "Precision withheld",
        "data-only": "No supported position",
      }[window.state]],
      ["Model window", window.startUtc ? window.startUtc + " to " + window.endUtc
        : window.limitHoursFromEpoch ? "±" + window.limitHoursFromEpoch + " h from the element epoch" : null],
    ])];
    const source = external(review.source, "Open reference source");
    if (source) reviewed.push(source);
    if (review.priorComparison) reviewed.push(element("p", review.priorComparison));
    section(mount, "Trajectory review", reviewed);
  }
  section(mount, "Parents and related bodies", record.parents.length
    ? [list(record.parents.map((r) => r.name + " · " + words(r.relationship) + " · " + r.status))] : []);
  section(mount, "Aliases and designations", record.aliases.length
    ? [list(record.aliases.map((a) => a.value + " · " + words(a.namespace)))] : []);
  section(mount, "Source assets", record.assets.length ? [
    list(record.assets.map((a) => {
      const button = element("button", a.title + " · " + words(a.readiness), "result-name");
      button.type = "button";
      button.addEventListener("click", () => openDossier("assets", a.id));
      return button;
    })),
    ...(record.assetDetailsTruncated ? [element("p", "More files are available in the Source assets view.")] : []),
  ] : [element("p", "No asset metadata is linked to this object in the local register.")]);
  const records = record.records.map((source) => {
    const details = rawDetails(words(source.dataset) + " · " + source.source_key, source.payload);
    const provenance = source.provenance ? external(source.provenance.url, "Open source selection") : null;
    if (provenance) details.append(provenance, element("p", "Retrieved " + source.provenance.checkedAt, "detail-value"));
    const references = (source.references ?? []).map((ref) => external(ref.url, ref.name)).filter(Boolean);
    if (references.length) details.append(list(references));
    return details;
  });
  if (record.recordsTruncated) records.push(element("p", "This dossier displays the first 50 linked records."));
  section(mount, "Source records", records.length ? records : [element("p", "No source records are linked in this release.")]);
}

async function openDossier(view, id) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  byId("dossier-kind").textContent = "";
  byId("dossier-title").textContent = "Opening record…";
  byId("dossier-content").replaceChildren();
  if (!dossier.open) dossier.showModal();
  try {
    const result = await request(view === "objects" ? "object" : "asset", { id }, controller.signal);
    if (detailRequest === controller && dossier.open) renderDossier(view, result);
  } catch (error) {
    if (error.name === "AbortError") return;
    byId("dossier-title").textContent = error.status === 409 ? "Catalog changed" : "Record unavailable";
    byId("dossier-content").textContent = error.message;
  }
}

form.addEventListener("submit", (event) => { event.preventDefault(); apply(); });
for (const pane of panes) pane.addEventListener("click", () => activate(pane.dataset.view));
byId("reset").addEventListener("click", () => { form.reset(); apply(); });
byId("close-dossier").addEventListener("click", () => dossier.close());
dossier.addEventListener("close", () => detailRequest?.abort());
byId("previous").addEventListener("click", () => { if (state.page > 0) { state.page--; search(); } });
byId("next").addEventListener("click", () => {
  if (!state.next) return;
  state.history[state.page + 1] = state.next;
  state.page++;
  search();
});

(async function start() {
  try {
    const data = await request("options", {});
    state.options = data;
    for (const [id, values] of [
      ["population", data.populations], ["object-kind", data.kinds], ["asset-target", data.assetTargets],
      ["asset-kind", data.assetKinds], ["rights", data.assetRights], ["readiness", data.assetReadiness],
    ]) fill(id, asOptions(values));
    fill("orbit", data.orbitTypes);
    byId("object-count").textContent = format.format(data.counts.items);
    byId("asset-count").textContent = format.format(data.counts.asset);
    const release = data.release;
    byId("snapshot").textContent = release.id + " · " + data.snapshot;
    byId("snapshot").title = release.catalogSha256;
    const date = (value) => new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    byId("release-status").textContent = [
      release.recoveredOffline ? "Recovered using the previous accepted release" : "Local offline catalog",
      release.acceptedAt ? "This release accepted " + date(release.acceptedAt) : "Direct snapshot",
      release.lastSuccessfulRefresh ? "Last successful refresh " + date(release.lastSuccessfulRefresh)
        + " (" + release.lastSuccessfulRelease + ")" : null,
      "Latest source retrieval " + date(data.latestAcquisition),
    ].filter(Boolean).join(" · ");
    apply();
  } catch (error) {
    byId("snapshot").textContent = "Local snapshot unavailable";
    printStatus(error.status === 409 ? "stale" : "error", error.message);
  }
})();
