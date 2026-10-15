#!/usr/bin/env python3
"""Offline/direct tests only: no localhost requests, browser or provider credentials."""
import copy
import io
import json
import sys
import tempfile
import threading
import time
import unittest
from email.message import Message
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from screening_research import (DEFAULT_MODEL, JOB_TTL, JOB_TIMEOUT, MAX_JOBS, MAX_OUTPUT_TOKENS,
    MAX_TOOL_CALLS, OpenAIProvider, ResearchError, ResearchService, build_payload,
    parse_response, safe_url, validate_model, validate_query, identity_evidence, canonical_url)
from serve import Handler, allowed_request, static_file

QUERY = {"name": "Example Office Client", "type": "person", "country": "Cyprus", "dob": "1980-01-01"}
FIXTURE_KEY = "fixture-only-not-a-real-provider-key"


def sourced(text="Official record found [source]", url="https://regulator.example.org/record"):
    return {"status": "completed", "output": [
        {"type": "web_search_call", "status": "completed", "action": {"type": "search", "sources": [{"type": "url", "url": url}]}},
        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": text + '\n<identity_evidence>' + json.dumps({"status":"unresolved","candidate":"Example candidate","reason":"Name-only lead", "anchors":[],"conflicts":[],"missing":["Birth date"]}) + '</identity_evidence>',
            "annotations": [{"type": "url_citation", "url": url, "title": "Official record", "start_index": text.index("[source]"), "end_index": len(text)}]}]}],
        "usage": {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30}}


class FakeProvider:
    def __init__(self, responses=None, event=None, release=None):
        self.responses = responses or [sourced() for _ in range(3)]
        self.calls = []
        self.verifications = []
        self.event, self.release = event, release
    def verify(self, key, model):
        self.verifications.append((key, model))
    def research(self, key, payload, timeout):
        self.calls.append((key, payload, timeout))
        if self.event:
            self.event.set()
            self.release.wait(2)
        response = self.responses[len(self.calls) - 1]
        if isinstance(response, Exception):
            raise response
        return copy.deepcopy(response)


def completed_official(query,event,publish):
    from screening_official import initial_checks
    checks=[{**c,'status':'completed','matchCount':0,'checkedAt':'2026-10-12T12:00:00Z'} for c in initial_checks()]
    for check in checks: publish(check)
    return checks


def service(provider=None, **kwargs):
    kwargs.setdefault('official_checker',completed_official)
    return ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=provider or FakeProvider(), env={"OPENAI_API_KEY": FIXTURE_KEY}, **kwargs)


def headers(**items):
    value = Message()
    for key, val in {"Host": "127.0.0.1:4176", **items}.items():
        value[key.replace("_", "-")] = val
    return value


class QueryTests(unittest.TestCase):
    def test_normalization_and_field_minimization(self):
        q = validate_query({**QUERY, "name": "  Example Office Client ", "apiKey": "ignore", "projectId": "local"})
        self.assertEqual(q, QUERY)
    def test_invalid_subjects(self):
        for value in (None, [], {}, {"name": "x"}, {"name": "123"}, {"name": "A\nB"}, {"name": "x" * 181}, {"name": "Valid", "country": []}, {"name": "Valid", "type": "vessel"}):
            with self.subTest(value=value), self.assertRaises(ResearchError):
                validate_query(value)
    def test_dates(self):
        for value in ("2000-02-31", "19800101", "2100-01-01", "2000-2-1"):
            with self.subTest(value=value), self.assertRaises(ResearchError):
                validate_query({**QUERY, "dob": value})
        self.assertEqual(validate_query({**QUERY, "dob": "2000-02-29"})["dob"], "2000-02-29")
    def test_model_validation(self):
        self.assertEqual(validate_model(DEFAULT_MODEL), DEFAULT_MODEL)
        for model in (None, "", "../secret", "gpt\nAuthorization", "x" * 101):
            with self.subTest(model=model), self.assertRaises(ResearchError):
                validate_model(model)
    def test_urls(self):
        for value in ("javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com", "https://127.0.0.1/test", "http://localhost/x", "https://10.0.0.1/", "https://thing.internal/a", "https://example.com:999/a", "https://example.com/a\nb"):
            with self.subTest(value=value): self.assertEqual(safe_url(value), "")
        self.assertEqual(safe_url("https://www.gov.uk/example?q=a%20b"), "https://www.gov.uk/example?q=a%20b")


