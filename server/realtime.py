"""Tiny in-process pub/sub used by the SSE endpoint."""
import json
import queue
import threading

_lock = threading.Lock()
_subscribers = []


def subscribe():
    q = queue.Queue(maxsize=50)
    with _lock:
        _subscribers.append(q)
    return q


def unsubscribe(q):
    with _lock:
        if q in _subscribers:
            _subscribers.remove(q)


def publish(event, data, target=None):
    """target: None (all) or ('member', id) / ('pegawai', id) / ('admin',)"""
    payload = {"event": event, "data": data, "target": target}
    with _lock:
        subs = list(_subscribers)
    for q in subs:
        try:
            q.put_nowait(payload)
        except queue.Full:
            pass


def serialize(payload):
    return "event: %s\ndata: %s\n\n" % (payload["event"], json.dumps(payload["data"], ensure_ascii=False))
