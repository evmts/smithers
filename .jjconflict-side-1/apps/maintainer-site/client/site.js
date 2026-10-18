// The maintainer site's client: a hash router over window.SITE (assets/data.js, written by build.mjs).
//   #/                      home
//   #/work[?area=<area>]    work board: one column per status, one card per apps/mvp/docs/work note
//   #/flows[/<spec>]        GIF gallery
//   #/graph                 note graph
//   #/search?q=<query>      search
//   #/<note path>[#<id>]    a note, at a heading
"use strict"
;(() => {
  const S = window.SITE
  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESC[char])
  const href = (path, anchor) => `#/${encodeURI(path)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`
  const fileName = (path) => path.split("/").pop().replace(/\.md$/, "")
  const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/")

  const notes = new Map(S.notes.map((note) => [note.path, note]))
  const main = $("#ms-main")
  const input = $("#ms-q")
  const sidebar = $("#ms-sidebar")
  const menu = $("#ms-menu")
  const lightbox = $("#ms-lightbox")
  let stopView = () => {}
  let currentKey = null

  // Short labels for the graph: the file name, with its folder when two notes share one.
  const nameCounts = new Map()
  for (const note of S.notes) nameCounts.set(fileName(note.path), (nameCounts.get(fileName(note.path)) ?? 0) + 1)
  const shortLabel = (path) => {
    const name = fileName(path)
    if (nameCounts.get(name) === 1) return name
    const parts = path.split("/")
    return parts.length > 1 ? `${parts.at(-2)}/${name}` : name
  }

  // ---------------------------------------------------------------------------------------------------
  // Router.

  function route() {
    let hash = location.hash.slice(1)
    try {
      hash = decodeURI(hash)
    } catch {}
    if (!hash.startsWith("/")) return { view: "home" }
    const sharp = hash.indexOf("#", 1)
    const path = sharp < 0 ? hash.slice(1) : hash.slice(1, sharp)
    let anchor = sharp < 0 ? "" : hash.slice(sharp + 1)
    try {
      anchor = decodeURIComponent(anchor)
    } catch {}
    const [name, query = ""] = path.split("?")
    if (name === "") return { view: "home" }
    if (name === "flows" || name.startsWith("flows/")) return { view: "flows", spec: name.slice(6) }
    if (name === "work") return { view: "work", area: new URLSearchParams(query).get("area") ?? "" }
    if (name === "graph") return { view: "graph" }
    if (name === "search") return { view: "search", q: new URLSearchParams(query).get("q") ?? "" }
    if (notes.has(name)) return { view: "note", path: name, anchor }
    return { view: "missing", path: name }
  }

  function render() {
    const r = route()
    const key = r.view === "note" ? `note:${r.path}` : r.view === "work" ? `work:${r.area}` : r.view
    if (key === currentKey) {
      if (r.view === "note") return scrollToAnchor(r.anchor)
      if (r.view === "search") return renderResults(r.q)
      if (r.view === "flows") return scrollToSpec(r.spec)
    }
    stopView()
    stopView = () => {}
    currentKey = key
    if (lightbox.open) lightbox.close()
    setMenu(false)
    main.className = ""
    if (r.view !== "search" && document.activeElement !== input) input.value = ""
    if (r.view === "home") home()
    else if (r.view === "flows") flows(r.spec)
    else if (r.view === "work") board(r.area)
    else if (r.view === "graph") graph()
    else if (r.view === "search") search(r.q)
    else if (r.view === "note") note(r.path, r.anchor)
    else missing(r.path)
    for (const link of $$("[data-view]")) link.toggleAttribute("aria-current", link.dataset.view === r.view)
    for (const link of $$("a[data-path]")) {
      const active = r.view === "note" && link.dataset.path === r.path
      link.classList.toggle("active", active)
      if (active) {
        link.setAttribute("aria-current", "page")
        for (let parent = link.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true
      } else link.removeAttribute("aria-current")
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // Sidebar.

  function treeHtml(node) {
    const dirs = node.dirs
      .map((dir) => `<details open><summary><span class="folder">${esc(dir.name)}</span></summary>${treeHtml(dir)}</details>`)
      .join("")
    const files = node.files
      .map((path) => `<a href="${href(path)}" data-path="${esc(path)}" title="${esc(notes.get(path).title)}">${esc(fileName(path))}</a>`)
      .join("")
    return `<div class="tree-level">${dirs}${files}</div>`
  }
  $("#ms-tree").innerHTML = treeHtml(S.tree)

  function setMenu(open) {
    sidebar.classList.toggle("open", open)
    menu.setAttribute("aria-expanded", String(open))
  }
  menu.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")))

  // ---------------------------------------------------------------------------------------------------
  // Home.

  function home() {
    document.title = "Smithers maintainer"
    const stats = [
      [S.notes.length, "notes", "#/graph"],
      [S.flows.length, "flows", "#/flows"],
      [S.edges.length, "links", "#/graph"],
    ]
    const built = new Date(S.builtAt)
    main.innerHTML = `
      <div class="page home">
        <h1>Smithers maintainer</h1>
        <div class="stats">${stats
          .map(([count, label, to]) => `<a class="stat" href="${to}"><span class="stat-n">${count}</span><span class="stat-l">${label}</span></a>`)
          .join("")}</div>
        <div class="go">
          <a href="#/work">${icon("board")}Work</a>
          <a href="#/flows">${icon("play")}Flows</a>
          <a href="#/graph">${icon("graph")}Graph</a>
          <a href="#/search">${icon("search")}Search <kbd>/</kbd></a>
        </div>
        <h2>Decisions</h2>
        ${
          S.decisions.length
            ? `<ol class="decisions">${S.decisions
                .slice(0, 8)
                .map(
                  (decision) =>
                    `<li><a href="${href(decision.path)}"><span class="num">${esc(decision.number)}</span><span class="d-title">${esc(decision.title)}</span></a><span class="meta">${[decision.status, decision.date]
                      .filter(Boolean)
                      .map(esc)
                      .join(" · ")}</span></li>`,
                )
                .join("")}</ol>`
            : `<p class="muted">None</p>`
        }
        <p class="built">Built ${esc(built.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }))}</p>
      </div>`
  }

  function icon(name) {
    const paths = {
      play: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8.5 7.5v5l4-2.5z" fill="currentColor" stroke="none"/>',
      graph: '<circle cx="5" cy="6" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="10" cy="15" r="2"/><path d="M6.8 6.9l2.4 6.2M13.6 6.6l-2.7 6.6M7 5.8l6-.6"/>',
      search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
      board: '<rect x="3" y="4" width="4" height="12" rx="1"/><rect x="8" y="4" width="4" height="8" rx="1"/><rect x="13" y="4" width="4" height="10" rx="1"/>',
    }
    return `<svg class="icon" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${paths[name]}</svg>`
  }

  // ---------------------------------------------------------------------------------------------------
  // Work: a kanban of apps/mvp/docs/work notes, one column per status, filtered by area.

  function board(area) {
    document.title = "Work · Smithers maintainer"
    const items = area ? S.work.filter((item) => item.area === area) : S.work
    const open = (list) => list.filter((item) => item.status !== "done").length
    const chip = (value, label, count) =>
      `<a href="#/work${value ? `?area=${encodeURIComponent(value)}` : ""}"${value === area ? ' aria-current="true"' : ""}>${esc(label)} <span class="count">${count}</span></a>`
    const card = (item) => `
      <li>
        <a class="card" href="${href(item.path)}" data-path="${esc(item.path)}" data-status="${esc(item.status)}" data-area="${esc(item.area)}">
          <span class="card-title">${esc(item.title)}</span>
          <span class="card-meta">
            <span class="tag area-${esc(item.area)}">${esc(item.area)}</span>
            ${item.updated ? `<time datetime="${esc(item.updated)}">${esc(item.updated)}</time>` : ""}
          </span>
          ${item.owner ? `<span class="card-owner">${esc(item.owner)}</span>` : ""}
        </a>
      </li>`
    main.innerHTML = `
      <div class="page wide board-page">
        <header class="page-head">
          <h1>Work <span class="count">${open(items)} open</span></h1>
          <nav class="chips board-areas" aria-label="Areas">${chip("", "All", S.work.length)}${S.workAreas
            .map((value) => chip(value, value, S.work.filter((item) => item.area === value).length))
            .join("")}</nav>
        </header>
        <div class="board" style="--cols:${S.workStatuses.length}">${S.workStatuses
          .map((status) => {
            const cards = items.filter((item) => item.status === status.id)
            return `
          <section class="col" data-status="${esc(status.id)}" aria-labelledby="col-${esc(status.id)}">
            <h2 id="col-${esc(status.id)}"><span class="dot st-${esc(status.id)}"></span>${esc(status.label)} <span class="count">${cards.length}</span></h2>
            <ol class="cards">${cards.map(card).join("")}</ol>
          </section>`
          })
          .join("")}</div>
        ${S.work.length === 0 ? `<p class="muted">No notes in apps/mvp/docs/work</p>` : ""}
      </div>`
    window.scrollTo(0, 0)
  }

  // ---------------------------------------------------------------------------------------------------
  // Flows.

  function specGroups() {
    const names = [...new Set([...S.specs.map((spec) => spec.name), ...S.flows.map((flow) => flow.spec)])]
    return names
      .map((name) => ({
        name,
        spec: S.specs.find((spec) => spec.name === name),
        flows: S.flows.filter((flow) => flow.spec === name),
        missing: S.missingGifs.filter((test) => test.spec === name),
      }))
      .filter((group) => group.flows.length + group.missing.length > 0)
  }

  function flows(spec) {
    document.title = "Flows · Smithers maintainer"
    const groups = specGroups()
    const card = (flow) => `
      <figure class="flow" id="flow-${esc(flow.name)}">
        <button class="flow-media" type="button" data-flow="${esc(flow.name)}" aria-label="Enlarge ${esc(flow.title)}" style="aspect-ratio:${flow.width || 16}/${flow.height || 9}">
          <img src="${esc(flow.gif)}" alt="" loading="lazy" decoding="async" width="${flow.width}" height="${flow.height}">
        </button>
        <figcaption>
          <span class="flow-title">${esc(flow.title)}</span>
          ${flow.test ? `<span class="flow-test">${esc(flow.test)}</span>` : ""}
        </figcaption>
      </figure>`
    const missingCard = (test) => `
      <figure class="flow flow-missing">
        <div class="flow-media">No GIF</div>
        <figcaption><span class="flow-title">${esc(test.flow)}</span><span class="flow-test">${esc(test.title)}</span></figcaption>
      </figure>`
    main.innerHTML = `
      <div class="page wide">
        <header class="page-head">
          <h1>Flows <span class="count">${S.flows.length}</span></h1>
          <nav class="chips" aria-label="Specs">${groups
            .map((group) => `<a href="#/flows/${encodeURIComponent(group.name)}">${esc(group.name)} <span class="count">${group.flows.length}</span></a>`)
            .join("")}</nav>
        </header>
        ${groups
          .map(
            (group) => `
          <section class="spec" id="spec-${esc(group.name)}">
            <h2>${esc(group.name)}${group.spec ? ` <a class="spec-file file" href="${esc(group.spec.file)}">${esc(group.spec.path)}</a>` : ""}</h2>
            <div class="grid">${group.flows.map(card).join("")}${group.missing.map(missingCard).join("")}</div>
          </section>`,
          )
          .join("")}
        ${S.flows.length === 0 ? `<p class="muted">No GIFs in ~/Desktop/smithers-mvp/gifs</p>` : ""}
      </div>`
    main.addEventListener("click", onFlowClick)
    stopView = () => main.removeEventListener("click", onFlowClick)
    scrollToSpec(spec)
  }

  function onFlowClick(event) {
    const button = event.target.closest("[data-flow]")
    if (button) openFlow(button.dataset.flow)
  }

  function scrollToSpec(spec) {
    const target = spec && document.getElementById(`spec-${spec}`)
    if (target) target.scrollIntoView({ block: "start" })
    else window.scrollTo(0, 0)
  }

  function openFlow(name) {
    let index = S.flows.findIndex((flow) => flow.name === name)
    if (index < 0) return
    const show = () => {
      const flow = S.flows[index]
      const spec = S.specs.find((item) => item.name === flow.spec)
      lightbox.innerHTML = `
        <div class="lb" tabindex="-1">
          <div class="lb-head">
            <div>
              <h2>${esc(flow.title)}</h2>
              ${flow.test ? `<p class="lb-test">${esc(flow.test)}</p>` : ""}
              ${spec ? `<a class="file lb-file" href="${esc(spec.file)}">${esc(spec.path)}${flow.line ? `:${flow.line}` : ""}</a>` : ""}
            </div>
            <button class="lb-close" type="button" aria-label="Close" data-close>&times;</button>
          </div>
          <img src="${esc(flow.gif)}" alt="${esc(flow.title)}" width="${flow.width}" height="${flow.height}">
          <div class="lb-nav">
            <button type="button" data-step="-1" aria-label="Previous flow">&larr;</button>
            <span>${index + 1} / ${S.flows.length}</span>
            <button type="button" data-step="1" aria-label="Next flow">&rarr;</button>
          </div>
        </div>`
    }
    const step = (delta) => {
      index = (index + delta + S.flows.length) % S.flows.length
      show()
    }
    const onKey = (event) => {
      if (event.key === "ArrowRight") step(1)
      if (event.key === "ArrowLeft") step(-1)
    }
    const onClick = (event) => {
      if (event.target === lightbox || event.target.closest("[data-close]")) lightbox.close()
      const stepper = event.target.closest("[data-step]")
      if (stepper) step(Number(stepper.dataset.step))
    }
    show()
    lightbox.addEventListener("keydown", onKey)
    lightbox.addEventListener("click", onClick)
    lightbox.addEventListener(
      "close",
      () => {
        lightbox.removeEventListener("keydown", onKey)
        lightbox.removeEventListener("click", onClick)
        lightbox.innerHTML = ""
      },
      { once: true },
    )
    lightbox.showModal()
    $(".lb", lightbox).focus({ preventScroll: true })
  }

  // ---------------------------------------------------------------------------------------------------
  // Notes.

  function note(path, anchor) {
    const item = notes.get(path)
    document.title = `${item.title} · Smithers maintainer`
    const outline = item.headings.length
      ? `<ul>${item.headings.map((heading) => `<li class="l${heading.level}"><a href="${href(path, heading.id)}" data-id="${esc(heading.id)}">${esc(heading.text)}</a></li>`).join("")}</ul>`
      : ""
    const backlinks = item.backlinks.length
      ? `<ul class="backlink-list">${item.backlinks
          .map(
            (link) =>
              `<li><a href="${href(link.from)}">${esc(notes.get(link.from).title)}</a><span class="bl-path">${esc(link.from)}</span>${link.contexts
                .map((context) => `<p>${context}</p>`)
                .join("")}</li>`,
          )
          .join("")}</ul>`
      : `<p class="muted">None</p>`
    main.innerHTML = `
      <div class="note-layout">
        <article class="page note">
          <a class="crumb file" href="${esc(item.file)}">${esc(path)}</a>
          ${outline ? `<details class="outline-mobile"><summary>Outline</summary>${outline}</details>` : ""}
          <div class="md">${item.html}</div>
          <section class="backlinks" aria-labelledby="ms-backlinks">
            <h2 id="ms-backlinks">Backlinks <span class="count">${item.backlinks.length}</span></h2>
            ${backlinks}
          </section>
        </article>
        ${outline ? `<aside class="outline" aria-label="Outline">${outline}</aside>` : ""}
      </div>`
    scrollToAnchor(anchor)
    const spy = () => {
      const headings = $$(".md h2, .md h3, .md h4", main)
      let active = null
      for (const heading of headings) if (heading.getBoundingClientRect().top < 120) active = heading.id
      for (const link of $$(".outline a", main)) link.classList.toggle("active", link.dataset.id === active)
    }
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(spy)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    spy()
    stopView = () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }

  function scrollToAnchor(anchor) {
    const target = anchor && $(`.md [id="${CSS.escape(anchor)}"]`, main)
    if (target) target.scrollIntoView({ block: "start" })
    else window.scrollTo(0, 0)
  }

  function missing(path) {
    document.title = "Not found · Smithers maintainer"
    main.innerHTML = `<div class="page"><h1>Not found</h1><p><code>${esc(path)}</code></p><p><a href="#/">Home</a></p></div>`
  }

  // ---------------------------------------------------------------------------------------------------
  // Search: every term must appear in a section's note title, path, heading or text; flows match on title and test.

  const sectionIndex = S.sections.map((section) => {
    const owner = notes.get(section.note)
    return {
      section,
      note: owner,
      title: owner.title.toLowerCase(),
      path: section.note.toLowerCase(),
      heading: section.heading.toLowerCase(),
      text: section.text.toLowerCase(),
    }
  })
  const flowIndex = S.flows.map((flow) => ({ flow, hay: `${flow.title} ${flow.test ?? ""} ${flow.spec} ${flow.name}`.toLowerCase() }))
  const occurrences = (text, term) => {
    let count = 0
    for (let at = text.indexOf(term); at >= 0 && count < 6; at = text.indexOf(term, at + term.length)) count++
    return count
  }
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const highlight = (text, terms) => {
    if (!terms.length) return esc(text)
    const pattern = new RegExp(
      [...terms]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join("|"),
      "gi",
    )
    let out = ""
    let last = 0
    for (const match of text.matchAll(pattern)) {
      out += `${esc(text.slice(last, match.index))}<mark>${esc(match[0])}</mark>`
      last = match.index + match[0].length
    }
    return out + esc(text.slice(last))
  }
  const snippet = (text, terms) => {
    const lower = text.toLowerCase()
    let at = -1
    for (const term of terms) {
      const found = lower.indexOf(term)
      if (found >= 0 && (at < 0 || found < at)) at = found
    }
    let start = Math.max(0, at - 70)
    let end = Math.min(text.length, Math.max(at, 0) + 170)
    // Cut at spaces, never inside a word.
    const space = text.indexOf(" ", start)
    if (start > 0 && space >= 0 && space < at) start = space + 1
    const back = text.lastIndexOf(" ", end)
    if (end < text.length && back > at) end = back
    return `${start > 0 ? "…" : ""}${highlight(text.slice(start, end), terms)}${end < text.length ? "…" : ""}`
  }

  function find(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return { terms, flows: [], notes: [] }
    const flowHits = flowIndex.filter((entry) => terms.every((term) => entry.hay.includes(term))).map((entry) => entry.flow)
    const byNote = new Map()
    for (const entry of sectionIndex) {
      const all = `${entry.title} ${entry.path} ${entry.heading} ${entry.text}`
      if (!terms.every((term) => all.includes(term))) continue
      let score = 0
      for (const term of terms) {
        if (entry.title.includes(term)) score += 8
        if (entry.path.includes(term)) score += 3
        if (entry.heading.includes(term)) score += 6
        score += occurrences(entry.text, term)
      }
      const group = byNote.get(entry.note.path) ?? { note: entry.note, score: 0, sections: [] }
      group.sections.push({ ...entry, score })
      group.score = Math.max(group.score, score)
      byNote.set(entry.note.path, group)
    }
    const noteHits = [...byNote.values()].sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
    for (const group of noteHits) group.sections.sort((a, b) => b.score - a.score)
    return { terms, flows: flowHits, notes: noteHits }
  }

  let selected = 0

  function search(query) {
    document.title = "Search · Smithers maintainer"
    main.innerHTML = `<div class="page search-page"><div id="ms-results"></div></div>`
    if (input.value !== query) input.value = query
    renderResults(query)
  }

  function renderResults(query) {
    const box = $("#ms-results")
    if (!box) return
    const { terms, flows: flowHits, notes: noteHits } = find(query)
    selected = 0
    if (!terms.length) {
      box.innerHTML = `<h2 class="results-h">Notes <span class="count">${S.notes.length}</span></h2>${[...S.notes]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((item) => `<a class="result" href="${href(item.path)}"><span class="r-title">${esc(item.title)}</span><span class="r-path">${esc(item.path)}</span></a>`)
        .join("")}`
    } else if (!flowHits.length && !noteHits.length) {
      box.innerHTML = `<p class="muted">No matches for “${esc(query)}”</p>`
    } else {
      const flowHtml = flowHits.length
        ? `<h2 class="results-h">Flows <span class="count">${flowHits.length}</span></h2>${flowHits
            .map(
              (flow) =>
                `<a class="result result-flow" href="#/flows/${encodeURIComponent(flow.spec)}" data-flow="${esc(flow.name)}"><img src="${esc(flow.gif)}" alt="" loading="lazy" width="${flow.width}" height="${flow.height}"><span><span class="r-title">${highlight(flow.title, terms)}</span><span class="r-text">${highlight(flow.test ?? flow.name, terms)}</span></span></a>`,
            )
            .join("")}`
        : ""
      const noteHtml = noteHits.length
        ? `<h2 class="results-h">Notes <span class="count">${noteHits.length}</span></h2>${noteHits
            .map(
              (group) => `
          <div class="result-group">
            <a class="result result-note" href="${href(group.note.path)}"><span class="r-title">${highlight(group.note.title, terms)}</span><span class="r-path">${highlight(group.note.path, terms)}</span></a>
            ${group.sections
              .filter((entry) => entry.section.id || entry.section.text)
              .slice(0, 3)
              .map(
                (entry) =>
                  `<a class="result result-section" href="${href(group.note.path, entry.section.id)}">${entry.section.heading ? `<span class="r-heading">${highlight(entry.section.heading, terms)}</span>` : ""}<span class="r-text">${snippet(entry.section.text || entry.section.heading, terms)}</span></a>`,
              )
              .join("")}
          </div>`,
            )
            .join("")}`
        : ""
      box.innerHTML = flowHtml + noteHtml
    }
    select(0)
  }

  function select(index) {
    const results = $$(".result", main)
    if (!results.length) return
    selected = Math.max(0, Math.min(index, results.length - 1))
    results.forEach((result, position) => result.classList.toggle("sel", position === selected))
    if (document.activeElement === input) results[selected].scrollIntoView({ block: "nearest" })
  }

  main.addEventListener("click", (event) => {
    const flowResult = event.target.closest(".result-flow")
    if (flowResult && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      openFlow(flowResult.dataset.flow)
    }
  })

  input.addEventListener("input", () => {
    const target = `#/search?q=${encodeURIComponent(input.value)}`
    if (route().view === "search") {
      history.replaceState(null, "", target)
      renderResults(input.value)
    } else location.hash = target
  })
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      select(selected + (event.key === "ArrowDown" ? 1 : -1))
    } else if (event.key === "Enter") {
      if (route().view !== "search") renderOrGo()
      const result = $$(".result", main)[selected]
      if (result) {
        event.preventDefault()
        input.blur()
        result.click()
      }
    } else if (event.key === "Escape") {
      input.blur()
    }
  })
  const renderOrGo = () => {
    location.hash = `#/search?q=${encodeURIComponent(input.value)}`
  }
  input.addEventListener("focus", () => setMenu(false))

  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input, textarea, select, [contenteditable]")
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey && !lightbox.open) {
      event.preventDefault()
      input.focus()
      input.select()
    }
  })

  // ---------------------------------------------------------------------------------------------------
  // Graph: a small force simulation (many-body, links, centering), then drag, pan, zoom and hover.

  function graph() {
    document.title = "Graph · Smithers maintainer"
    main.className = "full"
    const dirs = [...new Set(S.notes.map((item) => dirOf(item.path)))].sort()
    main.innerHTML = `
      <div class="graph-page">
        <svg class="graph" id="ms-graph" role="group" aria-label="Notes and the links between them"><g class="viewport"><g class="edges"></g><g class="nodes"></g></g></svg>
        <ul class="legend">${dirs.map((dir, index) => `<li><span class="dot g${index % 8}"></span>${esc(dir)}</li>`).join("")}</ul>
      </div>`
    const svg = $("#ms-graph")
    const viewport = $(".viewport", svg)
    const NS = "http://www.w3.org/2000/svg"
    const golden = Math.PI * (3 - Math.sqrt(5))
    const nodes = S.notes.map((item, index) => {
      const radius = 30 * Math.sqrt(0.5 + index)
      return { id: item.path, title: item.title, label: shortLabel(item.path), group: dirs.indexOf(dirOf(item.path)), x: radius * Math.cos(index * golden), y: radius * Math.sin(index * golden), vx: 0, vy: 0, degree: 0, fx: null, fy: null }
    })
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const links = S.edges.map(([from, to]) => ({ source: byId.get(from), target: byId.get(to) })).filter((link) => link.source && link.target)
    for (const link of links) {
      link.source.degree++
      link.target.degree++
    }
    for (const link of links) {
      link.strength = 1 / Math.min(link.source.degree, link.target.degree)
      link.bias = link.source.degree / (link.source.degree + link.target.degree)
    }

    let alpha = 1
    let alphaTarget = 0
    const tick = () => {
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = (i - j) * 0.01 + 0.01
            dy = 0.01
            d2 = 1
          }
          const force = (-520 * alpha) / d2
          a.vx += dx * force
          a.vy += dy * force
          b.vx -= dx * force
          b.vy -= dy * force
        }
      for (const link of links) {
        let dx = link.target.x + link.target.vx - link.source.x - link.source.vx
        let dy = link.target.y + link.target.vy - link.source.y - link.source.vy
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const k = ((distance - 110) / distance) * alpha * link.strength
        dx *= k
        dy *= k
        link.target.vx -= dx * link.bias
        link.target.vy -= dy * link.bias
        link.source.vx += dx * (1 - link.bias)
        link.source.vy += dy * (1 - link.bias)
      }
      for (const node of nodes) {
        node.vx -= node.x * 0.06 * alpha
        node.vy -= node.y * 0.06 * alpha
        if (node.fx !== null) {
          node.x = node.fx
          node.y = node.fy
          node.vx = node.vy = 0
        } else {
          node.x += node.vx *= 0.6
          node.y += node.vy *= 0.6
        }
      }
      alpha += (alphaTarget - alpha) * 0.0228
    }
    for (let i = 0; i < 300; i++) tick()

    const lines = links.map((link) => {
      const line = document.createElementNS(NS, "line")
      $(".edges", svg).append(line)
      return line
    })
    const groups = nodes.map((node) => {
      const group = document.createElementNS(NS, "g")
      group.setAttribute("class", "node")
      group.setAttribute("tabindex", "0")
      group.setAttribute("role", "link")
      group.setAttribute("aria-label", node.title)
      group.dataset.id = node.id
      const radius = 5 + Math.sqrt(node.degree) * 2.6
      group.innerHTML = `<title>${esc(node.title)}\n${esc(node.id)}</title><circle class="g${node.group % 8}" r="${radius.toFixed(1)}"></circle><text y="${(radius + 14).toFixed(1)}">${esc(node.label)}</text>`
      $(".nodes", svg).append(group)
      return group
    })

    let width = svg.clientWidth || 800
    let height = svg.clientHeight || 600
    const view = { x: 0, y: 0, k: 1 }
    const fit = () => {
      if (!nodes.length) return
      const xs = nodes.flatMap((node) => [node.x - node.label.length * 3.4, node.x + node.label.length * 3.4])
      const ys = nodes.flatMap((node) => [node.y - 12, node.y + 26])
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      view.k = Math.max(0.3, Math.min(1.6, Math.min(width / (maxX - minX + 80), height / (maxY - minY + 80))))
      view.x = -((minX + maxX) / 2) * view.k
      view.y = -((minY + maxY) / 2) * view.k
    }
    const draw = () => {
      viewport.setAttribute("transform", `translate(${width / 2 + view.x},${height / 2 + view.y}) scale(${view.k})`)
      links.forEach((link, index) => {
        const line = lines[index]
        line.setAttribute("x1", link.source.x.toFixed(1))
        line.setAttribute("y1", link.source.y.toFixed(1))
        line.setAttribute("x2", link.target.x.toFixed(1))
        line.setAttribute("y2", link.target.y.toFixed(1))
      })
      nodes.forEach((node, index) => groups[index].setAttribute("transform", `translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`))
    }
    fit()
    draw()

    let frame = 0
    const loop = () => {
      tick()
      draw()
      frame = alpha > 0.005 || alphaTarget > 0 ? requestAnimationFrame(loop) : 0
    }
    const reheat = () => {
      if (!frame) frame = requestAnimationFrame(loop)
    }

    const toGraph = (event) => {
      const box = svg.getBoundingClientRect()
      return { x: (event.clientX - box.left - width / 2 - view.x) / view.k, y: (event.clientY - box.top - height / 2 - view.y) / view.k }
    }
    let drag = null
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return
      const group = event.target.closest(".node")
      svg.setPointerCapture(event.pointerId)
      if (group) {
        const node = byId.get(group.dataset.id)
        drag = { node, startX: event.clientX, startY: event.clientY, moved: false }
        node.fx = node.x
        node.fy = node.y
      } else drag = { pan: true, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y, moved: false }
    })
    svg.addEventListener("pointermove", (event) => {
      if (!drag) return
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true
      if (drag.pan) {
        view.x = drag.x + event.clientX - drag.startX
        view.y = drag.y + event.clientY - drag.startY
        svg.classList.add("panning")
        draw()
      } else if (drag.moved) {
        const point = toGraph(event)
        drag.node.fx = point.x
        drag.node.fy = point.y
        alphaTarget = 0.3
        reheat()
      }
    })
    const release = () => {
      if (!drag) return
      if (drag.node) {
        if (!drag.moved) location.hash = href(drag.node.id)
        drag.node.fx = drag.node.fy = null
        alphaTarget = 0
      }
      svg.classList.remove("panning")
      drag = null
    }
    svg.addEventListener("pointerup", release)
    svg.addEventListener("pointercancel", release)
    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault()
        const box = svg.getBoundingClientRect()
        const px = event.clientX - box.left - width / 2
        const py = event.clientY - box.top - height / 2
        const k = Math.max(0.2, Math.min(4, view.k * Math.exp(-event.deltaY * 0.0015)))
        view.x = px - ((px - view.x) * k) / view.k
        view.y = py - ((py - view.y) * k) / view.k
        view.k = k
        draw()
      },
      { passive: false },
    )
    svg.addEventListener("keydown", (event) => {
      const group = event.target.closest?.(".node")
      if (group && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault()
        location.hash = href(group.dataset.id)
      }
    })
    const neighbors = new Map(nodes.map((node) => [node.id, new Set([node.id])]))
    for (const link of links) {
      neighbors.get(link.source.id).add(link.target.id)
      neighbors.get(link.target.id).add(link.source.id)
    }
    const focus = (id) => {
      svg.classList.toggle("hovering", id !== null)
      const near = id === null ? new Set() : neighbors.get(id)
      groups.forEach((group, index) => group.classList.toggle("hl", near.has(nodes[index].id)))
      lines.forEach((line, index) => line.classList.toggle("hl", id !== null && (links[index].source.id === id || links[index].target.id === id)))
    }
    for (const group of groups) {
      group.addEventListener("pointerenter", () => focus(group.dataset.id))
      group.addEventListener("pointerleave", () => focus(null))
      group.addEventListener("focus", () => focus(group.dataset.id))
      group.addEventListener("blur", () => focus(null))
    }
    const resize = new ResizeObserver(() => {
      const nextWidth = svg.clientWidth
      const nextHeight = svg.clientHeight
      if (nextWidth === width && nextHeight === height) return
      width = nextWidth
      height = nextHeight
      fit()
      draw()
    })
    resize.observe(svg)
    stopView = () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
    }
  }

  window.addEventListener("hashchange", render)
  render()
})()
