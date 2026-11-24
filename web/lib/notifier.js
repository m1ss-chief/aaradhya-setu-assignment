// Mock WhatsApp sender. The assignment says a real messaging API is not
// required, so this only logs the message and returns a delivery receipt.
// To go live, replace the body with a call to the WhatsApp Business Cloud API
// (or Twilio/Gupshup) and keep the same return shape.
//
// Like a real provider, it can FAIL:
//  - an Indian number (+91) that does not have exactly 10 digits after the code,
//    or any number with fewer than 10 / more than 15 digits, is rejected;
//  - MOCK_WHATSAPP_FAILURE_RATE (0–1, default 0) makes a share of sends fail at
//    random, to rehearse the "Resend" flow.

let counter = 0;

export function phoneProblem(to) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'Not a valid WhatsApp number';
  if (String(to).trim().startsWith('+91') && digits.length !== 12) return 'Not a valid WhatsApp number (+91 needs 10 digits)';
  return null;
}

export async function sendWhatsAppMock({ to, message }, { failureRate = Number(process.env.MOCK_WHATSAPP_FAILURE_RATE) || 0 } = {}) {
  counter += 1;
  const at = new Date().toISOString();
  const problem = phoneProblem(to) || (Math.random() < failureRate ? 'Recipient unavailable (simulated network error)' : null);
  const quiet = process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT;

  if (problem) {
    if (!quiet) console.log(`[mock WhatsApp] FAILED to ${to}: ${problem}`);
    return { provider: 'mock-whatsapp', messageId: null, status: 'failed', error: problem, sentAt: at };
  }
  if (!quiet) console.log(`[mock WhatsApp] to ${to}: ${message}`);
  return { provider: 'mock-whatsapp', messageId: `mock-${Date.now().toString(36)}-${counter}`, status: 'sent', sentAt: at };
}
