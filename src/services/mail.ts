import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

type MailAccount = "system" | "payment" | "quotation";
type RecipientRole = "customer" | "internal" | "applicant" | "recruitment";
type SmtpSettings = typeof env.smtpPayment;
type MailAttachment = { filename: string; contentType: string } & ({ content: Buffer; href?: never } | { href: string; content?: never });
export type DeliveryOutcome = { role: RecipientRole; delivered: boolean; message: string; redirected: boolean };
export type DeliveryResult = { delivered: boolean; message: string; suppressed?: boolean; outcomes: DeliveryOutcome[] };

const transporters: Partial<Record<MailAccount, Transporter>> = {};
const verifiedTransporters = new Set<MailAccount>();
const companyLogoUrl = "https://res.cloudinary.com/dkywwhihp/image/upload/v1788515842/gallery/qnuag37fe1oixuhe0z7a.png";
const companyAddress = "004, Starry Nights, Anusaya Society, Nanded - Maharashtra, India.";
const assistance = "+91 8847755042 | +91 9284137430";

const accountSettings = (account: MailAccount): SmtpSettings => account === "payment" ? env.smtpPayment : account === "quotation" ? env.smtpQuotation : env.smtp;
const supportRecipient = (): string | undefined => env.smtp.supportTo || env.smtp.to;
const hrRecipient = (): string | undefined => env.smtp.hrTo || supportRecipient();
const supportPhone = (): string => "+91 8847755042";
const headerValue = (value: unknown): string => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
const text = (value: unknown): string => String(value ?? "");
const escape = (value: unknown): string => text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character).replace(/\n/g, "<br>");
const valueOr = (value: string | null | undefined, fallback: string): string => value?.trim() || fallback;
const date = (value: Date | string | null | undefined): string => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toISOString().slice(0, 10);
};
const instant = (value: Date | string | null | undefined): string => {
  if (!value) return "As shown on the secure payment page";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "As shown on the secure payment page" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(parsed);
};
const money = (value: number | string | null | undefined): string => {
  const amount = Number(value ?? 0);
  return `INR ${Number.isFinite(amount) ? String(Number(amount.toFixed(2))) : "0"}`;
};
const contentRows = (...rows: string[]): string => `<table style="width:100%;border-collapse:collapse;margin:14px 0 18px;">${rows.join("")}</table>`;
const row = (label: string, value: unknown): string => `<tr><td style="border:1px solid #e5e7eb;background:#f9fafb;padding:10px;font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;width:34%;">${escape(label)}</td><td style="border:1px solid #e5e7eb;padding:10px;font-size:13px;color:#111827;">${escape(value)}</td></tr>`;
const paragraph = (value: string): string => `<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">${escape(value)}</p>`;
const section = (heading: string, ...parts: string[]): string => `<h2 style="margin:0 0 14px;color:#0b1f3a;font-size:19px;">${escape(heading)}</h2>${parts.join("")}`;
const cta = (label: string, href: string): string => `<p style="margin:18px 0 4px;"><a href="${escape(href)}" style="display:inline-block;background:#e50914;color:#ffffff;text-decoration:none;border-radius:6px;padding:11px 16px;font-weight:700;">${escape(label)}</a></p>`;
const signature = (): string => `<div style="background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:22px 24px;color:#173c78;font-size:14px;line-height:1.55;"><p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-style:italic;color:#173c78;">Team Lead, Operations</p><p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;font-style:italic;color:#0b2e6f;">Starry Nights Tours &amp; Adventures</p><p style="margin:0 0 4px;font-size:15px;font-weight:700;font-style:italic;color:#0b2e6f;">Head Office - Nanded</p><p style="margin:0 0 18px;color:#173c78;">${escape(companyAddress)}</p><p style="margin:0;color:#173c78;">Website: <a href="https://www.starrynightsindia.in" style="color:#1d5fc1;text-decoration:underline;">www.starrynightsindia.in</a></p><p style="margin:2px 0 18px;color:#173c78;">WhatsApp Message Assistance: ${escape(assistance)}</p><img src="${escape(companyLogoUrl)}" alt="Starry Nights Tours and Treks" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 auto;" /></div>`;
const htmlPage = (title: string, content: string): string => `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;"><div style="max-width:680px;margin:0 auto;padding:24px;"><div style="background:#0b1f3a;color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:#fca5a5;">Starry Nights Holidays</div><h1 style="margin:6px 0 0;font-size:24px;line-height:1.25;">${escape(title)}</h1></div><div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;">${content}</div>${signature()}</div></body></html>`;
const quotationBody = (body: string): string => body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split(/(?=^[A-Z][A-Z ]{2,}$)/m).map((block) => {
  const value = block.trim(); if (!value) return "";
  const breakAt = value.indexOf("\n"); const heading = breakAt < 0 ? "Quotation Details" : value.slice(0, breakAt).trim(); const content = breakAt < 0 ? value : value.slice(breakAt + 1).trim();
  return `<section style="margin:14px 0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;"><div style="padding:9px 13px;background:#0b1f3a;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${escape(heading)}</div><div style="padding:12px 13px;background:#fbfcfe;color:#374151;font-size:13px;line-height:1.65;">${escape(content)}</div></section>`;
}).join("");
const quotationAttachmentNotice = (): string => `<div style="margin:18px 0;padding:13px 15px;border-left:4px solid #e50914;border-radius:6px;background:#fff4f4;color:#7f1d1d;font-size:13px;line-height:1.6;"><strong>Complete quotation attached</strong><br>The attached PDF is print-ready and includes the full itinerary, booking terms, and cancellation policy.</div>`;

