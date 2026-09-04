# Drop 001 — Client Analytics Patch V1

Status: **final / ready to apply**. No live change, merge, PR or deploy performed.

## Goal

Close the two measurement gaps documented in Notion without adding a new tracker or paid service:

1. record a one-shot `drop_001_form_start` event after a product has been selected and the visitor first interacts with the email field;
2. rename the post-API event so it describes what actually happened: the submission was accepted/updated by the newsletter endpoint, not necessarily double-opt-in confirmed.

Buttondown confirmation status remains measured separately by `scripts/drop-001-report.mjs`.

## Exact client changes for `src/pages/drop-001.astro`

### 1. Add state next to the existing DOM references

```js
const emailInput = document.querySelector("#email");
let formStarted = false;
```

### 2. Make the analytics helper accept optional aggregate metadata

Replace:

```js
function pushAnalytics(event, product, concept) {
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event,
      product,
      concept,
      creative_version: creativeVersion,
    });
  }
}
```

with:

```js
function pushAnalytics(event, product, concept, extra = {}) {
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event,
      product,
      concept,
      creative_version: creativeVersion,
      ...extra,
    });
  }
}
```

### 3. Add one-shot form-start tracking

Insert after the product button listeners:

```js
function trackFormStart() {
  if (formStarted || !preference?.value) return;

  const selectedButton = buttons.find(
    (button) => button.dataset.product === preference.value,
  );

  formStarted = true;
  pushAnalytics(
    "drop_001_form_start",
    preference.value,
    selectedButton?.dataset.concept || "",
    { interaction: "email" },
  );
}

emailInput?.addEventListener("focus", trackFormStart);
emailInput?.addEventListener("input", trackFormStart);
```

The local boolean keeps the event one-shot for the page session. No email value is sent to analytics.

### 4. Correct the accepted-submission event semantics

Replace:

```js
pushAnalytics(
  "drop_001_waitlist_signup",
  preference.value,
  selectedButton?.dataset.concept || "",
);
```

with:

```js
pushAnalytics(
  "drop_001_waitlist_submit_accepted",
  preference.value,
  selectedButton?.dataset.concept || "",
  {
    result: response.status === 409 ? "existing_updated" : "accepted",
  },
);
```

Do **not** emit a fake `confirmed` event from the browser. Double-opt-in confirmation is a Buttondown lifecycle fact and is reported separately by the aggregate server-side script.

## Measurement semantics after patch

| Metric | Source | Meaning |
| --- | --- | --- |
| Product interest | `drop_001_product_interest` | product CTA clicked |
| Form start | `drop_001_form_start` | first email-field interaction after product selection |
| Accepted submit | `drop_001_waitlist_submit_accepted` | `/api/newsletter` accepted or updated the request |
| Confirmed subscriber | `npm run report:drop-001` / Buttondown | current lifecycle is active/confirmed rather than `unactivated` |

## Privacy constraints

- no email, subscriber ID, IP or referrer is added to custom event payloads;
- client events remain dependent on the site's existing analytics consent mechanism;
- Buttondown report outputs aggregates only;
- no new cookie, endpoint, SaaS or recurring-cost service is introduced.

## QA checklist before any future deploy

- select each product and verify one `drop_001_product_interest` event;
- focus/type in email and verify exactly one `drop_001_form_start` per page load;
- submit a controlled test only in an approved preview/test context;
- verify the accepted event is named `drop_001_waitlist_submit_accepted`;
- verify `result` distinguishes `accepted` from HTTP 409 `existing_updated`;
- verify no email value appears in the data layer event;
- verify users without analytics consent do not generate these client analytics events;
- run `npm run report:drop-001 -- --json` only in an authorized environment with `BUTTONDOWN_API_KEY` to validate aggregate lifecycle reporting.

## Release gate

Applying this patch to production is intentionally deferred until it can be grouped with the next justified site batch. This avoids a standalone deploy solely for measurement semantics.
