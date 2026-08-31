import 'server-only';
import { governanceWeight,createGovernanceIntent,getGovernanceIntent,prepareGovernanceIntent,submitGovernanceIntent } from '@/lib/server/governance';
import { db } from '@/lib/server/db';
export const governanceService={
  createIntent:createGovernanceIntent,getIntent:getGovernanceIntent,prepareIntent:prepareGovernanceIntent,submitIntent:submitGovernanceIntent,
  async overview(subjectId:string){const[weight,votes]=await Promise.all([governanceWeight(subjectId),db()`SELECT gv.*,gp.title,gp.status AS proposal_status FROM governance_votes gv JOIN governance_proposals gp ON gp.id=gv.proposal_id WHERE gv.subject_id=${subjectId} ORDER BY gv.created_at DESC`]);return{votingWeightAtomic:weight.toString(),votes,delegations:[]};},
};