const getTransporter = (account: MailAccount): Transporter | undefined => {
  const settings = accountSettings(account);
  if (!env.smtp.enabled || !settings.host || !settings.username || !settings.password || !settings.from) return undefined;
  transporters[account] ??= nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.secure, requireTLS: settings.starttls && !settings.secure, auth: { user: settings.username, pass: settings.password } });
  return transporters[account];
};
const verifyTransporter = async (account: MailAccount): Promise<DeliveryResult> => {
  const client = getTransporter(account);
  if (!client) return { delivered: false, message: "Email is disabled or not configured", outcomes: [] };
  if (verifiedTransporters.has(account)) return { delivered: true, message: "Verified", outcomes: [] };
  try { await client.verify(); verifiedTransporters.add(account); console.info("SMTP transporter verified", { account }); return { delivered: true, message: "Verified", outcomes: [] }; }
  catch { console.warn("SMTP transporter verification failed", { account }); return { delivered: false, message: "Email delivery failed", outcomes: [] }; }
};

export const sendEmail = async (options: { to: string; subject: string; html: string; attachments?: MailAttachment[]; role?: RecipientRole }, account: MailAccount = "system"): Promise<DeliveryResult> => {
  const role = options.role ?? "customer";
  if (env.mail.deliveryMode === "disabled") return { delivered: false, message: "Email delivery is disabled for this runtime", outcomes: [{ role, delivered: false, message: "disabled", redirected: false }] };
  const targets = env.mail.deliveryMode === "safe" ? [...new Set(env.mail.safeRecipients)] : [options.to];
  if (!options.to || !targets.length) return { delivered: false, message: "Email delivery is not configured", outcomes: [{ role, delivered: false, message: "missing recipient", redirected: false }] };
  const verified = await verifyTransporter(account);
  if (!verified.delivered) return { ...verified, outcomes: [{ role, delivered: false, message: verified.message, redirected: false }] };
  const client = getTransporter(account);
  if (!client) return { delivered: false, message: "Email is disabled or not configured", outcomes: [{ role, delivered: false, message: "unavailable", redirected: false }] };
  const redirected = env.mail.deliveryMode === "safe" && !targets.includes(options.to);
  const outcomes: DeliveryOutcome[] = [];
  for (const target of targets) {
    try { await client.sendMail({ from: accountSettings(account).from, to: target, subject: headerValue(options.subject), html: options.html, attachments: options.attachments }); outcomes.push({ role, delivered: true, message: "Delivered", redirected }); }
    catch { console.warn("SMTP delivery failed", { account, role, stagingSafeMode: env.mail.deliveryMode === "safe" }); outcomes.push({ role, delivered: false, message: "Email delivery failed", redirected }); }
  }
  const delivered = outcomes.length > 0 && outcomes.every((outcome) => outcome.delivered);
  if (delivered) console.info("SMTP delivery accepted", { account, role, stagingSafeMode: env.mail.deliveryMode === "safe", redirected });
  return { delivered, message: delivered ? "Delivered" : "Email delivery failed", outcomes };
};

