"""Verified HTTPS and safe public diagnostics for official-source failures."""
import errno
import http.client
import socket
import ssl
import urllib.error
import xml.etree.ElementTree as ET
import json
import zipfile


# Public diagnostics are deliberately categorical. Never copy exception text,
# request URLs, headers, payloads or local file paths into these receipts.
DIAGNOSTICS = {
    'tls': ('The secure connection could not be verified. Check the local certificate configuration before retrying.', False),
    'dns': ('The source hostname could not be resolved. The background refresh will retry.', True),
    'timeout': ('The official source reached its time limit. The background refresh will retry.', True),
    'network': ('The connection to the official source was interrupted or unavailable. The background refresh will retry.', True),
    'http': ('The official source returned an unsuccessful HTTP response.', False),
    'parser': ('The official file could not be validated or read. The last valid snapshot is retained.', False),
    'local_index': ('The downloaded list could not be prepared for local matching. This source needs attention.', False),
    'local_storage': ('The verified list could not be saved locally. Check local disk access and space.', False),
    'cancelled': ('The source refresh was stopped. No incomplete download was published.', False),
    'unknown': ('The source refresh failed before it produced a valid snapshot. This source needs attention.', False),
}


class SourceStorageError(OSError):
    """A local public-download cache could not be written."""


class SourceRefreshCancelled(ValueError):
    def __init__(self):
        super().__init__('Source check stopped')


def verified_context():
    # A fresh context per connection avoids sharing native verification state
    # between concurrent source workers. Hostname and chain checks stay required.
    try:
        import truststore
    except ImportError:
        return ssl.create_default_context()
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


def safe_source_diagnostic(value):
    """Allowlist even persisted diagnostics: no untrusted exception prose."""
    if not isinstance(value, dict) or value.get('category') not in DIAGNOSTICS:
        return None
    category = value['category']
    message, retryable = DIAGNOSTICS[category]
    result = {'category': category, 'message': message, 'retryable': retryable}
    status = value.get('httpStatus')
    if category == 'http' and type(status) is int and 100 <= status <= 599:
        result['httpStatus'] = status
        result['message'] = f'The official source returned HTTP {status}. This check is incomplete.'
        result['retryable'] = status in (408, 429) or 500 <= status <= 599
    number = value.get('errno')
    if type(number) is int and number in {errno.ECONNRESET, errno.ECONNREFUSED, errno.ECONNABORTED, errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ETIMEDOUT, errno.ENOSPC, errno.EACCES, errno.EPERM}:
        result['errno'] = number
    return result


def source_diagnostic(exc, stage='download'):
    """Classify nested urllib errors without publishing the exception string."""
    chain, seen = [], set()
    current = exc
    while isinstance(current, BaseException) and id(current) not in seen and len(chain) < 8:
        seen.add(id(current)); chain.append(current)
        current = getattr(current, 'reason', None) or current.__cause__ or current.__context__
    category, status, number = 'unknown', None, None
    if any(isinstance(e, SourceRefreshCancelled) for e in chain):
        category = 'cancelled'
    elif any(isinstance(e, SourceStorageError) for e in chain):
        category = 'local_storage'
    elif stage in ('local_index', 'local_storage'):
        category = stage
    elif any(isinstance(e, ssl.SSLError) for e in chain):
        category = 'tls'
    elif any(isinstance(e, socket.gaierror) for e in chain):
        category = 'dns'
    elif any(isinstance(e, TimeoutError) for e in chain):
        category = 'timeout'
    elif any(isinstance(e, urllib.error.HTTPError) for e in chain):
        category = 'http'
        status = next(e.code for e in chain if isinstance(e, urllib.error.HTTPError))
    elif any(isinstance(e, (http.client.IncompleteRead, ConnectionError, urllib.error.URLError, OSError)) for e in chain):
        category = 'network'
    elif any(isinstance(e, (ET.ParseError, json.JSONDecodeError, zipfile.BadZipFile, UnicodeError, ValueError, KeyError, StopIteration)) for e in chain) or stage == 'parser':
        category = 'parser'
    # These are our own fixed budget errors, not general ValueError prose.
    if category == 'parser' and any(isinstance(e, ValueError) and str(e) in {
        'Source exceeded download size/time budget',
        'Official download exceeded its time limit before the complete file arrived.'
    } for e in chain):
        category = 'timeout'
    for error in chain:
        if isinstance(error, OSError) and type(error.errno) is int:
            number = error.errno
    return safe_source_diagnostic({'category': category, 'httpStatus': status, 'errno': number})


def source_error(exc):
    # Existing adapters use fixed validation messages; keep that compatibility.
    # New refresh receipts use source_diagnostic exclusively and retain no prose.
    diagnosis = source_diagnostic(exc)
    if diagnosis['category'] in ('tls', 'dns', 'timeout', 'http', 'network', 'cancelled'):
        return diagnosis['message']
    if isinstance(exc, ValueError):
        return str(exc)[:240]
    return 'The official source could not be downloaded or read. This check is incomplete; retry it.'