class ParseTests(unittest.TestCase):
    def test_actual_search_and_citations(self):
        value = parse_response(sourced())
        self.assertEqual(value["status"], "completed")
        self.assertEqual(value["webSearchCalls"], 1)
        self.assertEqual(len(value["sources"]), 1)
        self.assertEqual(value["sources"][0]["title"], "Official record")
    def test_no_search_never_completed(self):
        fixture = sourced()
        fixture["output"].pop(0)
        self.assertEqual(parse_response(fixture)["status"], "partial")
    def test_failed_search_never_completed(self):
        fixture = sourced()
        fixture["output"][0]["status"] = "failed"
        value = parse_response(fixture)
        self.assertEqual(value["status"], "partial")
        self.assertEqual(value["completedWebSearchCalls"], 0)
    def test_citations_are_not_counted_as_tool_sources(self):
        fixture = sourced()
        fixture["output"].pop(0)
        value = parse_response(fixture)
        self.assertEqual(value["sources"], [])
        self.assertEqual(len(value["citations"]), 1)
    def test_no_citation_never_completed(self):
        fixture = sourced()
        fixture["output"][1]["content"][0]["annotations"] = []
        self.assertEqual(parse_response(fixture)["status"], "partial")
    def test_unsafe_and_invalid_citations_removed(self):
        fixture = sourced()
        annotations = fixture["output"][1]["content"][0]["annotations"]
        annotations.extend([{**annotations[0], "url": "javascript:evil()"}, {**annotations[0], "start_index": -1}, {**annotations[0], "end_index": 100000}])
        self.assertEqual(len(parse_response(fixture)["citations"]), 1)
    def test_citation_offsets_are_utf16_across_parts(self):
        fixture = sourced("👤 Official record [source]")
        first = fixture["output"][1]["content"][0]
        fixture["output"][1]["content"].append(copy.deepcopy(first))
        value = parse_response(fixture)
        expected = len("👤 Official record ".encode("utf-16-le")) // 2
        self.assertEqual(value["citations"][0]["start"], expected)
        self.assertEqual(value["citations"][1]["start"], expected + len(first["text"].encode("utf-16-le")) // 2 + 2)
    def test_incomplete_and_refusal(self):
        fixture = sourced()
        fixture["status"] = "incomplete"
        fixture["output"][1]["content"].append({"type": "refusal", "refusal": "Cannot answer"})
        self.assertEqual(len(parse_response(fixture)["warnings"]), 2)
    def test_no_reasoning_or_raw_provider_data_leaks(self):
        fixture = sourced()
        fixture["output"].insert(0, {"type": "reasoning", "summary": [{"text": "private internal content"}]})
        fixture["apiKey"] = FIXTURE_KEY
        value = json.dumps(parse_response(fixture))
        self.assertNotIn("private internal", value)
        self.assertNotIn(FIXTURE_KEY, value)


class JobTests(unittest.TestCase):
    def test_connection_verification_and_secret_free_status(self):
        provider = FakeProvider()
        s = ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=provider, env={})
        self.assertFalse(s.status()["configured"])
        status = s.connect({"apiKey": FIXTURE_KEY, "model": DEFAULT_MODEL})
        self.assertTrue(status["verified"])
        self.assertEqual(len(provider.verifications), 1)
        self.assertNotIn(FIXTURE_KEY, json.dumps(status))
        self.assertFalse(s.disconnect()["configured"])
    def test_unconfigured_cannot_run(self):
        s = ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=FakeProvider(), env={})
        with self.assertRaises(ResearchError) as caught: s.start({"query": QUERY}, background=False)
        self.assertEqual(caught.exception.status, 503)
    def test_three_real_bounded_sequential_scopes(self):
        provider = FakeProvider()
        s = service(provider)
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "completed")
        self.assertEqual(job["completedPhases"], 3)
        self.assertEqual(job["sourceCount"], 1)
        self.assertEqual(job["toolCalls"], 3)
        self.assertEqual(len(provider.calls), 3)
        for _, payload, timeout in provider.calls:
            self.assertFalse(payload["store"])
            self.assertEqual(payload["tool_choice"], "required")
            self.assertTrue(payload["tools"][0]["external_web_access"])
            self.assertEqual(payload["max_tool_calls"], MAX_TOOL_CALLS)
            self.assertEqual(payload["max_output_tokens"], MAX_OUTPUT_TOKENS)
            self.assertLessEqual(timeout, 180)
        self.assertIn("Official record found", provider.calls[1][1]["input"])
        self.assertIn("untrusted", provider.calls[2][1]["input"])
        self.assertNotIn(FIXTURE_KEY, json.dumps(job))
    def test_partial_preserves_completed_findings(self):
        s = service(FakeProvider([sourced(), ResearchError("Timeout", 504), sourced()]))
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "partial")
        self.assertEqual([p["status"] for p in job["phases"]], ["completed", "failed", "completed"])
    def test_auth_failure_stops_billable_calls(self):
        provider = FakeProvider([ResearchError("Key rejected", 401)])
        s = service(provider)
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "partial")
        self.assertEqual(job["officialStatus"], "completed")
        self.assertEqual(len(provider.calls), 1)
    def test_missing_search_evidence_does_not_report_completed(self):
        fixture = sourced(); fixture["output"].pop(0)
        s = service(FakeProvider([fixture] * 3))
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "partial")
        self.assertEqual(job["completedPhases"], 0)
    def test_cancellation_race_discards_provider_result(self):
        entered, release = threading.Event(), threading.Event()
        provider = FakeProvider(event=entered, release=release)
        s = service(provider)
        job_id = s.start({"query": QUERY})["id"]
        self.assertTrue(entered.wait(1))
        self.assertEqual(s.cancel(job_id)["status"], "cancelled")
        with self.assertRaises(ResearchError) as caught: s.start({"query": QUERY})
        self.assertEqual(caught.exception.status, 409)
        release.set()
        deadline = time.monotonic() + 2
        while s.status()["activeJobId"] and time.monotonic() < deadline: time.sleep(.01)
        job = s.get(job_id)
        self.assertEqual(job["status"], "cancelled")
        self.assertEqual(job["sourceCount"], 0)
        self.assertEqual(len(provider.calls), 1)
    def test_cancel_before_worker_starts_does_not_reopen_checks(self):
        entered, release = threading.Event(), threading.Event()
        calls = []
        class DelayedStart(ResearchService):
            def _run(self, *args):
                entered.set()
                release.wait(2)
                super()._run(*args)
        def official(*args):
            calls.append("official")
            return completed_official(*args)
        s = DelayedStart(provider=FakeProvider(), env={}, official_checker=official,
                        worldbank_checker=lambda *a: calls.append("worldbank"))
        job_id = s.start({"query": QUERY, "mode": "search"})["id"]
        self.assertTrue(entered.wait(1))
        stopped = s.cancel(job_id)
        release.set()
        deadline = time.monotonic() + 2
        while s.status()["activeJobId"] and time.monotonic() < deadline: time.sleep(.01)
        final = s.get(job_id)
        self.assertEqual(final["status"], "cancelled")
        self.assertEqual(final["officialStatus"], "cancelled")
        self.assertEqual(final, stopped)
        self.assertEqual(calls, [])
        self.assertIsNone(s.status()["activeJobId"])
    def test_disconnect_cancels_without_returning_key(self):
        entered, release = threading.Event(), threading.Event()
        s = service(FakeProvider(event=entered, release=release))
        job_id = s.start({"query": QUERY})["id"]
        self.assertTrue(entered.wait(1))
        status = s.disconnect()
        release.set()
        self.assertFalse(status["configured"])
        self.assertEqual(s.get(job_id)["status"], "cancelled")
        self.assertNotIn(FIXTURE_KEY, json.dumps(status))
    def test_connection_verification_cannot_replace_running_connection(self):
        entered, release, running, finish = [threading.Event() for _ in range(4)]
        class Blocking(FakeProvider):
            def verify(self, key, model):
                entered.set(); release.wait(2)
            def research(self, key, payload, timeout):
                running.set(); finish.wait(2); return sourced()
        s = service(Blocking())
        errors = []
        def connect():
            try: s.connect({"apiKey": "second-fixture-key-not-real", "model": "other-model"})
            except ResearchError as exc: errors.append(exc.status)
        thread = threading.Thread(target=connect); thread.start()
        self.assertTrue(entered.wait(1))
        job_id = s.start({"query": QUERY})["id"]
        self.assertTrue(running.wait(1)); release.set(); thread.join(1)
        self.assertEqual(errors, [409])
        self.assertEqual(s.status()["model"], DEFAULT_MODEL)
        s.cancel(job_id); finish.set()
    def test_overall_job_deadline_stops_remaining_phases(self):
        clock = [100.]
        class Slow(FakeProvider):
            def research(self, key, payload, timeout):
                clock[0] += JOB_TIMEOUT + 1
                return sourced()
        s = service(Slow(), clock=lambda: clock[0])
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "partial")
        self.assertEqual([p["status"] for p in job["phases"]], ["completed", "failed", "failed"])
    def test_jobs_expire_and_history_is_bounded(self):
        clock = [100.]
        class Endless(FakeProvider):
            def research(self, key, payload, timeout): return sourced()
        s = service(Endless(), clock=lambda: clock[0])
        ids = [s.start({"query": QUERY}, background=False)["id"] for _ in range(MAX_JOBS + 1)]
        with self.assertRaises(ResearchError): s.get(ids[0])
        self.assertEqual(s.get(ids[-1])["status"], "completed")
        clock[0] += JOB_TTL + 1
        with self.assertRaises(ResearchError): s.get(ids[-1])
    def test_job_responses_are_copies(self):
        s = service()
        job_id = s.start({"query": QUERY}, background=False)["id"]
        value = s.get(job_id); value["query"]["name"] = "mutation"
        self.assertEqual(s.get(job_id)["query"]["name"], QUERY["name"])
    def test_unexpected_provider_errors_are_not_exposed(self):
        s = service(FakeProvider([RuntimeError(FIXTURE_KEY)]))
        job = s.get(s.start({"query": QUERY}, background=False)["id"])
        self.assertEqual(job["status"], "failed")
        self.assertNotIn(FIXTURE_KEY, json.dumps(job))



