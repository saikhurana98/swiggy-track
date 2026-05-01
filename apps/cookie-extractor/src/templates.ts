function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_STYLE = `
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
  h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
  p { color: #4b5563; }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 0.5rem; font-size: 1rem; border: 1px solid #d1d5db; border-radius: 0.375rem; }
  button { margin-top: 1rem; padding: 0.6rem 1rem; font-size: 1rem; border: 0; border-radius: 0.375rem; background: #f97316; color: white; cursor: pointer; }
  button:hover { background: #ea580c; }
  .warn { background: #fef3c7; border: 1px solid #fcd34d; padding: 0.6rem; border-radius: 0.375rem; color: #92400e; margin-top: 1rem; }
  .err { color: #b91c1c; margin-top: 0.75rem; min-height: 1.25rem; }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function phonePage(): string {
  return shell(
    'Swiggy cookie extractor',
    `<h1>Swiggy cookie extractor</h1>
<p>Enter the mobile number you use to log in to Swiggy. We will request an OTP.</p>
<form id="phone-form">
  <label for="phone">Mobile number (10 digits)</label>
  <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" pattern="[6-9][0-9]{9}" required />
  <button type="submit">Send OTP</button>
  <div id="err" class="err" role="alert"></div>
</form>
<script>
  const form = document.getElementById('phone-form');
  const err = document.getElementById('err');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    err.textContent = '';
    const phone = document.getElementById('phone').value.trim();
    try {
      const res = await fetch('/api/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        err.textContent = body.error || 'Failed to send OTP.';
        return;
      }
      window.location.href = '/otp';
    } catch (e) {
      err.textContent = 'Network error.';
    }
  });
</script>`,
  );
}

export function otpPage(maskedPhone: string): string {
  return shell(
    'Enter Swiggy OTP',
    `<h1>Enter the OTP</h1>
<p>OTP sent to <strong>${escape(maskedPhone)}</strong>. Enter the 4-6 digit code.</p>
<form id="otp-form">
  <label for="otp">OTP</label>
  <input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,6}" required />
  <button type="submit">Verify</button>
  <div id="err" class="err" role="alert"></div>
</form>
<script>
  const form = document.getElementById('otp-form');
  const err = document.getElementById('err');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    err.textContent = '';
    const otp = document.getElementById('otp').value.trim();
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otp }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        err.textContent = body.error || 'Verification failed.';
        return;
      }
      sessionStorage.setItem('swiggy_cookies', JSON.stringify(body.cookies));
      window.location.href = '/done';
    } catch (e) {
      err.textContent = 'Network error.';
    }
  });
</script>`,
  );
}

export function donePage(): string {
  return shell(
    'Swiggy cookies captured',
    `<h1>Cookies captured</h1>
<p>Copy this JSON and paste it into the Home Assistant config flow for Swiggy Track.</p>
<div class="warn">These values are session secrets. Do not share them or commit them to git.</div>
<label for="output">Cookies JSON</label>
<textarea id="output" rows="14" readonly></textarea>
<button type="button" id="copy-btn">Copy to clipboard</button>
<div id="err" class="err" role="alert"></div>
<script>
  const out = document.getElementById('output');
  const err = document.getElementById('err');
  const data = sessionStorage.getItem('swiggy_cookies');
  if (!data) {
    err.textContent = 'No cookie data found in this tab. Start over from /.';
  } else {
    out.value = JSON.stringify(JSON.parse(data), null, 2);
  }
  document.getElementById('copy-btn').addEventListener('click', async () => {
    err.textContent = '';
    try {
      await navigator.clipboard.writeText(out.value);
      err.textContent = 'Copied.';
    } catch (e) {
      err.textContent = 'Clipboard write failed; copy manually.';
    }
  });
</script>`,
  );
}

export function maskPhone(phone: string): string {
  const last4 = phone.slice(-4);
  return `+91 XXXXX-XX${last4.slice(-4)}`;
}