const combined = (...results: DeliveryResult[]): DeliveryResult => ({ delivered: results.every((result) => result.delivered), message: results.every((result) => result.delivered) ? "Delivered" : "Email delivery failed", outcomes: results.flatMap((result) => result.outcomes) });
const travelDates = (start?: Date | string | null, end?: Date | string | null): string => `${date(start)} to ${date(end)}`;
const travellerCount = (persons?: number | null, adults?: number | null, children?: number | null): string => persons && persons > 0 ? String(persons) : (adults || children) ? `${adults ?? 0} adults / ${children ?? 0} children` : "-";
const roomCount = (rooms?: number | null): string => !rooms || rooms < 1 ? "Not specified" : `${rooms} ${rooms === 1 ? "room" : "rooms"}`;

export const sendProfileCompletedEmail = async (user: { to?: string | null; name: string; contact?: string | null; city?: string | null; state?: string | null; country?: string | null }): Promise<DeliveryResult> => {
  if (!user.to) return { delivered: false, message: "Customer email is unavailable", outcomes: [] };
  return sendEmail({ to: user.to, role: "customer", subject: "Your Starry Nights profile is complete", html: htmlPage("Welcome to Starry Nights Holidays", section("Profile Completed", paragraph(`Dear ${text(user.name)}, your Starry Nights profile is now complete.`), contentRows(row("Name", user.name), row("Email", user.to), row("Mobile", user.contact), row("City", user.city), row("State", user.state), row("Country", user.country)), paragraph(`Our team is available at ${supportPhone()} or ${valueOr(supportRecipient(), "")} for travel support.`))) });
};

export const sendWelcomeEmail = async (user: { to?: string | null; name: string }): Promise<DeliveryResult> => {
  if (!user.to) return { delivered: false, message: "Customer email is unavailable", outcomes: [] };
  return sendEmail({ to: user.to, role: "customer", subject: "Welcome to Starry Nights Holidays", html: htmlPage("Welcome to Starry Nights Holidays", section("Welcome aboard", paragraph(`Dear ${text(user.name)}, welcome to Starry Nights Holidays.`), paragraph("We create memorable travel experiences with thoughtfully planned holidays, curated stays, and reliable support from the first idea to your return journey."), paragraph("Explore domestic and international travel experiences, discover your next getaway, and save the packages that inspire you."), cta("Explore Starry Nights", "https://www.starrynightsindia.in"), paragraph(`Need help planning your next trip? Our travel support team is available at ${supportPhone()} or ${valueOr(supportRecipient(), "")}.`))) });
};

export const sendBookingConfirmationEmail = async (booking: { to?: string | null; name: string; tourId: string; packageName?: string | null; pickupDate?: Date | string | null; dropDate?: Date | string | null; mobile?: string | null; adults?: number | null; kids?: number | null; totalCost?: number | null; paymentStatus?: string | null }): Promise<DeliveryResult> => {
  if (!booking.to) return { delivered: false, message: "Customer email is unavailable", outcomes: [] };
  return sendEmail({ to: booking.to, role: "customer", subject: `Booking confirmation - ${headerValue(booking.tourId)}`, html: htmlPage("Booking Confirmation", section("Your booking is confirmed", paragraph(`Dear ${text(booking.name)}, your booking with Starry Nights Holidays has been created successfully.`), contentRows(row("Booking ID", booking.tourId), row("Package", booking.packageName || "Travel Package"), row("Travel Dates", travelDates(booking.pickupDate, booking.dropDate)), row("Customer", booking.name), row("Mobile", booking.mobile), row("Passengers", `${booking.adults ?? 0} adults / ${booking.kids ?? 0} kids`), row("Total Cost", money(booking.totalCost)), row("Payment Status", booking.paymentStatus)), paragraph("Please keep this booking ID for future communication."))) });
};

export const sendPaymentLinkEmail = async (payment: { to?: string | null; name: string; tourId: string; packageName?: string | null; amount: number; paymentUrl: string; expiresAt?: Date | string | null }): Promise<DeliveryResult> => {
  if (!payment.to || !payment.paymentUrl) return { delivered: false, message: "A payment link and valid customer email are required", outcomes: [] };
  return sendEmail({ to: payment.to, role: "customer", subject: `Secure payment request - ${headerValue(payment.tourId)}`, html: htmlPage("Secure payment request", section("Complete your payment securely", paragraph(`Dear ${text(payment.name)}, a secure payment request has been prepared for your Starry Nights booking.`), contentRows(row("Tour ID", payment.tourId), row("Package", payment.packageName || "Travel Package"), row("Requested Amount", money(payment.amount)), row("Payment Expiry", instant(payment.expiresAt))), cta("PAY SECURELY WITH RAZORPAY", payment.paymentUrl), paragraph("For your safety, this email never asks for card, UPI, bank, or account credentials. Payment is completed only on Razorpay's hosted secure page."))) }, "payment");
};