class IdentityEvidenceTests(unittest.TestCase):
    def phase(self, status="unresolved", anchors=None, conflicts=None, candidate="Example candidate"):
        parsed = parse_response(sourced())
        parsed["text"] = parsed["text"].split("<identity_evidence>")[0] + '<identity_evidence>' + json.dumps({"status":status,"candidate":candidate,"reason":"Evidence assessment","anchors":anchors or [],"conflicts":conflicts or [],"missing":[]}) + '</identity_evidence>'
        return parsed
    def test_missing_structured_identity_remains_partial(self):
        parsed = parse_response(sourced()); parsed["text"] = "Plausible narrative [source]"
        result = identity_evidence(parsed, QUERY, [])
        self.assertEqual(result["identity"]["status"], "unresolved")
        self.assertEqual(result["status"], "partial")
    def test_name_or_country_alone_never_confirms_identity(self):
        for anchors in ([], [{"field":"country","value":"Cyprus","url":"https://regulator.example.org/record"}]):
            result = identity_evidence(self.phase("corroborated", anchors), QUERY, [])
            self.assertEqual(result["identity"]["status"], "unresolved")
            self.assertEqual(result["status"], "partial")
    def test_company_downgrade_removes_confident_reason_and_summary(self):
        parsed = self.phase("corroborated")
        structured = json.loads(parsed["text"].split('<identity_evidence>')[1].split('</identity_evidence>')[0])
        structured["reason"] = "This is a confirmed identity match."
        structured["summary"] = {"finding":"Strong identity match to the client.", "relevance":"subject", "sourceUrls":["https://regulator.example.org/record"], "nextStep":"Review registration."}
        parsed["text"] = parsed["text"].split("<identity_evidence>")[0] + "<identity_evidence>" + json.dumps(structured) + "</identity_evidence>"
        result = identity_evidence(parsed, {"name":"Example Company", "type":"entity", "country":"China"}, [])
        self.assertEqual(result["identity"]["status"], "unresolved")
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["summary"]["relevance"], "candidate")
        self.assertEqual(result["summary"]["finding"], result["identity"]["reason"])
        self.assertNotIn("Strong identity", result["summary"]["finding"])
        self.assertIn("registration identifier", result["summary"]["finding"])
    def test_dob_requires_supplied_value_and_cited_url(self):
        for anchor in ({"field":"dob","value":"1981-01-01","url":"https://regulator.example.org/record"}, {"field":"dob","value":QUERY["dob"],"url":"https://invented.example.org/record"}):
            result=identity_evidence(self.phase("corroborated", [anchor]), QUERY, [])
            self.assertEqual(result["identity"]["status"], "unresolved")
    def test_exact_dob_is_candidate_corroboration_not_client_confirmation(self):
        anchor={"field":"dob","value":QUERY["dob"],"url":"https://regulator.example.org/record"}
        result=identity_evidence(self.phase("corroborated", [anchor]), QUERY, [])
        self.assertEqual(result["identity"]["status"], "corroborated")
        self.assertTrue(result["identity"]["humanReviewRequired"])
        self.assertNotIn("identity_evidence", result["text"])
    def test_later_phase_cannot_upgrade_unresolved_or_change_candidates(self):
        anchor={"field":"dob","value":QUERY["dob"],"url":"https://regulator.example.org/record"}
        for baseline in ({"status":"unresolved","candidate":"Example candidate"},{"status":"corroborated","candidate":"Another person"}):
            result=identity_evidence(self.phase("corroborated", [anchor]), QUERY, [{"identity":baseline}])
            self.assertEqual(result["identity"]["status"], "unresolved")
            self.assertTrue(any("withheld" in w for w in result["warnings"]))
    def test_conflicts_override_confidence(self):
        result=identity_evidence(self.phase("corroborated",conflicts=["Birth dates differ"]),QUERY,[])
        self.assertEqual(result["identity"]["status"], "conflicting")
    def test_tracking_variants_and_search_only_sources_are_not_evidence_counts(self):
        fixture=sourced(); fixture["output"][0]["action"]["sources"] += [{"url":"https://regulator.example.org/record?utm_source=openai"},{"url":"https://regulator.example.org/lead"}]
        s=service(FakeProvider([fixture]*3)); job=s.get(s.start({"query":QUERY},background=False)["id"])
        self.assertEqual(job["citedSourceCount"],1)
        self.assertEqual(job["searchResultCount"],2)
        self.assertEqual(job["uncitedSearchResultCount"],1)
        self.assertEqual(len(job["requestedPortals"]),9)
    def test_expensive_models_cannot_run_as_fallback(self):
        provider=FakeProvider(); s=ResearchService(worldbank_checker=lambda *a:{'status':'completed','totalResults':0,'candidates':[]}, provider=provider, env={"OPENAI_API_KEY":FIXTURE_KEY,"NEOLAW_RESEARCH_MODEL":"gpt-6-astra"})
        with self.assertRaises(ResearchError): s.start({"query":QUERY},background=False)
        self.assertEqual(provider.calls,[])
    def test_prompt_carries_five_portals_and_fixed_budget(self):
        payload=build_payload(QUERY,"identity",[],DEFAULT_MODEL)
        for host in ('sanctionsmap.eu','sanctionssearch.ofac.treas.gov','main.un.org','search-uk-sanctions-list.service.gov.uk','stratlink.meci.gov.cy'):
            self.assertIn(host,payload["instructions"])
        self.assertEqual(payload["reasoning"]["effort"],"low")

