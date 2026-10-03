#!/bin/bash
# Select and verify the Codex login before a benchmark starts a container.
# Subscription runs lease the shared benchmark pool. Explicit API-key runs
# retain the isolated home for historical parity.
swb_codex_auth() {
  if [ -z "${SWB_CODEX_CLI:-}" ] || [ ! -x "$SWB_CODEX_CLI" ]; then
    echo 'codex auth: set SWB_CODEX_CLI to the remote executable.' >&2
    return 2
  fi
  local mode="${SWB_CODEX_AUTH:-chatgpt}"
  local login lease
  case "$mode" in
    chatgpt)
      if [ -n "${SWB_CODEX_HOME:-}" ]; then
        echo "codex auth: use SMITHERS_CODEX_POOL, not SWB_CODEX_HOME, for ChatGPT accounts" >&2
        return 2
      fi
      lease="$(python3 "$S/lib/codex-account.py" --trial "${RUN_ID:-preflight}" "$@")" || return $?
      CODEX_HOME="${lease%$'\n'*}"
      SWB_CODEX_ACCOUNT="${lease##*$'\n'}"
      if [ ! -d "$CODEX_HOME" ]; then
        echo "codex auth: missing ChatGPT home at $CODEX_HOME" >&2
        return 1
      fi
      login="$(CODEX_HOME="$CODEX_HOME" "$SWB_CODEX_CLI" login status 2>&1)" || {
        echo "codex auth: login status failed for $CODEX_HOME" >&2
        return 1
      }
      if [ "$login" != 'Logged in using ChatGPT' ]; then
        echo "codex auth: $CODEX_HOME is not logged in using ChatGPT" >&2
        return 1
      fi
      ;;
    api-key)
      CODEX_HOME="${SWB_CODEX_HOME:-$S/.codex-home}"
      SWB_CODEX_ACCOUNT="api-key"
      mkdir -p "$CODEX_HOME"
      login="$(CODEX_HOME="$CODEX_HOME" "$SWB_CODEX_CLI" login status 2>&1)" || login=''
      if [ "$login" != 'Logged in using an API key' ]; then
        if [ -z "${OPENAI_API_KEY:-}" ]; then
          echo "codex auth: no API-key login at $CODEX_HOME" >&2
          return 1
        fi
        printenv OPENAI_API_KEY | CODEX_HOME="$CODEX_HOME" "$SWB_CODEX_CLI" login --with-api-key >/dev/null 2>&1 || {
          echo "codex auth: API-key login failed" >&2
          return 1
        }
        login="$(CODEX_HOME="$CODEX_HOME" "$SWB_CODEX_CLI" login status 2>&1)" || login=''
        if [ "$login" != 'Logged in using an API key' ]; then
          echo "codex auth: API-key login not verified" >&2
          return 1
        fi
      fi
      ;;
    *)
      echo "codex auth: SWB_CODEX_AUTH must be api-key or chatgpt, got '$mode'" >&2
      return 2
      ;;
  esac
  export CODEX_HOME SWB_CODEX_ACCOUNT
  echo "codex auth: $mode login verified at $CODEX_HOME"
}

# Fail before image admission when the installed arm differs from the pin.
swb_codex_version() {
  if [ -z "${SWB_CODEX_CLI:-}" ] || [ ! -x "$SWB_CODEX_CLI" ]; then
    echo 'codex version: set SWB_CODEX_CLI to the remote executable.' >&2
    return 2
  fi
  local version
  version="$("$SWB_CODEX_CLI" --version 2>&1)" || return 1
  if [ "$version" != 'codex-cli 0.160.0' ]; then
    echo "codex version: expected codex-cli 0.160.0, got $version" >&2
    return 1
  fi
  SWB_CODEX_CLI_VERSION=0.160.0
  export SWB_CODEX_CLI_VERSION
}
