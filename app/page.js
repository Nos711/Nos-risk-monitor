'use client';
import {useEffect,useMemo,useState} from 'react';

const DEFAULT_SETTINGS={equity:10000,riskPct:.5,maxDailyR:2,maxWeeklyR:5,maxOpenR:2.5,minScore:70,minRR:2,scaleTrades:50,scalePF:1.3,scaleAdherence:90,scaleDD:6};
const EMPTY={symbol:'',side:'Long',entry:'',stop:'',target:'',leverage:5,setup:'A1 Trend Continuation',structure:20,confirmation:20,rrScore:20,riskScore:20,notes:''};
const PLAYBOOK=[
 {id:'A1',name:'Trend Continuation',rules:'HTF aligned · pullback · liquidity/trigger · RR ≥ 2.5'},
 {id:'A2',name:'Reversal',rules:'HTF level · sweep/rejection · confirmation · defined invalidation'},
 {id:'B1',name:'Breakout',rules:'Compression · clean level · volume/acceptance · no chase'}
];

export default function Home(){
 const [view,setView]=useState('Dashboard'),[settings,setSettings]=useState(DEFAULT_SETTINGS),[trade,setTrade]=useState(EMPTY);
 const [positions,setPositions]=useState([]),[history,setHistory]=useState([]),[marks,setMarks]=useState({}),[loaded,setLoaded]=useState(false);
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('nos_trading_os_v1')||'{}');if(s.settings)setSettings(s.settings);if(s.positions)setPositions(s.positions);if(s.history)setHistory(s.history);if(s.marks)setMarks(s.marks)}catch{}setLoaded(true)},[]);
 useEffect(()=>{if(loaded)localStorage.setItem('nos_trading_os_v1',JSON.stringify({settings,positions,history,marks}))},[loaded,settings,positions,history,marks]);

 const stats=useMemo(()=>calcStats(history),[history]);
 const today=new Date().toDateString();
 const todayTrades=history.filter(t=>new Date(t.closedAt).toDateString()===today);
 const todayR=todayTrades.reduce((s,t)=>s+Number(t.r||0),0);
 const openR=positions.reduce((s,p)=>s+Number(p.riskUsd||0)/(settings.equity*settings.riskPct/100||1),0);
 const calc=useMemo(()=>{
  const e=+trade.entry||0,s=+trade.stop||0,t=+trade.target||0,dist=Math.abs(e-s),risk=settings.equity*settings.riskPct/100;
  const stopPct=e?dist/e:0,size=stopPct?risk/stopPct:0,qty=e?size/e:0,margin=size/(+trade.leverage||1),rr=dist?Math.abs(t-e)/dist:0;
  const setupScore=trade.setup.startsWith('A1')?20:trade.setup.startsWith('A2')?17:13;
  const score=Math.round(setupScore+(+trade.structure||0)+(+trade.confirmation||0)+(rr>=3?20:rr>=2?16:rr>=1.5?10:4)+(+trade.riskScore||0));
  const errors=[];
  if(!trade.symbol)errors.push('ใส่ Symbol');
  if(!e||!s||!t)errors.push('ใส่ Entry / SL / TP ให้ครบ');
  if(trade.side==='Long'&&e&&s>=e)errors.push('Long: SL ต้องต่ำกว่า Entry');
  if(trade.side==='Short'&&e&&s<=e)errors.push('Short: SL ต้องสูงกว่า Entry');
  if(rr&&rr<settings.minRR)errors.push('R:R ต่ำกว่า minimum');
  if(score<settings.minScore)errors.push('Pre-trade score ไม่ผ่าน');
  if(todayR<=-settings.maxDailyR)errors.push('Daily loss limit reached');
  if(openR+1>settings.maxOpenR)errors.push('Open risk limit exceeded');
  return{e,s,t,risk,size,qty,margin,rr,score,errors};
 },[trade,settings,todayR,openR]);

 function openTrade(){if(calc.errors.length)return;const p={id:crypto.randomUUID(),...trade,symbol:trade.symbol.toUpperCase(),entry:calc.e,stop:calc.s,target:calc.t,riskUsd:calc.risk,size:calc.size,qty:calc.qty,rr:calc.rr,score:calc.score,openedAt:new Date().toISOString()};setPositions(v=>[p,...v]);setMarks(m=>({...m,[p.id]:calc.e}));setTrade(EMPTY);setView('Positions')}
 function closeTrade(p){const exit=+marks[p.id];if(!exit)return;const dir=p.side==='Long'?1:-1,pnl=(exit-p.entry)*dir*p.qty,r=p.riskUsd?pnl/p.riskUsd:0;const followed=window.confirm('Did you follow the plan? OK = Yes / Cancel = No');const emotion=window.prompt('Emotion: Calm / FOMO / Fear / Revenge / Greed','Calm')||'Calm';const mistake=followed?'None':(window.prompt('Mistake: Early Entry / Early Exit / Oversize / Moved SL / No Setup','Early Exit')||'Rule violation');const reason=window.prompt('Close reason: TP / SL / Early / Manual','Manual')||'Manual';setHistory(v=>[{...p,exit,pnl,r,followed,emotion,mistake,reason,closedAt:new Date().toISOString()},...v]);setPositions(v=>v.filter(x=>x.id!==p.id));setMarks(m=>{const n={...m};delete n[p.id];return n})}

 const nav=['Dashboard','Plan','Positions','Journal','Playbook','Analytics','Scale','Settings'];
 return <main className="shell"><header><div><div className="brand">NØS TRADING OS</div><h1>{view}</h1><p>PLAN → VALIDATE → SIZE → EXECUTE → REVIEW → SCALE</p></div><nav>{nav.map(n=><button className={view===n?'active':''} onClick={()=>setView(n)} key={n}>{n}</button>)}</nav></header>

 {view==='Dashboard'&&<><section className="metrics"><Metric l="TODAY" v={rFmt(todayR)} s="Realized R"/><Metric l="OPEN RISK" v={openR.toFixed(2)+'R'} s={'Limit '+settings.maxOpenR+'R'}/><Metric l="THIS MONTH" v={rFmt(stats.monthR)} s="Realized"/><Metric l="RULE SCORE" v={stats.adherence.toFixed(0)+'%'} s="Plan adherence"/><Metric l="EXPECTANCY" v={rFmt(stats.expectancy)} s="per trade"/><Metric l="MAX DRAWDOWN" v={rFmt(-stats.maxDD)} s="R"/></section>
 <div className="grid2"><Card title="Process Gate" sub="ระบบตัดสินใจจากกฎ ไม่ใช่อารมณ์"><div className={calc.errors.length?'gate bad':'gate good'}><b>{todayR<=-settings.maxDailyR?'NO NEW TRADES':'READY'}</b><span>{todayR<=-settings.maxDailyR?'Daily loss limit reached':'Risk engine active'}</span></div><Rows rows={[['Closed trades',history.length],['Win rate',stats.winRate.toFixed(1)+'%'],['Profit factor',isFinite(stats.pf)?stats.pf.toFixed(2):'—'],['Behavioral cost',money(stats.behaviorCost)]]}/></Card>
 <Card title="Scale Gate" sub="เพิ่ม Risk เมื่อข้อมูลอนุญาตเท่านั้น"><ScaleGate stats={stats} settings={settings}/></Card></div></>}

 {view==='Plan'&&<div className="grid2"><Card title="New Trade Plan" sub="Plan ก่อน Order เสมอ"><div className="form">
 <Field l="Symbol"><input value={trade.symbol} onChange={e=>setTrade({...trade,symbol:e.target.value})} placeholder="BTCUSDT"/></Field><Field l="Side"><select value={trade.side} onChange={e=>setTrade({...trade,side:e.target.value})}><option>Long</option><option>Short</option></select></Field>
 <Field l="Setup"><select value={trade.setup} onChange={e=>setTrade({...trade,setup:e.target.value})}>{PLAYBOOK.map(x=><option key={x.id}>{x.id} {x.name}</option>)}</select></Field><Field l="Leverage"><input type="number" value={trade.leverage} onChange={e=>setTrade({...trade,leverage:e.target.value})}/></Field>
 <Field l="Entry"><input type="number" value={trade.entry} onChange={e=>setTrade({...trade,entry:e.target.value})}/></Field><Field l="Stop Loss"><input type="number" value={trade.stop} onChange={e=>setTrade({...trade,stop:e.target.value})}/></Field><Field l="Take Profit"><input type="number" value={trade.target} onChange={e=>setTrade({...trade,target:e.target.value})}/></Field>
 <Field l="Structure /20"><input type="number" min="0" max="20" value={trade.structure} onChange={e=>setTrade({...trade,structure:e.target.value})}/></Field><Field l="Confirmation /20"><input type="number" min="0" max="20" value={trade.confirmation} onChange={e=>setTrade({...trade,confirmation:e.target.value})}/></Field><Field l="Risk discipline /20"><input type="number" min="0" max="20" value={trade.riskScore} onChange={e=>setTrade({...trade,riskScore:e.target.value})}/></Field></div></Card>
 <Card title="Pre-Trade Gate" sub="Risk first. Leverage only changes margin."><div className={'score '+(calc.score>=settings.minScore?'good':'bad')}><span>TRADE SCORE</span><b>{calc.score}/100</b></div><Rows rows={[['Risk budget',money(calc.risk)],['Position size',money(calc.size)],['Quantity',num(calc.qty,6)],['Margin @ '+trade.leverage+'x',money(calc.margin)],['Planned R:R',calc.rr.toFixed(2)+'R'],['Open risk after',(openR+(calc.e?1:0)).toFixed(2)+'R']]}/>{calc.errors.length>0&&<div className="errors">{calc.errors.map(x=><div key={x}>• {x}</div>)}</div>}<button className="primary" disabled={calc.errors.length>0} onClick={openTrade}>{calc.errors.length?'NO TRADE':'OPEN POSITION'}</button></Card></div>}

 {view==='Positions'&&<Card title="Ongoing Positions" sub="P&L แสดงเป็น R เพื่อรักษา process">{positions.length===0?<Empty/>:<div className="stack">{positions.map(p=>{const mark=marks[p.id]??'',dir=p.side==='Long'?1:-1,pnl=mark?(+mark-p.entry)*dir*p.qty:0,r=p.riskUsd?pnl/p.riskUsd:0;return <div className="position" key={p.id}><div><b>{p.symbol}</b><span className="pill">{p.side} · {p.setup}</span><small>Score {p.score} · Plan RR {p.rr.toFixed(2)}R</small></div><div className="posnums"><span>Entry<b>{num(p.entry)}</b></span><span>SL<b>{num(p.stop)}</b></span><span>TP<b>{num(p.target)}</b></span><span>Risk<b>{money(p.riskUsd)}</b></span></div><div><input type="number" placeholder="Current price" value={mark} onChange={e=>setMarks({...marks,[p.id]:e.target.value})}/><strong className={r>=0?'green':'red'}>{rFmt(r)} · {signedMoney(pnl)}</strong></div><button className="secondary" disabled={!+mark} onClick={()=>closeTrade(p)}>Close / Review</button></div>})}</div>}</Card>}

 {view==='Journal'&&<Card title="Journal" sub="แยก System Loss ออกจาก Trader Error">{history.length===0?<Empty/>:<Table history={history}/>}</Card>}

 {view==='Playbook'&&<div className="cards">{PLAYBOOK.map(p=>{const rows=history.filter(t=>t.setup?.startsWith(p.id)),s=calcStats(rows);return <Card key={p.id} title={p.id+' — '+p.name} sub={p.rules}><Rows rows={[['Trades',rows.length],['Win rate',s.winRate.toFixed(1)+'%'],['Expectancy',rFmt(s.expectancy)],['Profit factor',isFinite(s.pf)?s.pf.toFixed(2):'—']]}/></Card>})}</div>}

 {view==='Analytics'&&<div className="grid2"><Card title="Edge Analytics" sub="Strategy problem หรือ Execution problem?"><Rows rows={[['Trades',history.length],['Expectancy',rFmt(stats.expectancy)],['Profit factor',isFinite(stats.pf)?stats.pf.toFixed(2):'—'],['Win rate',stats.winRate.toFixed(1)+'%'],['Avg win',rFmt(stats.avgWin)],['Avg loss',rFmt(stats.avgLoss)]]}/></Card><Card title="Behavioral Cost" sub="ต้นทุนจากการไม่ทำตามแผน"><div className="big">{money(stats.behaviorCost)}</div><p className="muted">Rule adherence {stats.adherence.toFixed(1)}% · เป้าหมายคือทำให้ execution ใกล้ system มากขึ้น ไม่ใช่บังคับให้ทุก trade ชนะ</p></Card></div>}

 {view==='Scale'&&<Card title="Controlled Scaling" sub="Risk เพิ่มทีละขั้นเมื่อผ่าน Data Gate"><ScaleGate stats={stats} settings={settings}/><div className="levels"><div><b>LEVEL 1</b><strong>0.50%</strong></div><div><b>LEVEL 2</b><strong>0.75%</strong></div><div><b>LEVEL 3</b><strong>1.00%</strong></div></div></Card>}

 {view==='Settings'&&<Card title="Risk Engine Settings" sub="Guardrails ของระบบ"><div className="form">{Object.entries({equity:'Account Equity ($)',riskPct:'Risk / Trade %',maxDailyR:'Max Daily Loss (R)',maxWeeklyR:'Max Weekly Loss (R)',maxOpenR:'Max Open Risk (R)',minScore:'Minimum Trade Score',minRR:'Minimum R:R',scaleTrades:'Scale: Min Trades',scalePF:'Scale: Min Profit Factor',scaleAdherence:'Scale: Rule Adherence %',scaleDD:'Scale: Max DD (R)'}).map(([k,l])=><Field key={k} l={l}><input type="number" step=".1" value={settings[k]} onChange={e=>setSettings({...settings,[k]:+e.target.value})}/></Field>)}</div></Card>}
 </main>
}

