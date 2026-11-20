export class ConversationAccessError extends Error {
  constructor() { super('Conversation does not exist or is not available to this account.'); }
}

export class MessageRecipientError extends Error {
  constructor() { super('The recipient account is unavailable.'); }
}
