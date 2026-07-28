import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { generateLocalPairingOffer } from "./pairing-offer.js";

/**
 * The pairing offer is what the app consumes to reach the daemon, so whatever TLS decision is made
 * here is the one the client acts on. Getting it wrong does not fail loudly — the app just tries to
 * talk plaintext to a TLS endpoint.
 */
describe("generateLocalPairingOffer", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function createPaseoHome(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "pairing-offer-test-"));
    roots.push(root);
    return root;
  }

  async function relayFromOffer(args: {
    paseoHome: string;
    relayEndpoint?: string;
    relayUseTls?: boolean;
  }) {
    const offer = await generateLocalPairingOffer({ ...args, includeQr: false });
    expect(offer.url).toBeTruthy();
    const parsed = parseConnectionOfferFromUrl(offer.url ?? "");
    expect(parsed).not.toBeNull();
    return parsed!.relay;
  }

  test("a self-hosted relay on 443 is offered over TLS", async () => {
    // The fallback used to be `relayEndpoint === "relay.paseo.sh:443"`, so every self-hosted relay
    // was advertised as plaintext no matter which port it listened on.
    const offer = await relayFromOffer({
      paseoHome: await createPaseoHome(),
      relayEndpoint: "relay.example.com:443",
    });

    expect(offer.endpoint).toBe("relay.example.com:443");
    expect(offer.useTls).toBe(true);
  });

  test("a plaintext relay port is offered without TLS", async () => {
    const offer = await relayFromOffer({
      paseoHome: await createPaseoHome(),
      relayEndpoint: "127.0.0.1:8787",
    });

    expect(offer.useTls).toBe(false);
  });

  test("an explicit relayUseTls still wins", async () => {
    const offer = await relayFromOffer({
      paseoHome: await createPaseoHome(),
      relayEndpoint: "relay.example.com:443",
      relayUseTls: false,
    });

    expect(offer.useTls).toBe(false);
  });

  test("relay disabled produces no offer at all", async () => {
    const result = await generateLocalPairingOffer({
      paseoHome: await createPaseoHome(),
      relayEnabled: false,
    });

    expect(result).toEqual({ relayEnabled: false, url: null, qr: null });
  });
});
