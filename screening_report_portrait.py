"""Validate optional, transient PDF image bytes. Never fetch a supplied URL."""
import base64
import binascii
import io
import re
from urllib.parse import urlsplit


def report_portrait(report):
    from PIL import Image, ImageOps
    photo = report.get('reportPortrait')
    if not isinstance(photo, dict) or photo.get('status') != 'available':
        return None
    provider = (report.get('research') or {}).get('opensanctions') or {}
    if provider.get('status') != 'completed' or provider.get('atLimit') or report.get('query', {}).get('type') == 'entity':
        return None
    candidates = [c for c in provider.get('candidates', []) if c.get('schema') == 'Person'
                  and c.get('id') and 'opensanctions:' + c['id'] == photo.get('candidateId')]
    if len(candidates) != 1 or report.get('decisions', {}).get(photo['candidateId'], {}).get('status') == 'dismissed':
        return None
    candidate = candidates[0]
    qids = set(q for q in candidate.get('wikidataIds', []) if isinstance(q, str) and re.fullmatch(r'Q[1-9][0-9]{0,17}', q))
    if qids != {photo.get('wikidataId')} or not photo.get('artist') or not photo.get('license'):
        return None
    try:
        source = urlsplit(photo.get('sourceUrl', ''))
        if source.scheme != 'https' or source.netloc != 'commons.wikimedia.org' or not source.path.startswith('/wiki/File:'):
            return None
        encoded = photo.get('imageData', '')
        if not isinstance(encoded, str) or len(encoded) > 800_000 or not encoded.startswith('data:image/jpeg;base64,'):
            return None
        raw = base64.b64decode(encoded.split(',', 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.format != 'JPEG' or image.width * image.height > 1_048_576 or max(image.size) > 1024:
                return None
            image.load()
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((512, 512))
            output = io.BytesIO()
            image.save(output, format='JPEG', quality=90)
            width, height = image.size
        # Strip arbitrary metadata; candidate name comes from the provider record.
        result = {k: str(photo.get(k) or '')[:800] for k in ('artist', 'license', 'licenseURL', 'sourceUrl', 'checkedAt')}
        return {**result, 'candidateName': candidate.get('name', ''), 'candidateId': photo['candidateId'],
                'wikidataUrl': 'https://www.wikidata.org/wiki/' + photo['wikidataId'],
                'bytes': output.getvalue(), 'width': width, 'height': height}
    except (ValueError, TypeError, OSError, binascii.Error, Image.DecompressionBombError):
        return None
