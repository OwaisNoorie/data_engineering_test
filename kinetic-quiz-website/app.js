const STORAGE_KEY = "kineticQuizQuestionBankV1";
const RESULTS_KEY = "kineticQuizResultsV1";
let bank = [];
let currentTest = null;
let currentQuestion = 0;
let answers = {};
let timerId = null;
let secondsLeft = 3600;
let selectedMode = null;
let reviewFilter = "all";
let notes = [];

const modes = [
  {id:"full", no:"01", title:"Full Final Assessment", desc:"60 questions across the complete question bank. Ideal for a realistic final simulation.", filter:()=>true},
  {id:"dbt", no:"02", title:"Through DBT", desc:"Focus on DBT, SQL transformation, models, tests, macros and project workflow.", filter:q=>hasText(q,"dbt")},
  {id:"snowflake", no:"03", title:"Snowflake Certification", desc:"Snowflake-focused practice: security, stages, loading, streams, tasks, Snowpark and performance.", filter:q=>hasText(q,"snowflake")},
  {id:"intensive", no:"04", title:"DBT Intensive", desc:"A concentrated DBT test using DBT-tagged questions and fallback bank questions.", filter:q=>hasText(q,"dbt")}
];

const $ = id => document.getElementById(id);
const hasText = (q, needle) => ((q.topic||"")+" "+(q.category||"")+" "+(q.tags||[]).join(" ")+" "+(q.question||"")).toLowerCase().includes(needle);
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function shuffle(a){return [...a].sort(()=>Math.random()-.5)}
function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function normalizeQuestion(q,i){
  let options = q.options || q.choices || q.answers || [];
  if(Array.isArray(options) && options.length && typeof options[0]==="object") options=options.map(x=>x.text??x.label??x.value??"");
  options=options.map(String).filter(Boolean).slice(0,4);
  while(options.length<4) options.push("Not provided");
  let answer=q.answer ?? q.correctAnswer ?? q.correct ?? q.correctOption ?? q.answerIndex ?? 0;
  if(typeof answer==="string"){
    const idx=["A","B","C","D"].indexOf(answer.trim().toUpperCase());
    answer=idx>=0?idx:Math.max(0,options.findIndex(o=>o===answer));
  }
  if(typeof answer!=="number" || answer<0 || answer>3) answer=0;
  return {
    id:String(q.id??`q-${Date.now()}-${i}`),
    question:String(q.question??q.prompt??q.text??"Untitled question"),
    options,
    answer,
    explanation:String(q.explanation??q.rationale??"Review the concept and compare the selected option with the answer key."),
    topic:String(q.topic??q.category??(q.tags?.[0]??"General")),
    difficulty:String(q.difficulty??"Medium"),
    tags:Array.isArray(q.tags)?q.tags:[q.topic,q.category].filter(Boolean)
  };
}
function extractJson(obj){
  if(Array.isArray(obj)) return obj;
  if(Array.isArray(obj.questions)) return obj.questions;
  if(Array.isArray(obj.data)) return obj.data;
  if(Array.isArray(obj.items)) return obj.items;
  if(obj.question && (obj.options||obj.choices)) return [obj];
  return [];
}
function parseDocxText(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const out=[]; let q=null;
  const qRe=/^(?:Q(?:uestion)?\s*)?(\d+)[.)\-:]\s*(.+)$/i;
  const optRe=/^([A-D])[\).:\-]\s*(.+)$/i;
  const ansRe=/^(?:answer|correct answer|correct)\s*[:\-]\s*([A-D1-4])(?:\s*[.)]\s*(.*))?$/i;
  for(const line of lines){
    let m=line.match(qRe);
    if(m && !/^[A-D][\).:]/i.test(line)){ if(q) out.push(q); q={question:m[2],options:[],answer:0,explanation:"",topic:"Imported",difficulty:"Medium"}; continue; }
    m=line.match(optRe);
    if(m && q){q.options.push(m[2]);continue}
    m=line.match(ansRe);
    if(m && q){q.answer=/[A-D]/i.test(m[1])?"ABCD".indexOf(m[1].toUpperCase()):Number(m[1])-1; if(m[2])q.explanation=m[2];continue}
    if(q && q.options.length===0) q.question+=" "+line;
    else if(q && q.options.length>0 && !q.explanation && /^(explanation|reason|rationale)\s*:/i.test(line)) q.explanation=line.split(/:/)[1].trim();
  }
  if(q) out.push(q);
  return out.filter(x=>x.question && x.options.length>=2);
}
function saveBank(){localStorage.setItem(STORAGE_KEY,JSON.stringify(bank))}
function loadBank(){try{bank=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]").map(normalizeQuestion)}catch{bank=[]}}
function renderModes(){
  $("modeGrid").innerHTML=modes.map(m=>`<article class="mode-card"><div class="mode-no">${m.no}</div><h3>${m.title}</h3><p>${m.desc}</p><button class="primary-btn" data-mode="${m.id}">Start assessment →</button></article>`).join("");
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>startAssessment(b.dataset.mode));
}
function updateStats(){
  $("questionCount").textContent=bank.length.toLocaleString();
  $("bankCount").textContent=bank.length.toLocaleString();
  let results=[];try{results=JSON.parse(localStorage.getItem(RESULTS_KEY)||"[]")}catch{}
  const best=results.reduce((a,r)=>Math.max(a,r.percent||0),0);
  $("bestScore").textContent=results.length?`${best}%`:"—";
}
function renderMap(){
  $("questionMap").innerHTML=currentTest.questions.map((q,i)=>{
    const a=answers[i];
    return `<button class="map-btn ${i===currentQuestion?"current ":""}${a!==undefined?"answered ":""}" data-i="${i}">${i+1}</button>`;
  }).join("");
  document.querySelectorAll(".map-btn").forEach(b=>b.onclick=()=>{currentQuestion=Number(b.dataset.i);renderQuestion()});
}
function renderQuestion(){
  const q=currentTest.questions[currentQuestion], chosen=answers[currentQuestion];
  $("quizCounter").textContent=`Question ${currentQuestion+1} of ${currentTest.questions.length}`;
  $("quizMode").textContent=currentTest.title;
  $("questionTag").textContent=`${q.topic} · ${q.difficulty}`;
  $("questionText").textContent=q.question;
  $("options").innerHTML=q.options.map((o,i)=>`<button class="option ${chosen===i?"selected":""}" data-option="${i}"><span class="option-key">${"ABCD"[i]}</span><span>${escapeHTML(o)}</span></button>`).join("");
  document.querySelectorAll(".option").forEach(b=>b.onclick=()=>{answers[currentQuestion]=Number(b.dataset.option);renderQuestion()});
  $("prevBtn").disabled=currentQuestion===0;
  $("nextBtn").classList.toggle("hidden",currentQuestion===currentTest.questions.length-1);
  $("submitBtn").classList.toggle("hidden",currentQuestion!==currentTest.questions.length-1);
  $("progressBar").style.width=`${((currentQuestion+1)/currentTest.questions.length)*100}%`;
  renderMap();
}
function startAssessment(modeId){
  if(bank.length===0){showToast("Upload a question bank first.");location.hash="#bank";return}
  const mode=modes.find(m=>m.id===modeId);
  let pool=bank.filter(mode.filter);
  if(pool.length<8) pool=bank;
  const questions=shuffle(pool).slice(0,Math.min(60,pool.length));
  if(questions.length<1){showToast("No questions available for this mode.");return}
  selectedMode=modeId; currentTest={title:mode.title,questions}; answers={};currentQuestion=0;secondsLeft=3600;
  $("quizModal").classList.remove("hidden");document.body.style.overflow="hidden";
  renderQuestion();startTimer();
}
function startTimer(){
  clearInterval(timerId);updateTimer();
  timerId=setInterval(()=>{secondsLeft--;updateTimer();if(secondsLeft<=0){clearInterval(timerId);finishTest(true)}},1000);
}
function updateTimer(){
  const m=Math.floor(secondsLeft/60),s=secondsLeft%60;
  $("timer").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  $("timer").classList.toggle("warning",secondsLeft<=300);
}
function finishTest(auto=false){
  if(!auto && !confirm("Submit your test now? Unanswered questions will be marked wrong.")) return;
  clearInterval(timerId);
  const rows=currentTest.questions.map((q,i)=>({...q,index:i,selected:answers[i],correct:q.answer,correctness:answers[i]===q.answer}));
  const score=rows.filter(r=>r.correctness).length;
  const percent=Math.round(score/rows.length*100);
  let results=[];try{results=JSON.parse(localStorage.getItem(RESULTS_KEY)||"[]")}catch{}
  results.push({date:new Date().toISOString(),mode:selectedMode,percent,score,total:rows.length});
  localStorage.setItem(RESULTS_KEY,JSON.stringify(results.slice(-20)));
  $("quizModal").classList.add("hidden");$("reviewModal").classList.remove("hidden");
  $("reviewScore").textContent=`${percent}%`;$("reviewMarks").textContent=`${score} / ${rows.length}`;
  currentTest.rows=rows;reviewFilter="all";renderReview();
  updateStats();
}
function renderReview(){
  const rows=currentTest.rows.filter(r=>reviewFilter==="all"||(reviewFilter==="right"?r.correctness:!r.correctness));
  const all=currentTest.rows, right=all.filter(r=>r.correctness).length;
  $("reviewSummary").innerHTML=`<div class="summary-pill">Questions <strong>${all.length}</strong></div><div class="summary-pill">Correct <strong>${right}</strong></div><div class="summary-pill">Wrong <strong>${all.length-right}</strong></div><div class="summary-pill">Unanswered <strong>${all.filter(r=>r.selected===undefined).length}</strong></div>`;
  $("reviewList").innerHTML=rows.map(r=>{
    const opts=r.options.map((o,i)=>{
      const cls=i===r.correct?"correct":(i===r.selected&&i!==r.correct?"chosen-wrong":"");
      return `<div class="review-option ${cls}"><strong>${"ABCD"[i]}.</strong> ${escapeHTML(o)}</div>`;
    }).join("");
    return `<article class="review-card ${r.correctness?"":"wrong"}"><div class="review-qhead"><div class="review-q">Q${r.index+1}. ${escapeHTML(r.question)}</div><div class="result-label ${r.correctness?"right":"wrong"}">${r.correctness?"✓ Correct":"✕ Wrong"}</div></div><div class="review-options">${opts}</div><div class="explanation"><strong>Explanation:</strong> ${escapeHTML(r.explanation)}</div></article>`;
  }).join("");
}
async function importQuestionFile(file){
  $("uploadStatus").textContent=`Reading ${file.name}...`;
  try{
    let qs=[];
    if(file.name.toLowerCase().endsWith(".json")) qs=extractJson(JSON.parse(await file.text()));
    else {
      const arrayBuffer=await file.arrayBuffer();
      if(!window.mammoth) throw new Error("DOCX parser is still loading. Try again.");
      const result=await mammoth.extractRawText({arrayBuffer});
      qs=parseDocxText(result.value);
    }
    const normalized=qs.map(normalizeQuestion);
    if(!normalized.length) throw new Error("No questions found. Check the JSON structure or DOCX format.");
    bank=[...bank,...normalized];saveBank();updateStats();$("uploadStatus").textContent=`Imported ${normalized.length} questions from ${file.name}.`;showToast(`${normalized.length} questions imported`);
  }catch(e){$("uploadStatus").textContent="Import failed: "+e.message;showToast("Import failed")}
}
function sampleData(){
  return [
    ["Why is authentication distinct from object privileges?","Authentication determines identity; privileges determine allowed actions.","Authentication changes table schemas","Privileges replace authentication","They are identical","Authentication establishes identity/access to the account, while privileges control authorized actions.",0,"Snowflake","Hard"],
    ["What is data classification?","A way to categorize data according to sensitivity and handling requirements.","Creating joins","Deleting duplicate rows","Compressing files","Data classification groups data by characteristics such as sensitivity so appropriate controls can be applied.",0,"Snowflake","Medium"],
    ["Which command executes a dbt model?","dbt run","dbt test","dbt docs","dbt debug","dbt run builds the selected models; dbt test evaluates configured tests.",0,"DBT","Easy"],
    ["What does a Snowflake stream track?","Change data capture metadata for table changes","Warehouse CPU usage","User login passwords","Query result cache","A stream records change-tracking metadata so downstream processing can consume table changes.",0,"Snowflake","Medium"],
    ["What is a dbt source used for?","Declaring and documenting raw data dependencies","Creating a virtual warehouse","Starting Airflow workers","Uploading files to S3","dbt sources describe raw tables that models depend on and enable source freshness and testing.",0,"DBT","Medium"],
    ["What does Snowpipe provide?","Continuous, automated data loading into Snowflake","A SQL query optimizer","A BI dashboard","A local Python runtime","Snowpipe is designed for continuous ingestion of data as files arrive.",0,"Snowflake","Medium"],
    ["Which dbt command builds models and runs tests according to the project graph?","dbt build","dbt compile","dbt parse","dbt clean","dbt build runs selected resources in DAG order and includes tests associated with those resources.",0,"DBT","Medium"],
    ["What is a Snowflake stage?","A location used to store or reference files for data loading and unloading","A row-level security policy","A query result","A database role","Stages provide locations for files that can be loaded into or unloaded from Snowflake.",0,"Snowflake","Easy"],
  ].map((x,i)=>normalizeQuestion({id:"sample-"+i,question:x[0],options:x.slice(1,5),explanation:x[5],answer:x[6],topic:x[7],difficulty:x[8],tags:[x[7]]},i));
}
function loadSample(){bank=sampleData();saveBank();updateStats();showToast("Sample question bank loaded")}
function clearBank(){if(confirm("Clear all imported questions?")){bank=[];saveBank();updateStats();showToast("Question bank cleared")}}
function downloadTemplate(){
  const blob=new Blob([JSON.stringify({questions:[{question:"What is ...?",options:["Option A","Option B","Option C","Option D"],answer:0,explanation:"Why the answer is correct.",topic:"Snowflake",difficulty:"Medium",tags:["snowflake"]}]},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="kinetic-quiz-template.json";a.click();URL.revokeObjectURL(a.href);
}
function loadNotes(){
  try{notes=JSON.parse(localStorage.getItem("kineticNotesV1")||"[]")}catch{notes=[]}
  renderNotes();
}
function saveNotes(){localStorage.setItem("kineticNotesV1",JSON.stringify(notes))}
function renderNotes(){
  const search=($("notesSearch").value||"").toLowerCase();
  const filtered=notes.filter(n=>(n.name+" "+n.text).toLowerCase().includes(search));
  $("notesList").innerHTML=filtered.length?filtered.map((n,i)=>`<div class="note-item" data-note="${n.id}"><strong>${escapeHTML(n.name)}</strong><small>${new Date(n.date).toLocaleString()} · ${Math.ceil(n.text.length/1000)}k chars</small></div>`).join(""):`<div class="empty-state" style="padding:30px 10px"><p>No notes found.</p></div>`;
  document.querySelectorAll(".note-item").forEach(el=>el.onclick=()=>showNote(el.dataset.note));
}
function showNote(id){
  const n=notes.find(x=>x.id===id);if(!n)return;
  $("notesReader").innerHTML=`<h3>${escapeHTML(n.name)}</h3><p class="muted">${new Date(n.date).toLocaleString()}</p><div class="note-content">${escapeHTML(n.text)}</div>`;
}
async function importNote(file){
  let text="";
  try{
    if(file.name.endsWith(".docx")){
      const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});text=r.value;
    }else if(file.name.endsWith(".json")) text=JSON.stringify(JSON.parse(await file.text()),null,2);
    else if(file.name.endsWith(".pdf")) text="PDF preview is not extracted in this static build. Keep the PDF here as a reference file or convert it to TXT/DOCX for searchable text.";
    else text=await file.text();
    notes.unshift({id:crypto.randomUUID(),name:file.name,date:new Date().toISOString(),text});
    notes=notes.slice(0,50);saveNotes();renderNotes();showToast("Note added");
  }catch(e){showToast("Could not read note: "+e.message)}
}
$("chooseQuestionFile").onclick=()=>$("questionFile").click();
$("questionFile").onchange=e=>e.target.files[0]&&importQuestionFile(e.target.files[0]);
$("chooseNotesFile").onclick=()=>$("notesFile").click();
$("notesFile").onchange=e=>e.target.files[0]&&importNote(e.target.files[0]);
$("notesSearch").oninput=renderNotes;
$("loadSample").onclick=loadSample;$("clearBank").onclick=clearBank;$("downloadTemplate").onclick=downloadTemplate;
$("nextBtn").onclick=()=>{if(currentQuestion<currentTest.questions.length-1){currentQuestion++;renderQuestion()}};
$("prevBtn").onclick=()=>{if(currentQuestion>0){currentQuestion--;renderQuestion()}};
$("submitBtn").onclick=()=>finishTest(false);
$("closeReview").onclick=()=>{$("reviewModal").classList.add("hidden");document.body.style.overflow="";location.hash="#home"};
$("retryBtn").onclick=()=>{ $("reviewModal").classList.add("hidden");document.body.style.overflow="";startAssessment(selectedMode)};
document.querySelectorAll(".filter-btn").forEach(b=>b.onclick=()=>{document.querySelectorAll(".filter-btn").forEach(x=>x.classList.remove("active"));b.classList.add("active");reviewFilter=b.dataset.filter;renderReview()});
$("clearDataBtn").onclick=()=>{if(confirm("Reset question bank, notes and scores?")){localStorage.clear();location.reload()}};
loadBank();loadNotes();renderModes();updateStats();
