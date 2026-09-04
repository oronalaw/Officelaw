export async function handleIncomingMessage({ senderNumber, text, sendReply }) {
  const authorized = (process.env.AUTHORIZED_NUMBERS || "").split(",").map((s) => s.trim());
  if (!authorized.includes(senderNumber)) return;

  const classification = await classifyMessage(text);
