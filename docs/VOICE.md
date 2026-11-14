# AI phone agent → CRM leads

Callers ring the Plivo number, Sarvam's voice agent answers, and when the call ends Sarvam posts a message to the CRM.
A connected call from a real Indian mobile becomes a lead (source `ai-telecaller`); a number that already has an open lead is
added to it, not duplicated. Every message is kept in the `VoiceCall` table exactly as received, whatever came of it.

## Turning it on
1. Set `VOICE_WEBHOOK_SECRET` (16+ random characters) in the backend environment and restart. Until it is set the address answers 404.
2. In Sarvam → Deploy → Inbound calls → the deployment → Advanced → **Webhook URL**, paste
   `https://<site>/crm/api/public/voice/sarvam?key=<the secret>` (the secret can instead be sent as an `x-webhook-secret` header if Sarvam allows custom headers).
3. Make a test call from your own phone. Check `VoiceCall` (for example `SELECT "receivedAt", outcome, phone, status, "durationSec", error FROM "VoiceCall" ORDER BY "receivedAt" DESC LIMIT 5;`).

## What is read from the message
Sarvam documents its campaign and instant-outbound messages but not an inbound one, so the reader looks for each detail under several likely names at any depth (`from`/`caller`/`phone_number`, `name`/`customer_name`, `city`, `loan_amount`/`amount`, `loan_type`, `summary`, `transcript`, `duration`, `status`, `interaction_id`/`call_id`). Amounts like "20 lakh" and "1.5 crore" are understood. After the first real call, check the stored `payload` and adjust `src/voice/voice-payload.ts` if a field was missed.

To get name, city, loan type and amount reliably, add them as **output variables** on the agent in Sarvam so they arrive as `final_agent_variables`.

## Not done
No screen in the CRM lists calls yet (read the table for now), no call recording link, and outbound calling from a CRM button.
Customers should be told at the start of the call that it is recorded and handled by an AI assistant.