function calcStats(h){const rs=h.map(t=>+t.r||0),wins=rs.filter(x=>x>0),loss=rs.filter(x=>x<0),grossW=wins.reduce((a,b)=>a+b,0),grossL=Math.abs(loss.reduce((a,b)=>a+b,0)),expectancy=rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:0;let peak=0,cum=0,maxDD=0;rs.slice().reverse().forEach(r=>{cum+=r;peak=Math.max(peak,cum);maxDD=Math.max(maxDD,peak-cum)});const now=new Date(),month=h.filter(t=>{const d=new Date(t.closedAt);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,t)=>s+(+t.r||0),0);const followed=h.filter(t=>t.followed).length;return{count:h.length,trades:h.length,winRate:rs.length?wins.length/rs.length*100:0,pf:grossL?grossW/grossL:(grossW?Infinity:0),expectancy,avgWin:wins.length?grossW/wins.length:0,avgLoss:loss.length?-grossL/loss.length:0,maxDD,monthR:month,adherence:h.length?followed/h.length*100:100,behaviorCost:h.filter(t=>!t.followed).reduce((s,t)=>s+Math.abs(Math.min(0,+t.pnl||0)),0)}}
function ScaleGate({stats,settings}){const gates=[['Sample size',stats?undefined:0],['Trades',stats?stats:null]];const checks=[['Trades',stats&&stats.trades,settings.scaleTrades]];const passTrades=(stats?.count||0)>=settings.scaleTrades;const items=[['50+ trades',passTrades],['Positive expectancy',(stats?.expectancy||0)>.2],['Profit Factor ≥ '+settings.scalePF,(stats?.pf||0)>=settings.scalePF],['Rule adherence ≥ '+settings.scaleAdherence+'%',(stats?.adherence||0)>=settings.scaleAdherence],['Max DD ≤ '+settings.scaleDD+'R',(stats?.maxDD||0)<=settings.scaleDD]];const pass=items.every(x=>x[1]);return <><div className={'gate '+(pass?'good':'bad')}><b>{pass?'SCALE ALLOWED':'HOLD SIZE'}</b><span>{pass?'Data gate passed':'Keep current risk'}</span></div><div className="checklist">{items.map(([x,y])=><div key={x}><span>{y?'✓':'○'}</span>{x}</div>)}</div></>}
function Card({title,sub,children}){return <section className="card"><div className="cardhead"><h2>{title}</h2><p>{sub}</p></div>{children}</section>}
function Metric({l,v,s}){return <div className="metric"><span>{l}</span><b>{v}</b><small>{s}</small></div>}
function Field({l,children}){return <label className="field"><span>{l}</span>{children}</label>}
function Rows({rows}){return <div className="rows">{rows.map(([a,b])=><div key={a}><span>{a}</span><b>{b}</b></div>)}</div>}
function Table({history}){return <div className="table"><table><thead><tr><th>Date</th><th>Symbol</th><th>Setup</th><th>R</th><th>P&L</th><th>Plan?</th><th>Emotion</th><th>Mistake</th></tr></thead><tbody>{history.map(t=><tr key={t.id}><td>{new Date(t.closedAt).toLocaleDateString()}</td><td>{t.symbol}</td><td>{t.setup}</td><td>{rFmt(t.r)}</td><td>{signedMoney(t.pnl)}</td><td>{t.followed?'YES':'NO'}</td><td>{t.emotion}</td><td>{t.mistake}</td></tr>)}</tbody></table></div>}
function Empty(){return <div className="empty">ยังไม่มีข้อมูล — เริ่มจาก Plan</div>}
function money(n){return '$'+Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}function signedMoney(n){const x=+n||0;return (x>0?'+':x<0?'−':'')+'$'+Math.abs(x).toLocaleString(undefined,{maximumFractionDigits:2})}function rFmt(n){const x=+n||0;return (x>0?'+':'')+x.toFixed(2)+'R'}function num(n,d=2){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d})}