class TransportTests(unittest.TestCase):
    def test_direct_fixed_host_and_no_redirects(self):
        received = []
        class Response:
            status = 200
            def read(self, limit): return b'{"id":"gpt-6-luna","object":"model"}'
        class Connection:
            sock = None
            def __init__(self, host, timeout): received.append((host, timeout))
            def request(self, method, path, body, headers): received.append((method, path, headers))
            def getresponse(self): return Response()
            def close(self): pass
        OpenAIProvider(connection_factory=Connection).verify(FIXTURE_KEY, DEFAULT_MODEL)
        self.assertEqual(received[0][0], "api.openai.com")
        self.assertEqual(received[1][1], "/v1/models/gpt-6-luna")
    def test_provider_errors_do_not_expose_body(self):
        class Response:
            status = 401
            def read(self, limit): raise AssertionError("Error body must not be read")
        class Connection:
            sock = None
            def __init__(self, *args, **kwargs): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        with self.assertRaises(ResearchError) as caught:
            OpenAIProvider(connection_factory=Connection).verify(FIXTURE_KEY, DEFAULT_MODEL)
        self.assertEqual(caught.exception.status, 401)
        self.assertNotIn(FIXTURE_KEY, str(caught.exception))
    def test_wall_clock_watchdog_interrupts_slow_reader(self):
        stopped = threading.Event()
        class Socket:
            def settimeout(self, value): pass
            def shutdown(self, how): stopped.set()
        class Response:
            status = 200
            def read(self, limit):
                stopped.wait(1)
                return b"{}"
        class Connection:
            sock = Socket()
            def __init__(self, *args, **kwargs): pass
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): stopped.set()
        with self.assertRaises(ResearchError) as caught:
            OpenAIProvider(connection_factory=Connection)._request("/responses", FIXTURE_KEY, {}, timeout=.02)
        self.assertEqual(caught.exception.status, 504)
        self.assertTrue(stopped.is_set())


