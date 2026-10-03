#!/usr/bin/env python3
"""Read a stock Codex seal only from completed CLI shell-tool receipts."""
import argparse
import json
import shlex
from pathlib import Path

PROBE = ['curl', '--noproxy', '*', '--max-time', '5', 'https://example.com']
DENIALS = ('operation not permitted', 'permission denied', 'network access is disabled',
           'network is disabled', 'denied by sandbox', 'sandbox denied')


def argv_of(command):
    if not isinstance(command, str):
        return []
    try:
        args = shlex.split(command)
        if len(args) == 3 and args[0] in ('bash', '/bin/bash', 'sh', '/bin/sh', 'zsh', '/bin/zsh') and args[1] in ('-lc', '-c'):
            args = shlex.split(args[2])
        return args
    except ValueError:
        return []


def seal(text, container, guest_network="none"):
    probe = {'command': None, 'exit_code': None, 'denied': False,
             'source': 'codex-shell-tool', 'output': None}
    guest_supported = False
    connected = False
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict) or event.get('type') != 'item.completed':
            continue
        item = event.get('item')
        if not isinstance(item, dict) or item.get('type') != 'command_execution':
            continue
        args = argv_of(item.get('command'))
        code = item.get('exit_code')
        output = item.get('aggregated_output')
        # Success remains a disproof even if the receipt omitted its output.
        if args == PROBE and type(code) is int and code == 0:
            connected = True
        if args == PROBE and isinstance(code, int) and not isinstance(code, bool) and isinstance(output, str):
            denied = code != 0 and any(denial in output.lower() for denial in DENIALS)
            # Any successful probe disproves confinement, in either ordering.
            probe = {'command': item['command'], 'exit_code': code, 'denied': denied,
                     'source': 'codex-shell-tool', 'output': output[:4000]}
        if args == ['docker', 'exec', container, 'bash', '-lc', 'exit 0'] and isinstance(code, int) and not isinstance(code, bool) and code == 0:
            guest_supported = True
    reason = None if probe['denied'] and guest_supported else (
        'sandbox_denial_unproven' if not probe['denied'] else 'guest_verification_unavailable')
    if connected:
        reason = 'shell-tool network probe connected'
    if guest_network != 'none':
        reason = 'guest_network_unsealed'
    return {'sealed': reason is None, 'sealed_by': 'codex-sandbox', 'sandbox_probe': probe, 'reason': reason}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('timings')
    parser.add_argument('log')
    parser.add_argument('container')
    parser.add_argument('--guest-network', required=True)
    args = parser.parse_args()
    receipt = Path(args.timings)
    timing = json.loads(receipt.read_text())
    timing['benchmark_seal'] = seal(Path(args.log).read_text(), args.container, args.guest_network)
    receipt.write_text(json.dumps(timing, indent=2) + '\n')
    raise SystemExit(0 if timing['benchmark_seal']['sealed'] else 125)
