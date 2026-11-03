/**
 * Rilievo 5: timer delle impressioni. Esegue ESATTAMENTE lo script inviato al browser (AD_SLOT_SCRIPT)
 * in un DOM simulato. Prima della correzione: un secondo callback "visibile" sovrascriveva il timer
 * (il primo scattava comunque anche a box uscito) e la scheda in background non fermava il conteggio.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AD_SLOT_SCRIPT } from "../src/lib/ads/clientScript.ts";
import { runSlotScript } from "./support/fakeDom.ts";

describe("script client: impressione dopo 1 s continuo di visibilità", () => {
  it("visibile ≥50% per 1 s → un solo beacon con placement e token", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    assert.equal(t.observed(), true);
    t.see(0.6);
    t.advance(999);
    assert.equal(t.beacons.length, 0);
    t.advance(1);
    assert.equal(t.beacons.length, 1);
    assert.equal(t.beacons[0].url, "/api/ads/event/");
    assert.deepEqual(JSON.parse(t.beacons[0].body), { type: "impression", placement: "p1", token: "tok" });
    t.see(0);
    t.see(0.9);
    t.advance(5000);
    assert.equal(t.beacons.length, 1, "al massimo un beacon per pagina");
    assert.equal(t.listenerCount(), 0, "listener rimossi dopo l'invio");
  });

  it("regressione: più callback 'visibile' non creano timer multipli; uscita dal viewport azzera", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    t.see(0.6);
    t.see(1);
    t.see(0.8);
    assert.equal(t.pendingTimers(), 1);
    t.advance(900);
    t.see(0);
    t.advance(2000);
    assert.equal(t.beacons.length, 0);
  });

  it("sotto il 50% non conta", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    t.see(0.49);
    t.advance(5000);
    assert.equal(t.beacons.length, 0);
  });

  it("regressione: scheda in background ferma il conteggio; al ritorno serve 1 s pieno", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    t.see(0.7);
    t.advance(400);
    t.hideTab();
    t.advance(5000);
    assert.equal(t.beacons.length, 0);
    t.showTab();
    t.advance(999);
    assert.equal(t.beacons.length, 0, "il conteggio riparte da zero");
    t.advance(1);
    assert.equal(t.beacons.length, 1);
  });

  it("scheda nascosta all'avvio: niente beacon finché non torna visibile", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    t.hideTab();
    t.see(1);
    t.advance(3000);
    assert.equal(t.beacons.length, 0);
    t.showTab();
    t.advance(1000);
    assert.equal(t.beacons.length, 1);
  });

  it("pagehide annulla il timer in corso", () => {
    const t = runSlotScript(AD_SLOT_SCRIPT);
    t.see(1);
    t.advance(500);
    t.pagehide();
    t.advance(3000);
    assert.equal(t.beacons.length, 0);
  });

  it("senza token o placement non osserva nulla", () => {
    for (const attrs of [{ "data-ad-placement": "p1" }, { "data-ad-token": "tok" }] as Record<string, string>[]) {
      const t = runSlotScript(AD_SLOT_SCRIPT, attrs);
      assert.equal(t.observed(), false);
    }
  });
});
