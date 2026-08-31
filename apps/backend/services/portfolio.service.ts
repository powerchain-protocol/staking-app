import 'server-only';
import { buildPortfolio } from '@/lib/portfolio';
export const portfolioService={snapshot:(subjectId:string)=>buildPortfolio(subjectId)};
