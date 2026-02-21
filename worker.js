import { EmailMessage } from "cloudflare:email";

const MAX_FIELD_LENGTH = {
  name: 120,
  company: 120,
  position: 120,
  message: 4000,
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
  const position = clean(payload.position, MAX_FIELD_LENGTH.position);
  const message = clean(payload.message, MAX_FIELD_LENGTH.message);

  if (!name || !company || !position || !message) {
    return { error: "All fields are required." };
  }

  return { name, company, position, message };
}

function buildRawEmail({ from, to, subject, text }) {
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
    position: form.get("position"),
    message: form.get("message"),
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

    const destination = env.CONTACT_TO || "business@lqve.solutions";
    const fromAddress = env.CONTACT_FROM || "no-reply@lqve.solutions";

    const messageText = [
      "New contact form submission",
      "",
      `Name: ${validated.name}`,
      `Company: ${validated.company}`,
      `Position: ${validated.position}`,
      "",
      "Message:",
      validated.message,
      "",
      `Received at: ${new Date().toISOString()}`,
    ].join("\n");

    const raw = buildRawEmail({
      from: fromAddress,
      to: destination,
      subject: `LQVE Contact | ${validated.name} (${validated.company})`,
      text: messageText,
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
