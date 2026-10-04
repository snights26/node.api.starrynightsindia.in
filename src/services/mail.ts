import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

type MailAccount = "system" | "payment" | "quotation";
type SmtpSettings = typeof env.smtpPayment;
const transporters: Partial<Record<MailAccount, Transporter>> = {};
const verifiedTransporters = new Set<MailAccount>();
type DeliveryResult = { delivered: boolean; message: string; suppressed?: boolean };
const accountSettings = (account: MailAccount): SmtpSettings => account === "payment" ? env.smtpPayment : account === "quotation" ? env.smtpQuotation : env.smtp;
const getTransporter = (account: MailAccount): Transporter | undefined => {
  const settings = accountSettings(account);
  if (!env.smtp.enabled || !settings.host || !settings.username || !settings.password || !settings.from) return undefined;
  transporters[account] ??= nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, requireTLS: settings.starttls && !settings.secure, auth: { user: settings.username, pass: settings.password } });
  return transporters[account];
};

const verifyTransporter = async (account: MailAccount): Promise<DeliveryResult> => {
  const client = getTransporter(account);
  if (!client) return { delivered: false, message: "Email is disabled or not configured" };
  if (verifiedTransporters.has(account)) return { delivered: true, message: "Verified" };
  try {
    await client.verify();
    verifiedTransporters.add(account);
    console.info("SMTP transporter verified", { account });
    return { delivered: true, message: "Verified" };
  } catch {
    console.warn("SMTP transporter verification failed", { account });
    return { delivered: false, message: "Email delivery failed" };
  }
};

const layout = (title: string, content: string): string => `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033"><main style="max-width:640px;margin:24px auto;background:#fff;padding:32px;border-radius:10px"><h1 style="margin:0 0 20px;color:#12305b">Starry Nights</h1><h2>${title}</h2>${content}<p style="margin-top:28px;color:#64748b">Starry Nights Team</p></main></body></html>`;

type MailAttachment = { filename: string; contentType: string } & ({ content: Buffer; href?: never } | { href: string; content?: never });

export const sendEmail = async (options: { to: string; subject: string; html: string; attachments?: MailAttachment[] }, account: MailAccount = "system"): Promise<DeliveryResult> => {
  if (env.mail.deliveryMode === "disabled") return { delivered: false, message: "Email delivery is disabled for this runtime" };
  if (env.mail.deliveryMode === "safe" && !env.mail.safeRecipients.includes(options.to)) {
    console.info("SMTP delivery suppressed by staging allowlist", { account });
    return { delivered: false, suppressed: true, message: "Email delivery is suppressed outside the staging allowlist" };
  }
  const verified = await verifyTransporter(account);
  if (!verified.delivered) return verified;
  const client = getTransporter(account);
  if (!client) return { delivered: false, message: "Email is disabled or not configured" };
  try {
    await client.sendMail({ from: accountSettings(account).from, to: options.to, subject: options.subject, html: options.html, attachments: options.attachments });
    console.info("SMTP delivery accepted", { account, stagingSafeMode: env.mail.deliveryMode === "safe" });
    return { delivered: true, message: "Delivered" };
  } catch {
    console.warn("SMTP delivery failed", { account });
    return { delivered: false, message: "Email delivery failed" };
  }
};

const shouldSendAcknowledgement = (email: string): boolean => env.mail.deliveryMode !== "safe" || env.mail.safeRecipients.includes(email);

export const sendContactEmails = async (contact: { name: string; email: string; phone: string; message: string }): Promise<DeliveryResult> => {
  const destination = env.smtp.supportTo || env.smtp.to;
  if (!destination) return { delivered: false, message: "Contact email is not configured" };
  const internal = await sendEmail({ to: destination, subject: `New Starry Nights enquiry from ${contact.name}`, html: layout("New contact submission", `<p><b>Name:</b> ${escape(contact.name)}</p><p><b>Email:</b> ${escape(contact.email)}</p><p><b>Phone:</b> ${escape(contact.phone)}</p><p>${escape(contact.message)}</p>`) });
  if (!internal.delivered) return internal;
  if (contact.email && shouldSendAcknowledgement(contact.email)) {
    const acknowledgement = await sendEmail({ to: contact.email, subject: "We received your Starry Nights message", html: layout("Thank you for contacting us", `<p>Hi ${escape(contact.name)},</p><p>Our travel team has received your message and will be in touch shortly.</p>`) });
    if (!acknowledgement.delivered) return acknowledgement;
  }
  return internal;
};

