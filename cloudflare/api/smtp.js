// 热点雷达 · QQ 邮箱 SMTP 验证码发送
// Workers 无法直接使用 nodemailer，这里用 cloudflare:sockets 建立隐式 TLS 连接，
// 手写 SMTP 对话（EHLO → AUTH LOGIN → MAIL/RCPT/DATA → QUIT）。
// 连接固定为 smtp.qq.com:465，账号与授权码来自 env.MAIL_USER / env.MAIL_PASS。
import { connect } from "cloudflare:sockets";

const TIMEOUT_MS = 15_000;
const SMTP_HOST = "smtp.qq.com";
const SMTP_PORT = 465;
const DEFAULT_SENDER_NAME = "热点雷达";

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`smtp_timeout:${label}`)), TIMEOUT_MS),
    ),
  ]);
}

/** 逐行读取器：把字节流切成以 \r\n 分隔的行。 */
class LineReader {
  constructor(socket) {
    this.reader = socket.readable.getReader();
    this.decoder = new TextDecoder();
    this.buf = "";
  }
  async readLine() {
    for (;;) {
      const idx = this.buf.indexOf("\r\n");
      if (idx >= 0) {
        const line = this.buf.slice(0, idx);
        this.buf = this.buf.slice(idx + 2);
        return line;
      }
      const { done, value } = await this.reader.read();
      if (done) throw new Error("smtp_closed");
      this.buf += this.decoder.decode(value, { stream: true });
    }
  }
  /** 读取一条应答，跳过 "250-..." 的多行中间行，返回最后一行。 */
  async readReply() {
    let line = "";
    for (;;) {
      line = await this.readLine();
      if (line.length < 4 || line[3] !== "-") return line;
    }
  }
}

function b64(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

function b64Wrapped(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // 按 76 字符折行（MIME 规范）
  return (btoa(binary).match(/.{1,76}/g) || []).join("\r\n");
}

function mimeHeader(name, value) {
  return `${name}: =?UTF-8?B?${b64(value)}?=`;
}

/** 发一封验证码邮件，失败时抛错（错误信息只含阶段代号，不带密钥）。 */
export async function sendVerificationEmail(env, to, code, purpose) {
  const user = env.MAIL_USER;
  const pass = env.MAIL_PASS;
  if (!user || !pass) throw new Error("mail_not_configured");

  const fromName = env.MAIL_SENDER_NAME || DEFAULT_SENDER_NAME;
  const scene = purpose === "reset" ? "找回密码" : "注册";
  const subject = `【${fromName}】${scene}验证码：${code}`;

  const body = `<!doctype html><html><body style="margin:0;padding:24px;background:#0b1120;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#111a2e;border:1px solid #23314f;border-radius:14px;overflow:hidden">
    <div style="background:#e5484d;padding:14px 22px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.08em">热点雷达 · 邮箱验证</div>
    <div style="padding:24px 26px;color:#d7deec;font-size:14px;line-height:1.8">
      <p style="margin:0 0 12px">你好，雷达用户：</p>
      <p style="margin:0 0 16px">你的${scene}验证码是下面这串数字，10 分钟内有效。请勿透露给任何人。</p>
      <div style="text-align:center;margin:18px 0">
        <span style="display:inline-block;padding:12px 30px;border:1px dashed #e5484d;border-radius:10px;font-size:30px;font-weight:800;letter-spacing:.35em;color:#ff8a8d">${code}</span>
      </div>
      <p style="margin:0;color:#8b98b3;font-size:12px">如果这不是你本人的操作，请忽略这封邮件，你的账号不会受到影响。</p>
    </div>
    <div style="border-top:1px solid #23314f;padding:12px 22px;color:#6b7a99;font-size:11px;text-align:center">热点雷达 · 捕捉正在发生的热点</div>
  </div>
</body></html>`;

  const socket = connect(
    { hostname: SMTP_HOST, port: SMTP_PORT },
    { secureTransport: "on", allowHalfOpen: false },
  );
  const writer = socket.writable.getWriter();
  const reader = new LineReader(socket);
  const enc = new TextEncoder();
  let stage = "connect";

  const write = (s) => writer.write(enc.encode(s));
  const cmd = async (line, expect, nextStage) => {
    await write(line + "\r\n");
    const reply = await reader.readReply();
    if (!reply.startsWith(expect)) {
      throw new Error(`smtp_bad_reply:${stage}:${reply.slice(0, 60)}`);
    }
    stage = nextStage;
    return reply;
  };

  try {
    const greeting = await withTimeout(reader.readReply(), "greeting");
    if (!greeting.startsWith("220")) throw new Error(`smtp_greeting:${greeting.slice(0, 60)}`);

    await cmd("EHLO hot-radar", "250", "ehlo");
    await cmd("AUTH LOGIN", "334", "auth_user");
    await cmd(b64(user), "334", "auth_pass");
    await cmd(b64(pass), "235", "mail_from");
    await cmd(`MAIL FROM:<${user}>`, "250", "rcpt");
    await cmd(`RCPT TO:<${to}>`, "250", "data");

    await cmd("DATA", "354", "body");
    const dotStuffed = body
      .split("\r\n")
      .map((line) => (line.startsWith(".") ? "." + line : line))
      .join("\r\n");
    await write(
      [
        `From: =?UTF-8?B?${b64(fromName)}?= <${user}>`,
        `To: <${to}>`,
        mimeHeader("Subject", subject),
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        b64Wrapped(dotStuffed),
        ".",
        "",
      ].join("\r\n"),
    );
    const reply = await withTimeout(reader.readReply(), "data_end");
    if (!reply.startsWith("250")) {
      throw new Error(`smtp_bad_reply:${stage}:${reply.slice(0, 60)}`);
    }

    await write("QUIT\r\n");
  } finally {
    try {
      await writer.close();
    } catch {
      // 连接可能已断开
    }
    try {
      socket.close();
    } catch {
      // 同上
    }
  }
}
