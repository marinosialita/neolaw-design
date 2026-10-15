"""Loopback-only NeoLaw preview with bounded, in-memory research endpoints."""
import http.server
import json
import os
import re
import urllib.parse
from pathlib import Path

from screening_research import ResearchError, ResearchService
from screening_opensanctions import ProviderError

ROOT = Path(__file__).resolve().parent
ALLOWED_HOSTS = {"127.0.0.1:4176", "localhost:4176"}
STATIC_ROOT_FILES = {"index.html", "app.js", "chat.js", "core.js", "styles.css", "favicon.ico"}
STATIC_DIRS = {"assets", "modules"}
STATIC_SUFFIXES = {".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf"}
MAX_REQUEST_BYTES = 8192
JOB_PATH = re.compile(r"^/api/research/jobs/([a-f0-9]{32})(/cancel)?$")


def allowed_request(headers, api=False, mutation=False):
    """Prevent cross-site use and DNS rebinding of a credential-bearing local app."""
    host = headers.get("Host", "")
    if host not in ALLOWED_HOSTS:
        return False
    if hasattr(headers, "get_all") and len(headers.get_all("Host", [])) != 1:
        return False
    origin = headers.get("Origin")
    if origin is not None and origin != "http://" + host:
        return False
    site = headers.get("Sec-Fetch-Site")
    # Opening the public entry page from another page is a normal navigation.
    # This exception never applies to APIs, writes, frames or subresources.
    entry_navigation = (not api and not mutation
                        and headers.get("Sec-Fetch-Mode") == "navigate"
                        and headers.get("Sec-Fetch-Dest") == "document")
    if site is not None and site not in ("same-origin", "none") and not entry_navigation:
        return False
    # Browser JSON writes always have Origin; command-line clients must opt in too.
    if mutation and origin != "http://" + host:
        return False
    return True


def static_file(path, root=ROOT):
    """An explicit public asset allowlist; no directory listings or server sources."""
    try:
        raw = urllib.parse.unquote(urllib.parse.urlsplit(path).path, errors="strict")
    except (ValueError, UnicodeError):
        return None
    if raw == "/":
        return root / "index.html"
    if "\\" in raw or "\x00" in raw:
        return None
    parts = raw.lstrip("/").split("/")
    if any(not p or p.startswith(".") for p in parts):
        return None
    allowed = (len(parts) == 1 and parts[0] in STATIC_ROOT_FILES)
    allowed = allowed or (parts[0] in STATIC_DIRS and Path(parts[-1]).suffix.lower() in STATIC_SUFFIXES)
    allowed = allowed or (parts == ["data", "screening-sources.json"])
    allowed = allowed or (parts == ["assets", "nda-reviewed-demo.docx"])
    if not allowed:
        return None
    candidate = root.joinpath(*parts)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root.resolve())
    except (OSError, ValueError):
        return None
    # No symlinks, even if their target currently happens to be within public files.
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            return None
    return resolved if resolved.is_file() else None


