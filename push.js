// Web Push without dependencies: VAPID (RFC 8292) + aes128gcm payload
// encryption (RFC 8291), using only node:crypto and fetch.
const crypto = require("node:crypto");

const b64u = (buffer) => Buffer.from(buffer).toString("base64url");
const fromB64u = (text) => Buffer.from(String(text || ""), "base64url");

function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidPrivateKey(keys) {
  const publicKey = fromB64u(keys.publicKey);
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64u(publicKey.subarray(1, 33)), y: b64u(publicKey.subarray(33, 65)) },
    format: "jwk",
  });
}

function vapidHeader(endpoint, keys, subject = "mailto:admin@cmcg.ma") {
  const audience = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const signature = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(keys), dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

// RFC 8291 single-record aes128gcm body for one subscription.
function encryptPayload(payload, subscription) {
  const userPublic = fromB64u(subscription.keys?.p256dh);
  const authSecret = fromB64u(subscription.keys?.auth);
  if (userPublic.length !== 65 || authSecret.length < 16) throw new Error("Invalid push subscription keys");
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(userPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), userPublic, serverPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, body]);
}

// Returns the push service status; 404/410 mean the subscription is gone.
async function sendPush(subscription, data, keys, { ttl = 3600, urgency = "high", topic = "" } = {}) {
  const headers = {
    TTL: String(ttl),
    Urgency: urgency,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: vapidHeader(subscription.endpoint, keys),
  };
  if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: encryptPayload(JSON.stringify(data), subscription),
    signal: AbortSignal.timeout(15000),
  });
  return response.status;
}

module.exports = { generateVapidKeys, vapidHeader, encryptPayload, sendPush };
