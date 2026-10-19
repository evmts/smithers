import { Link } from "../../../core/router"
import { useView, Loading, Failed, Empty } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { fmtDate, repo, shortSha, tags, to } from "../../fixtures"
import { Box, CopyButton, PageHeader, Row } from "../../ui"
import { HistoryIcon as Icon, useHistoryCommands } from "./shared"

export const TagsLoading = () => <Loading rows={6} />
export const TagsError = () => <Failed what="tags" reason="The repository host didn't return the tag list." />
export const TagsEmpty = () => <Empty title="No tags yet." />

export const TagsReady = () => (
  <div className="repo-history-stack">
    <PageHeader title="Tags" />
    <Box>
      {[...tags].sort((a, b) => b.date.localeCompare(a.date)).map(tag => (
        <Row className="repo-history-tag-row" key={tag.name}>
          <Icon name="tag" size={19} />
          <div className="repo-history-tag-main">
            <Link className="repo-history-tag-name" to={to("tree/" + encodeURIComponent(tag.name))}>{tag.name}</Link>
            <time className="repo-history-muted" dateTime={tag.date}>{fmtDate(tag.date)}</time>
          </div>
          <Link className="repo-history-sha" to={to("commit/" + tag.sha)}>{shortSha(tag.sha)}</Link>
          <CopyButton text={tag.sha} label="Copy SHA" small />
          <div className="repo-history-tag-release">
            {tag.release && <Link to={to("releases/tag/" + encodeURIComponent(tag.name))}>Release<Icon name="chevron" size={13} /></Link>}
          </div>
        </Row>
      ))}
    </Box>
  </div>
)

export const TagsPage = () => {
  useHistoryCommands()
  const state = useView("tags:" + repo.slug)
  return (
    <RepoFrame tab="code" title={"Tags · " + repo.slug} askView="commits" askContext={repo.slug + " tags"}>
      <div className="repo-history-page">
        {state === "loading" ? <TagsLoading /> : state === "error" ? <TagsError />
          : state === "empty" || !tags.length ? <TagsEmpty /> : <TagsReady />}
      </div>
    </RepoFrame>
  )
}
