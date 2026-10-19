import { pluralize } from "../../ui/pluralize"
import { useEffect, useRef, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, navigate, useLocation } from "../../../core/router"
import { file, repo, to, tree } from "../../fixtures"
import { Empty, Failed, Loading, registerSlash, useRepoFrame, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { AgentMark, Box, Counter, Icon, LabelChip, PersonChip, RelTime, StateIcon } from "../../ui"
import { Syntax } from "../../ui/syntax"
import { searchFixtures, searchMode, searchSubject, subjects, type SearchIndex, type SearchResult, type Subject } from "./search-data"

const searchRoute = (query: string, subject: Subject, current = "") => {
  const params = new URLSearchParams(current)
  params.set("q", query)
  params.set("type", subject)
  params.delete("ask")
  return to(`search?${params}`)
}

export const Highlight = ({ text, term }: { text: string; term: string }) => {
  if (!term) return <span className="repo-search-highlight">{text}</span>
  const parts = []
  let from = 0
  let at = text.toLowerCase().indexOf(term.toLowerCase())
  while (at !== -1) {
    parts.push(text.slice(from, at))
    parts.push(<mark key={at}>{text.slice(at, at + term.length)}</mark>)
    from = at + term.length
    at = text.toLowerCase().indexOf(term.toLowerCase(), from)
  }
  parts.push(text.slice(from))
  return <span className="repo-search-highlight">{parts}</span>
}

const SearchBox = ({ query, subject }: { query: string; subject: Subject }) => {
  const [value, setValue] = useState(query)
  const location = useLocation()
  useEffect(() => setValue(query), [query])
  return (
    <form
      className="repo-search-form"
      role="search"
      onSubmit={event => {
        event.preventDefault()
        navigate(searchRoute(value.trim(), subject, location.split("?")[1]))
      }}
    >
      <label className="repo-ui-sr" htmlFor="repo-search-query">Search {repo.slug}</label>
      <div className="repo-search-input-wrap">
        <Icon name="search" size={18} />
        <input
          className="repo-ui-input"
          id="repo-search-query"
          type="search"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={`Search ${repo.slug}`}
        />
      </div>
      <button className="repo-ui-btn" title={`/search ${value}`}>Search</button>
    </form>
  )
}

const SearchFacets = ({ query, active, index }: { query: string; active: Subject; index?: SearchIndex }) => {
  const location = useLocation()
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const selected = nav.current?.querySelector<HTMLElement>("[aria-current]")
    if (nav.current && selected) nav.current.scrollLeft = Math.max(0, selected.offsetLeft - nav.current.offsetLeft - 16)
  }, [active])
  return (
    <nav ref={nav} className="repo-search-facets" aria-label="Search subjects">
      {subjects.map(subject => (
        <Link
          key={subject.key}
          to={searchRoute(query, subject.key, location.split("?")[1])}
          aria-current={active === subject.key ? "page" : undefined}
        >
          <Icon name={subject.icon} />
          <span>{subject.label}</span>
          {index && <Counter>{index[subject.key].length}</Counter>}
        </Link>
      ))}
    </nav>
  )
}

export const SearchQueryEmpty = () => {
  const firstSymbol = tree.flatMap(entry => entry.kind === "file" ? file(entry.path)?.symbols ?? [] : [])[0]
  const examples = [repo.name, ...(firstSymbol ? [`symbol:${firstSymbol.name}`, `ref:${firstSymbol.name}`] : [])]
  return (
    <section className="repo-search-intro">
      <Icon name="search" size={28} />
      <h2>Search {repo.slug}</h2>
      <div className="repo-search-examples">
        {examples.map(query => (
          <Link key={query} to={searchRoute(query, "code")}>
            <code>{query}</code>
          </Link>
        ))}
      </div>
    </section>
  )
}

export const SearchEmpty = ({ query }: { query: string }) => {
  const { openAsk } = useRepoFrame()
  return (
    <Empty
      title={`No results for "${query}"`}
      action={(
        <button
          className="repo-ui-btn"
          title={`/ask What can you tell me about ${query}?`}
          onClick={() => openAsk(`What can you tell me about ${query}?`)}
        >
          Ask about it
        </button>
      )}
    />
  )
}

