import 'server-only';
import { createBondIntent,getBondIntent,listBonds,prepareBondIntent,submitBondIntent } from '@/lib/server/bonds';
export const bondsService={createIntent:createBondIntent,getIntent:getBondIntent,list:listBonds,prepareIntent:prepareBondIntent,submitIntent:submitBondIntent};
