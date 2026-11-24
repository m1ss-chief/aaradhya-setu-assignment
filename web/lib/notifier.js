// Mock WhatsApp sender. The assignment says a real messaging API is not
// required, so this only logs the message and returns a delivery receipt.
// To go live, replace the body with a call to the WhatsApp Business Cloud API
// (or Twilio/Gupshup) and keep the same return shape.

let counter = 0;

export async function sendWhatsAppMock({ to, message }) {
  counter += 1;
  const receipt = {
    provider: 'mock-whatsapp',
    messageId: `mock-${Date.now().toString(36)}-${counter}`,
    status: 'sent',
    sentAt: new Date().toISOString(),
  };
  if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) {
    console.log(`[mock WhatsApp] to ${to}: ${message}`);
  }
  return receipt;
}
