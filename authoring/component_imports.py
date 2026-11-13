"""Which components a source file of the application component reaches, read from its import and path strings.

One definition shared by scripts/make_component.py (which marks artefacts with `component`) and
authoring/check_conditional_artefacts.py (which checks the marks). Nothing here runs or assembles anything.
"""
import posixpath
import re
from pathlib import Path

CODE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".swift", ".kt", ".kts", ".sh", ".css", ".html"}
STRING = re.compile(r"""(["'`])((?:\.\./)*(?:\./)?components/([a-z][a-z0-9-]*)/([^"'`\s]*))\1""")
EXTENSIONS = ("", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".py", ".swift", ".kt")
RELATIVE = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)(["'])(\.{1,2}/[^"']*)\1""")


def code(text: str, suffix: str) -> str:
    """The text without whole-line comments and trailing `// ` comments (so a path named in a comment is not a reference)."""
    marks = ("#",) if suffix in {".py", ".sh"} else ("//", "*", "/*")
    out = []
    for line in text.splitlines():
        if line.strip().startswith(marks):
            continue
        out.append(re.sub(r"\s//\s.*$", "", line) if suffix not in {".py", ".sh"} else line)
    return "\n".join(out)


def references(path: Path) -> list[tuple[str, str]]:
    """(component, path inside the component) for every quoted string naming `components/<name>/<path>`.
    A path built with `${...}` is cut at the first `${` and ends with `/*` so it reads as a prefix."""
    if path.suffix not in CODE_SUFFIXES:
        return []
    found = []
    for m in STRING.finditer(code(path.read_text(encoding="utf-8", errors="ignore"), path.suffix)):
        rest = m.group(4)
        if "${" in rest:
            rest = rest[: rest.index("${")] + "*"
        found.append((m.group(3), rest))
    return found


# Workflows and scripts of the repository name component files in commands, not in quoted imports.
REPOSITORY_SUFFIXES = {".yml", ".yaml", ".sh", ".ps1"}


def repository_references(path: Path) -> list[tuple[str, str]]:
    """(component, path inside the component) for every `components/<name>/<path>` a workflow or script names, quoted or not; a
    path ending in `**` or a `"$ROOT/components/...` string counts too (a glob reads as a prefix)."""
    if path.suffix not in REPOSITORY_SUFFIXES or "repository" not in path.parts:
        return []
    found = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.strip().startswith("#"):
            continue
        for m in re.finditer(r"""components/([a-z][a-z0-9-]*)/([^\s"'`)]*)""", line):
            rest = m.group(2)
            found.append((m.group(1), rest.split("*")[0] + "*" if "*" in rest else rest))
    return found


def relative_imports(path: Path) -> list[str]:
    """Relative module specifiers (`./x`, `../x`) of import, export-from, dynamic import and require, in code files."""
    if path.suffix not in {".ts", ".tsx", ".js", ".mjs", ".cjs"}:
        return []
    return [m.group(2) for m in RELATIVE.finditer(code(path.read_text(encoding="utf-8", errors="ignore"), path.suffix))
            if not m.group(2).startswith("../../components/") and "/components/" not in m.group(2)]


def match(rest: str, destinations: set[str]) -> set[str]:
    """The destinations `rest` (a path inside a folder) can name: itself, with the extension a bundler adds, as a directory index,
    as a directory (everything below it) or, for a built path ending in `*`, as a prefix. Empty when it names none."""
    if rest.endswith("*"):
        return {d for d in destinations if d.startswith(rest[:-1])}
    base = rest.rstrip("/")
    found = {base + ext for ext in EXTENSIONS if base + ext in destinations}
    found |= {f"{base}/index{ext}" for ext in EXTENSIONS[1:] if f"{base}/index{ext}" in destinations}
    return found or {d for d in destinations if d.startswith(base + "/")}


def resolves(rest: str, destinations: set[str]) -> bool:
    return bool(match(rest, destinations))


def relative_match(source_destination: str, specifier: str, destinations: set[str]) -> set[str]:
    """The installed destinations a relative specifier written in the file installed at `source_destination` names."""
    base = posixpath.normpath(posixpath.join(posixpath.dirname(source_destination), specifier))
    return set() if base.startswith("..") else match(base, destinations)
