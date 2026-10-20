// Code that runs inside the page. Playwright serializes each function with toString(), so every function
// here is self-contained: it uses only its argument and browser globals.
//
// Times are performance.now() milliseconds: relative to the page's navigation start, and comparable across
// pages once each page's performance.timeOrigin is added (the pages share one machine clock).

export type Sample = { at: number; text: string }

export type Exchange = {
  questionAt: number
  questionText: string
  firstTextAt: number
  completeAt: number
  answerText: string
  // Each distinct answer text the page rendered, in order.
  samples: Array<Sample>
}

export type Probe = {
  // When the Chat ⌘K button (or the open composer) is in the DOM. The /app route suspends until the conversation's
  // first snapshot from Electric is in its TanStack DB collection, so the button renders with the conversation.
  usableAt: number
  // When the conversation shows the run's newest message, and how many messages it held then.
  newestAt: number
  messages: number
  lcp: number
  // The last ⌘K and Enter keydown events' timeStamps, and when the composer last took focus.
  cmdKAt: number
  enterAt: number
  focusedAt: number
  exchanges: Record<string, Exchange>
}

export type BenchWindow = Window & { __bench: Probe }

// Installed before the page's own scripts on every navigation (BrowserContext.addInitScript).
export function installProbe(newestWord: string) {
  const COMPOSER = 'textarea[aria-label="Message Smithers"]'
  const probe: Probe = { usableAt: 0, newestAt: 0, messages: 0, lcp: 0, cmdKAt: 0, enterAt: 0, focusedAt: 0, exchanges: {} }
  ;(window as unknown as BenchWindow).__bench = probe
  // Vite's dev server loads hundreds of modules, more than the default 250 resource entries, which would drop the
  // shape requests the load suite counts.
  performance.setResourceTimingBufferSize(10_000)

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) probe.lcp = entry.startTime
  }).observe({ type: "largest-contentful-paint", buffered: true })

  // event.timeStamp is when the browser created the event, so input delay counts.
  addEventListener(
    "keydown",
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") probe.cmdKAt = event.timeStamp
      else if (event.key === "Enter" && !event.shiftKey) probe.enterAt = event.timeStamp
    },
    true,
  )
  addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof Element && event.target.matches(COMPOSER)) probe.focusedAt = performance.now()
    },
    true,
  )

  const usable = () =>
    document.querySelector(COMPOSER) !== null ||
    Array.from(document.querySelectorAll("button[aria-keyshortcuts]")).some((button) => button.textContent?.trim().startsWith("Chat"))

  // Mutation callbacks run right after React commits to the DOM, before the frame paints.
  const observer = new MutationObserver(() => {
    const now = performance.now()
    if (!probe.usableAt && usable()) probe.usableAt = now
    if (!probe.newestAt) {
      const conversation = document.querySelector('[aria-label="Conversation"]')
      if (conversation?.textContent?.includes(newestWord)) {
        probe.newestAt = now
        probe.messages = conversation.querySelectorAll("article").length
      }
    }
    if (probe.usableAt && probe.newestAt) observer.disconnect()
  })
  observer.observe(document, { childList: true, subtree: true, characterData: true })
}

// Records when the question containing `word` and each state of its answer reach this page's DOM.
export function watchExchange(word: string) {
  const probe = (window as unknown as BenchWindow).__bench
  const exchange: Exchange = { questionAt: 0, questionText: "", firstTextAt: 0, completeAt: 0, answerText: "", samples: [] }
  probe.exchanges[word] = exchange
  const conversation = document.querySelector('[aria-label="Conversation"]')
  if (conversation === null) throw new Error("the page has no Conversation region")
  const isQuestion = (element: Element) => element.matches('article[data-role="user"]') && (element.textContent ?? "").includes(word)
  let question: Element | undefined

  const observer = new MutationObserver((records) => {
    const now = performance.now()
    if (question === undefined) {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (question === undefined && node instanceof Element) question = [node, ...node.querySelectorAll("article")].find(isQuestion)
        }
      }
      if (question === undefined) return
      exchange.questionAt = now
      exchange.questionText = question.textContent ?? ""
    }
    // The answer is the article after its question; it shows a typing indicator until text arrives.
    const answer = question.nextElementSibling
    const response = answer?.matches('article[data-role="assistant"]') ? answer.querySelector('[data-slot="message-response"]') : null
    if (response === null || response === undefined) return
    const text = response.textContent ?? ""
    if (text !== "" && text !== exchange.samples.at(-1)?.text) exchange.samples.push({ at: now, text })
    if (text !== "" && exchange.firstTextAt === 0) exchange.firstTextAt = now
    if (response.getAttribute("data-streaming") === "false") {
      exchange.completeAt = now
      exchange.answerText = text
      observer.disconnect()
    }
  })
  observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-streaming"] })
}
