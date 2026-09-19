'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_ACCOUNTS = {
  Binance: { equity: 10000, riskPct: 1, maxRiskPct: 3, leverage: 10 },
  OKX: { equity: 10000, riskPct: 1, maxRiskPct: 3, leverage: 10 },
  XM: { equity: 10000, riskPct: 1, maxRiskPct: 3, leverage: 100 },
};

const PLAYBOOKS = {
  'A1 Trend Continuation': { regimes:['Trending'], minRR:2.5, checks:['HTF trend aligned','Structure aligned with bias','Pullback into planned zone','Liquidity sweep / trigger','Entry confirmation','Invalidation is clear','No FOMO / chase'] },
  'A2 Reversal': { regimes:['Trending','Ranging'], minRR:2, checks:['HTF key level reached','Liquidity sweep','Displacement / rejection','Structure shift confirmed','Entry confirmation','Invalidation is clear','No FOMO / chase'] },
  'B1 Breakout': { regimes:['Trending','High Volatility'], minRR:2, checks:['Clean compression / level','Break with acceptance','Volume / momentum confirms','Retest or defined trigger','Invalidation is clear','Not entering extended candle','No FOMO / chase'] },
};
const EMPTY_TRADE = {
  exchange:'Binance', symbol:'', side:'Long', entry:'', stop:'', target:'',
  leverage:10, sizeMode:'Auto', manualSize:'', contractSize:100,
  regime:'Trending', setup:'A1 Trend Continuation', checks:{},
};