export const sendPaymentReceiptEmail = async (payment: { to?: string | null; name: string; tourId: string; packageName?: string | null; amount: number; paymentDate?: Date | string | null; mode?: string | null; transactionId?: string | null; totalPaid?: number | null; dueAmount?: number | null }): Promise<DeliveryResult> => {
  if (!payment.to) return { delivered: false, message: "Customer email is unavailable", outcomes: [] };
  const invoiceBase = (env.publicAppUrl || "http://localhost:5173").replace(/\/$/, "");
  return sendEmail({ to: payment.to, role: "customer", subject: `Payment received - ${headerValue(payment.tourId)}`, html: htmlPage("Payment Successful", section("Payment received", paragraph(`Dear ${text(payment.name)}, we have received your payment for ${payment.packageName || "Travel Package"}.`), contentRows(row("Invoice / Booking ID", payment.tourId), row("Amount Paid", money(payment.amount)), row("Payment Date", date(payment.paymentDate)), row("Payment Mode", payment.mode), row("Transaction Reference", payment.transactionId), row("Total Paid", money(payment.totalPaid ?? payment.amount)), row("Balance Due", money(payment.dueAmount ?? 0))), cta("Download Invoice", `${invoiceBase}/invoice/${encodeURIComponent(payment.tourId)}`))) }, "payment");
};

export const sendContactEmails = async (contact: { name: string; email: string; phone: string; message: string }): Promise<DeliveryResult> => {
  const customer = await sendEmail({ to: contact.email, role: "customer", subject: "We received your enquiry", html: htmlPage("Contact Request Received", section("Thank you for contacting Starry Nights", paragraph(`Dear ${text(contact.name)}, our team has received your message and will contact you shortly.`), contentRows(row("Name", contact.name), row("Email", contact.email), row("Phone", contact.phone), row("Message", contact.message)), paragraph(`For urgent travel support, contact ${supportPhone()}.`))) });
  const internalTo = supportRecipient();
  if (!internalTo) return { delivered: false, message: "Contact email is not configured", outcomes: customer.outcomes };
  const internal = await sendEmail({ to: internalTo, role: "internal", subject: `New contact enquiry - ${headerValue(contact.name)}`, html: htmlPage("New Contact Enquiry", section("Customer enquiry details", contentRows(row("Name", contact.name), row("Email", contact.email), row("Phone", contact.phone), row("Message", contact.message)))) });
  return combined(customer, internal);
};

export const sendEnquiryEmails = async (enquiry: { inquiryId?: string | null; name: string; email?: string | null; phone: string; pickupCity?: string | null; purpose?: string | null; destination?: string | null; startDate?: Date | string | null; endDate?: Date | string | null; persons?: number | null; adults?: number | null; children?: number | null; rooms?: number | null; mealplan?: string | null; hotel?: string | null; transport?: string | null; leadSource?: string | null; contactTime?: string | null; message?: string | null }): Promise<DeliveryResult> => {
  const id = enquiry.inquiryId || "";
  const deliveries: DeliveryResult[] = [];
  if (enquiry.email) deliveries.push(await sendEmail({ to: enquiry.email, role: "customer", subject: `We received your travel enquiry - ${headerValue(id)}`, html: htmlPage("Travel Enquiry Received", section("Thank you for your enquiry", paragraph(`Dear ${text(enquiry.name)}, our team has received your travel enquiry and will contact you shortly.`), contentRows(row("Enquiry ID", id), row("Destination", enquiry.destination), row("Travel Dates", travelDates(enquiry.startDate, enquiry.endDate)), row("Travellers", travellerCount(enquiry.persons, enquiry.adults, enquiry.children)), row("Rooms", roomCount(enquiry.rooms)), row("Contact", enquiry.phone), row("Message", enquiry.message)), paragraph(`For urgent travel support, contact ${supportPhone()}.`))) }));
  const internalTo = supportRecipient();
  if (!internalTo) return { delivered: false, message: "Enquiry email is not configured", outcomes: deliveries.flatMap((item) => item.outcomes) };
  deliveries.push(await sendEmail({ to: internalTo, role: "internal", subject: `New travel enquiry - ${headerValue(id)}`, html: htmlPage("New Travel Enquiry", section("Customer enquiry details", contentRows(row("Enquiry ID", id), row("Name", enquiry.name), row("Email", enquiry.email), row("Contact", enquiry.phone), row("Pickup City", enquiry.pickupCity), row("Destination", enquiry.destination), row("Purpose", enquiry.purpose), row("Travel Dates", travelDates(enquiry.startDate, enquiry.endDate)), row("Travellers", travellerCount(enquiry.persons, enquiry.adults, enquiry.children)), row("Rooms", roomCount(enquiry.rooms)), row("Meal Plan", enquiry.mealplan), row("Hotel", enquiry.hotel), row("Transport", enquiry.transport), row("Lead Source", enquiry.leadSource), row("Preferred Contact Time", enquiry.contactTime), row("Message", enquiry.message)))) }));
  return combined(...deliveries);
};

