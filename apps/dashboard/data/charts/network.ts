import type { ChartPoint } from '@/types/charts';
export function networkSeries(values:number[]):ChartPoint[]{return values.map((value,index)=>({label:`${index+1}`,value}));}