export default function Home() {
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [trade, setTrade] = useState(EMPTY_TRADE);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [marks, setMarks] = useState({});
  const [view, setView] = useState('Trade');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nos_cockpit_v3') || '{}');
      if (saved.accounts) setAccounts(saved.accounts);
      if (saved.positions) setPositions(saved.positions);
      if (saved.history) setHistory(saved.history);
      if (saved.marks) setMarks(saved.marks);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem('nos_cockpit_v3', JSON.stringify({ accounts, positions, history, marks }));
  }, [loaded, accounts, positions, history, marks]);

  const account = accounts[trade.exchange] || DEFAULT_ACCOUNTS.Binance;

  useEffect(() => {
    setTrade(t => ({ ...t, leverage: accounts[t.exchange]?.leverage || 1, manualSize: '' }));
  }, [accounts]);

  const calc = useMemo(() => {
    const entry = Number(trade.entry) || 0;
    const stop = Number(trade.stop) || 0;
    const target = Number(trade.target) || 0;
    const equity = Number(account.equity) || 0;
    const plannedRisk = equity * (Number(account.riskPct) || 0) / 100;
    const leverage = Math.max(1, Number(trade.leverage) || 1);
    const distance = Math.abs(entry - stop);
    const stopPct = entry ? distance / entry : 0;
    const isXM = trade.exchange === 'XM';
    const contractSize = Math.max(0.000001, Number(trade.contractSize) || 1);

    let autoSize = 0;
    let actualSize = 0;
    let qty = 0;
    let actualRisk = 0;
    let margin = 0;

    if (isXM) {
      const riskPerLot = distance * contractSize;
      autoSize = riskPerLot ? plannedRisk / riskPerLot : 0;
      actualSize = trade.sizeMode === 'Manual' ? (Number(trade.manualSize) || 0) : autoSize;
      qty = actualSize;
      actualRisk = riskPerLot * actualSize;
      margin = entry && actualSize ? entry * contractSize * actualSize / leverage : 0;
    } else {
      autoSize = stopPct ? plannedRisk / stopPct : 0; // USDT notional
      actualSize = trade.sizeMode === 'Manual' ? (Number(trade.manualSize) || 0) : autoSize;
      qty = entry ? actualSize / entry : 0;
      actualRisk = actualSize * stopPct;
      margin = actualSize / leverage;
    }

    const rr = distance ? Math.abs(target - entry) / distance : 0;
    const openRisk = positions
      .filter(p => p.exchange === trade.exchange)
      .reduce((s, p) => s + Number(p.riskUsd || 0), 0);
    const afterRisk = openRisk + actualRisk;
    const afterRiskPct = equity ? afterRisk / equity * 100 : 0;

    const errors = [];
    if (!trade.symbol) errors.push('ใส่ Symbol');
    if (!entry || !stop || !target) errors.push('ใส่ Entry / SL / TP ให้ครบ');
    if (trade.side === 'Long' && entry && stop && stop >= entry) errors.push('Long ต้องมี SL ต่ำกว่า Entry');
    if (trade.side === 'Long' && entry && target && target <= entry) errors.push('Long ต้องมี TP สูงกว่า Entry');
    if (trade.side === 'Short' && entry && stop && stop <= entry) errors.push('Short ต้องมี SL สูงกว่า Entry');
    if (trade.side === 'Short' && entry && target && target >= entry) errors.push('Short ต้องมี TP ต่ำกว่า Entry');
    if (trade.sizeMode === 'Manual' && !actualSize) errors.push('ใส่ Position Size');
    if (afterRiskPct > Number(account.maxRiskPct)) errors.push('Portfolio Risk เกิน Max Risk');
    const pb = PLAYBOOKS[trade.setup];
    const checklistPass = pb ? pb.checks.every((_,i)=>trade.checks?.[i]) : false;
    const regimePass = pb ? pb.regimes.includes(trade.regime) : false;
    if (!regimePass) errors.push('Strategy ไม่เหมาะกับ Market Regime นี้');
    if (!checklistPass) errors.push('Mandatory Playbook Checklist ยังไม่ครบ');
    if (pb && rr < pb.minRR) errors.push(`R:R ต่ำกว่า Playbook minimum ${pb.minRR}R`);

    return { entry, stop, target, plannedRisk, stopPct, autoSize, actualSize, qty, actualRisk, margin, rr, openRisk, afterRiskPct, leverage, errors };
  }, [trade, account, positions]);

  const selectedPositions = positions.filter(p => p.exchange === trade.exchange);
  const accountOpenRisk = selectedPositions.reduce((s, p) => s + Number(p.riskUsd || 0), 0);
  const accountRiskPct = Number(account.equity) ? accountOpenRisk / Number(account.equity) * 100 : 0;
  const unrealized = selectedPositions.reduce((sum, p) => sum + unrealizedPnl(p, marks[p.id]), 0);

  function changeExchange(exchange) {
    const a = accounts[exchange];
    setTrade({ ...EMPTY_TRADE, exchange, leverage: a?.leverage || 1, contractSize: exchange === 'XM' ? 100 : 1 });
  }

  function addPosition() {
    if (calc.errors.length) return;
    const p = {
      id: crypto.randomUUID(), exchange: trade.exchange, symbol: trade.symbol.toUpperCase(), side: trade.side,
      entry: calc.entry, stop: calc.stop, target: calc.target, leverage: calc.leverage,
      positionSize: calc.actualSize, qty: calc.qty, riskUsd: calc.actualRisk, rr: calc.rr,
      regime: trade.regime, setup: trade.setup, checklistPassed: true,
      contractSize: Number(trade.contractSize) || 1, openedAt: new Date().toISOString(),
    };
    setPositions(v => [p, ...v]);
    setMarks(m => ({ ...m, [p.id]: calc.entry }));
    const ex = trade.exchange;
    setTrade({ ...EMPTY_TRADE, exchange: ex, leverage: accounts[ex]?.leverage || 1, contractSize: ex === 'XM' ? 100 : 1 });
    setView('Positions');
  }

  function closePosition(p) {
    const exit = Number(marks[p.id]);
    if (!exit) return;
    const pnl = pnlAtPrice(p, exit);
    const r = p.riskUsd ? pnl / p.riskUsd : 0;
    const reason = window.prompt('Close reason: TP / SL / Early / Manual', 'Manual') || 'Manual';
    const followed = window.confirm('Did you follow the original plan? OK = Yes / Cancel = No');
    const emotion = window.prompt('Emotion: Calm / FOMO / Fear / Revenge / Greed', 'Calm') || 'Calm';
    const mistake = followed ? 'None' : (window.prompt('Mistake: Early Entry / Early Exit / Oversize / Moved SL / No Setup', 'Early Exit') || 'Rule violation');
    const systemRRaw = window.prompt('If the original plan was followed exactly, what would the result be in R? (optional)', String(Number(r).toFixed(2)));
    const systemR = Number(systemRRaw);
    const behavioralCost = Number.isFinite(systemR) ? systemR - r : 0;
    const row = { ...p, exit, pnl, r, reason, followed, emotion, mistake, systemR, behavioralCost, closedAt: new Date().toISOString() };
    setHistory(v => [row, ...v]);
    setPositions(v => v.filter(x => x.id !== p.id));
    setMarks(m => { const n = { ...m }; delete n[p.id]; return n; });
  }

  return <main className="shell">
    <header className="top">
      <div><div className="brand">NØS TRADING OS</div><h1>Trading Operating System</h1><p>PLAN → VALIDATE → SIZE → EXECUTE → MANAGE → REVIEW</p></div>
      <nav>{['Trade','Positions','History','Playbook','Rules','Settings'].map(x => <button key={x} className={view===x?'active':''} onClick={()=>setView(x)}>{x}</button>)}</nav>
    </header>

    <div className="accountTabs">
      {Object.keys(accounts).map(ex => <button key={ex} className={trade.exchange===ex?'selected':''} onClick={()=>changeExchange(ex)}>{ex}<small>${Number(accounts[ex].equity||0).toLocaleString()}</small></button>)}
    </div>

    <section className="metrics">
      <Metric label="Account Equity" value={usd(account.equity)} />
      <Metric label="Open Risk" value={usd(accountOpenRisk)} sub={`${accountRiskPct.toFixed(2)}%`} />
      <Metric label="Unrealized P&L" value={signedUsd(unrealized)} tone={unrealized>0?'good':unrealized<0?'bad':''} />
      <Metric label="Open Positions" value={selectedPositions.length} />
    </section>

    {view==='Trade' && <section className="layout">
      <div className="card">
        <div className="cardHead"><h2>New Trade</h2><p>กรอกเฉพาะข้อมูลที่มีอยู่ใน order ticket</p></div>
        <div className="form">
          <Field label="Market Regime"><select value={trade.regime} onChange={e=>setTrade({...trade,regime:e.target.value,checks:{}})}><option>Trending</option><option>Ranging</option><option>High Volatility</option><option>Event-driven</option></select></Field>
          <Field label="Strategy"><select value={trade.setup} onChange={e=>setTrade({...trade,setup:e.target.value,checks:{}})}>{Object.keys(PLAYBOOKS).map(x=><option key={x}>{x}</option>)}</select></Field>
          <Field label="Symbol"><input value={trade.symbol} onChange={e=>setTrade({...trade,symbol:e.target.value})} placeholder={trade.exchange==='XM'?'XAUUSD':'BTCUSDT'} /></Field>
          <Field label="Side"><select value={trade.side} onChange={e=>setTrade({...trade,side:e.target.value})}><option>Long</option><option>Short</option></select></Field>
          <Field label="Entry"><input type="number" value={trade.entry} onChange={e=>setTrade({...trade,entry:e.target.value})} /></Field>
          <Field label="Stop Loss"><input type="number" value={trade.stop} onChange={e=>setTrade({...trade,stop:e.target.value})} /></Field>
          <Field label="Take Profit"><input type="number" value={trade.target} onChange={e=>setTrade({...trade,target:e.target.value})} /></Field>
          <Field label="Leverage"><input type="number" min="1" value={trade.leverage} onChange={e=>setTrade({...trade,leverage:e.target.value})} /></Field>
          {trade.exchange==='XM' && <Field label="Contract Size / 1 Lot"><input type="number" value={trade.contractSize} onChange={e=>setTrade({...trade,contractSize:e.target.value})} /></Field>}
          <Field label="Sizing"><select value={trade.sizeMode} onChange={e=>setTrade({...trade,sizeMode:e.target.value,manualSize:''})}><option>Auto</option><option>Manual</option></select></Field>
          {trade.sizeMode==='Manual' && <Field label={trade.exchange==='XM'?'Position Size (Lot)':'Position Size (USDT)'}><input type="number" value={trade.manualSize} onChange={e=>setTrade({...trade,manualSize:e.target.value})} /></Field>}
        </div>
      </div>

      <div className="card result">
        <div className="cardHead"><h2>Trade Gate</h2><p>{trade.setup} · {trade.regime}</p></div>
        <div className="checklist">{PLAYBOOKS[trade.setup].checks.map((x,i)=><label className="check" key={x}><input type="checkbox" checked={!!trade.checks?.[i]} onChange={e=>setTrade({...trade,checks:{...trade.checks,[i]:e.target.checked}})} /><span>{x}</span></label>)}</div>
        <div className="cardHead"><h2>Risk Check</h2><p>{account.riskPct}% risk per trade · max portfolio {account.maxRiskPct}%</p></div>
        <Result label="Risk Budget" value={usd(calc.plannedRisk)} />
        <Result label="SL Distance" value={`${(calc.stopPct*100).toFixed(2)}%`} />
        <Result label={trade.exchange==='XM'?'Position Size':'Position Size'} value={trade.exchange==='XM'?`${fmt(calc.actualSize,3)} lot`:usd(calc.actualSize)} strong />
        {trade.exchange!=='XM' && <Result label="Quantity" value={fmt(calc.qty,6)} />}
        <Result label="Leverage" value={`${calc.leverage}x`} />
        <Result label="Margin Required" value={usd(calc.margin)} />
        <Result label="Actual Risk at SL" value={`${usd(calc.actualRisk)} · ${account.equity ? (calc.actualRisk/account.equity*100).toFixed(2) : '0.00'}%`} />
        <Result label="Planned R:R" value={`${calc.rr.toFixed(2)}R`} />
        <Result label="Portfolio Risk After" value={`${calc.afterRiskPct.toFixed(2)}%`} />
        {calc.errors.length>0 && <div className="errors">{calc.errors.map(x=><div key={x}>• {x}</div>)}</div>}
        <button className="openBtn" disabled={calc.errors.length>0} onClick={addPosition}>OPEN POSITION</button>
      </div>
    </section>}

    {view==='Positions' && <section className="card">
      <div className="cardHead"><h2>Active Positions — {trade.exchange}</h2><p>ใส่ Current Price เพื่อดู P&L และใช้ราคานั้นปิด Position</p></div>
      {selectedPositions.length===0 ? <Empty/> : <div className="positionList">{selectedPositions.map(p => {
        const mark = marks[p.id] ?? '';
        const pnl = unrealizedPnl(p, mark);
        return <div className="pos" key={p.id}>
          <div className="posTitle"><b>{p.symbol}</b><span className={p.side==='Long'?'long':'short'}>{p.side}</span><small>{p.leverage}x</small></div>
          <div className="posData"><span>Entry<b>{fmt(p.entry,6)}</b></span><span>SL<b>{fmt(p.stop,6)}</b></span><span>TP<b>{fmt(p.target,6)}</b></span><span>Size<b>{p.exchange==='XM'?`${fmt(p.positionSize,3)} lot`:usd(p.positionSize)}</b></span><span>Risk<b>{usd(p.riskUsd)}</b></span></div>
          <div className="markBox"><label>Current Price</label><input type="number" value={mark} onChange={e=>setMarks({...marks,[p.id]:e.target.value})}/><strong className={pnl>0?'goodText':pnl<0?'badText':''}>{signedUsd(pnl)}</strong></div>
          <button className="closeBtn" disabled={!Number(mark)} onClick={()=>closePosition(p)}>Close @ Current</button>
        </div>
      })}</div>}
    </section>}

    {view==='History' && <section className="card">
      <div className="cardHead"><h2>History</h2><p>Closed trades</p></div>
      {history.length===0 ? <Empty/> : <div className="tableWrap"><table><thead><tr><th>Date</th><th>Exchange</th><th>Symbol</th><th>Side</th><th>Size</th><th>Lev.</th><th>P&L</th><th>R</th><th>Reason</th></tr></thead><tbody>{history.map(t=><tr key={t.id}><td>{new Date(t.closedAt).toLocaleDateString()}</td><td>{t.exchange}</td><td><b>{t.symbol}</b></td><td>{t.side}</td><td>{t.exchange==='XM'?`${fmt(t.positionSize,3)} lot`:usd(t.positionSize)}</td><td>{t.leverage}x</td><td className={t.pnl>=0?'goodText':'badText'}>{signedUsd(t.pnl)}</td><td>{Number(t.r||0).toFixed(2)}R</td><td>{t.reason}</td></tr>)}</tbody></table></div>}
    </section>}

    {view==='Playbook' && <section className="layout"><div className="card"><div className="cardHead"><h2>Strategy Playbook</h2><p>Mandatory checklist — one missing hard condition = NO TRADE.</p></div>{Object.entries(PLAYBOOKS).map(([name,pb])=><div className="playCard" key={name}><div className="posTitle"><b>{name}</b><span>{pb.regimes.join(' / ')}</span></div><p>Minimum R:R <b>{pb.minRR}R</b></p>{pb.checks.map(x=><div className="ruleLine" key={x}>□ {x}</div>)}<p className="muted">Stats: {history.filter(h=>h.setup===name).length} logged trades · {strategyExpectancy(history,name)}</p></div>)}</div><div className="card result"><div className="cardHead"><h2>Scale Gate</h2><p>Size increases only when data permits it.</p></div><Result label="Minimum sample" value="50 trades"/><Result label="Expectancy" value="> +0.20R"/><Result label="Profit Factor" value="> 1.30"/><Result label="Rule Adherence" value="≥ 90%"/><Result label="Scaling" value="0.50% → 0.75% → 1.00%" strong/></div></section>}
    {view==='Rules' && <section className="layout"><div className="card"><div className="cardHead"><h2>Hard Guardrails</h2><p>Protect process before P&L.</p></div><Result label="Max Risk / Trade" value="0.75%"/><Result label="Max Daily Loss" value="2R"/><Result label="Max Weekly Loss" value="5R"/><Result label="Max Open Risk" value="2.5R"/><Result label="Minimum R:R" value="2R"/></div><div className="card"><div className="cardHead"><h2>Execution Protocol</h2></div><p>1. PLAN — define thesis and invalidation.</p><p>2. VALIDATE — setup must match playbook.</p><p>3. SIZE — risk first; leverage never defines risk.</p><p>4. EXECUTE — trigger only, no FOMO entry.</p><p>5. REVIEW — separate system loss from trader error.</p><p>6. SCALE — only after statistical gate.</p></div></section>}
    {view==='Settings' && <section className="card">
      <div className="cardHead"><h2>Account Risk Settings</h2><p>ตั้ง Balance และ Guardrail แยกแต่ละพอร์ต</p></div>
      <div className="settingsGrid">{Object.entries(accounts).map(([ex,a])=><div className="accountCard" key={ex}><h3>{ex}</h3>
        <Field label="Equity ($)"><input type="number" value={a.equity} onChange={e=>setAccounts({...accounts,[ex]:{...a,equity:Number(e.target.value)}})} /></Field>
        <Field label="Risk / Trade %"><input type="number" step="0.1" value={a.riskPct} onChange={e=>setAccounts({...accounts,[ex]:{...a,riskPct:Number(e.target.value)}})} /></Field>
        <Field label="Max Portfolio Risk %"><input type="number" step="0.1" value={a.maxRiskPct} onChange={e=>setAccounts({...accounts,[ex]:{...a,maxRiskPct:Number(e.target.value)}})} /></Field>
        <Field label="Default Leverage"><input type="number" value={a.leverage} onChange={e=>setAccounts({...accounts,[ex]:{...a,leverage:Number(e.target.value)}})} /></Field>
      </div>)}</div>
    </section>}
  </main>
}

