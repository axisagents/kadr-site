// Vercel serverless function — subscribes an email to the Kadr "Hook Vault"
// MailerLite group. The API key lives only in the MAILERLITE_API_KEY env var
// (server-side), never in the client. Joining the group triggers the welcome
// automation that delivers the Hook Vault + the follow-up drip.

const GROUP_ID = '191257345898055136'; // Hook Vault

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Accept JSON or form-encoded bodies.
  let email = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    email = (body.email || '').trim();
  } catch {
    email = (req.body && req.body.email ? String(req.body.email) : '').trim();
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email.' });
  }

  const key = process.env.MAILERLITE_API_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: 'Server not configured.' });
  }

  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email, groups: [GROUP_ID] }),
    });

    // MailerLite returns 200/201 on success, 200 for already-subscribed.
    if (r.ok) return res.status(200).json({ ok: true });

    const detail = await r.text();
    console.error('MailerLite error', r.status, detail);
    return res.status(502).json({ ok: false, error: 'Could not subscribe right now.' });
  } catch (err) {
    console.error('subscribe handler error', err);
    return res.status(502).json({ ok: false, error: 'Could not subscribe right now.' });
  }
}
