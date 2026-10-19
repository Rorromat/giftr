/** Claves de la tabla única `wishy` (ver spec AWS, sección "Modelo de datos"). */

export const keys = {
  user: (sub: string) => ({ PK: `USER#${sub}`, SK: 'PROFILE' }),
  list: (listId: string) => ({ PK: `LIST#${listId}`, SK: 'META' }),
  item: (listId: string, itemId: string) => ({ PK: `LIST#${listId}`, SK: `ITEM#${itemId}` }),
  claim: (itemId: string, claimId: string) => ({ PK: `ITEM#${itemId}`, SK: `CLAIM#${claimId}` }),
  comment: (itemId: string, createdAt: string, commentId: string) => ({
    PK: `ITEM#${itemId}`,
    SK: `COMMENT#${createdAt}#${commentId}`,
  }),
  guest: (guestId: string) => ({ PK: `GUEST#${guestId}`, SK: 'PROFILE' }),
  notification: (recipientKey: string, createdAt: string, notifId: string) => ({
    PK: `RECIP#${recipientKey}`,
    SK: `NOTIF#${createdAt}#${notifId}`,
  }),
} as const;

export const gsi = {
  listByToken: (shareToken: string) => ({ GSI1PK: `TOKEN#${shareToken}`, GSI1SK: 'LIST' }),
  listByOwner: (ownerId: string) => ({ GSI2PK: `OWNER#${ownerId}`, GSI2SK: 'LIST' }),
  claimByClaimer: (claimerKey: string, claimId: string) => ({
    GSI1PK: `CLAIMER#${claimerKey}`,
    GSI1SK: `CLAIM#${claimId}`,
  }),
  guestByEmail: (email: string) => ({
    GSI1PK: `GEMAIL#${email.trim().toLowerCase()}`,
    GSI1SK: 'GUEST',
  }),
} as const;
