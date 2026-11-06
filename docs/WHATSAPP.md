# WhatsApp in the CRM

Menu: **Messaging → WhatsApp Inbox, Notification templates, Notification logs, WhatsApp setup.**

## What it does
- **Inbox** — every customer thread, searchable, with "Needs me (human takeover)". Staff see only threads on their own leads and files; Admin and Manager see all. Replies are free-form for 24 hours after the customer's last message (WhatsApp's rule); after that, and to start a chat, only an approved template can be sent.
- **Chatbot** — customers: `hi`, `status`, `agent`, `help`; anything else is flagged for a person. Team members (a number matching an active user's phone) get the CRM assistant, limited to what their own login can see. Those chats are not stored in the inbox.
- **Notifications** — templates fire when a lead is created, a file changes stage or is rejected, a sanction is approved, a payout is recorded; plus morning and evening briefs to the admin's phone. Every message, sent or held back, is in **Notification logs** with the reason.
- A stranger who writes in becomes a lead (source `whatsapp`) and appears in the inbox.

## Connecting it (needs the client's Meta account)
1. In the Meta developer app, add the WhatsApp product and a phone number. Note the **Phone number ID**, **WABA ID**, create a permanent **access token** (System User), and the app's **App secret**. Pick any **verify token** phrase.
2. Put them in the backend environment (`ops/backend.env.production.example`) and restart.
3. In Meta → WhatsApp → Configuration set the callback URL to `https://<site>/crm/api/public/whatsapp/webhook`, the verify token, and subscribe to **messages**.
4. **WhatsApp setup** shows "Connected" and which credentials are set. Send a test from the same page.
5. **Notification templates → Send to Meta** for each template you will use. Meta must approve each one (minutes to a day). **Refresh from Meta** reads the verdicts. Rewording an approved template makes it a new one that must be approved again.

## Decisions to make
- **One webhook per Meta app.** The website's Gia assistant currently answers WhatsApp through its own webhook. Pointing Meta at the CRM instead moves answering to the CRM chatbot (commands above, then a person). To keep Gia, keep the website as the receiver and the CRM inbox stays empty until the website forwards messages to it — not built.
- **Customer messages are off by default** (Settings → WhatsApp). Turn on only once customers have consented — the enquiry form does not yet carry a WhatsApp consent line.
- **Documents sent by customers** (PDF, JPG, PNG, WebP, HEIC, up to 15 MB) are downloaded from Meta, checked by their contents, kept in the private storage bucket and listed under "Files received" on the lead, with a download button. Nothing is read out of them. Voice notes and videos cannot be opened; Gia says so kindly and carries on.

## Not built
Callbacks module, Telegram, "Sales Agent" knowledge base, attaching documents by WhatsApp, and webhook forwarding from the website.
