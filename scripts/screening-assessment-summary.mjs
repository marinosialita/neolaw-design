// Local pure-data bridge for the Python PDF renderer. No browser or network APIs.
import {assessmentSummary,validAssessmentEvent} from '../modules/screening-assessment.js';
const chunks=[];let bytes=0;
try {
  for await (const chunk of process.stdin) {
    bytes+=chunk.length;
    if(bytes>20_000_000)throw new Error('Report exceeds local review-summary limit.');
    chunks.push(chunk);
  }
  const report=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(report.assessmentLog!=null&&(!Array.isArray(report.assessmentLog)||report.assessmentLog.length>1000||!report.assessmentLog.every(validAssessmentEvent)))throw new Error('Saved outcome history is invalid or exceeds the export limit.');
  // preparePDFReport changes Markdown tables and citation offsets for display.
  // Restore only those original fields for evidence comparison, not statuses or
  // other current evidence. The actual rendered research remains unchanged.
  if(report.assessmentOriginalPhases!=null){
    const originals=report.assessmentOriginalPhases,phases=report.research?.phases;
    if(!Array.isArray(originals)||!Array.isArray(phases)||originals.length!==phases.length||originals.length>3||originals.some((p,i)=>!p||p.id!==phases[i]?.id||(p.text!=null&&typeof p.text!=='string')||(p.citations!=null&&!Array.isArray(p.citations))))throw new Error('Original research text cannot be compared safely.');
    report.research={...report.research,phases:phases.map((p,i)=>{
      const result={...p};for(const field of ['text','citations'])if(Object.hasOwn(originals[i],field))result[field]=originals[i][field];else delete result[field];return result;
    })};
  }
  const s=assessmentSummary(report);
  process.stdout.write(JSON.stringify(Object.fromEntries(['status','label','recorded','log','stale','gaps','scopeNotes','canRecord','nextReviewDate','due','overdue','note','auditNote'].map(key=>[key,s[key]]))));
} catch {
  // Avoid disclosing report contents in server logs or error responses.
  process.stderr.write('The saved case-review outcome could not be safely derived.');
  process.exitCode=1;
}
