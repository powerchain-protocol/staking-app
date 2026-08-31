import { apiJson } from '@powerchain/api-client';
export interface PriceRow{symbol:string;price:number;source:string;timestamp:string}
export async function loadPrices(symbols:string[]){return (await apiJson<{prices:PriceRow[]}>(`/api/v1/prices?symbols=${encodeURIComponent(symbols.join(','))}`)).prices;}
