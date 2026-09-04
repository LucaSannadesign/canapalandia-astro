# Canapalandia Commerce — Editorial / Legal Review V1

Stato: internal review complete; external fiscal/legal validation still open where indicated.

## 1. Provider-role wording

Current commerce drafts consistently distinguish:
- Canapalandia as editorial project and brand owner/curator of the merchandise line;
- Spreadshop / sprd.net AG as contractual counterpart for customer orders in the European Spreadshop model;
- provider-side handling of production, delivery and customer-service flow for customer orders.

Public Spreadshop partner terms currently state that the contractual relationship with the customer is handled by Spreadshirt and that production, delivery and customer service are handled by the provider. This supports the current FAQ/Terms wording.

## 2. Pages reviewed

### FAQ
Status: editorial-ready for staging.

The draft:
- explicitly excludes cannabis/CBD consumables from the merchandise line;
- explains hosted-provider checkout;
- identifies sprd.net AG conditionally when Spreadshop is the active provider;
- sends order/shipping/returns questions to the provider storefront and order support channels.

### Terms
Status: editorial-ready for staging; qualified legal review remains desirable before production.

The draft:
- separates editorial content from merchandise;
- states that customer purchase terms live in the provider storefront;
- does not attempt to override mandatory provider customer information;
- keeps provider choice conditional;
- still carries the staging-only note, which must be removed in the final production batch.

### Chi siamo
Status: editorial-ready for staging.

Legacy heading `senza venderti un prodotto` has already been replaced on the commerce branch.

### Missione
Status: editorial-ready for staging.

Legacy section `Non siamo un negozio` has already been replaced on the commerce branch with a separation between editorial work and merchandise.

## 3. Legacy-copy repository scan

A code scan of the current production branch found only these commerce-conflicting legacy statements:
1. Home editorial note: `non vendiamo prodotti`;
2. Chi siamo heading: `senza venderti un prodotto`;
3. Missione section: `Non siamo un negozio` / `Non vendiamo direttamente prodotti`.

Items 2 and 3 are already resolved in the commerce branch.

Item 1 remains intentionally unpatched on production and must be changed in the single commerce publication batch.

## 4. Home replacement locked for cutover

Replace the legacy statement with the already approved direction:

`Canapalandia è un progetto editoriale indipendente. Non vendiamo cannabis, CBD o altri prodotti destinati al consumo e non forniamo indicazioni mediche. L'eventuale merchandise ufficiale è una linea separata dai contenuti editoriali e viene gestita tramite il provider indicato nello shop.`

Do not deploy this replacement by itself.

## 5. Remaining non-editorial legal/fiscal gates

This internal editorial review does not resolve:
- Italian tax/accounting treatment of partner payouts and provider settlement documents;
- German withholding / §50a applicability and treatment;
- final commercial/legal consequences of the selected Spreadshop account configuration;
- any additional mandatory disclosures required by the user's accountant or qualified legal adviser.

These remain launch gates, not copy-writing tasks.

## 6. Final publication rule

Promote only as one batch:
- Home copy;
- FAQ;
- Chi siamo;
- Missione;
- Terms;
- Shop gateway;
- provider configuration;
- final noindex/index switch after all gates pass.

No partial production cutover.