const careerTemplate = (application: { name: string; email: string; phone: string; position: string; about: string }, acknowledgement: boolean): string => acknowledgement
  ? htmlPage("Career Application Received", section("Thank you for applying", paragraph(`Dear ${text(application.name)}, your career application has been received by Starry Nights Holidays.`), contentRows(row("Name", application.name), row("Email", application.email), row("Phone", application.phone), row("Position", application.position)), paragraph("Our team will review your details and contact you if your profile matches an open requirement.")))
  : htmlPage("New Career Application", section("Applicant details", contentRows(row("Name", application.name), row("Email", application.email), row("Phone", application.phone), row("Position", application.position), row("Resume", "Attached securely"), row("About", application.about))));
const sendCareer = async (application: { name: string; email: string; phone: string; position: string; about: string }, resume: MailAttachment): Promise<DeliveryResult> => {
  const internalTo = hrRecipient();
  if (!internalTo) return { delivered: false, message: "Career email is not configured", outcomes: [] };
  const internal = await sendEmail({ to: internalTo, role: "recruitment", subject: `New career application - ${headerValue(application.name)}`, html: careerTemplate(application, false), attachments: [resume] });
  if (!internal.delivered) return internal;
  const acknowledgement = application.email ? await sendEmail({ to: application.email, role: "applicant", subject: "Career application received", html: careerTemplate(application, true) }) : undefined;
  return { delivered: internal.delivered, message: internal.message, outcomes: [...internal.outcomes, ...(acknowledgement?.outcomes ?? [])] };
};
export const sendCareerEmail = async (application: { name: string; email: string; phone: string; position: string; about: string }, resume: { filename: string; content: Buffer; contentType: string }): Promise<DeliveryResult> => sendCareer(application, resume);
export const sendCareerEmailFromUrl = async (application: { name: string; email: string; phone: string; position: string; about: string }, resume: { filename: string; href: string; contentType: string }): Promise<DeliveryResult> => sendCareer(application, resume);

const quotationTemplate = (packageName: string, packageCode: string, body: string): string => htmlPage("Your Travel Quotation", section("Your travel plan is ready", paragraph("Dear Guest, thank you for choosing Starry Nights Holidays. Your personalised travel plan is ready to review."), contentRows(row("Package", packageName), row("Package Reference", packageCode)), quotationBody(body), quotationAttachmentNotice(), paragraph("Our travel team is happy to help with any questions or customisations.")));
export const sendQuotationEmail = async (to: string, packageName: string, body: string, attachment: Buffer, filename: string, packageCode = "quotation"): Promise<DeliveryResult> => sendEmail({ to, role: "customer", subject: `Your Starry Nights quotation - ${headerValue(packageName)}`, html: quotationTemplate(packageName, packageCode, body), attachments: [{ filename, content: attachment, contentType: "application/pdf" }] });
export const sendQuotationEmailFromUrl = async (to: string, packageName: string, body: string, href: string, filename: string, packageCode = "quotation"): Promise<DeliveryResult> => sendEmail({ to, role: "customer", subject: `Your Starry Nights quotation - ${headerValue(packageName)}`, html: quotationTemplate(packageName, packageCode, body), attachments: [{ filename, href, contentType: "application/pdf" }] });
