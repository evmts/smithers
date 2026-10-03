"""Validate offline workspace CLI fakes against this checkout's declarations.

This checks argv shape, not allocation, authorization or guest execution. A fake
must never invent a flag merely because the benchmark adapter needs it.
"""

from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

ROOT = Path(__file__).resolve().parents[3]
DEFINITIONS = ROOT / "packages/smithers/src/internal/backend/Definitions.ts"
GLOBALS = ROOT / "packages/smithers/src/cli/Argv.ts"


@dataclass(frozen=True)
class Option:
    kind: str
    repeatable: bool = False
    required: bool = False
    choices: tuple[str, ...] = ()


def _balanced(source: str, start: int) -> tuple[str, int]:
    """Read a TS object, skipping strings and comments when counting braces."""
    if start >= len(source) or source[start] != "{":
        raise ValueError("CLI declaration is not an object")
    depth = 0
    quote = None
    index = start
    while index < len(source):
        char = source[index]
        if quote:
            if char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
        elif source.startswith("//", index):
            end = source.find("\n", index)
            index = len(source) if end < 0 else end
            continue
        elif source.startswith("/*", index):
            end = source.find("*/", index + 2)
            if end < 0:
                raise ValueError("Unterminated CLI declaration comment")
            index = end + 2
            continue
        elif char in "\"'`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1:index], index + 1
        index += 1
    raise ValueError("Unterminated CLI declaration object")


def _schema(command: str, part: str, source: str) -> str:
    match = re.search(r'^  "' + re.escape(command) + r'":\s*\{', source, re.MULTILINE)
    if not match:
        raise ValueError(f"Undeclared CLI command: {command}")
    body, _ = _balanced(source, source.index("{", match.start()))
    schema = re.search(r'\b' + part + r':\s*z\.object\(\s*\{', body)
    if not schema:
        raise ValueError(f"Unsupported {command} {part} declaration")
    return _balanced(body, body.index("{", schema.start()))[0]


def _fields(schema: str) -> list[tuple[str, str]]:
    # Workspace schemas use one property per line (or an inline singleton).
    # Refuse unparsed schema text rather than silently dropping a new flag.
    matches = list(re.finditer(r'(?:^|,)\s*"([\w-]+)"\s*:\s*', schema))
    fields = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(schema)
        fields.append((match.group(1), schema[match.end():end].strip().rstrip(",")))
    if schema.strip() and (not matches or schema[:matches[0].start()].strip()):
        raise ValueError("Unsupported CLI schema fields")
    return fields


def options(command: str, source: str | None = None) -> dict[str, Option]:
    """Return declared kebab-case flags, preserving array/boolean arity."""
    source = DEFINITIONS.read_text() if source is None else source
    result = {}
    for name, expression in _fields(_schema(command, "options", source)):
        flag = "--" + re.sub(r"[A-Z]", lambda m: "-" + m.group().lower(), name)
        repeatable = expression.startswith("z.array(")
        if expression.startswith("z.boolean()"):
            kind = "boolean"
        elif expression.startswith("z.coerce.number()"):
            kind = "number"
        elif expression.startswith(("z.string()", "z.array(z.string())", "z.enum(")):
            kind = "string"
        else:
            raise ValueError(f"Unsupported CLI option declaration: {command} {name}")
        choices = ()
        if expression.startswith("z.enum("):
            enum = re.match(r"z\.enum\(\s*(\[.*?\])\s*\)", expression, re.S)
            if enum is None:
                raise ValueError(f"Unsupported CLI enum declaration: {command} {name}")
            choices = tuple(json.loads(enum.group(1)))
        result[flag] = Option(kind, repeatable, ".optional()" not in expression and ".default(" not in expression, choices)
    return result


def global_options() -> dict[str, Option]:
    """The actual shared pre-parser's valued/switch tables, including format."""
    source = GLOBALS.read_text()
    result = {}
    for table, kind in (("valued", "string"), ("switches", "boolean")):
        match = re.search(r'const ' + table + r' =\s*\{', source)
        if not match:
            raise ValueError(f"Missing CLI globals declaration: {table}")
        body, _ = _balanced(source, source.index("{", match.start()))
        for flag in re.findall(r'"(--[\w-]+)"\s*:', body):
            result[flag] = Option(kind)
    if "--format" not in result:
        raise ValueError("Missing CLI format declaration")
    return result


_BOOL_LITERALS = {"true", "1", "yes", "y", "on", "false", "0", "no", "n", "off"}


