import type { CostBaseline } from "./ledger.js";

const common = (profile?: string) => ["--region", "us-east-2", "--output", "json", "--no-cli-pager", ...(profile ? ["--profile", profile] : [])];
export const callerArgs = (profile?: string) => ["sts", "get-caller-identity", ...common(profile)];
export const dashboardArgs = (profile?: string) => ["cloudwatch", "get-dashboard", "--dashboard-name", "ccb-bedrock-usage", ...common(profile)];
export function parseCaller(stdout: string): string { let v: any; try { v=JSON.parse(stdout); } catch { throw new Error("AWS STS returned invalid JSON"); } if(typeof v?.Arn!=="string"||!v.Arn.includes(":user/")) throw new Error("Bedrock reconciliation requires an IAM user identity"); return v.Arn; }
export function queryArgs(dashboard: string, principal: string, now=new Date(), profile?: string): string[] {
 let outer:any; try { outer=JSON.parse(dashboard); } catch { throw new Error("CloudWatch dashboard returned invalid JSON"); }
 let body:any; try { body=JSON.parse(outer.DashboardBody); } catch { throw new Error("CloudWatch dashboard body was invalid"); }
 const query=body.widgets?.find((w:any)=>w?.properties?.title==="Estimated Bedrock Cost by User")?.properties?.query;
 if(typeof query!=="string") throw new Error("CloudWatch personal Bedrock cost query was unavailable");
 const needle="| stats coalesce(sum(inputCost), 0) + coalesce(sum(outputCost), 0) + coalesce(sum(cacheWriteCost), 0) + coalesce(sum(cacheReadCost), 0) as estimatedCost, count() as invocations by userArn";
 if(!query.includes(needle)) throw new Error("CloudWatch personal Bedrock cost query had an unexpected contract");
 const filtered=query.replace(needle, `| filter userArn = \"${principal}\"\n${needle}`).split(/\r?\n/).map((x:string)=>x.trim()).filter(Boolean).filter((x:string)=>!x.startsWith("SOURCE ")).map((x:string)=>x.replace(/^\|\s*/,"")).join(" | ");
 const start=Math.floor(Date.parse(`${now.toISOString().slice(0,7)}-01T00:00:00Z`)/1000), end=Math.floor(now.getTime()/1000);
 return ["logs","start-query","--log-group-name","/aws/bedrock/ccb","--start-time",String(start),"--end-time",String(end),"--query-string",filtered,...common(profile)];
}
export function parseQueryId(stdout:string):string { let v:any; try{v=JSON.parse(stdout)}catch{throw new Error("CloudWatch Logs query start returned invalid JSON")}; if(typeof v?.queryId!=="string") throw new Error("CloudWatch Logs query did not return an ID"); return v.queryId; }
export const resultsArgs=(id:string,profile?:string)=>["logs","get-query-results","--query-id",id,...common(profile)];
export function parseResults(stdout:string, principal:string, capturedAt:string): {pending:boolean; baseline?:CostBaseline} { let v:any; try{v=JSON.parse(stdout)}catch{throw new Error("CloudWatch Logs results returned invalid JSON")}; if(["Scheduled","Running"].includes(v?.status)) return {pending:true}; if(v?.status!=="Complete") throw new Error(`CloudWatch Logs query failed: ${v?.status||"unknown status"}`); const row=v.results?.[0]; if(!row) return {pending:false,baseline:{schemaVersion:1,month:capturedAt.slice(0,7),principal,amount:0,invocations:0,capturedAt,source:"cloudwatch-bedrock-invocation-logs"}}; const fields=Object.fromEntries(row.map((x:any)=>[x.field,x.value])); if(fields.userArn!==principal) throw new Error("CloudWatch result did not match the AWS caller"); const amount=Number(fields.estimatedCost), invocations=Number(fields.invocations); if(!Number.isFinite(amount)||amount<0||!Number.isInteger(invocations)||invocations<0) throw new Error("CloudWatch result contained invalid totals"); return {pending:false,baseline:{schemaVersion:1,month:capturedAt.slice(0,7),principal,amount,invocations,capturedAt,source:"cloudwatch-bedrock-invocation-logs"}}; }
