// Editorial research guide for the captured murder-case collection.
// References are reader source blocks, never official paragraph numbers.
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function getCaseStrategy(query, items = []) {
  const text = normalize(query);
  const relevant = /\b(?:murder|murders|homicide|premedit\w*)\b|φονο|προμελετ|ανθρωποκτον/.test(text);
  if (!relevant || !items.length) return null;
  const absence = /απουσια|ελλειψη|χωρις|\b(?:absence|lack|without|no)\b/.test(text) && /προμελετ|premedit/.test(text);
  const reference = (id, block, label) => {
    const item = items.find(item => item.id === id);
    return item?.paragraphs.some(p => p.n === block) ? { id, block, label, title: item.displayTitle } : null;
  };
  const participation = items.some(item => item.id === 'case-06');
  const circumstantialEvidence = items.some(item => item.id === 'case-05');
  const points = [
    {
      title: 'Προμελέτη και πρόθεση',
      description: 'Εξετάστε χωριστά την πρόθεση θανάτωσης, τον προηγούμενο σχεδιασμό και τη δυνατότητα ψυχρού αναλογισμού.',
      references: [reference('case-01', 100, 'Ονησίλλου')]
    },
    {
      title: participation ? 'Μαρτυρία και συμμετοχή' : 'Περιστατική μαρτυρία',
      description: participation
        ? circumstantialEvidence ? 'Αξιολογήστε τις περιστάσεις συνολικά και εξετάστε χωριστά την πρόθεση και τη δράση κάθε συμμετέχοντος.' : 'Εξετάστε χωριστά την πρόθεση και τη δράση κάθε συμμετέχοντος και τη βάση της συμμετοχικής ευθύνης.'
        : 'Εξετάστε τη σωρευτική βαρύτητα των περιστάσεων και αν αφήνουν άλλη λογική εξήγηση.',
      references: [reference('case-05', 137, 'Γαβριήλ'), reference('case-06', 127, 'Bo Yo Hong')]
    },
    {
      title: 'Η πραγματική έκβαση',
      description: 'Διακρίνετε τη μετατροπή της καταδίκης σε ανθρωποκτονία από την αθώωση και ελέγξτε χωριστά την κρίση για την ποινή.',
      references: [reference('case-01', 137, 'Ονησίλλου'), reference('case-02', 274, 'Χαραλάμπους')]
    }
  ].map(point => ({ ...point, references: point.references.filter(Boolean) })).filter(point => point.references.length);
  return {
    title: absence ? 'Απουσία προμελέτης' : 'Φόνος εκ προμελέτης',
    description: absence
      ? 'Η έρευνα εστιάζει στα στοιχεία που αποκλείουν ή αποδυναμώνουν την προμελέτη και στη διάκρισή της από την πρόθεση θανάτωσης. Ελέγξτε πώς επηρεάζουν την κατηγορία και την τελική έκβαση, χωρίς να εξισώνετε την έλλειψη προμελέτης με αθώωση.'
      : 'Η έρευνα εστιάζει στο πώς αποδεικνύεται η προμελέτη και πώς διακρίνεται από την πρόθεση θανάτωσης. Συγκρίνετε τη μαρτυρία, το σκεπτικό και την τελική έκβαση κάθε απόφασης, ιδίως όταν η καταδίκη μετατρέπεται σε ανθρωποκτονία.',
    points
  };
}
