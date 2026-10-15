import assert from 'node:assert/strict';
import {contractItems} from '../modules/contract-library.js';

const expected = [
  ['contract-employment-agreement', 'Employment Agreement'],
  ['contract-employment-termination-agreement', 'Employment Termination Agreement'],
  ['contract-nda', 'Non-Disclosure Agreement'],
  ['contract-services-agreement', 'Services Agreement'],
  ['contract-lease-agreement', 'Lease Agreement'],
  ['contract-shareholders-agreement', 'Shareholders’ Agreement'],
  ['contract-share-purchase-agreement', 'Share Purchase Agreement'],
  ['contract-loan-agreement', 'Loan Agreement'],
  ['contract-property-sale-agreement', 'Property Sale Agreement'],
  ['contract-settlement-agreement', 'Settlement Agreement'],
  ['contract-contract-termination-agreement', 'Contract Termination Agreement'],
  ['contract-guarantee-agreement', 'Guarantee Agreement']
];
assert.equal(contractItems.length, 12);
assert.equal(new Set(contractItems.map(item => item.id)).size, 12);
for (const [index, [id, title]] of expected.entries()) {
  const item = contractItems[index];
  assert.equal(item.id, id);
  assert.equal(item.title, title);
  assert.equal(item.type, 'contracts');
  assert.equal(item.id, 'contract-' + item.kind);
  assert.ok(item.ask && item.hint);
  assert.ok(['Employment', 'Commercial', 'Property', 'Corporate', 'Finance', 'Dispute Resolution'].includes(item.category));
  assert.equal(item.icon, 'file');
  assert.equal(item.jurisdiction, 'Cyprus law');
  assert.equal(item.provider, 'Your office');
  assert.equal(item.templateStatus, 'awaiting-template');
  assert.ok(item.description.length > 20 && item.description.length < 150);
  assert.ok(!('text' in item) && !('html' in item) && !('prompt' in item));
  assert.equal(item.perspectives.length, index === 11 ? 3 : 2);
  for (const perspective of item.perspectives) {
    assert.deepEqual(Object.keys(perspective), ['label']);
    assert.ok(perspective.label.length > 0);
  }
}
const perspectiveLabels = contractItems.flatMap(item => item.perspectives.map(perspective => perspective.label));
assert.equal(perspectiveLabels.length, 25);
assert.deepEqual(perspectiveLabels, [
  'Employer', 'Employee', 'Employer', 'Employee', 'Disclosing party', 'Receiving party',
  'Provider', 'Client', 'Landlord', 'Tenant', 'Company', 'Shareholders',
  'Seller', 'Buyer', 'Lender', 'Borrower', 'Seller', 'Buyer', 'Party A', 'Party B',
  'Party A', 'Party B', 'Guarantor', 'Creditor', 'Debtor'
]);
for (const item of contractItems) {
  assert.deepEqual(Object.keys(item).sort(), [
    'ask', 'category', 'description', 'hint', 'icon', 'id', 'jurisdiction', 'kind', 'perspectives',
    'provider', 'templateStatus', 'title', 'type'
  ]);
}
assert.doesNotMatch(JSON.stringify(contractItems), /https?:|lexology|lawgood|sourceId|sourceUrl|\bUS law\b/i);
console.log('PASS Twelve agreement entries preserve the MyNomosAI welcome-page order');
console.log('PASS All twenty-five party labels remain local; no external links or invented full terms');
