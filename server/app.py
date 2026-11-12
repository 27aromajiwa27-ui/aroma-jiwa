"""HTTP server: static PWA files, JSON API, SSE stream."""
import json
import mimetypes
import os
import queue
import sys
import traceback
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

from . import api, auth, db, realtime, util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "app")
PORT = int(os.environ.get("PORT", 4000))
HOST = os.environ.get("HOST", "0.0.0.0")

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp", ".map": "application/json",
}


class Ctx:
    def __init__(self, handler, method, path, query, body):
        self.handler = handler
        self.method = method
        self.path = path
        self.query = query
        self.body = body or {}
        self.params = {}
        self.ip = handler.client_address[0]
        self.cookies = SimpleCookie()
        try:
            self.cookies.load(handler.headers.get("Cookie") or "")
        except Exception:
            pass
        self.token = self.cookies["aj_session"].value if "aj_session" in self.cookies else None
        self.session = auth.get_session(self.token)
        self.device = (handler.headers.get("X-Device") or handler.headers.get("User-Agent") or "Perangkat")[:80]
        self._cookies = []

    def set_cookie(self, token, expires, remember):
        parts = ["aj_session=%s" % token, "Path=/", "HttpOnly", "SameSite=Lax"]
        if remember:
            parts.append("Max-Age=%d" % max(60, int((expires - util.now()).total_seconds())))
        self._cookies.append("; ".join(parts))

    def clear_cookie(self):
        self._cookies.append("aj_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")


class Handler(BaseHTTPRequestHandler):
    server_version = "AromaJiwa/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("AJ_QUIET") != "1":
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ------------------------------------------------------------------ helpers
    def _json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for h in extra_headers or []:
            self.send_header("Set-Cookie", h)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        if (self.headers.get("Content-Type") or "").startswith("application/json"):
            try:
                return json.loads(raw.decode("utf-8"))
            except ValueError:
                return {}
        try:
            return {k: v[0] for k, v in parse_qs(raw.decode("utf-8")).items()}
        except Exception:
            return {}

    def _static(self, path):
        rel = unquote(path.split("?")[0]).lstrip("/")
        if not rel:
            rel = "index.html"
        full = os.path.realpath(os.path.join(APP_DIR, rel))
        if not full.startswith(os.path.realpath(APP_DIR)) or not os.path.isfile(full):
            self.send_response(404)
            payload = b"Not found"
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext) or mimetypes.guess_type(full)[0] or "application/octet-stream"
        if rel == ".well-known/assetlinks.json":
            # Trusted Web Activity verification wants bare application/json, no redirect, no cache.
            ctype = "application/json"
        with open(full, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if rel in ("sw.js", "index.html", "manifest.webmanifest", ".well-known/assetlinks.json"):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=60")
        self.end_headers()
        self.wfile.write(body)

    def _sse(self, ctx):
        if not ctx.session:
            self._json(401, {"error": "Sesi tidak ditemukan."})
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        q = realtime.subscribe()
        kind = ctx.session["kind"]
        ref = ctx.session["ref_id"]
        try:
            self.wfile.write(("event: ready\ndata: %s\n\n" % json.dumps({"kind": kind})).encode())
            self.wfile.flush()
            while True:
                try:
                    payload = q.get(timeout=20)
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue
                target = payload.get("target")
                if target:
                    if target[0] == "pegawai":
                        if kind != "pegawai" or (target[1] and target[1] != ref):
                            continue
                    elif target[0] == "member":
                        if kind != "member" or target[1] != ref:
                            continue
                    elif target[0] == "admin":
                        if kind != "admin":
                            continue
                self.wfile.write(realtime.serialize(payload).encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            realtime.unsubscribe(q)
            self.close_connection = True

    # ------------------------------------------------------------------ verbs
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/stream":
            ctx = Ctx(self, "GET", parsed.path, {k: v[0] for k, v in parse_qs(parsed.query).items()}, {})
            return self._sse(ctx)
        if parsed.path.startswith("/api/"):
            return self._api("GET", parsed)
        return self._static(parsed.path)

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        return self._api("POST", parsed)

    def do_PATCH(self):
        parsed = urlparse(self.path)
        return self._api("PATCH", parsed)

    def do_PUT(self):
        parsed = urlparse(self.path)
        return self._api("PUT", parsed)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        return self._api("DELETE", parsed)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _api(self, method, parsed):
        body = self._read_body() if method in ("POST", "PATCH", "PUT") else {}
        ctx = Ctx(self, method, parsed.path, {k: v[0] for k, v in parse_qs(parsed.query).items()}, body)
        try:
            result, _ = api.dispatch(ctx)
            if result is None:
                return self._json(404, {"error": "Endpoint tidak ditemukan."}, ctx._cookies)
            if isinstance(result, dict) and "__file__" in result:
                blob = result["__file__"]
                self.send_response(200)
                self.send_header("Content-Type", result.get("content_type", "application/pdf"))
                self.send_header("Content-Disposition", 'attachment; filename="%s"' % result.get("filename", "laporan.pdf"))
                self.send_header("Content-Length", str(len(blob)))
                for h in ctx._cookies:
                    self.send_header("Set-Cookie", h)
                self.end_headers()
                self.wfile.write(blob)
                return
            return self._json(200, result, ctx._cookies)
        except api.ApiError as exc:
            return self._json(exc.status, {"error": exc.message}, ctx._cookies)
        except ValueError as exc:
            return self._json(400, {"error": str(exc)}, ctx._cookies)
        except Exception as exc:  # pragma: no cover - defensive
            traceback.print_exc()
            return self._json(500, {"error": "Terjadi kesalahan di server: %s" % exc}, ctx._cookies)


def main():
    db.init()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print("\n  Aroma Jiwa Hadir")
    print("  Aplikasi berjalan di http://localhost:%d" % PORT)
    print("  Portal admin  : http://localhost:%d/#/admin" % PORT)
    print("  Login pegawai : 081234560001 / aroma123")
    print("  PIN admin     : 2727\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
        server.shutdown()


if __name__ == "__main__":
    main()
