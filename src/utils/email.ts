import 'dotenv/config';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY as string;
const FROM_EMAIL = process.env.RESEND_FROM || 'OK777 <no-reply@ok777.io>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function buildVerificationHtml(codeOrText: string, title: string = 'OK777 Verification Code') {
  const safe = String(codeOrText).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#0b0f1a; color:#ffffff; font-family: Arial, Helvetica, sans-serif; }
    .container { max-width: 520px; margin: 0 auto; padding: 24px; }
    .card { background: #12172a; border-radius: 12px; padding: 24px; border: 1px solid #1f2a44; }
    .header { display:flex; align-items:center; gap: 12px; margin-bottom: 16px; }
    .logo { width: 28px; height: 28px; background: linear-gradient(135deg, #4f46e5, #06b6d4); border-radius: 6px; }
    .brand { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .title { font-size: 20px; font-weight: 700; margin: 16px 0 8px; }
    .subtext { color: #9da7c2; font-size: 14px; margin-bottom: 18px; }
    .code { display: inline-block; background: #0b1226; color: #e5eeff; border: 1px solid #233155; padding: 14px 18px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 26px; letter-spacing: 6px; border-radius: 10px; }
    .footer { color: #7f8bb3; font-size: 12px; margin-top: 18px; }
    hr { border: none; border-top: 1px solid #1f2a44; margin: 20px 0; }
    a { color: #60a5fa; text-decoration: none; }
  </style>
  </head>
  <body>
    <div class="container">
      <div class="card">
        <div class="header">
          <div class="logo"></div>
          <div class="brand">OK777</div>
        </div>
        <div class="title">${title}</div>
        <div class="subtext">Use the code below to verify your email address. This code will expire in 5 minutes.</div>
        <div class="code">${safe}</div>
        <hr />
        <div class="footer">
          If you didn't request this, you can safely ignore this email.<br/>
          Sent by <a href="https://ok777.io" target="_blank" rel="noopener">ok777.io</a>
        </div>
      </div>
    </div>
  </body>
  </html>
  `.trim();
}

export const sendEmail = async (email: string, subject: string, text: string) => {
  if (!resend) {
    throw new Error('RESEND_API_KEY not configured');
  }
  const html = buildVerificationHtml(text, 'OK777 Verification Code');
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    html,
    text,
  });
  if (error) {
    throw error;
  }
  return { ok: true } as any;
};