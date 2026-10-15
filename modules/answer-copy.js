// Update only known interface copy in stored assistant responses. User messages and source documents are not rewritten.
const replacements = [
  [
    "Review the source and translation together. This example demonstrates English to Greek.",
    "Review the source and translation together, in English and Greek."
  ],
  [
    "This design preview uses prepared sample responses. The mode selector demonstrates where model routing would live in the connected product.",
    "Choose a response mode."
  ],
  [
    "Explore the case-law demonstration",
    "Explore case law"
  ],
  [
    "This is a saved sample matter conversation. Your files and working notes are available on the project home.",
    "Your files and working notes are available on the project home."
  ],
  [
    "Create sample draft",
    "Create draft"
  ],
  [
    "Use an example",
    "Open template"
  ],
  [
    "<div class=\"sample-foot\">Prepared demonstration · No files sent to a server</div>",
    ""
  ],
  [
    "Earlier fictional example",
    "Archived response · sources unavailable"
  ],
  [
    "The case collection now uses real judgments. Try the updated answer with citations that open beside this chat.",
    "Open the current case collection to continue with linked sources."
  ],
  [
    "Research real judgments",
    "Research judgments"
  ],
  [
    "Your file is attached locally. ",
    "Your file is attached. "
  ],
  [
    "This prototype does not parse PDF or Word files.",
    "PDF and Word reading is currently unavailable."
  ],
  [
    " Use the prepared example to explore the document experience.",
    ""
  ],
  [
    "Return to sample workspace",
    "Return to document"
  ],
  [
    "Open sample workspace",
    "Open document template"
  ],
  [
    "The sample answer could not be prepared.",
    "The answer could not be completed."
  ],
  [
    "Statement of claim · Example",
    "Statement of claim"
  ],
  [
    "Consultancy agreement · Example",
    "Consultancy agreement"
  ],
  [
    "<p class=\"muted\">This is a sample drafting flow, not a validated corporate resolution.</p>",
    ""
  ],
  [
    "The example review identifies two commercial points.",
    "The review identifies two commercial points."
  ],
  [
    "sample consultancy agreement",
    "consultancy agreement"
  ],
  [
    "A cap is absent in the sample.",
    "The agreement has no liability cap."
  ],
  [
    "The two prepared versions differ in fees and notice.",
    "The two versions differ in fees and notice."
  ],
  [
    "The example versions differ in",
    "The versions differ in"
  ],
  [
    "The prepared Greek translation is open.",
    "The Greek translation is open."
  ],
  [
    "The prepared Greek translation is open next to the English source.",
    "The Greek translation is open next to the English source."
  ],
  [
    "The example pleading has three items to complete.",
    "The pleading has three items to complete."
  ],
  [
    "sample pleading",
    "pleading"
  ],
  [
    "<p>This sample demonstrates issue triage, not a court filing check.</p>",
    ""
  ],
  [
    "The sample document is open with the proposed fee change.",
    "The document is open with the proposed fee change."
  ],
  [
    "The example document is open beside us. I’ve marked the sample change from",
    "The document is open beside us. I’ve marked the change from"
  ],
  [
    "Your prepared sample is open beside the conversation.",
    "Your document is open beside the conversation."
  ],
  [
    "Your prepared <strong>",
    "Your <strong>"
  ],
  [
    "<p>This is fictional sample material. It demonstrates the structure and review experience, rather than AI-generated work on your matter.</p>",
    ""
  ],
  [
    "Sample document",
    "Document"
  ],
  [
    "EXAMPLE DOCUMENT · NOT LEGAL ADVICE",
    "WORKING DOCUMENT"
  ],
  [
    "LOCAL TEXT PREVIEW · NOT SENT TO A SERVER",
    "DOCUMENT"
  ],
  [
    "LOCAL TEXT PREVIEW",
    "DOCUMENT"
  ],
  [
    "CORPORATE · SAMPLE DRAFT",
    "CORPORATE · DRAFT"
  ],
  [
    " · FICTIONAL SAMPLE",
    ""
  ],
  [
    "Aster / Meridian · Prepared demonstration",
    "Aster / Meridian"
  ],
  [
    "Source: sample Email",
    "Source: Email"
  ],
  [
    "The sample agreement and fictional correspondence form the working record. No legal authorities have been retrieved in this preview.",
    "The agreement and correspondence form the working record. Legal authorities remain to be added."
  ],
  [
    "LITIGATION · FICTIONAL EXAMPLE",
    "LITIGATION · DRAFT"
  ],
  [
    "<p>The contents are a fictional example used only to demonstrate issue highlighting.</p>",
    ""
  ],
  [
    "TRANSLATION · PREPARED EXAMPLE",
    "TRANSLATION"
  ],
  [
    "VERSION COMPARISON · EXAMPLE",
    "VERSION COMPARISON"
  ],
  [
    "unchanged in these sample versions.",
    "unchanged in these versions."
  ],
  [
    "This sample agreement records",
    "This agreement records"
  ],
  [
    "This example agreement refers to the laws of the Republic of Cyprus. It is prepared solely to demonstrate the interface.",
    "This agreement refers to the laws of the Republic of Cyprus."
  ],
  [
    "Your files are attached locally. This prototype does not run AI on uploaded files.",
    "Your files are attached. Automatic document analysis is currently unavailable."
  ],
  [
    "Your files are attached locally. This design preview does not run AI on uploaded documents.",
    "Your files are attached. Automatic document analysis is currently unavailable."
  ],
  [
    "Open the example to try the review and editing controls.",
    "Open a document template to work with the review and editing controls."
  ],
  [
    "Use a sample document",
    "Open document template"
  ],
  [
    "I’ve marked the sample hourly rate as",
    "I’ve marked the hourly rate as"
  ],
  [
    "This preview supports the prepared document actions.",
    "You can review the marked changes in the document."
  ],
  [
    "This is an interactive document demo. You can",
    "You can"
  ],
  [
    "To try a change through chat, write",
    "To update the rate, write"
  ],
  [
    "Other instructions need the connected AI service.",
    "Other editing instructions are currently unavailable."
  ],
  [
    "AI analysis and editing of uploaded files are not connected in this showcase.",
    "Automatic analysis and editing of uploaded files are currently unavailable."
  ],
  [
    "This document is a prepared example.",
    "The document is open beside the conversation."
  ],
  [
    "This is a prepared example. Use the document controls to inspect or export it. Free-form changes to this type of document need the connected NeoLaw AI service.",
    "Use the document controls to inspect or export it. Automatic editing for this document type is currently unavailable."
  ],
  [
    "research the prepared premeditation case collection.",
    "research the premeditation case collection."
  ],
  // Historical workflow response copy.
  ["Prepared fictional sample. It is not an analysis of your instructions or documents. Source references belong only to this sample.", "This brief uses the included document context. Edited instructions are saved separately; automatic analysis is unavailable."],
  ["from the workflow preview is open beside this conversation.", "is open beside this conversation."],
  ["Services agreement · sample", "Services agreement"],
  ["Commercial dispute · sample", "Commercial dispute"],
  ["Share transaction · sample", "Share transaction"],
  ["Matter correspondence · sample", "Matter correspondence"],
  ["Agreement v1 → v2 · sample", "Agreement v1 → v2"],
  ["No express liability cap is included in the sample clause.", "No express liability cap is included in the clause."],
  ["The supplied sample distinguishes dispatch from delivery. Receipt of the goods remains an open factual question.", "The record distinguishes dispatch from delivery. Receipt of the goods remains an open factual question."],
  ["Three dated events and one undated note have been organized in this illustrative timeline.", "Three dated events and one undated note have been organized in this timeline."],
  ["Two commercial changes and one administrative correction are shown in the sample comparison.", "Two commercial changes and one administrative correction are shown in the comparison."],
  ["<div class=\"doc-eyebrow\">WORKFLOW PREVIEW</div><h2>Sample unavailable</h2><p>Return to the library to open a current workflow example.</p>", "<div class=\"doc-eyebrow\">WORKFLOW</div><h2>Document unavailable</h2><p>Return to the library to open a workflow.</p>"],
  ["<h3>Fictional sample context</h3>", "<h3>Document context</h3>"],
  ["Fictional services agreement between Aster Advisory Ltd and Helios Trading Ltd. Term: 12 months. Fees: €4,500 per month. Clause 6.2 provides payment within 30 days. Clause 9 permits termination on 60 days’ notice. Clause 11 contains no express liability cap.", "Services agreement between Aster Advisory Ltd and Helios Trading Ltd. Term: 12 months. Fees: €4,500 per month. Clause 6.2 provides payment within 30 days. Clause 9 permits termination on 60 days’ notice. Clause 11 contains no express liability cap."],
  ["Fictional dispute: delivery was due on 15 March 2026. A customer email dated 18 March says the goods had not arrived. The supplier’s dispatch note records dispatch on 14 March. No signed delivery receipt is included. The customer sent a demand on 25 March.", "Dispute record: delivery was due on 15 March 2026. A customer email dated 18 March says the goods had not arrived. The supplier’s dispatch note records dispatch on 14 March. No signed delivery receipt is included. The customer sent a demand on 25 March."],
  ["Fictional transaction: Aster Holdings Ltd proposes to acquire all shares in Helios Services Ltd for €750,000. Target closing: 30 June 2026. The sample term sheet requires board approval, signed transfer documents and confirmation of payment. Director names and signing arrangements are not supplied.", "Transaction context: Aster Holdings Ltd proposes to acquire all shares in Helios Services Ltd for €750,000. Target closing: 30 June 2026. The term sheet requires board approval, signed transfer documents and confirmation of payment. Director names and signing arrangements are not supplied."],
  ["Fictional sample record: 3 February 2026, parties exchanged a draft agreement. 10 February, the client requested a revised payment schedule by email. 14 February, the counterparty circulated version 2. An undated note refers to a later telephone discussion but does not identify when it occurred.", "Matter record: 3 February 2026, parties exchanged a draft agreement. 10 February, the client requested a revised payment schedule by email. 14 February, the counterparty circulated version 2. An undated note refers to a later telephone discussion but does not identify when it occurred."],
  ["Fictional versions of a services agreement. Version 1 clause 6: invoices payable within 30 days; version 2 clause 6: 45 days. Version 1 clause 9: termination notice of 60 days; version 2: 30 days. Version 2 corrects the supplier’s address in the notices clause. Other sample terms are unchanged.", "Versions of a services agreement. Version 1 clause 6: invoices payable within 30 days; version 2 clause 6: 45 days. Version 1 clause 9: termination notice of 60 days; version 2: 30 days. Version 2 corrects the supplier’s address in the notices clause. Other terms are unchanged."]
];
const introductions = ["Προετοιμασμένη απάντηση από 10 πραγματικές αποφάσεις. Πατήστε μια παραπομπή για να διαβάσετε την πηγή δίπλα στη συζήτηση.", "Prepared answer from 10 real judgments. Select a citation to read its source beside this conversation."];