const CodeResult = ({ result, term }: { result: SearchResult; term: string }) => (
  <Box className="repo-search-code-result" header={(
    <Link className="repo-search-file-title" to={result.target}>
      <Icon name="file" />
      <Highlight text={result.title} term={term} />
    </Link>
  )}>
    {(result.lines ?? []).map((line, i) => (
      <div className="repo-search-match" key={`${line.number}:${i}`}>
        {line.detail && <div className="repo-search-symbol-detail"><Highlight text={line.detail} term={term} /></div>}
        <Link
          className="repo-search-match-link"
          to={line.target ?? to(`blob/${encodeURIComponent(repo.defaultBranch)}/${result.title}?L=${line.number}`)}
          aria-label={`${result.title}, line ${line.number}`}
        >
          <span className="repo-search-line-number">{line.number}</span>
          <code><span className="repo-search-highlight"><Syntax code={line.text} term={term} /></span></code>
        </Link>
      </div>
    ))}
  </Box>
)

const SubjectResult = ({ result, term }: { result: SearchResult; term: string }) => (
  <article className="repo-search-result">
    <div className="repo-search-result-icon">
      {result.state ? <StateIcon state={result.state} /> : <Icon name={result.subject === "commits" ? "change" : "file"} />}
    </div>
    <div className="repo-search-result-content">
      <div className="repo-search-result-title">
        <Link to={result.target}><Highlight text={result.title} term={term} /></Link>
        {result.agent && <AgentMark agent={result.agent} />}
        {result.labels?.map(name => <LabelChip key={name} name={name} />)}
      </div>
      {result.excerpt && <p><Highlight text={result.excerpt} term={term} /></p>}
      <div className="repo-search-result-meta">
        {result.number !== undefined && <span>#{result.number}</span>}
        {result.subject === "commits" && <code>{result.id.slice(0, 7)}</code>}
        {result.subject === "runs" && <span>{result.id}</span>}
        {result.author && <PersonChip login={result.author} />}
        {result.date && <RelTime date={result.date} />}
      </div>
    </div>
  </article>
)

export const SearchReady = ({ query, subject, index }: { query: string; subject: Subject; index: SearchIndex }) => {
  const results = index[subject]
  const { kind, term } = searchMode(query)
  const count = kind === "ref" || kind === "symbol"
    ? results.reduce((sum, result) => sum + (result.lines?.length ?? 0), 0) : results.length
  return (
    <section className="repo-search-results" aria-label="Search results" aria-live="polite">
      <h2>
        {count} {kind === "ref" ? pluralize(count, "reference") : kind === "symbol" ? `symbol ${pluralize(count, "result")}` : pluralize(count, "result")}
        <span> for <strong>{query}</strong></span>
      </h2>
      {results.map(result => result.subject === "code" ? (
        <CodeResult key={result.id} result={result} term={term} />
      ) : (
        <SubjectResult key={result.id} result={result} term={term} />
      ))}
    </section>
  )
}

export const SearchLoading = () => <Loading rows={5} />
export const SearchError = () => <Failed what="search results" reason="The repository search didn't respond." />
export const SearchSignedOut = SearchReady
export const SearchReader = SearchReady

const SearchContent = ({ query, subject }: { query: string; subject: Subject }) => {
  const { flags } = useMock()
  const state = useView(`search:${repo.slug}:${query}:${subject}`)
  const index = searchFixtures(query, flags.data === "empty")
  useEffect(() => registerSlash("search", {
    purpose: "Search this repository",
    fields: [{ name: "query", label: "Search query" }],
    access: "public",
    confirm: false,
    run: ({ query: value }, { closeAsk }) => {
      navigate(searchRoute(value, "code"))
      closeAsk()
    }
  }), [repo.slug])
  const ready = state === "ready" || state === "empty"
  const Ready = flags.as === "out" ? SearchSignedOut : flags.role === "reader" ? SearchReader : SearchReady
  return (
    <div className="repo-search-page">
      <SearchBox query={query} subject={subject} />
      <div className="repo-search-layout" data-query={Boolean(query)}>
        {query && <SearchFacets query={query} active={subject} index={ready ? index : undefined} />}
        <div className="repo-search-main">
          {state === "loading" ? <SearchLoading />
            : state === "error" ? <SearchError />
            : !query ? <SearchQueryEmpty />
            : !index[subject].length ? <SearchEmpty query={query} />
            : <Ready query={query} subject={subject} index={index} />}
        </div>
      </div>
    </div>
  )
}

export const Search = () => {
  const location = useLocation()
  const params = new URLSearchParams(location.split("?")[1])
  const query = params.get("q")?.trim() ?? ""
  const subject = searchSubject(params.get("type"))
  return (
    <RepoFrame tab={null} title={`Search · ${repo.slug}`} askView="search" askContext={`${repo.slug} · search: ${query || "all subjects"}`}>
      <SearchContent query={query} subject={subject} />
    </RepoFrame>
  )
}