export const sendEnquiryEmails = async (enquiry: { name: string; email?: string | null; phone: string; destination?: string | null; travelDates?: string | null; message?: string | null }): Promise<DeliveryResult> => {
  const destination = env.smtp.supportTo || env.smtp.to;
  const details = `<p><b>Name:</b> ${escape(enquiry.name)}</p><p><b>Phone:</b> ${escape(enquiry.phone)}</p>${enquiry.email ? `<p><b>Email:</b> ${escape(enquiry.email)}</p>` : ""}${enquiry.destination ? `<p><b>Destination:</b> ${escape(enquiry.destination)}</p>` : ""}${enquiry.travelDates ? `<p><b>Travel dates:</b> ${escape(enquiry.travelDates)}</p>` : ""}${enquiry.message ? `<p>${escape(enquiry.message)}</p>` : ""}`;
  if (!destination) return { delivered: false, message: "Enquiry email is not configured" };
  const internal = await sendEmail({ to: destination, subject: `New travel enquiry from ${enquiry.name}`, html: layout("New travel enquiry", details) });
  if (!internal.delivered) return internal;
  if (enquiry.email && shouldSendAcknowledgement(enquiry.email)) {
    const acknowledgement = await sendEmail({ to: enquiry.email, subject: "We received your Starry Nights enquiry", html: layout("Thank you for your enquiry", `<p>Hi ${escape(enquiry.name)},</p><p>Our travel team has received your enquiry and will contact you shortly.</p>`) });
    if (!acknowledgement.delivered) return acknowledgement;
  }
  return internal;
};

export const sendWelcomeEmail = async (user: { to?: string | null; name: string }): Promise<{ delivered: boolean; message: string }> => {
  if (!user.to) return { delivered: false, message: "Customer email is unavailable" };
  return sendEmail({ to: user.to, subject: "Welcome to Starry Nights Holidays", html: layout("Welcome aboard", `<p>Hi ${escape(user.name)},</p><p>Welcome to Starry Nights Holidays. Discover your next getaway, save packages that inspire you, and contact our travel team whenever you need help.</p>`) });
};

export const sendProfileCompletedEmail = async (user: { to?: string | null; name: string }): Promise<{ delivered: boolean; message: string }> => {
  if (!user.to) return { delivered: false, message: "Customer email is unavailable" };
  return sendEmail({ to: user.to, subject: "Your Starry Nights profile is complete", html: layout("Profile completed", `<p>Hi ${escape(user.name)},</p><p>Your profile is now complete. Our travel team can provide more personalised support for your next journey.</p>`) });
};

export const sendBookingConfirmationEmail = async (booking: { to?: string | null; name: string; tourId: string; packageName?: string | null; pickupDate?: string | null; totalCost?: number }): Promise<{ delivered: boolean; message: string }> => {
  if (!booking.to) return { delivered: false, message: "Customer email is unavailable" };
  const amount = typeof booking.totalCost === "number" ? `<p><b>Total:</b> ₹${booking.totalCost.toFixed(2)}</p>` : "";
  return sendEmail({ to: booking.to, subject: `Booking confirmed — ${booking.tourId}`, html: layout("Your booking is confirmed", `<p>Hi ${escape(booking.name)},</p><p><b>Booking reference:</b> ${escape(booking.tourId)}</p>${booking.packageName ? `<p><b>Package:</b> ${escape(booking.packageName)}</p>` : ""}${booking.pickupDate ? `<p><b>Travel date:</b> ${escape(booking.pickupDate)}</p>` : ""}${amount}<p>We look forward to travelling with you.</p>`) });
};