class Handler(http.server.SimpleHTTPRequestHandler):
    research = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(25)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def log_message(self, format, *args):
        # Do not record paths, request bodies, subject names or provider credentials.
        return

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _guard(self, mutation=False, entry_page=False):
        if not allowed_request(self.headers, api=not entry_page, mutation=mutation):
            self._json(403, {"error": "This local workspace accepts requests only from its own page."})
            return False
        return True

    def _body(self, maximum=MAX_REQUEST_BYTES):
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1:
            raise ResearchError("Send a JSON request with a valid content length.")
        try:
            length = int(lengths[0])
        except ValueError:
            raise ResearchError("Send a JSON request with a valid content length.") from None
        if not 0 <= length <= maximum:
            raise ResearchError("The research request is too large.", 413)
        if self.headers.get_content_type() != "application/json":
            raise ResearchError("Use application/json for research requests.", 415)
        try:
            value = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            raise ResearchError("The request body must be valid JSON.") from None
        if not isinstance(value, dict):
            raise ResearchError("The request body must be a JSON object.")
        return value

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        if not self._guard(entry_page=path in ("/", "/index.html")):
            return
        if path.startswith("/api/"):
            try:
                if path == "/api/research/status":
                    self._json(200, self.research.status())
                elif path == "/api/screening/index":
                    self._json(200, self.research.official_checker.status())
                elif path == "/api/opensanctions/status":
                    self._json(200, self.research.opensanctions.status())
                elif (match := JOB_PATH.fullmatch(path)) and not match[2]:
                    self._json(200, self.research.get(match[1]))
                else:
                    self._json(404, {"error": "Unknown research endpoint."})
            except ResearchError as exc:
                self._json(exc.status, {"error": str(exc)})
            return
        if static_file(self.path) is None:
            self.send_error(404, "File not found")
            return
        super().do_GET()

    def do_HEAD(self):
        path = urllib.parse.urlsplit(self.path).path
        if not self._guard(entry_page=path in ("/", "/index.html")):
            return
        if static_file(self.path) is None:
            self.send_error(404, "File not found")
            return
        super().do_HEAD()

    def do_POST(self):
        if not self._guard(mutation=True):
            return
        try:
            path = urllib.parse.urlsplit(self.path).path
            value = self._body(8_000_000 if path in ('/api/screening/report','/api/screening/chat','/api/screening/retry') else MAX_REQUEST_BYTES)
            if path == '/api/screening/report':
                if not isinstance(value.get('query'), dict) or not isinstance(value.get('matches', []), list):
                    raise ResearchError('The saved report could not be read.', 400)
                try:
                    from screening_report import build_pdf, ReportExportError
                    pdf = build_pdf(value)
                except ReportExportError as exc:
                    raise ResearchError(str(exc),413) from None
                except ImportError:
                    raise ResearchError('PDF export needs ReportLab in the local server. Print / Save as PDF remains available.', 503) from None
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', 'attachment; filename="NeoLaw-screening-report.pdf"')
                self.send_header('Content-Length', str(len(pdf)))
                self.end_headers()
                self.wfile.write(pdf)
                return
            if path == "/api/screening/chat":
                result, status = self.research.chat(value), 200
            elif path == "/api/opensanctions/connect":
                result, status = self.research.opensanctions.connect(value), 200
            elif path == "/api/opensanctions/disconnect":
                result, status = self.research.opensanctions.disconnect(), 200
            elif path == "/api/research/connect":
                result, status = self.research.connect(value), 200
            elif path == "/api/research/disconnect":
                result, status = self.research.disconnect(), 200
            elif path == "/api/screening/retry":
                result, status = self.research.retry(value), 202
            elif path == "/api/screening/index/refresh":
                try:
                    refresh = self.research.official_checker.request_refresh(value.get('sourceIds'))
                except ValueError as exc:
                    raise ResearchError(str(exc),400) from None
                result, status = {**self.research.official_checker.status(), 'refreshRequest':refresh}, 202
            elif path == "/api/screening/start":
                result, status = self.research.start({"query": value.get("query"), "mode": "search"}), 202
            elif path == "/api/research/start":
                result, status = self.research.start(value), 202
            elif (match := JOB_PATH.fullmatch(path)) and match[2]:
                result, status = self.research.cancel(match[1]), 200
            else:
                raise ResearchError("Unknown research endpoint.", 404)
            self._json(status, result)
        except ProviderError as exc:
            self._json(400, {"error": str(exc)})
        except ResearchError as exc:
            self._json(exc.status, {"error": str(exc)})
        except Exception:
            self._json(500, {"error": "The local research service could not complete this request."})

    def list_directory(self, path):
        self.send_error(404, "File not found")
        return None


def main():
    os.chdir(ROOT)
    Handler.research = ResearchService()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 4176), Handler)
    server.daemon_threads = True
    try:
        Handler.research.official_checker.start_refreshing()
        server.serve_forever()
    finally:
        Handler.research.official_checker.close()
        server.server_close()


if __name__ == "__main__":
    main()
