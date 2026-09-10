'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_RULES={equity:14000,riskPct:.75,maxPortfolioRiskPct:2,dailyLossPct:2.25,maxOpen:4};
const EMPTY_PLAN={exchange:'Binance',symbol:'',side:'Long',setup:'',entry:'',stop:'',target:''};
const EMPTY_CLOSE={id:'',exit:'',reason:'Take Profit',followedPlan:true,note:''};

export default function Home(){
  const [tab,setTab]=useState('Today');
  const [rules,setRules]=useState(DEFAULT_RULES);
  const [plan,setPlan]=useState(EMPTY_PLAN);
  const [positions,setPositions]=useState([]);
  const [closed,setClosed]=useState([]);
  const [closeForm,setCloseForm]=useState(EMPTY_CLOSE);
  const [day,setDay]=useState({peak:0,current:0});
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{try{const x=JSON.parse(localStorage.getItem('nos_cockpit_v2')||'{}');if(x.rules)setRules(x.rules);if(x.positions)setPositions(x.positions);if(x.closed)setClosed(x.closed);if(x.day)setDay(x.day)}catch{}setLoaded(true)},[]);
  useEffect(()=>{if(loaded)localStorage.setItem('nos_cockpit_v2',JSON.stringify({rules,positions,closed,day}))},[loaded,rules,positions,closed,day]);

  const calc=useMemo(()=>{
    const equity=Number(rules.equity)||0, entry=Number(plan.entry)||0, stop=Number(plan.stop)||0, target=Number(plan.target)||0;
    const riskUsd=equity*(Number(rules.riskPct)||0)/100;
    const dist=Math.abs(entry-stop);
    const qty=dist?riskUsd/dist:0;
    const rr=dist?Math.abs(target-entry)/dist:0;
    const openRisk=positions.reduce((s,p)=>s+Number(p.riskUsd||0),0);
    const afterRisk=openRisk+riskUsd;
    const afterRiskPct=equity?afterRisk/equity*100:0;
    const realized=closed.filter(isToday).reduce((s,t)=>s+Number(t.pnl||0),0);
    const dailyLossPct=equity?Math.max(0,-realized)/equity*100:0;
    const blocks=[];
    if(!plan.symbol||!plan.setup||!entry||!stop||!target) blocks.push('กรอกแผนให้ครบ');
    if(entry===stop) blocks.push('SL ใช้ไม่ได้');
    if(afterRiskPct>Number(rules.maxPortfolioRiskPct)) blocks.push('Portfolio Risk เกิน limit');
    if(positions.length+1>Number(rules.maxOpen)) blocks.push('Open Positions เกิน limit');
    if(dailyLossPct>=Number(rules.dailyLossPct)) blocks.push('Daily Loss Limit ถึงแล้ว');
    return{riskUsd,qty,rr,openRisk,afterRiskPct,realized,dailyLossPct,blocks,status:blocks.length?'BLOCK':'PASS'};
  },[rules,plan,positions,closed]);

  const todayClosed=closed.filter(isToday);
  const todayPnl=todayClosed.reduce((s,t)=>s+Number(t.pnl||0),0);
  const giveback=Math.max(0,Number(day.peak||0)-Number(day.current||0));
  const riskBudget=Math.max(0,(Number(rules.equity)||0)*Number(rules.maxPortfolioRiskPct)/100-calc.openRisk);
  const discipline=todayClosed.length?Math.round(todayClosed.filter(t=>t.followedPlan).length/todayClosed.length*100):100;
  const winRate=todayClosed.length?Math.round(todayClosed.filter(t=>t.pnl>0).length/todayClosed.length*100):0;

  function openTrade(){
    if(calc.status==='BLOCK')return;
    const p={id:crypto.randomUUID(),...plan,symbol:plan.symbol.toUpperCase(),entry:Number(plan.entry),stop:Number(plan.stop),target:Number(plan.target),riskUsd:calc.riskUsd,qty:calc.qty,rr:calc.rr,openedAt:new Date().toISOString()};
    setPositions(v=>[p,...v]);setPlan(EMPTY_PLAN);setTab('Active');
  }

  function prepareClose(p){setCloseForm({id:p.id,exit:'',reason:'Take Profit',followedPlan:true,note:''});setTab('Review')}
  function closeTrade(){
    const p=positions.find(x=>x.id===closeForm.id); if(!p||!Number(closeForm.exit))return;
    const exit=Number(closeForm.exit), dir=p.side==='Long'?1:-1;
    const pnl=(exit-p.entry)*dir*p.qty;
    const r=p.riskUsd?pnl/p.riskUsd:0;
    const row={...p,exit,pnl,r,closeReason:closeForm.reason,followedPlan:closeForm.followedPlan,note:closeForm.note,closedAt:new Date().toISOString()};
    setClosed(v=>[row,...v]);setPositions(v=>v.filter(x=>x.id!==p.id));setCloseForm(EMPTY_CLOSE);setTab('Today');
  }

  return <main className="appShell">
    <aside className="sidebar">
      <div className="brand">NØS <span>COCKPIT</span></div>
      {['Today','Plan Trade','Active','Review','History','Settings'].map(x=><button key={x} className={tab===x?'nav active':'nav'} onClick={()=>setTab(x)}>{x}</button>)}
      <div className="sideRule">PROCESS &gt; P&L</div>
    </aside>

    <section className="workspace">
      <header className="pageHead"><div><p className="eyebrow">DAILY TRADING COCKPIT</p><h1>{tab}</h1></div><div className={`gate ${calc.status==='PASS'?'pass':'block'}`}><small>TRADE STATUS</small><b>{calc.status==='PASS'?'TRADE ALLOWED':'NO TRADE'}</b></div></header>

      {tab==='Today'&&<>
        <section className="kpis">
          <Kpi label="Today P&L" value={money(todayPnl)} sub={`${todayClosed.length} closed trades`} tone={todayPnl<0?'bad':todayPnl>0?'good':''}/>
          <Kpi label="Open Risk" value={money(calc.openRisk)} sub={`${pct(calc.openRisk/rules.equity*100)} of equity`}/>
          <Kpi label="Risk Budget Left" value={money(riskBudget)} sub={`limit ${rules.maxPortfolioRiskPct}%`}/>
          <Kpi label="Open Positions" value={positions.length} sub={`max ${rules.maxOpen}`}/>
          <Kpi label="Discipline" value={`${discipline}%`} sub="followed plan" tone={discipline<80?'bad':'good'}/>
          <Kpi label="Win Rate Today" value={`${winRate}%`} sub={`${todayClosed.filter(x=>x.pnl>0).length}/${todayClosed.length}`}/>
        </section>
        <section className="twoCol">
          <Panel title="Today's Control" sub="เปิดดูแค่สิ่งที่ต้องตัดสินใจตอนนี้">
            <div className="controlGrid">
              <Field label="Peak P&L"><input type="number" value={day.peak} onChange={e=>setDay({...day,peak:Number(e.target.value)})}/></Field>
              <Field label="Current P&L"><input type="number" value={day.current} onChange={e=>setDay({...day,current:Number(e.target.value)})}/></Field>
            </div>
            <div className="controlStatus"><span>Giveback from Peak</span><b>{money(giveback)}</b></div>
            <div className="controlStatus"><span>Daily Loss Used</span><b>{pct(calc.dailyLossPct)} / {rules.dailyLossPct}%</b></div>
            <button className="primary" onClick={()=>setTab('Plan Trade')}>+ Plan New Trade</button>
          </Panel>
          <Panel title="Active Positions" sub="สิ่งที่กำลังเสี่ยงอยู่ตอนนี้">
            {positions.length===0?<Empty text="No active positions"/>:<div className="stack">{positions.map(p=><PositionCard key={p.id} p={p} onClose={()=>prepareClose(p)}/>)}</div>}
          </Panel>
        </section>
      </>}

      {tab==='Plan Trade'&&<Panel title="Plan Trade" sub="กรอกเฉพาะสิ่งที่รู้ก่อนเข้า ระบบคำนวณส่วนที่เหลือให้">
        <div className="formGrid">
          <Field label="Exchange"><select value={plan.exchange} onChange={e=>setPlan({...plan,exchange:e.target.value})}><option>Binance</option><option>OKX</option><option>XM</option><option>Dime</option></select></Field>
          <Field label="Symbol"><input value={plan.symbol} onChange={e=>setPlan({...plan,symbol:e.target.value})} placeholder="BTCUSDT"/></Field>
          <Field label="Side"><select value={plan.side} onChange={e=>setPlan({...plan,side:e.target.value})}><option>Long</option><option>Short</option></select></Field>
          <Field label="Setup"><input value={plan.setup} onChange={e=>setPlan({...plan,setup:e.target.value})} placeholder="Pullback / Breakout"/></Field>
          <Field label="Entry"><input type="number" value={plan.entry} onChange={e=>setPlan({...plan,entry:e.target.value})}/></Field>
          <Field label="Stop Loss"><input type="number" value={plan.stop} onChange={e=>setPlan({...plan,stop:e.target.value})}/></Field>
          <Field label="Take Profit"><input type="number" value={plan.target} onChange={e=>setPlan({...plan,target:e.target.value})}/></Field>
        </div>
        <div className="calcStrip"><Mini label="Risk" value={money(calc.riskUsd)}/><Mini label="Position Qty" value={calc.qty?calc.qty.toFixed(4):'—'}/><Mini label="Planned R:R" value={calc.rr?`${calc.rr.toFixed(2)}R`:'—'}/><Mini label="Risk After Entry" value={pct(calc.afterRiskPct)}/></div>
        {calc.blocks.length>0&&<div className="warnings">{calc.blocks.map(x=><div key={x}>BLOCK · {x}</div>)}</div>}
        <button className="primary" disabled={calc.status==='BLOCK'} onClick={openTrade}>Open Approved Position</button>
      </Panel>}

      {tab==='Active'&&<Panel title="Active Positions" sub="เปิดจริง → อยู่ตรงนี้ → ปิดจากตรงนี้">
        {positions.length===0?<Empty text="No active positions"/>:<div className="stack">{positions.map(p=><PositionCard key={p.id} p={p} onClose={()=>prepareClose(p)}/>)}</div>}
      </Panel>}

      {tab==='Review'&&<Panel title="Close & Review" sub="ผูก outcome กับ trade เดิม ไม่ต้องกรอกซ้ำ">
        {!closeForm.id?<><p className="muted">เลือก Close จาก Active Position ก่อน</p><button className="secondary" onClick={()=>setTab('Active')}>Go to Active Positions</button></>:<>
          <div className="reviewTrade">{positions.find(x=>x.id===closeForm.id)?.symbol} · {positions.find(x=>x.id===closeForm.id)?.side} · {positions.find(x=>x.id===closeForm.id)?.setup}</div>
          <div className="formGrid">
            <Field label="Exit Price"><input type="number" value={closeForm.exit} onChange={e=>setCloseForm({...closeForm,exit:e.target.value})}/></Field>
            <Field label="Close Reason"><select value={closeForm.reason} onChange={e=>setCloseForm({...closeForm,reason:e.target.value})}><option>Take Profit</option><option>Stop Loss</option><option>Structure Changed</option><option>Early Exit</option><option>Manual Exit</option></select></Field>
            <Field label="Followed Plan?"><select value={closeForm.followedPlan?'Yes':'No'} onChange={e=>setCloseForm({...closeForm,followedPlan:e.target.value==='Yes'})}><option>Yes</option><option>No</option></select></Field>
            <Field label="Note"><input value={closeForm.note} onChange={e=>setCloseForm({...closeForm,note:e.target.value})} placeholder="Why did I exit?"/></Field>
          </div><button className="primary" onClick={closeTrade}>Close Position & Save Review</button>
        </>}
      </Panel>}

      {tab==='History'&&<Panel title="Trade History" sub="ดู Decision Quality พร้อม P&L">
        {closed.length===0?<Empty text="No closed trades yet"/>:<div className="tableWrap"><table><thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Setup</th><th>P&L</th><th>R</th><th>Reason</th><th>Plan</th></tr></thead><tbody>{closed.map(t=><tr key={t.id}><td>{new Date(t.closedAt).toLocaleDateString()}</td><td><b>{t.symbol}</b></td><td>{t.side}</td><td>{t.setup}</td><td className={t.pnl<0?'badText':'goodText'}>{money(t.pnl)}</td><td>{Number(t.r).toFixed(2)}R</td><td>{t.closeReason}</td><td>{t.followedPlan?'PASS':'FAIL'}</td></tr>)}</tbody></table></div>}
      </Panel>}

      {tab==='Settings'&&<Panel title="Risk Rules" sub="ตั้งครั้งเดียว แล้วใช้เป็น hard guardrails">
        <div className="formGrid">
          <Field label="Equity ($)"><input type="number" value={rules.equity} onChange={e=>setRules({...rules,equity:Number(e.target.value)})}/></Field>
          <Field label="Risk / Trade %"><input type="number" step=".05" value={rules.riskPct} onChange={e=>setRules({...rules,riskPct:Number(e.target.value)})}/></Field>
          <Field label="Max Portfolio Risk %"><input type="number" step=".1" value={rules.maxPortfolioRiskPct} onChange={e=>setRules({...rules,maxPortfolioRiskPct:Number(e.target.value)})}/></Field>
          <Field label="Daily Loss Limit %"><input type="number" step=".1" value={rules.dailyLossPct} onChange={e=>setRules({...rules,dailyLossPct:Number(e.target.value)})}/></Field>
          <Field label="Max Open Positions"><input type="number" value={rules.maxOpen} onChange={e=>setRules({...rules,maxOpen:Number(e.target.value)})}/></Field>
        </div>
      </Panel>}
    </section>
  </main>
}

