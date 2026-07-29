// Vercel serverless function — emails a submitted Kadr brief to the team inbox.
// Uses Resend; the API key lives only in the RESEND_API_KEY env var (server-side),
// never in the client. Reply-To is the lead's own address, so hitting reply in the
// inbox starts the conversation with them directly.

const TO = process.env.BRIEF_TO_EMAIL || 'kadrcuts@gmail.com';
const FROM = process.env.BRIEF_FROM_EMAIL || 'onboarding@resend.dev';

// Question keys in the order they appear in the form, with human-readable labels.
const FIELDS = [
  ['firm', 'Team type'],
  ['volume', 'Monthly edit volume'],
  ['content', 'Delivering'],
  ['turnaround', 'Turnaround'],
];

function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmt(v) {
  return Array.isArray(v) ? v.join(', ') : String(v ?? '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Accept JSON or form-encoded bodies.
  let email = '';
  let answers = {};
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    email = (body.email || '').trim();
    if (body.answers && typeof body.answers === 'object') answers = body.answers;
  } catch {
    email = (req.body && req.body.email ? String(req.body.email) : '').trim();
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email.' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: 'Server not configured.' });
  }

  const name = String(answers.name || '').slice(0, 120).trim();
  const company = String(answers.company || '').slice(0, 120).trim();

  // Log the full brief too, so it lands in Vercel function logs even if mail fails.
  console.log('brief', JSON.stringify({ email, ...answers }));

  const rows = [
    ['Name', name || '—'],
    ['Firm', company || '—'],
    ['Email', email],
    ...FIELDS.map(([k, label]) => [label, fmt(answers[k]) || '—']),
  ];

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#1a1a1a">
  <h2 style="margin:0 0 4px">New brief${company ? ` — ${esc(company)}` : ''}</h2>
  <p style="margin:0 0 20px;color:#666">Reply to this email to answer the lead directly.</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 20px 6px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(
            label
          )}</td><td style="padding:6px 0"><strong>${esc(value)}</strong></td></tr>`
      )
      .join('')}
  </table>
</div>`;

  const text = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Kadr Briefs <${FROM}>`,
        to: [TO],
        reply_to: email,
        subject: `New brief — ${company || name || email}`,
        html,
        text,
      }),
    });

    if (r.ok) return res.status(200).json({ ok: true });

    const detail = await r.text();
    console.error('Resend error', r.status, detail);
    return res.status(502).json({ ok: false, error: 'Could not send your brief right now.' });
  } catch (err) {
    console.error('subscribe handler error', err);
    return res.status(502).json({ ok: false, error: 'Could not send your brief right now.' });
  }
}