export const sendPaymentLinkEmail = async (payment: { to?: string | null; name: string; tourId: string; amount: number; paymentUrl: string; expiresAt?: Date | string | null }): Promise<{ delivered: boolean; message: string }> => {
  if (!payment.to) return { delivered: false, message: "Customer email is unavailable" };
  const expiry = payment.expiresAt ? `<p><b>Valid until:</b> ${escape(new Date(payment.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</p>` : "";
  return sendEmail({ to: payment.to, subject: `Secure payment request — ${payment.tourId}`, html: layout("Complete your payment", `<p>Hi ${escape(payment.name)},</p><p>Please use the secure link below to pay <b>₹${payment.amount.toFixed(2)}</b> for booking ${escape(payment.tourId)}.</p><p><a href="${escapeUrl(payment.paymentUrl)}">Pay securely</a></p>${expiry}<p>Do not reply with card or bank information.</p>`) }, "payment");
};

export const sendPaymentReceiptEmail = async (payment: { to?: string | null; name: string; tourId: string; amount: number; transactionId?: string | null }): Promise<{ delivered: boolean; message: string }> => {
  if (!payment.to) return { delivered: false, message: "Customer email is unavailable" };
  return sendEmail({ to: payment.to, subject: `Payment received — ${payment.tourId}`, html: layout("Payment received", `<p>Hi ${escape(payment.name)},</p><p>We received your payment of <b>₹${payment.amount.toFixed(2)}</b> for booking ${escape(payment.tourId)}.</p>${payment.transactionId ? `<p><b>Transaction reference:</b> ${escape(payment.transactionId)}</p>` : ""}`) }, "payment");
};

export const sendCareerEmail = async (application: { name: string; email: string; phone: string; position: string; about: string }, resume: { filename: string; content: Buffer; contentType: string }): Promise<{ delivered: boolean; message: string }> => {
  const destination = env.smtp.hrTo || env.smtp.to;
  if (!destination) return { delivered: false, message: "Career email is not configured" };
  return sendEmail({ to: destination, subject: `Career application: ${application.position || "General"} — ${application.name}`, html: layout("New career application", `<p><b>Name:</b> ${escape(application.name)}</p><p><b>Email:</b> ${escape(application.email)}</p><p><b>Phone:</b> ${escape(application.phone)}</p><p><b>Position:</b> ${escape(application.position)}</p><p>${escape(application.about)}</p>`), attachments: [resume] });
};

/** Fetches a short-lived, authorized object-storage URL directly in Nodemailer. */
export const sendCareerEmailFromUrl = async (application: { name: string; email: string; phone: string; position: string; about: string }, resume: { filename: string; href: string; contentType: string }): Promise<{ delivered: boolean; message: string }> => {
  const destination = env.smtp.hrTo || env.smtp.to;
  if (!destination) return { delivered: false, message: "Career email is not configured" };
  return sendEmail({ to: destination, subject: `Career application: ${application.position || "General"} — ${application.name}`, html: layout("New career application", `<p><b>Name:</b> ${escape(application.name)}</p><p><b>Email:</b> ${escape(application.email)}</p><p><b>Phone:</b> ${escape(application.phone)}</p><p><b>Position:</b> ${escape(application.position)}</p><p>${escape(application.about)}</p>`), attachments: [resume] });
};

export const sendQuotationEmail = async (to: string, packageName: string, body: string, attachment: Buffer, filename: string): Promise<{ delivered: boolean; message: string }> =>
  sendEmail({ to, subject: `Your Starry Nights quotation — ${packageName}`, html: layout(`Your ${escape(packageName)} quotation`, body ? `<p>${escape(body)}</p>` : "<p>Your personalised itinerary and quotation are attached.</p>"), attachments: [{ filename, content: attachment, contentType: "application/pdf" }] });

export const sendQuotationEmailFromUrl = async (to: string, packageName: string, body: string, href: string, filename: string): Promise<{ delivered: boolean; message: string }> =>
  sendEmail({ to, subject: `Your Starry Nights quotation — ${packageName}`, html: layout(`Your ${escape(packageName)} quotation`, body ? `<p>${escape(body)}</p>` : "<p>Your personalised itinerary and quotation are attached.</p>"), attachments: [{ filename, href, contentType: "application/pdf" }] });

// Legacy PostgreSQL rows can surface date-like values as non-string runtime
// values. Rendering mail must never turn a successfully persisted business
// action into a 500 solely because an optional display field is not a string.
const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const escapeUrl = (value: string): string => escape(value).replace(/`/g, "%60");