function isToday(t){const d=new Date(t.closedAt||0),n=new Date();return d.toDateString()===n.toDateString()}
function money(n){return `${Number(n||0)<0?'−':''}$${Math.abs(Number(n||0)).toFixed(0)}`}
function pct(n){return `${Number(n||0).toFixed(2)}%`}
function Kpi({label,value,sub,tone=''}){return <div className={`kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function Panel({title,sub,children}){return <section className="panel"><div className="panelHead"><h2>{title}</h2><p>{sub}</p></div>{children}</section>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Mini({label,value}){return <div><span>{label}</span><b>{value}</b></div>}
function Empty({text}){return <div className="empty">{text}</div>}
function PositionCard({p,onClose}){return <div className="position"><div><div className="positionTitle"><b>{p.symbol}</b><span>{p.exchange}</span><span className={p.side==='Long'?'long':'short'}>{p.side}</span></div><small>{p.setup}</small></div><div className="positionNums"><span>Entry <b>{p.entry}</b></span><span>SL <b>{p.stop}</b></span><span>TP <b>{p.target}</b></span><span>Risk <b>{money(p.riskUsd)}</b></span><span>R:R <b>{Number(p.rr).toFixed(2)}R</b></span></div><button className="closeBtn" onClick={onClose}>Close</button></div>}
