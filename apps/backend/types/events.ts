export type PlatformEventType='IDENTITY_CREATED'|'IDENTITY_UPDATED'|'IDENTITY_DELETED'|'WALLET_LINKED'|'ACTION_CONFIRMED'|'AI_REQUESTED'|'AI_REJECTED'|'AI_COMPLETED'|'SECURITY_ALERT';
export type PlatformEvent={type:PlatformEventType;subjectId?:string|null;source:string;severity?:'INFO'|'WARNING'|'CRITICAL';payload?:Record<string,unknown>};
