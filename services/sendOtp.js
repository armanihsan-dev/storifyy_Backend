import OTP from "../models/otpModel.js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpService(email) {
  // Generate 4-digit OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  // Save OTP in DB
  await OTP.findOneAndUpdate(
    { email },
    { otp, createdAt: new Date() },
    { upsert: true, new: true }
  );

  try {

    // Send email
    await resend.emails.send({
      from: "Storifyy Support <support@storifyy.cloud>",
      to: email,
      subject: "Your OTP Code 🔐",
      html: `
    <div style="
  font-family: 'Poppins', Roboto, Helvetica, Arial, sans-serif;
  background: #f3f4f6;
  padding: 45px 0;
  text-align: center;
  color: #111827;
">
  <div style="
    max-width: 480px;
    margin: auto;
    background: #ffffff;
    border-radius: 20px;
    padding: 40px 35px;
    box-shadow: 0 10px 35px rgba(0, 0, 0, 0.08);
  ">

    <!-- Heading -->
    <h2 style="
      font-size: 24px; 
      font-weight: 700; 
      margin-bottom: 8px;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    ">
      Your One-Time Password
    </h2>

    <!-- Sub text -->
    <p style="
      font-size: 15px; 
      color: #6b7280; 
      margin-bottom: 25px;
      line-height: 1.6;
    ">
      Use the OTP below to verify your email for 
      <strong style="color:#111;">Storage App</strong>.
    </p>

    <!-- OTP CARD -->
    <div style="
      background: linear-gradient(135deg, #fb7185, #f43f5e);
      padding: 18px 0;
      border-radius: 14px;
      margin: 30px 0;
      box-shadow: 0 8px 20px rgba(244, 63, 94, 0.25);
    ">
      <span style="
        font-size: 42px;
        font-weight: 700;
        letter-spacing: 14px;
        color: #fff;
        display: inline-block;
      ">
        ${otp}
      </span>
    </div>

    <!-- Info -->
    <p style="color:#6b7280; font-size:14px; line-height: 1.6;">
      This OTP is valid for <strong>10 minutes</strong>.<br />
      If you didn’t request this, you can safely ignore this email.
    </p>

    <div style="height: 1px; background:#e5e7eb; margin: 30px 0;"></div>

    <!-- Footer -->
    <p style="font-size:12px; color:#9ca3af;">
      © ${new Date().getFullYear()} Storage App. All rights reserved.<br />
      <span style="color:#111;">Developed by Arman Ihsan</span>
    </p>
  </div>
</div>
    `,
    });

    return { success: true, message: "OTP sent successfully" };

  } catch (err) {
    console.error("Resend error:", err);
    return { success: false, message: "Failed to send OTP" };
  }

  return { success: true, message: "OTP sent successfully" };
}

