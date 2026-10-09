process.env.CRM_SHEET_SYNC = "0"; // test servers never call Google
process.env.CRM_PUSH = "0";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Push = require("../push");

// RFC 8291 decryption, as the browser does it, to prove the payload is readable.
function decrypt(body, browserKeys, authSecret) {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + keyLength);
  const secret = browserKeys.computeSecret(serverPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), browserKeys.getPublicKey(), serverPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, authSecret, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const data = body.subarray(21 + keyLength);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.at(-1), 2);
  return plain.subarray(0, -1).toString();
}

test("push payloads are encrypted for the browser and signed with VAPID", () => {
  const browser = crypto.createECDH("prime256v1");
  browser.generateKeys();
  const auth = crypto.randomBytes(16);
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
  const body = Push.encryptPayload(JSON.stringify({ title: "🔥 رسالة جديدة" }), subscription);
  assert.deepEqual(JSON.parse(decrypt(body, browser, auth)), { title: "🔥 رسالة جديدة" });

  const keys = Push.generateVapidKeys();
  const [, jwt, k] = Push.vapidHeader(subscription.endpoint, keys).match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [header, claims, signature] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(claims, "base64url")).aud, "https://fcm.googleapis.com");
  const publicKey = Buffer.from(keys.publicKey, "base64url");
  const verifier = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: publicKey.subarray(1, 33).toString("base64url"), y: publicKey.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${header}.${claims}`), { key: verifier, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
});
