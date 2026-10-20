# Welcome to Smithers

> What Smithers is, and the two ways to use it.

Smithers is a web app for working on a GitHub repository with people and coding agents. On smithers.sh, you open a repository at the path it has on GitHub and read it. On your own Mac, the `smthrs` CLI runs Claude Code or Codex on your repository.

![The smithers.sh home page: Sign in at the top right (1) and the command that adds a coding flow to a repository (2)](https://smithers.sh/images/docs/welcome-home.light.webp)

## How Smithers relates to GitHub

GitHub keeps your repository's `main`, issues, pull requests, reviews and checks. Smithers reads them and adds its own layer. A person merges every change. Agents never approve or merge.

Every action in Smithers is a flow: a typed, durable program. A button, a slash command and an agent call all run the same flow. A repository can change its flows by committing files under `.smithers/flows/`. See [What a flow is](https://smithers.sh/docs/flows/).

## Two ways to use Smithers

| | smithers.sh | Your own Mac |
| --- | --- | --- |
| Where it runs | Hosted at smithers.sh | On your Mac, with the `smthrs` CLI |
| Sign in | With GitHub | Not needed for the CLI |
| Start here | [Quickstart](https://smithers.sh/docs/quickstart/) | [Change your code with a flow](https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md) |

## Next steps

- [Quickstart](https://smithers.sh/docs/quickstart/): open a repository on smithers.sh and sign in with GitHub.
- [Change your code with a flow](https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md): have Claude Code or Codex make a change on your own subscription.
- [What a flow is](https://smithers.sh/docs/flows/): how Smithers' actions are built, and how to change them.
