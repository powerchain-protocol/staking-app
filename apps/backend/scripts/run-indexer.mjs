const origin=(process.env.BACKEND_ORIGIN??process.env.INTERNAL_BACKEND_ORIGIN??'http://localhost:4000').replace(/\/$/,'');
const secret=process.env.INTERNAL_WORKER_SECRET;if(!secret)throw new Error('INTERNAL_WORKER_SECRET is required');
const loop=['1','true'].includes(String(process.env.INDEXER_LOOP??'').toLowerCase());const intervalMs=Math.max(10_000,Number(process.env.INDEXER_INTERVAL_MS??60_000));
async function run(){const response=await fetch(`${origin}/api/internal/index`,{method:'POST',headers:{authorization:`Bearer ${secret}`}});const body=await response.text();if(!response.ok)throw new Error(`Application indexer failed (${response.status}): ${body}`);console.log(new Date().toISOString(),body);}
if(!loop)await run();else for(;;){try{await run();}catch(error){console.error(new Date().toISOString(),error);process.exitCode=1;}await new Promise(r=>setTimeout(r,intervalMs));}
