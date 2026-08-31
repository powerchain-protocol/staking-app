'use client';
import { createContext,useContext,type ReactNode } from 'react';
import { usePortfolio } from '@/hooks/use-portfolio';
const Ctx=createContext<ReturnType<typeof usePortfolio>|null>(null);
export function PortfolioProvider({children}:{children:ReactNode}){return <Ctx.Provider value={usePortfolio()}>{children}</Ctx.Provider>}
export function usePortfolioContext(){const value=useContext(Ctx);if(!value)throw new Error('PortfolioProvider missing');return value;}
