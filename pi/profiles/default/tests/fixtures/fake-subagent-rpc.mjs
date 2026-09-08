import { existsSync } from 'node:fs';
let buffer='';
process.stdin.on('data',chunk=>{
 buffer+=chunk;
 for(;;){
  const i=buffer.indexOf('\n');if(i<0)break;
  const line=buffer.slice(0,i);buffer=buffer.slice(i+1);const command=JSON.parse(line);
  if(command.type==='prompt'){
   process.stdout.write(JSON.stringify({type:'response',id:command.id,success:true})+'\n');
   if(command.message.includes('[exit]'))process.exit(0);
   if(command.message.includes('[hold]'))continue;
   if(command.message.includes('[approval]')){process.stdout.write(JSON.stringify({type:'extension_ui_request',id:'consent',method:'confirm',title:'Inert fixture consent',message:'No operation will be executed.'})+'\n');continue}
   const reply=()=>{
    process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:command.message.includes('[blank]')?'':command.message.includes('follow-up')?'second answer':'first answer'}]}})+'\n');
    process.stdout.write('{"type":"agent_settled"}\n');
   };
   const marker=/WAIT_FILE:([^\n]+)/.exec(command.message)?.[1];
   if(marker){const timer=setInterval(()=>{if(existsSync(marker)){clearInterval(timer);reply()}},10)}else reply();
  }else if(command.type==='extension_ui_response'){
   process.stdout.write(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:command.confirmed===false?'denied':'approved'}]}})+'\n');process.stdout.write('{"type":"agent_settled"}\n');
  }else if(command.type==='abort')process.stdout.write(JSON.stringify({type:'response',id:command.id,success:true})+'\n');
 }
});
