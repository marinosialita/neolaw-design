# NeoLaw workspace showcase

An interactive local design prototype for NeoLaw. The existing teal brand is preserved: `#86c4cd` brand, `#2b6b74` action, `#eef2f2` canvas. No production application was changed.

The presentation frontend can also be deployed to Cloudflare Workers. See [DEPLOYMENT.md](DEPLOYMENT.md) for build settings and the distinction between the hosted presentation and the local Python screening backend.

## Open

Run from this directory:

```sh
.venv/bin/python serve.py
```

Open [the workspace](http://127.0.0.1:4176/#/chat). The server binds only to the local computer. The frontend has no build step. Direct PDF downloads require ReportLab (`python3 -m venv .venv` then `.venv/bin/python -m pip install -r requirements.txt`); use the same Python environment to start the server. Google Fonts loads the typefaces; system fallbacks work offline.

## A five-minute tour

1. **Case Law → search “murder”.** The original NeoLaw start page appears first, with its large search box, court/date filters, search settings and Employment/Property/Contracts suggestions. Suggestions fill the box for review. The local collection contains the first ten real MyNomos results for “φόνος εκ προμελέτης”, in their captured relevance order; unrelated queries can have no matches. Court, date range and sort controls work locally. Connected search modes, depth and AI expansion remain visibly disabled preview controls. Select a result title to open its Greek brief in the right-hand panel, with results still on the left. Brief shows the actual outcome; Decision contains the captured CyLaw judgment text. Source block numbers are local navigation anchors, not official judicial paragraph numbers.
2. **Chat With NeoLaw.** Select “Try a research answer with clickable citations” below the composer. Click a numbered citation to open and highlight its supporting passages beside the answer, without leaving the chat. Source cards open the case brief. Compare cases, ask about evidence, close the reader or reopen it; your conversation stays in place. “Chat” inside Case Law carries the selected case into a new conversation. Older fictional research answers remain in history with a clearly marked link to start a real-case answer.
3. **Chat With NeoLaw → Review a contract → Use an example.** Accept, dismiss and undo marked changes. Try “Change the hourly rate from 80 to 120”. Preview a local text attachment, then return to the sample workspace: your decisions remain saved. Switch to a case citation and back without losing the document’s reading position.
4. **Projects / Document review.** Projects keep chats and files together. The review table compares six fictional agreements, with prepared source excerpts, notes, review marks, filters and CSV export.
5. **Library.** Use Explore the library on chat home to browse in a window while your message and attachments stay in place. Explore ten tools, nine skills, nine prompts and nine workflows. Preview a workflow, then continue in the workspace: the same fictional findings open in the chat and document panel, with your instructions retained separately. Save items, edit launch instructions or create your own reusable prompt. Find active custom prompts through Search workspace and review their instructions before starting. Custom prompts support recoverable deletion and restore.

Other prepared document flows include editing, resolutions, version comparison, translation, pleading checks, chronology, opinion structure and template drafting. Tools open in the same chat/document layout.

The chat research starter shows a ten-second Greek walkthrough with linked legal sources before revealing its prepared answer. Article 203, 204 and 205 citations open the Criminal Code text beside the chat; switch to amendment history or related judgments, then open a verified judgment passage and return to the article. The history is a selected verified record, not a complete legislative timeline. Explicit Case Law searches show a cancellable 2.5-second transition. Murder/premeditation strategies then type for 4.2 seconds before cases appear; Show cases skips ahead, and reduced motion shows results immediately after the initial transition. Existing result routes and source links open immediately. The global header strip has been removed to give the workspace more room.

## What works now

### Screening workspace

Open **Screening** in the sidebar, **Screen a client** in the chat's Tools, or its Library entry. The dedicated workspace searches actual downloaded official sanctions records locally. A name search opens a results list with a right-hand source reader, identity comparison signals, listing details and governing legal-source links where supplied. Review decisions require a reason when confirming or dismissing an identity match. Committed checks, source snapshots and review notes remain in this browser’s IndexedDB history. Save to project links the same report to a selected local project; it does not duplicate or move the evidence. Browser capacity and explicit export/backup still apply.

Both OFAC SDN and non-SDN exports must succeed before OFAC is enabled. Read current record counts and separate retrieval/publication dates from `data/screening-sources.json` and each saved check receipt; static documentation is not a current coverage statement.

#### Live public-source research

The local Python server now includes a real OpenAI Responses API integration. Use **Screening → the small plug button → OpenAI** to enter the office's API key directly into the local connection form. The key is kept only in the server's memory; it is not written to project files, browser storage, logs or reports. Disconnect clears it, and restarting the server requires reconnecting. Alternatively, the server accepts `OPENAI_API_KEY` and optional `NEOLAW_RESEARCH_MODEL` in its process environment. Only `gpt-6-luna` is permitted; the server refuses other configured models and never falls back to a more expensive model. Model availability was verified against the connected account before the local server restart; reconnect to recheck account access. A successful connection checks model access, not research quality.

**Search** checks nine official sources without OpenAI. **Deep search** performs those same checks and then broad web research. The nine official checks are: EU, OFAC, UN and UK publisher datasets, a real Cyprus Stratlink portal search, four BIS export-control lists from the official Trade.gov CSL download, Australia DFAT, Canadian autonomous sanctions (SEMA/JVCFOA), and Switzerland SECO. Datasets verified within one hour are reused with their original retrieval dates; older datasets are refreshed or conditionally validated against the publisher. A failed source remains incomplete. After these checks, Luna researches identity on official domains, then media/proceedings and public ownership/roles on the wider web. The UI distinguishes dataset searches from direct portal searches and retains counts, candidate records and source receipts. It never claims that merely citing a portal completed a check.

The start screen uses two depth choices and one submit button. Choosing a depth does not run research; the selected mode starts only on submission. Optional identifiers and the Deep search connection stay out of the way until needed. Results open with an executive summary of sanctions, identity, relevant findings and next action. Official matches, Evidence and Notes hold the supporting detail. History lives in the header and identifies the search mode and incomplete runs. Detailed findings and the source trail open on demand. Selecting a citation or source opens supporting dossier passages in the right panel, which is hidden when unused. Those passages are clearly marked as AI summaries, not source quotations. Cited sources and other returned search results are counted separately, with tracking URL variants counted once.

New runs use a shared structured identity assessment. Missing identifiers, contradictory candidates, incomplete retrieval or missing assessment blocks remain unresolved or partial. Later stages cannot upgrade an unresolved identity baseline. Legacy saved research stays readable but cannot establish a confirmed identity. Name similarity is never identity confidence.

The search name is sent to Cyprus Stratlink using its public search form. The name, type, optional country/date of birth, bounded public candidate records and earlier research findings are sent to OpenAI and its search service. Matter names, notes, uploaded documents, document identifier numbers and the entire downloaded bundle are not included. `store:false` disables Responses storage; it does not itself guarantee zero provider retention. API and tool usage is billed to the connected account. Runs are bounded to three stages, up to eight tool calls and 7,000 output tokens per stage, with a 180-second phase timeout and 1,200-second overall timeout (including official downloads). Only one provider worker runs at a time. Stop prevents additional phases; an in-flight request may still finish and incur usage.

The server keeps at most ten jobs in memory for two hours; the UI saves returned evidence with local screening history. Reopening an active report resumes polling the same job. A server restart or expired job leaves previously saved findings readable and marks the run interrupted while preserving completed findings; unfinished checks remain incomplete. Browser storage is not shared office storage and has finite capacity; export important evidence.

This public-web investigation is not a Lexis connection, comprehensive PEP dataset, full beneficial-ownership assessment or current sanctions clearance. Both search modes retain the actual status and timestamp of each official check. The official checks require internet access; live checks and AI completion are recorded separately.

Implementation follows the official [OpenAI web-search guide](https://developers.openai.com/api/docs/guides/tools-web-search). `serve.py` binds to loopback, checks Host/Origin/request size and serves only the approved frontend assets. Do not expose this local server publicly.

The main **Download report** action generates a branded, searchable PDF with an executive review, next steps, source coverage, matches, reviewer decisions, research limitations and numbered source references. The report is built locally in memory. The Export menu also retains **Print / Save as PDF**, a PNG summary and the full JSON evidence record. Reports retain incomplete coverage, stale-source warnings, original source identifiers, review decisions and any returned public-web research. Source snapshots older than 48 hours require a refresh. This is not a live Lexis connection or a production compliance engine. Licensed PEP data, comprehensive ownership/control assessment, scheduled list refresh and shared authenticated storage are not connected. Name similarity is not a risk rating or confirmation of identity.

Refresh the official data with `python3 scripts/refresh-screening-data.py`; **Reload source snapshots** in the UI reloads the downloaded files. See [source provenance and refresh notes](data/SCREENING-SOURCES.md). Both Search and Deep search send the search name to Cyprus Stratlink. The other eight official source groups are downloaded and matched locally. Company searches also query the public GLEIF API by recorded name, optional LEI or registration number. Node.js is required on the local server to reuse the same matching engine for official dataset checks.

#### Screening architecture and review invariants

The UI coordinates views; domain modules decide how evidence is interpreted. Keep these boundaries when changing the workspace:

- `screening-research.js` owns job polling, cancellation and retry controls. An accepted terminal receipt is persisted even if its view has closed. Request generations prevent stale polls from replacing newer state.
- `screening-report-state.js` applies a job receipt to the original report without replacing its query, project link, reviewer decisions or notes. It does not access the DOM or storage.
- `screening-match.js` owns candidate restoration and identifier explanations. Each completed source receipt is interpreted separately. Historical candidates are used only where that source lacks its own candidate array; failed or explicit empty receipts cannot resurrect old matches.
- `screening-history.js` owns validated, revision-checked IndexedDB commits. `readForReview()` reads a snapshot without adopting its revision; the view adopts it only after confirming that navigation and unsaved drafts have not changed. A database failure must never produce a “saved” confirmation.
- `screening-review.js` records explicit identity decisions and their reasons. Status values are an allowlist. Match similarity, source counts, political exposure and identity decisions are separate concepts.
- `screening_report.py` renders the saved evidence. UI and PDF comparison rules have parity fixtures, including mismatched entity types and partial dates. Source identifiers are opaque: preserve their exact spelling and punctuation.

Project edits merge untouched projects from the latest local snapshot and reject overlapping changes. This reduces stale-tab overwrites, but localStorage is not an atomic shared-office database. Authentication, centrally enforced permissions and tamper-evident audit storage remain production work.

Do not replace a failed or interrupted source with a negative finding. Do not infer identity from a portrait or exact name alone. Keep source receipts immutable when recording review decisions, preserve historical evidence on reruns, and test delayed responses as well as the successful path.

Focused architecture regressions (offline; no provider credits):

```sh
node scripts/check-screening-report-state.mjs
node scripts/check-screening-history.mjs
node scripts/check-screening-ui.mjs
node scripts/check-screening-retry-ui.mjs
node scripts/check-screening-research-ui.mjs
node scripts/check-screening-health.mjs
node scripts/check-screening-candidates.mjs
node scripts/check-screening-comparison.mjs
.venv/bin/python scripts/check-screening-comparison.py
.venv/bin/python scripts/check-screening-profile-report.py
```

Synthetic tests establish the stated behaviours, not independent sanctions-screening accuracy. Verify substantive changes in the browser and inspect rendered PDFs. Backend and persistent matcher changes need one normal server restart; provider keys remain memory-only and need reconnecting afterward.

Screening checks:

```sh
node scripts/check-screening-engine.mjs
node scripts/check-screening-view-model.mjs
node scripts/check-screening-ui.mjs
node scripts/check-screening-exports.mjs
node scripts/check-screening-research-ui.mjs
python3 scripts/check-screening-research.py
python3 scripts/check-screening-official.py
# With ReportLab and pypdf in the Python runtime:
python3 scripts/check-screening-report.py
```

These tests cover actual records, ambiguous identities, missing evidence, source failures, interruptions, exports and detached UI callbacks. Browser access worked on 12 October: the simplified desktop screen, saved results and actual PDF download were checked. Downloaded and synthetic reports were rendered and visually inspected. A user-started live run was inspected end to end: all five official checks completed, all three Luna requests returned, and the uncited identity section correctly remained partial. Full mobile and native print-dialog verification remain outstanding.

Navigation, local project/chat organization, reusable prompts, case filtering/comparison/source navigation, document change decisions, matrix notes/review marks, plain-text and CSV export. State is stored under the `neolaw.design.*` namespace in this browser. Unsent home/chat/project messages, completed staged chat attachments and unfinished resolution fields survive page switches in memory only; refreshing or closing the tab clears them. Successful submission clears the corresponding draft; failed saves retain it.

Text previews retain the working sample separately, including its decisions and proposed rate. Document reading positions are kept while the chat stays mounted. Pending prepared replies retain the document/case context from Send, including when resumed after leaving the chat; browsing another source does not retarget the request.

## Contract catalogue

The welcome page’s Contracts tab and Library → Contracts show the same twelve agreements as MyNomosAI’s welcome page, in the same order: Employment, Employment Termination, Non-Disclosure, Services, Lease, Shareholders’, Share Purchase, Loan, Property Sale, Settlement, Contract Termination and Guarantee. English card titles and descriptions were copied from MyNomosAI’s `CHAT_CONTRACTS` catalogue on 15 October 2026. All twelve cards appear on the welcome page. Search, bookmarks and internal details work locally. Catalogue metadata is in `modules/contract-library.js`. Selecting any welcome-page contract places an @ agreement chip above the input; Enter starts its presentation flow. Library details offer the same selection through Use agreement.

For the NDA presentation: Contracts → Non-Disclosure Agreement → Enter → answer the five MyNomosAI follow-up questions → Draft. The right-hand document panel opens with a 5.6-second cinematic of layered pages and a teal light sweep. It then shows a blank page for a short settling pause before typing from the first character. Reduced-motion settings bypass the animation; pause/resume retains the remaining reveal time, and Start writing now skips it. The panel writes the supplied reviewed Greek NDA, with pause/resume, replay, close/reopen, resizable width and Word download. Answers are saved with the local conversation; they do not alter the fixed reviewed example. The download is an unchanged copy of the supplied Word document. When drafting finishes, the chat displays the user-supplied Greek MyNomos completion: summary, all 16 legal-basis references with clause excerpts, six notes, completion fields and guide attribution. This fixed response lives in `modules/nda-demo-response.js`. Other agreements provide a generic outline; the fully prepared example is the NDA. This is local UI/UX only and makes no drafting API calls. Implementation: `modules/contract-composer.js`, `modules/contract-drafting.js`, `modules/nda-demo-document.js` and `modules/contract-drafting.css`.

## What is simulated

Chat AI answers, document extraction and library workflow runs use prepared material. The separate Screening research integration above is real provider code but requires an office API connection; it does not connect the normal chat to a model. Authentication, shared workspace, live legal search and a production backend remain unconnected. The case library contains ten actual judgments with manually prepared, source-backed Greek briefs; it searches only this captured collection. Chat research answers are prepared from those same records. Matrix files and document-review excerpts remain fictional. Library descriptions describe the intended connected-product experience.

Case provenance is in `outputs/real-cases-manifest.json`, the full captured sources in `outputs/real-case-sources/`, and reviewed briefs in `outputs/real-case-briefs/`. Run `python3 scripts/build-real-case-data.py` to rebuild the app dataset offline. The Andreou judgment includes a visible date note because its body and a later judgment identify 22 February 2017 while CyLaw's HTML title and ECLI contain 2016.

Legislation is captured in `modules/article-data.js`; `outputs/article-source-research.json` records the CyLaw article pages, original Gazette amendment PDFs and the fifteen verified case-reference anchors. This is a local snapshot, not a live statute index. Existing saved answers remain historical; start a new research demonstration to see the added article citations.

The local upload control is designed to retain file metadata and preview small text files. PDF and Word parsing is not implemented. Browser permission prevented completing the upload test; see CHECKS.md. No files were sent to NeoLaw or Legora.

## Verification

```sh
node scripts/check.mjs
node scripts/check-cases.mjs
node scripts/check-case-home.mjs
node scripts/check-case-search-progress.mjs
node scripts/check-case-strategy.mjs
node scripts/check-case-strategy-reveal.mjs
node scripts/check-strategy-reveal.mjs
node scripts/check-case-bookmarks.mjs
node scripts/check-case-navigation.mjs
node scripts/check-case-provenance.mjs
node scripts/check-case-focus.mjs
node scripts/check-chat.mjs
node scripts/check-documents.mjs
node scripts/check-panel-switching.mjs
node scripts/check-chat-panel-focus.mjs
node scripts/check-chat-recovery.mjs
node scripts/check-research-delay.mjs
node scripts/check-reply-context.mjs
node scripts/check-resolution-drafts.mjs
node scripts/check-composer-drafts.mjs
node scripts/check-projects.mjs
node scripts/check-library.mjs
node scripts/check-contract-catalog.mjs
node scripts/check-contract-drafting.mjs
node scripts/check-workflow-handoff.mjs
node scripts/check-workspace.mjs
node scripts/check-workspace-handoff.mjs
node scripts/check-matrix.mjs
node scripts/check-motion.mjs
```

Export checks use an inert HTML parser in Node (test-only, outside the app):

```sh
npm install --prefix /tmp/neolaw-export-check --ignore-scripts --no-save --no-audit --no-fund linkedom@0.18.13
node scripts/check-exports.mjs
node scripts/check-document-exports.mjs
node scripts/check-chat-article-panel.mjs
node scripts/check-chat-articles.mjs
node scripts/check-answer-reveal.mjs
node scripts/check-chat-answer-reveal.mjs
```

Set `NEOLAW_EXPORT_DOM` to another absolute linkedom installation path if needed. These checks inspect generated text and intercepted download/clipboard callbacks; they do not download through a browser or access the system clipboard.

These check JavaScript syntax/imports, local assets, case-data relationships, catalog entries, export escaping, search/panel callbacks and case-specific chat persistence. The case/chat tests use lightweight DOM doubles, not a browser. See `CHECKS.md` for actual browser evidence and pending checks; see `outputs/` for historical screenshots and module check records.

## Implementation

- `app.js`, `core.js`, `styles.css`: shell, router, navigation, dialogs, local state and shared styles.
- `chat.js`: composer, prepared chat responses and document workspace.
- `modules/chat-export.js`: full-answer copy/export with source provenance and exact local-text export.
- `modules/composer-drafts.js`: isolated page-memory drafts for home, chats and project composers.
- `modules/resolution-drafts.js`: unfinished company/decision fields, isolated by chat in page memory.
- `modules/workflow-samples.js`: shared fictional workflow findings for the library, chat and document preview.
- `modules/projects.*`: projects and chat/file organization.
- `modules/library.*`: catalog, saved items, custom prompts and sample workflows.
- `modules/cases.*`, `modules/case-data.js`: real case results, source reader and brief comparison.
- `modules/case-research.js`, `modules/chat-case-panel.js`: prepared research answers and the inline citation reader.
- `modules/article-data.js`, `modules/chat-article-panel.*`: verified statutory snapshots, selected amendments and linked-case reader.
- `modules/research-progress.*`: timed, source-linked research walkthrough for the chat starter.
- `modules/answer-reveal.js`, `modules/answer-presentation.css`: progressive new-answer presentation, NeoLaw answer branding and readable typography. Complete saved content and citation handlers remain intact throughout typing.
- `modules/matrix.*`: document review table and source inspection.

The original `/Users/marinoshalida/neolaw-app-mockup` remains untouched. This folder is the new editable showcase. Nothing has been published to production or pushed to GitHub.

## Additional provider and secure downloads

The optional OpenSanctions connection is available through the small plug button at the bottom-left of Screening. Its key stays only in local server memory. Connecting enables one hosted matching query per Search or Deep search, using provider credits. The query includes only name, type and supplied country/birth date or company registration number/LEI; office notes and files are excluded. The `default` collection, `logic-v2` algorithm, 0.7 match threshold and 10-candidate limit are recorded. Sanctions, PEP and other topic tags remain separate; a provider match never confirms the client identity. Failed, stopped and unconfigured provider checks remain distinct, alongside the nine official check receipts. Provider credentials are verified on the first successful matching request.

Official HTTPS downloads use `truststore` and the macOS native trust store with certificate and hostname verification enabled. OFAC uses its Sanctions List Service download endpoint. The initial full OFAC ZIP download can take several minutes; verified datasets are reused for one hour, with their original retrieval date recorded. Failures do not become negative screening results. Run the server with the project `.venv` so the required TLS and PDF dependencies are present.

Additional checks: `.venv/bin/python scripts/check-screening-modes.py`. Integration reference: https://www.opensanctions.org/docs/api/request/ .

## BIS and GLEIF (local integration)

BIS uses the official public [CSL JSON download](https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json), restricted to the Entity, Denied Persons, Military End User and Unverified lists. It requires no API key. The importer verifies download totals and all four source declarations, preserves licence conditions, Federal Register references and end dates, and records the download hash. Entries without an explicit person/company classification are included in both searches. Historical records are retained with an instruction to verify whether a restriction remains effective. BIS matches are not automatically asset-freeze findings.

GLEIF uses `https://api.gleif.org/api/v1/lei-records`, with no key. It is included only when **Company** is selected. An LEI takes precedence over a registration number; otherwise a recorded-name lookup normalises punctuation and common trailing corporate suffixes to avoid GLEIF comma/OR expansion. The actual lookup is retained in the receipt. The API returns up to 50 records; the screen shows the best 10 and discloses the total. All retrieved records remain in the JSON/PDF. Matching names are ranked locally without suppressing different countries. An LEI result does not automatically confirm the client, and no result does not mean the company is unregistered or clear. Company status and LEI registration status remain distinct. Parent references are links only: accounting-consolidation relationships and exceptions are not a complete beneficial-ownership investigation.

New jobs use receipt schema version 6 and nine official checks. Version 5 receipts retain six checks; older receipts retain five. The result reader compares supplied details against each source, highlights missing/different details, and gives a follow-up checklist. Exact names/aliases sort ahead of broader candidates. PDF exports mark missing research areas and unfinished providers incomplete, and count only valid counts from completed official checks.

Additional tests: `.venv/bin/python scripts/check-screening-bis-gleif.py`, `node scripts/check-screening-comparison.mjs`, and `.venv/bin/python scripts/check-screening-report.py`.


## Additional official feeds and evidence overview

Australia uses DFAT's public XLSX, with aliases grouped under the primary reference, weak aliases labelled and each published measure retained. Canada uses the official autonomous-sanctions XML; its regime column is never treated as nationality. This covers SEMA/JVCFOA only, not every Canadian sanctions or terrorism law. Switzerland uses SECO whole-list XML and interprets effective listing/delisting events rather than assuming every historical target is active. Same-date listing/delisting entries remain explicitly unresolved; later amendments do not revive delisted records. No API keys are needed for these feeds. All three are searched locally after a verified download and share the existing failure/cancellation handling. Restricted or unreadable feeds remain incomplete.

The evidence overview shows official check completion, possible entries per source and distinct cited URLs by research area. URL tracking variants count once. A source can support multiple areas. Counts are not a risk score, distinct people count, client identity confirmation or proof that every page was read. Its controls open the matching source records or research evidence.

The default PDF is a review brief, with an executive outcome, top retrieved candidates, identifier comparisons, next steps, provider/LEI context and linked citations. **More report options → Download full evidence PDF** preserves all retrieved official records and research notes; **Download evidence data** preserves the complete JSON receipt. Full search totals and retrieval caps remain explicit. PDFs do not turn missing phase receipts or pending providers into completion. The brief includes every saved identity decision on a retrieved record, even when the record is not in the three detailed candidates.

Verification: `scripts/check-screening-extra-sources.py` tests delistings, reinstatement, conflicting status dates, Australian alias grouping, Canadian regime semantics and historic five/six/nine-source receipts. `scripts/check-screening-visuals.mjs` tests citation deduplication, overlapping sources, incomplete checks, escaping and translated unresolved candidates. Live test receipts, rendered PDFs and the bounded offline soak are in `work/overnight/`. The soak blocks network at the socket layer and cannot spend provider credits.

This remains a local prototype: no licensed comprehensive PEP/RCA or adverse-media coverage, no complete ownership/control graph, no production case database or immutable team audit log, and no validated equivalence to LexisNexis. Browser history and reviewer notes are local to this device. Do not treat successful interface tests as evidence of regulatory fitness or recall/precision across all real-world identities.


OpenSanctions receipts retain the provider's matching explanations (including conflicting identifiers), parsed query and a SHA-256 of canonical JSON. The documented `leiCode` field is mapped to the app's LEI field; primary, alternate and previous names are available for comparison. The score is labelled as a provider match score, not a risk rating or confirmed client identity. The fixed 0.7 threshold is not claimed to be calibrated for this office. Per-query error statuses fail the provider check. Contract changes are tested offline; a fresh live provider run requires reconnection after the server restart.

Local history no longer discards the oldest report on the 31st save. If browser storage fills, existing saved reports remain intact, the latest evidence remains visible for export, and a persistent warning distinguishes it from the earlier saved version. This is still local browser storage, not a production case archive.

Returned records are no longer cut down by a second 100-record UI/PDF cap. The official per-source retrieval caps are still disclosed; these must not be confused with complete list results. Reopening earlier reports reconstructs returned candidates from their saved source receipts. PDF generation supports up to 1,000 retrieved records and an 8 MB request; larger reports fail explicitly with guidance to download the full evidence JSON or refine the query. Nothing is silently removed to meet the PDF limit.

### Company and relationship evidence

Deep search now retrieves direct recorded relationships for up to ten returned OpenSanctions candidates (at most three concurrent detail requests, no recursive graph crawl). These are additional provider requests and may consume provider credits. Each receipt records retrieval status, time, provider entity and a response SHA-256. A failed detail request preserves the matching result and leaves relationship coverage incomplete. Ordinary directorships and other positions are not counted as PEP classifications; explicit PEP and relative/associate categories stay separate.

The company-discovery research pass runs independently of earlier provider namesakes. It searches the supplied name for corporate roles, including cross-border Cyprus and UK company leads, and only accepts structured affiliations whose URLs appear in the research citations. Public directories are secondary leads, not official registry checks. The Connections view and PDF show the candidate, organization, role, identifiers, source date, evidence and next check. Namesakes remain separate; a relationship never confirms client identity or transfers another party's sanctions/PEP status. Comprehensive registry coverage, licensed PEP data and beneficial-ownership tracing remain gaps.

Focused offline checks: `python3 scripts/check-screening-relationships.py` and `node scripts/check-screening-relationships.mjs`. These verify contracts, failure/cancellation handling and presentation, not real-world discovery accuracy.

Affiliation dates in cards, PDFs and report-chat context must also appear in the corresponding cited research passage. Unsupported extracted dates are withheld; this consistency check does not verify the original website. The original research JSON remains available for audit.

### Prepared screening index

Standard Search now searches a persistent, preloaded name/alias index of the eight official downloadable datasets. The existing matching rules and identifier comparisons are unchanged. Cyprus remains a separate live portal request. OpenSanctions, World Bank and GLEIF start alongside the official checks; their latency no longer postpones the initial local results. Deep search still adds fresh web research and provider relationship lookups.

The local server refreshes public lists in the background, checking every five minutes and refreshing snapshots after 45 minutes. A publisher verification older than one hour is **not** accepted as a completed check: that source is marked incomplete until refresh succeeds. A failed refresh retains the last valid public file and its original dates. Per-source public snapshots are saved atomically with a SHA-256 integrity check in `work/official-index/`; client queries and API keys are never written there. The index is rebuilt in memory on restart, so there is no per-search download or Node startup. Updates run only while this local server is running; this is not a hosted monitoring service.

`GET /api/screening/index` returns metadata/readiness only (no full dataset payload). Job `timing.preparedChecksMs` measures the eight local checks, including explicit failures; it is separate from total duration and is not an accuracy or coverage score. Browser updates poll at 200 ms for the first five seconds, then 1.2 s. Saved results record `initialResultsMs` only when a positive official candidate first arrives. Initial screening can be fast while live checks remain pending. Missing results must never be labelled clear. Current PEP/provider coverage is unchanged; no new licensed database is implied.

Verify with `python scripts/check-screening-index.py` plus the existing research, official, modes, UI and export checks. The matcher has a bounded local protocol and does not contact external hosts. Restarting the server still clears memory-only provider connections.