function pnlAtPrice(p, price) {
  const px = Number(price) || 0;
  if (!px) return 0;
  const dir = p.side === 'Long' ? 1 : -1;
  if (p.exchange === 'XM') return (px - p.entry) * dir * Number(p.contractSize || 1) * Number(p.positionSize || 0);
  return (px - p.entry) * dir * Number(p.qty || 0);
}
function unrealizedPnl(p, price){ return pnlAtPrice(p, price); }
function usd(n){ return `$${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}`; }
function signedUsd(n){ const x=Number(n||0); return `${x>0?'+':x<0?'−':''}$${Math.abs(x).toLocaleString(undefined,{maximumFractionDigits:2})}`; }
function fmt(n,d=2){ return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:d}); }
function Metric({label,value,sub,tone=''}){return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Result({label,value,strong=false}){return <div className={`resultRow ${strong?'strong':''}`}><span>{label}</span><b>{value}</b></div>}
function Empty(){return <div className="empty">ยังไม่มีข้อมูล</div>}
function strategyExpectancy(history,name){const a=history.filter(x=>x.setup===name);if(!a.length)return 'No sample yet';const e=a.reduce((s,x)=>s+Number(x.r||0),0)/a.length;return `Expectancy ${e>=0?'+':''}${e.toFixed(2)}R`;}
