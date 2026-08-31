export type UiEventType='toast'|'auth'|'wallet'|'runtime';export type UiEvent={type:UiEventType;level?:'info'|'success'|'warning'|'error';title:string;message?:string};
export type { RealtimeTopic,RealtimeEventEnvelope,RealtimeConnectionState } from '@powerchain/contracts';