def validate(argv: Sequence[str]) -> None:
    """Refuse undeclared flags in argv (without a program name).

    Option values are opaque words: a shell command containing --unknown is
    one --command value, never recursively parsed as CLI arguments.
    """
    globals = global_options()
    # Root globals may precede the verb; consume their values without treating
    # a value named "workspace" as the command itself.
    prefix = 0
    while prefix < len(argv) and argv[prefix].startswith("-"):
        flag, separator, value = argv[prefix].partition("=")
        negated = flag.startswith("--no-")
        normalized = "--" + flag[5:] if negated else flag
        option = globals.get(normalized)
        if option is None or (negated and option.kind != "boolean"):
            raise ValueError(f"Undeclared global CLI flag: {flag}")
        if option.kind == "boolean":
            if separator and (negated or value not in _BOOL_LITERALS):
                raise ValueError(f"Invalid boolean for {flag}: {value}")
            if not separator and not negated and prefix + 1 < len(argv) and argv[prefix + 1] in _BOOL_LITERALS:
                prefix += 1
        elif not separator:
            prefix += 1
            if prefix >= len(argv):
                raise ValueError(f"Missing value for {flag}")
        prefix += 1
    argv = argv[prefix:]
    if len(argv) < 2 or argv[0] != "workspace":
        raise ValueError("Expected a declared workspace command")
    source = DEFINITIONS.read_text()
    command = " ".join(argv[:2])
    declared = options(command, source)
    required = {flag for flag, option in declared.items() if option.required}
    if "--repo" in declared:
        declared["-R"] = declared["--repo"]  # backend/Commands.ts mounts this alias.
    declared.update(globals)
    provided = set()
    arguments = _fields(_schema(command, "args", source))
    minimum = sum(".optional()" not in expression and ".default(" not in expression
                  for _, expression in arguments)
    maximum = len(arguments)
    positional = 0
    index = 2
    while index < len(argv):
        word = argv[index]
        if word == "--":
            positional += len(argv) - index - 1
            break
        if not word.startswith("-"):
            positional += 1
            index += 1
            continue
        flag, separator, inline = word.partition("=")
        negated = flag.startswith("--no-")
        normalized = "--" + flag[5:] if negated else flag
        option = declared.get(normalized)
        if option is None or (negated and option.kind != "boolean"):
            raise ValueError(f"Undeclared CLI flag for {command}: {flag}")
        provided.add("--repo" if normalized == "-R" else normalized)
        if option.kind == "boolean":
            if separator and (negated or inline not in _BOOL_LITERALS):
                raise ValueError(f"Invalid boolean for {flag}: {inline}")
            if not separator and not negated and index + 1 < len(argv) and argv[index + 1] in _BOOL_LITERALS:
                index += 1
        else:
            if separator:
                value = inline
            else:
                index += 1
                if index >= len(argv):
                    raise ValueError(f"Missing value for {flag}")
                value = argv[index]
            if option.choices and value not in option.choices:
                raise ValueError(f"Invalid value for {flag}: {value}")
            if option.kind == "number":
                try:
                    number = float(value)
                except ValueError as error:
                    raise ValueError(f"Invalid number for {flag}: {value}") from error
                if not math.isfinite(number):
                    raise ValueError(f"Invalid number for {flag}: {value}")
        index += 1
    missing = sorted(required - provided)
    if missing:
        raise ValueError(f"Missing required CLI flags for {command}: {', '.join(missing)}")
    if not minimum <= positional <= maximum:
        raise ValueError(f"{command} expects {minimum}..{maximum} arguments, got {positional}")


def write_fake_cli(path: Path, script: str) -> None:
    """Wrap a Python/shell fake so validation precedes all response behavior.

    The absolute interpreter and fixture path work even when the harness
    deliberately removes PYTHONPATH/PATH from a subprocess environment.
    """
    shebang, newline, body = script.partition("\n")
    if not newline or not shebang.startswith("#!"):
        raise ValueError("Fake CLI script needs a Python or shell shebang")
    prelude = (
        f"#!{sys.executable}\n"
        "import json, os, sys\n"
        f"sys.path.insert(0, {str(Path(__file__).resolve().parent)!r})\n"
        "from cli_contract import validate\n"
        "try:\n"
        "    validate(sys.argv[1:])\n"
        "except ValueError as error:\n"
        "    print(json.dumps({'error': {'code': 'cli_contract', 'message': str(error)}}), file=sys.stderr)\n"
        "    sys.exit(2)\n"
    )
    if "python" in shebang or shebang == f"#!{sys.executable}":
        path.write_text(prelude + body)
    elif shebang in ("#!/bin/sh", "#!/bin/bash"):
        shell = shebang[2:]
        path.write_text(prelude + f"os.execv({shell!r}, [{shell!r}, '-c', {body!r}, 'fake-cli', *sys.argv[1:]])\n")
    else:
        raise ValueError(f"Unsupported fake CLI shebang: {shebang}")
