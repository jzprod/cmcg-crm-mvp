// WhatsApp Cloud API webhook: verification, signature check and payload parsing.
const crypto = require("crypto");

function verifyChallenge(query, verifyToken) {
  const mode = query.get("hub.mode");
  const token = query.get("hub.verify_token") || "";
  const challenge = query.get("hub.challenge") || "";
  if (mode !== "subscribe" || !verifyToken || token.length !== verifyToken.length) return null;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(verifyToken)) ? challenge : null;
}

// X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app secret, raw body).
function validSignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected.toLowerCase()), Buffer.from(header.toLowerCase()));
}

// Moroccan numbers to 212XXXXXXXXX; other countries kept as digits.
function normalizeWaPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[5-7]\d{8}$/.test(digits)) digits = `212${digits.slice(1)}`;
  return digits;
}

// Flatten a webhook body into inbound messages (customer -> business) and
// echoes (business app -> customer, sent with coexistence).
function parseWebhook(body) {
  const inbound = [];
  const echoes = [];
  (body?.entry || []).forEach((entry) => {
    (entry.changes || []).forEach((change) => {
      const value = change.value || {};
      if (value.messaging_product && value.messaging_product !== "whatsapp") return;
      const phoneNumberId = String(value.metadata?.phone_number_id || "");
      const businessNumber = String(value.metadata?.display_phone_number || "");
      const names = new Map((value.contacts || []).map((contact) => [normalizeWaPhone(contact.wa_id), contact.profile?.name || ""]));
      (value.messages || []).forEach((message) => {
        if (!message?.id || !message.from) return;
        const from = normalizeWaPhone(message.from);
        const referral = message.referral && typeof message.referral === "object" ? {
          sourceType: String(message.referral.source_type || ""),
          sourceId: String(message.referral.source_id || ""),
          sourceUrl: String(message.referral.source_url || ""),
          headline: String(message.referral.headline || "").slice(0, 300),
          body: String(message.referral.body || "").slice(0, 500),
          mediaType: String(message.referral.media_type || ""),
          ctwaClid: String(message.referral.ctwa_clid || ""),
        } : null;
        inbound.push({
          messageId: String(message.id),
          from,
          name: names.get(from) || "",
          phoneNumberId,
          businessNumber,
          wabaId: String(entry.id || ""),
          type: String(message.type || ""),
          text: message.type === "text" ? String(message.text?.body || "").slice(0, 1000) : "",
          at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          referral: referral && (referral.sourceId || referral.ctwaClid) ? referral : null,
        });
      });
      (value.message_echoes || []).forEach((message) => {
        if (!message?.id || !message.to) return;
        echoes.push({ messageId: String(message.id), to: normalizeWaPhone(message.to), phoneNumberId, at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString() });
      });
    });
  });
  return { inbound, echoes };
}

module.exports = { verifyChallenge, validSignature, normalizeWaPhone, parseWebhook };