// Localise the framing of existing prepared answers without rewriting saved
// conversations, source passages, identifiers or citation destinations.
const researchCopy = [
 ["Premeditation must be proved separately from the intention to kill. These judgments include both upheld convictions and murder convictions replaced with manslaughter.", "Η προμελέτη πρέπει να αποδεικνύεται χωριστά από την πρόθεση θανάτωσης. Στη συλλογή υπάρχουν τόσο καταδίκες που διατηρήθηκαν όσο και καταδίκες για φόνο εκ προμελέτης που αντικαταστάθηκαν με ανθρωποκτονία."],
 ["Relevant Criminal Code articles", "Σχετικά άρθρα του Ποινικού Κώδικα"],
 ["Defines premeditated murder and provides for life imprisonment.", "Ορίζει τον φόνο εκ προμελέτης και προβλέπει φυλάκιση διά βίου."],
 ["Sets out the statutory definition of premeditation.", "Δίνει τον νομοθετικό ορισμό της προμελέτης."],
 ["Defines manslaughter and unlawful omission, framing the distinction from premeditated murder.", "Ορίζει την ανθρωποκτονία και την παράνομη παράλειψη· είναι κρίσιμο για τη διάκριση από τον φόνο εκ προμελέτης."],
 ["Open an article for its text, verified amendments and judgments that mention it.", "Ανοίξτε ένα άρθρο για το κείμενο, επαληθευμένες τροποποιήσεις και αποφάσεις που το αναφέρουν."],
 ["What the judgments establish", "Τι προκύπτει από τη νομολογία"],
 ["Read the actual outcomes", "Οι εκβάσεις έχουν σημασία"],
 ["10 judgments · Sources", "10 αποφάσεις · Πηγές"],
 ["6 more judgments", "Άλλες 6 αποφάσεις"],
 ["Open beside the chat", "Άνοιγμα δίπλα στη συζήτηση"],
 ["Compare the first two", "Σύγκριση των δύο πρώτων"],
 ["Evidence in Gavriil", "Αποδεικτικό υλικό στην Γαβριήλ"],
 ["Open Case Law", "Άνοιγμα νομολογίας"],
 ["Άνοιγμα Case Law", "Άνοιγμα νομολογίας"],
 ["Comparing the judgments", "Σύγκριση αποφάσεων"],
 ["Research note", "Σημείωμα έρευνας"],
 ["Evidence and reasoning", "Αποδεικτικό υλικό και αιτιολογία"],
 ["Case analysis", "Ανάλυση της απόφασης"],
 ["The court’s holding", "Κρίση του Δικαστηρίου"],
 ["Actual outcome", "Τελική έκβαση"],
 ["Legal issue", "Νομικό ζήτημα"],
 [">Facts<", ">Πραγματικά περιστατικά<"],
 [">Holding<", ">Κρίση<"],
 [">Reasoning<", ">Αιτιολογία<"],
 ["Compare a related judgment", "Σύγκριση με συναφή απόφαση"],
 ["All 10 judgments", "Όλες οι 10 αποφάσεις"],
 ["Examine the reasoning", "Ανάλυση αιτιολογίας"]
];
export function cleanAnswerCopy(value){
 let text=String(value??'');
 for(const intro of introductions){
  text=text.split('<p class="chat-research-note">'+intro+'</p>').join('');
  text=text.split(intro).join('');
 }
 for(const [before,after] of replacements)text=text.split(before).join(after);
 if(text.includes('class="chat-research"')){
  for(const [before,after] of researchCopy)text=text.split(before).join(after);
  text=text.replace('class="chat-research" lang="en"','class="chat-research" lang="el"')
   .replace(/>Article (203|204|205)/g,'>Άρθρο $1')
   .replace(/aria-label="Open article /g,'aria-label="Άνοιγμα άρθρου ')
   .replace(/aria-label="Open /g,'aria-label="Άνοιγμα ')
   .replace(/source block /g,'απόσπασμα ')
   .replace(/ beside the chat/g,' στο δεξί πλαίσιο');
 }
 return text;
}
