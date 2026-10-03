#!/usr/bin/env python3
"""Real pool/file-lock and shell-auth regression checks, without paid calls.

The Codex executable is a command double: these checks assert login routing
and admission, while live Codex execution remains an operator measurement.
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path

RIG = Path(__file__).resolve().parents[1]


def run(env, *, check=False, version=False):
    command = 'S="$1"; source "$S/lib/codex-auth.sh"; '
    command += 'swb_codex_version' if version else 'swb_codex_auth' + (' --check' if check else '')
    if not version:
        command += '; code=$?; if [ "$code" = 0 ]; then printf "receipt:%s:%s\\n" "$SWB_CODEX_ACCOUNT" "$CODEX_HOME"; fi; exit "$code"'
    return subprocess.run(['bash', '-c', command, '_', str(RIG)], env=env, capture_output=True, text=True, timeout=10)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        account_root = root / '.smithers/accounts'
        for label in ('codex-1', 'codex-2', 'codex-3', 'codex-acct-1'):
            directory = account_root / label
            directory.mkdir(parents=True)
            (directory / 'auth.json').write_text('{}')
        (root / '.codex').mkdir()
        (root / '.codex/auth.json').write_text('{}')
        binary = root / 'bin/codex'
        binary.parent.mkdir()
        binary.write_text('''#!/bin/sh
if [ "$1" = --version ]; then echo "codex-cli ${FAKE_CODEX_VERSION:-0.160.0}"; exit 0; fi
if [ "$1" = login ] && [ "$2" = status ]; then
  echo "${FAKE_CODEX_LOGIN_STATUS:-Logged in using ChatGPT}"; exit 0
fi
exit 1
''')
        binary.chmod(0o755)
        state_path = root / 'pool.json'
        env = {k: v for k, v in os.environ.items()
               if not k.startswith(('SWB_CODEX_', 'SMITHERS_CODEX_POOL')) and k != 'CODEX_HOME'}
        env.update(HOME=str(root), PATH=f'{binary.parent}:{os.environ["PATH"]}',
                   SWB_CODEX_CLI=str(binary), SMITHERS_CODEX_ACCOUNTS_DIR=str(account_root), SMITHERS_CODEX_POOL_STATE=str(state_path), SMITHERS_CODEX_POOL_WAIT_SEC='0',
                   CODEX_HOME='/forbidden/inherited/home')
        unset_cli = {key: value for key, value in env.items() if key != 'SWB_CODEX_CLI'}
        for version in (False, True):
            reply = run(unset_cli, version=version)
            assert reply.returncode == 2 and 'set SWB_CODEX_CLI' in reply.stderr, reply
        assert not state_path.exists(), 'missing executable cannot spend a pool lease'
        # Default auth is ChatGPT; each instance rotates exactly once, from the
        # benchmark-only allowlist even when the host has extra signed-in homes.
        labels = ('codex-1', 'codex-3', 'codex-acct-1', 'codex-1')
        for index, label in enumerate(labels):
            reply = run({**env, 'RUN_ID': f'instance-{index}'})
            assert reply.returncode == 0, reply
            assert f'receipt:{label}:{account_root / label}' in reply.stdout, reply
        state = json.loads(state_path.read_text())
        assert [row['trial'] for row in state['leases']] == [f'instance-{i}' for i in range(4)], state
        # Batch preflight doesn't consume an instance lease.
        reply = run(env, check=True)
        assert reply.returncode == 0 and json.loads(state_path.read_text()) == state, reply
        reply = run({**env, 'SMITHERS_CODEX_POOL': 'codex-3'})
        assert reply.returncode == 0 and 'receipt:codex-3:' in reply.stdout, reply
        for invalid in ('', 'codex-2', 'codex-1,codex-5', 'default', '../codex-1'):
            before = state_path.read_text()
            reply = run({**env, 'SMITHERS_CODEX_POOL': invalid})
            assert reply.returncode != 0 and 'only benchmark accounts' in reply.stderr, (invalid, reply)
            assert state_path.read_text() == before, 'invalid pool cannot lease'
        reply = run({**env, 'SWB_CODEX_HOME': str(root / '.codex')})
        assert reply.returncode == 2 and 'SMITHERS_CODEX_POOL' in reply.stderr, reply
        reply = run({**env, 'FAKE_CODEX_LOGIN_STATUS': 'Logged in using an API key'})
        assert reply.returncode == 1 and 'not logged in using ChatGPT' in reply.stderr, reply
        state = json.loads(state_path.read_text())
        state['disabled'] = {label: {'reason': 'exhausted'} for label in labels}
        state_path.write_text(json.dumps(state))
        reply = run(env)
        assert reply.returncode == 1 and 'no Codex account in rotation' in reply.stderr, reply
        assert not any(row['label'] in ('default', 'codex-2') for row in json.loads(state_path.read_text())['leases'])
        # A reset that already passed is available to preflight without
        # rewriting the rotation or its disable/enable history.
        state = json.loads(state_path.read_text())
        state['disabled']['codex-1']['resetAt'] = '2000-01-01T00:00:00+00:00'
        state_path.write_text(json.dumps(state))
        before = state_path.read_text()
        reply = run(env, check=True)
        assert reply.returncode == 0 and 'receipt:codex-1:' in reply.stdout, reply
        assert state_path.read_text() == before, 'preflight cannot rotate or mutate reset history'
        for label in set(labels):
            (account_root / label / 'auth.json').unlink()
        reply = run(env, check=True)
        assert reply.returncode == 1 and 'no benchmark account available' in reply.stderr, reply
        # Earlier API-key lanes opt in explicitly and retain isolated key auth.
        reply = run({**env, 'SWB_CODEX_AUTH': 'api-key', 'SWB_CODEX_HOME': str(root / '.codex'),
                     'FAKE_CODEX_LOGIN_STATUS': 'Logged in using an API key'})
        assert reply.returncode == 0 and 'receipt:api-key:' in reply.stdout, reply
        assert run(env, version=True).returncode == 0
        for version in ('0.149.0', '0.160.1', '0.160.0-extra'):
            reply = run({**env, 'FAKE_CODEX_VERSION': version}, version=True)
            assert reply.returncode == 1 and 'expected codex-cli 0.160.0' in reply.stderr, reply
    print('check-codex-auth: per-instance allowed pool leases, no home fallback, nonrotating preflight, auth and CLI pin hold.')


if __name__ == '__main__':
    main()
