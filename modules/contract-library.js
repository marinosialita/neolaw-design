// Welcome-page agreement names, descriptions and order copied from MyNomosAI
// src/app/data/chat-composer-contracts.ts (CHAT_CONTRACTS), 15 October 2026.
// These are catalogue entries; the office templates have not been supplied.
export const contractItems = [
  {
    "id": "contract-employment-agreement",
    "kind": "employment-agreement",
    "hint": "Who hires whom, position, salary, start date, hours…",
    "ask": "Prepare an Employment Agreement.",
    "title": "Employment Agreement",
    "description": "Hiring on statutory terms",
    "category": "Employment",
    "perspectives": [
      "Employer",
      "Employee"
    ]
  },
  {
    "id": "contract-employment-termination-agreement",
    "kind": "employment-termination-agreement",
    "hint": "Employer, employee, leaving date, amount, reason…",
    "ask": "Prepare an Employment Termination Agreement.",
    "title": "Employment Termination Agreement",
    "description": "Agreed exit with a release",
    "category": "Employment",
    "perspectives": [
      "Employer",
      "Employee"
    ]
  },
  {
    "id": "contract-nda",
    "kind": "nda",
    "hint": "Who discloses to whom, purpose, duration…",
    "ask": "Prepare a Non-Disclosure Agreement.",
    "title": "Non-Disclosure Agreement",
    "description": "Mutual or one-way NDA",
    "category": "Commercial",
    "perspectives": [
      "Disclosing party",
      "Receiving party"
    ]
  },
  {
    "id": "contract-services-agreement",
    "kind": "services-agreement",
    "hint": "Provider, client, services, fee, term…",
    "ask": "Prepare a Services Agreement.",
    "title": "Services Agreement",
    "description": "Consultancy or other services",
    "category": "Commercial",
    "perspectives": [
      "Provider",
      "Client"
    ]
  },
  {
    "id": "contract-lease-agreement",
    "kind": "lease-agreement",
    "hint": "Landlord, tenant, property, rent, term…",
    "ask": "Prepare a Lease Agreement.",
    "title": "Lease Agreement",
    "description": "Residential or commercial tenancy",
    "category": "Property",
    "perspectives": [
      "Landlord",
      "Tenant"
    ]
  },
  {
    "id": "contract-shareholders-agreement",
    "kind": "shareholders-agreement",
    "hint": "Company, shareholders and holdings, what it should settle…",
    "ask": "Prepare a Shareholders’ Agreement.",
    "title": "Shareholders’ Agreement",
    "description": "Governance, transfers, deadlock",
    "category": "Corporate",
    "perspectives": [
      "Company",
      "Shareholders"
    ]
  },
  {
    "id": "contract-share-purchase-agreement",
    "kind": "share-purchase-agreement",
    "hint": "Seller, buyer, company, shares, price…",
    "ask": "Prepare a Share Purchase Agreement.",
    "title": "Share Purchase Agreement",
    "description": "Sale of shares with warranties",
    "category": "Corporate",
    "perspectives": [
      "Seller",
      "Buyer"
    ]
  },
  {
    "id": "contract-loan-agreement",
    "kind": "loan-agreement",
    "hint": "Lender, borrower, amount, interest, repayment…",
    "ask": "Prepare a Loan Agreement.",
    "title": "Loan Agreement",
    "description": "Loan or shareholder loan",
    "category": "Finance",
    "perspectives": [
      "Lender",
      "Borrower"
    ]
  },
  {
    "id": "contract-property-sale-agreement",
    "kind": "property-sale-agreement",
    "hint": "Seller, buyer, property, price, delivery…",
    "ask": "Prepare a Property Sale Agreement.",
    "title": "Property Sale Agreement",
    "description": "Sale of immovable property, Land Registry deposit",
    "category": "Property",
    "perspectives": [
      "Seller",
      "Buyer"
    ]
  },
  {
    "id": "contract-settlement-agreement",
    "kind": "settlement-agreement",
    "hint": "Parties, dispute, amount, instalments, withdrawal of the action…",
    "ask": "Prepare a Settlement Agreement.",
    "title": "Settlement Agreement",
    "description": "Settling a dispute with a release",
    "category": "Dispute Resolution",
    "perspectives": [
      "Party A",
      "Party B"
    ]
  },
  {
    "id": "contract-contract-termination-agreement",
    "kind": "contract-termination-agreement",
    "hint": "Which agreement ends, parties, date, what is still owed…",
    "ask": "Prepare a Contract Termination Agreement.",
    "title": "Contract Termination Agreement",
    "description": "Mutual termination of an existing agreement",
    "category": "Commercial",
    "perspectives": [
      "Party A",
      "Party B"
    ]
  },
  {
    "id": "contract-guarantee-agreement",
    "kind": "guarantee-agreement",
    "hint": "Guarantor, creditor, debtor, guaranteed debt…",
    "ask": "Prepare a Guarantee Agreement.",
    "title": "Guarantee Agreement",
    "description": "Personal or corporate guarantee",
    "category": "Finance",
    "perspectives": [
      "Guarantor",
      "Creditor",
      "Debtor"
    ]
  }
].map(({perspectives, ...item}) => ({
  ...item,
  type: 'contracts',
  icon: 'file',
  jurisdiction: 'Cyprus law',
  provider: 'Your office',
  templateStatus: 'awaiting-template',
  perspectives: perspectives.map(label => ({label}))
}));
