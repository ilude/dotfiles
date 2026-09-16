import { existsSync } from 'node:fs';
import net from 'node:net';

const endpoint=process.env.PI_SUBAGENT_ENDPOINT?JSON.parse(process.env.PI_SUBAGENT_ENDPOINT):undefined;
const startup=endpoint?new Promise((resolve,reject)=>{
 let socket,buffer='';
 const finish=(error,value)=>{socket?.destroy();error?reject(error):resolve(value)};
 socket=net.createConnection({host:'127.0.0.1',port:endpoint.port});
 socket.once('connect',()=>socket.write(JSON.stringify({...endpoint,message:{type:'session-identity',payload:{sessionId:`fixture-${process.pid}`,sessionFile:`${process.cwd()}/fixture-${process.pid}.jsonl`}}})+'\n'));
 socket.on('data',chunk=>{buffer+=String(chunk);const i=buffer.indexOf('\n');if(i<0)return;try{const response=JSON.parse(buffer.slice(0,i));if(response.ok)finish(undefined,response.result);else finish(new Error(response.error||'session identity rejected'))}catch(error){finish(error)}});
 socket.once('error',reject);
}):Promise.resolve();

let buffer='';
process.stdin.on('data',chunk=>{
 buffer+=chunk;
 for(;;){
  const i=buffer.indexOf('\n');if(i<0)break;
  const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const command=JSON.parse(line);
  void handle(command);
 }
});

async function handle(command){
 if(command.type==='prompt'){await startup;
   if(command.message.includes('[reject]')){process.stdout.write(JSON.stringify({type:'response',id:command.id,success:false,error:'fixture provider preflight rejected'})+'\n');return}
   process.stdout.write(JSON.stringify({type:'response',id:command.id,success:true})+'\n');
   if(command.message.includes('[activity]')){
    process.stdout.write(JSON.stringify({type:'agent_start'})+'\n');
    process.stdout.write(JSON.stringify({type:'tool_execution_start',toolName:'bash',args:{private:'must not appear in progress'}})+'\n');
   }
   if(command.message.includes('[provider-error]')){process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'error',errorMessage:'fixture provider unavailable'}})+'\n');return}
   if(command.message.includes('[tool-error]')){
    process.stdout.write(JSON.stringify({type:'tool_execution_end',toolName:'read',isError:true,result:{content:[{type:'text',text:'Native path is outside the assigned workspace'}]}})+'\n');
    if(command.message.includes('[recoverable]'))process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'recovered after the read failed'}]}})+'\n');
    process.stdout.write('{"type":"agent_settled"}\n');return;
   }
   if(command.message.includes('[oversize]')){process.stdout.write(JSON.stringify({type:'agent_end',messages:['x'.repeat(17*1024*1024)]})+'\n');return}
   if(command.message.includes('[exit]'))process.exit(0);
   if(command.message.includes('[hold]'))return;
   if(command.message.includes('[approval]')){process.stdout.write(JSON.stringify({type:'extension_ui_request',id:'consent',method:'confirm',title:'Inert fixture consent',message:'No operation will be executed.'})+'\n');return}
   const reply=()=>{
    process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:command.message.includes('[blank]')?'':command.message.includes('follow-up')?'second answer':'first answer'}]}})+'\n');
    if(command.message.includes('[aggregate]'))process.stdout.write(JSON.stringify({type:'agent_end',messages:Array.from({length:24},()=>({role:'toolResult',content:[{type:'text',text:'x'.repeat(50000)}]}))})+'\n');
    process.stdout.write('{"type":"agent_settled"}\n');
   };
   if(command.message.includes('[live]')){reply();return;}
   const marker=/WAIT_FILE:([^\n]+)/.exec(command.message)?.[1];
   if(marker){const timer=setInterval(()=>{if(existsSync(marker)){clearInterval(timer);reply()}},10)}else reply();
  }else if(command.type==='steer'){
   process.stdout.write(JSON.stringify({type:'response',id:command.id,success:true})+'\n');
   process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:`steered: ${command.message}`}]}})+'\n');
   process.stdout.write('{"type":"agent_settled"}\n');
  }else if(command.type==='extension_ui_response'){
   process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:command.confirmed===false?'denied':'approved'}]}})+'\n');process.stdout.write('{"type":"agent_settled"}\n');
  }else if(command.type==='abort')process.stdout.write(JSON.stringify({type:'response',id:command.id,success:true})+'\n');
}
