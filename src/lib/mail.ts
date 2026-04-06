import nodemailer from "nodemailer";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInviteCodeEmail(params: {
  email: string;
  username: string;
  inviteCode: string;
  expiresAt: Date;
}) {
  const host = requiredEnv("SMTP_HOST");
  const user = requiredEnv("SMTP_USER");
  const pass = requiredEnv("SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("SMTP transport is not configured.");
  }

  const rawFrom = process.env.MAIL_FROM ?? process.env.SMTP_FROM ?? user;
  const from = rawFrom.includes("<") ? rawFrom : `homeLabShare Admin <${rawFrom}>`;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const registerUrl = `${appUrl}/register`;

  await transporter.sendMail({
    from,
    to: params.email,
    subject: "homeLabShare Activation Code",
    text: `Hi ${params.username},\n\nYour activation code is: ${params.inviteCode}\nExpires at: ${params.expiresAt.toISOString()}\n\nRegister here: ${registerUrl}\n`,
    html: `
      <div style="margin:0;padding:24px;background:#09090b;font-family:Arial,sans-serif;color:#e4e4e7;">
        <div style="max-width:560px;margin:0 auto;border:1px solid #27272a;border-radius:16px;overflow:hidden;background:#18181b;">
          <div style="padding:20px 24px;border-bottom:1px solid #27272a;">
            <div style="font-size:26px;font-weight:700;letter-spacing:.2px;"><span style="color:#22c55e;">homeLab</span>Share</div>
            <p style="margin:8px 0 0;color:#a1a1aa;font-size:14px;">Your activation code is ready.</p>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 16px;font-size:16px;color:#f4f4f5;">Hi ${params.username},</p>
            <p style="margin:0 0 16px;line-height:1.6;color:#d4d4d8;">
              Use the activation code below to complete your account registration.
            </p>
            <div style="margin:0 0 20px;padding:14px 16px;background:#09090b;border:1px solid #3f3f46;border-radius:10px;">
              <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.08em;">Activation code</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#22c55e;letter-spacing:.08em;">${params.inviteCode}</p>
            </div>
            <p style="margin:0 0 20px;color:#a1a1aa;font-size:13px;">
              This code expires at ${params.expiresAt.toISOString()}.
            </p>
            <a href="${registerUrl}" style="display:inline-block;background:#22c55e;color:#09090b;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Create Account</a>
          </div>
        </div>
      </div>
    `,
  });
}