class ServerBoundaryTests(unittest.TestCase):
    def test_entry_page_navigation_from_another_site(self):
        for host in ("127.0.0.1:4176", "localhost:4176"):
            for site in ("cross-site", "same-site"):
                value = headers(Host=host, Sec_Fetch_Site=site,
                                Sec_Fetch_Mode="navigate", Sec_Fetch_Dest="document")
                with self.subTest(host=host, site=site):
                    self.assertTrue(allowed_request(value, api=False))
                    self.assertFalse(allowed_request(value, api=True))
                    self.assertFalse(allowed_request(value, mutation=True))
        for override in ({"Host": "evil.example:4176"}, {"Origin": "https://evil.example"},
                         {"Origin": "null"}, {"Sec_Fetch_Mode": "cors"},
                         {"Sec_Fetch_Mode": "no-cors"}, {"Sec_Fetch_Dest": "iframe"},
                         {"Sec_Fetch_Dest": "script"}, {"Sec_Fetch_Dest": "empty"}):
            value = headers(**{"Sec_Fetch_Site": "cross-site", "Sec_Fetch_Mode": "navigate",
                               "Sec_Fetch_Dest": "document", **override})
            with self.subTest(override=override):
                self.assertFalse(allowed_request(value, api=False))
        duplicate = headers(Sec_Fetch_Site="cross-site", Sec_Fetch_Mode="navigate", Sec_Fetch_Dest="document")
        duplicate["Host"] = "evil.example"
        self.assertFalse(allowed_request(duplicate, api=False))

    def test_navigation_exception_is_only_for_the_entry_page(self):
        # Exercise the real HTTP handler over an in-memory socket, without a
        # browser, network requests, provider access or application credentials.
        class Request:
            def __init__(self, data):
                self.input = io.BytesIO(data)
                self.output = bytearray()
            def makefile(self, *args, **kwargs): return self.input
            def settimeout(self, value): pass
            def sendall(self, data): self.output.extend(data)

        def response(method, path, site="cross-site", origin=None):
            lines = [f"{method} {path} HTTP/1.0", "Host: 127.0.0.1:4176",
                     f"Sec-Fetch-Site: {site}", "Sec-Fetch-Mode: navigate", "Sec-Fetch-Dest: document"]
            if origin is not None: lines.append(f"Origin: {origin}")
            request = Request(("\r\n".join(lines) + "\r\n\r\n").encode())
            Handler(request, ("127.0.0.1", 12345), object())
            return bytes(request.output)

        for method in ("GET", "HEAD"):
            for path in ("/", "/index.html", "/?from=chat"):
                with self.subTest(method=method, path=path):
                    result = response(method, path)
                    self.assertIn(b" 200 ", result.split(b"\r\n", 1)[0])
                    self.assertIn(b"X-Frame-Options: DENY", result)
                    body = result.split(b"\r\n\r\n", 1)[1]
                    if method == "GET": self.assertIn(b"NeoLaw", body)
                    else: self.assertEqual(body, b"")
            for path in ("/api/research/status", "/api/opensanctions/status", "/api/screening/index",
                         "/api/research/jobs/" + "a" * 32, "/app.js", "/data/screening-sources.json", "/serve.py"):
                with self.subTest(method=method, path=path):
                    self.assertIn(b" 403 ", response(method, path).split(b"\r\n", 1)[0])
        self.assertIn(b" 200 ", response("GET", "/app.js", site="same-origin").split(b"\r\n", 1)[0])
        self.assertIn(b" 404 ", response("GET", "/serve.py", site="same-origin").split(b"\r\n", 1)[0])
        for path in ("/", "/api/research/connect", "/api/research/start"):
            self.assertIn(b" 403 ", response("POST", path).split(b"\r\n", 1)[0])
            self.assertIn(b" 403 ", response("POST", path, origin="http://127.0.0.1:4176").split(b"\r\n", 1)[0])

    def test_same_origin_guards(self):
        self.assertTrue(allowed_request(headers(), api=True))
        self.assertTrue(allowed_request(headers(Origin="http://127.0.0.1:4176", Sec_Fetch_Site="same-origin"), mutation=True))
        for value in (headers(Host="evil.example:4176"), headers(Origin="https://evil.example"), headers(Sec_Fetch_Site="cross-site"), headers(Sec_Fetch_Site="same-site")):
            self.assertFalse(allowed_request(value, api=True))
        self.assertFalse(allowed_request(headers(), mutation=True))
        duplicate = headers(); duplicate["Host"] = "evil.example"
        self.assertFalse(allowed_request(duplicate))
    def test_public_files_only(self):
        self.assertEqual(static_file("/"), ROOT / "index.html")
        self.assertEqual(static_file("/assets/nda-reviewed-demo.docx"), ROOT / "assets/nda-reviewed-demo.docx")
        self.assertIsNone(static_file("/assets/other.docx"))
        self.assertEqual(static_file("/modules/screening.js"), ROOT / "modules/screening.js")
        self.assertEqual(static_file("/data/screening-sources.json"), ROOT / "data/screening-sources.json")
        for path in ("/.env", "/serve.py", "/screening_research.py", "/scripts/check-screening-research.py", "/outputs/report.json", "/modules/../serve.py", "/modules/%2e%2e/serve.py", "/data/SCREENING-SOURCES.md", "/modules/", "/modules/%00.js", "/.git/config"):
            with self.subTest(path=path): self.assertIsNone(static_file(path))
    def test_symlink_is_not_served(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / "modules").mkdir()
            (root / "secret.js").write_text("secret")
            (root / "modules" / "leak.js").symlink_to(root / "secret.js")
            self.assertIsNone(static_file("/modules/leak.js", root))
    def test_json_body_limits_and_validation(self):
        handler = object.__new__(Handler)
        handler.headers = headers(Content_Type="application/json", Content_Length="2")
        handler.rfile = io.BytesIO(b"{}")
        self.assertEqual(handler._body(), {})
        for content, length, body in (("text/plain", "2", b"{}"), ("application/json", "90000", b"{}"), ("application/json", "3", b"bad"), ("application/json", "2", b"[]")):
            handler.headers = headers(Content_Type=content, Content_Length=length)
            handler.rfile = io.BytesIO(body)
            with self.assertRaises(ResearchError): handler._body()


if __name__ == "__main__":
    unittest.main(verbosity=2)
