import { EmailMessage } from "cloudflare:email";

const MAX_FIELD_LENGTH = {
  name: 120,
  company: 120,
  contact: 180,
  message: 4000,
  source: 400,
  referrer: 400,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validate(payload) {
  const name = clean(payload.name, MAX_FIELD_LENGTH.name);
  const company = clean(payload.company, MAX_FIELD_LENGTH.company);
  const contact = clean(payload.contact, MAX_FIELD_LENGTH.contact);
  const message = clean(payload.message, MAX_FIELD_LENGTH.message);
  const website = clean(payload.website, 200);
  const source = clean(payload.source, MAX_FIELD_LENGTH.source);
  const referrer = clean(payload.referrer, MAX_FIELD_LENGTH.referrer);
  const turnstileToken = clean(payload.turnstileToken, 4000);

  if (!name || !company || !contact || !message) {
    return { error: "All fields are required." };
  }

  if (!turnstileToken) {
    return { error: "Please complete the anti-spam check." };
  }

  return { name, company, contact, message, website, source, referrer, turnstileToken };
}

async function verifyTurnstile(secret, token, remoteIp) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const result = await response.json();
  return Boolean(result && result.success);
}

async function isRateLimited(env, ip) {
  if (!env.RATE_LIMIT) {
    return false;
  }

  const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS || 600);
  const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS || 5);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${ip}:${bucket}`;

  const currentRaw = await env.RATE_LIMIT.get(key);
  const current = Number(currentRaw || 0) + 1;
  await env.RATE_LIMIT.put(key, String(current), { expirationTtl: windowSeconds });
  return current > maxRequests;
}

function buildRawEmail({ from, to, subject, text, replyTo }) {
  const safeSubject = subject.replace(/[\r\n]+/g, " ").trim();
  const fromDomain = (from.split("@")[1] || "lqve.solutions").trim();
  const messageId = `<${crypto.randomUUID()}@${fromDomain}>`;
  const date = new Date().toUTCString();
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `Reply-To: ${replyTo || from}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
}

async function parseRequestBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const form = await request.formData();
  return {
    name: form.get("name"),
    company: form.get("company"),
    contact: form.get("contact"),
    message: form.get("message"),
    website: form.get("website"),
    source: form.get("source"),
    referrer: form.get("referrer"),
    turnstileToken: form.get("cf-turnstile-response") || form.get("turnstileToken"),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/contact") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    let payload;
    try {
      payload = await parseRequestBody(request);
    } catch {
      return json({ error: "Invalid request body." }, 400);
    }

    const validated = validate(payload);
    if (validated.error) {
      return json({ error: validated.error }, 400);
    }

    if (validated.website) {
      return json({ ok: true });
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    if (await isRateLimited(env, clientIp)) {
      return json({ error: "Too many requests. Please try again shortly." }, 429);
    }

    if (!env.TURNSTILE_SECRET) {
      return json({ error: "Server configuration missing Turnstile secret." }, 500);
    }

    const turnstileOk = await verifyTurnstile(
      env.TURNSTILE_SECRET,
      validated.turnstileToken,
      clientIp,
    );
    if (!turnstileOk) {
      return json({ error: "Anti-spam verification failed. Please try again." }, 400);
    }

    const destination = env.CONTACT_TO || "business@lqve.solutions";
    const fromAddress = env.CONTACT_FROM || "no-reply@lqve.solutions";
    const replyTo = env.CONTACT_REPLY_TO || "business@lqve.solutions";

    const messageText = [
      "New contact form submission",
      "",
      `Name: ${validated.name}`,
      `Company: ${validated.company}`,
      `Email/Contact: ${validated.contact}`,
      "",
      "Message:",
      validated.message,
      "",
      `Source URL: ${validated.source || "n/a"}`,
      `Referrer: ${validated.referrer || "n/a"}`,
      `IP: ${clientIp}`,
      `Received at: ${new Date().toISOString()}`,
    ].join("\n");

    const raw = buildRawEmail({
      from: fromAddress,
      to: destination,
      subject: `LQVE Contact | ${validated.name} (${validated.company})`,
      text: messageText,
      replyTo,
    });

    try {
      await env.CONTACT_EMAIL.send(
        new EmailMessage(fromAddress, destination, raw),
      );
      return json({ ok: true });
    } catch (error) {
      const details = error && error.message ? error.message : String(error);
      console.error("Email send failed:", details);
      return json({ error: "Email delivery failed.", details }, 502);
    }
  },
};
