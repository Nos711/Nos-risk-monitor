'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_RULES = {
  equity: 14000,
  riskPerTradePct: 0.75,
  maxPortfolioRiskPct: 2,
  dailyLossLimitPct: 2.25,
  maxOpenPositions: 4,
  maxCorrelatedPositions: 3,
  maxGivebackPct: 40,
};

const emptyTrade = {
  symbol: '',
  side: 'Long',
  setup: '',
  entry: '',
  stop: '',
  target: '',
  currentPortfolioPnl: '',
  sameDirectionCount: 0,
  correlation: 'Low',
  mentalState: 'Calm',
  confidence: 3,
};

export default function Home() {
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [trade, setTrade] = useState(emptyTrade);
  const [positions, setPositions] = useState([]);
  const [day, setDay] = useState({ peakPnl: 0, currentPnl: 0, realizedPnl: 0 });
  const [execution, setExecution] = useState({ entry: true, risk: true, portfolio: true, management: true, exit: true });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const raw = localStorage.getItem('nos_trading_os');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.rules) setRules(saved.rules);
      if (saved.positions) setPositions(saved.positions);
      if (saved.day) setDay(saved.day);
      if (saved.logs) setLogs(saved.logs);
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('nos_trading_os', JSON.stringify({ rules, positions, day, logs }));
  }, [rules, positions, day, logs]);

  const calc = useMemo(() => {
    const equity = Number(rules.equity) || 0;
    const entry = Number(trade.entry) || 0;
    const stop = Number(trade.stop) || 0;
    const target = Number(trade.target) || 0;
    const riskBudget = equity * ((Number(rules.riskPerTradePct) || 0) / 100);
    const stopDist = Math.abs(entry - stop);
    const qty = stopDist > 0 ? riskBudget / stopDist : 0;
    const plannedReward = Math.abs(target - entry) * qty;
    const rr = riskBudget > 0 ? plannedReward / riskBudget : 0;
    const openRisk = positions.reduce((s, p) => s + Number(p.riskUsd || 0), 0);
    const afterRisk = openRisk + riskBudget;
    const afterRiskPct = equity ? (afterRisk / equity) * 100 : 0;
    const currentPnl = Number(day.currentPnl) || 0;
    const peakPnl = Math.max(Number(day.peakPnl) || 0, currentPnl);
    const giveback = Math.max(0, peakPnl - currentPnl);
    const givebackPct = peakPnl > 0 ? (giveback / peakPnl) * 100 : 0;
    const dailyLossPct = equity ? Math.max(0, -(Number(day.realizedPnl) || 0)) / equity * 100 : 0;

    const blocks = [];
    const cautions = [];
    if (!trade.symbol || !trade.setup || !entry || !stop || !target) blocks.push('Trade plan incomplete');
    if (entry === stop) blocks.push('Invalid stop distance');
    if (afterRiskPct > Number(rules.maxPortfolioRiskPct)) blocks.push('Portfolio risk exceeds limit');
    if (positions.length + 1 > Number(rules.maxOpenPositions)) blocks.push('Too many open positions');
    if (Number(trade.sameDirectionCount) + 1 > Number(rules.maxCorrelatedPositions) && trade.correlation === 'High') blocks.push('High correlated exposure');
    if (dailyLossPct >= Number(rules.dailyLossLimitPct)) blocks.push('Daily loss kill switch reached');
    if (givebackPct >= Number(rules.maxGivebackPct) && peakPnl > 0) cautions.push('Large profit giveback today');
    if (trade.mentalState !== 'Calm') cautions.push(`Mental state: ${trade.mentalState}`);
    if (Number(trade.confidence) <= 2) cautions.push('Low confidence');
    if (Number(trade.currentPortfolioPnl) > 0) cautions.push('Risk is being added while portfolio is profitable');

    const status = blocks.length ? 'NO TRADE' : cautions.length ? 'CAUTION' : 'TRADE ALLOWED';
    return { riskBudget, qty, rr, openRisk, afterRiskPct, giveback, givebackPct, dailyLossPct, blocks, cautions, status };
  }, [rules, trade, positions, day]);

  const executionScore = Object.values(execution).filter(Boolean).length;

  function addPosition() {
    if (calc.status === 'NO TRADE') return;
    const item = {
      id: crypto.randomUUID(),
      symbol: trade.symbol.toUpperCase(),
      side: trade.side,
      setup: trade.setup,
      riskUsd: calc.riskBudget,
      rr: calc.rr,
      correlation: trade.correlation,
      mentalState: trade.mentalState,
      portfolioPnlAtEntry: Number(trade.currentPortfolioPnl) || 0,
      createdAt: new Date().toISOString(),
    };
    setPositions((x) => [item, ...x]);
    setTrade(emptyTrade);
  }

  function closePosition(id) {
    setPositions((x) => x.filter((p) => p.id !== id));
  }

  function saveExecution() {
    const item = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      score: executionScore,
      ...execution,
    };
    setLogs((x) => [item, ...x].slice(0, 50));
  }

  const openRiskPct = Number(rules.equity) ? (calc.openRisk / Number(rules.equity)) * 100 : 0;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">NØS SYSTEMATIC TRADING</div>
          <h1>Trading System OS</h1>
          <p>Risk Engine · Exposure Control · Behavior · Execution</p>
        </div>
        <div className={`permission ${calc.status.replace(' ', '-').toLowerCase()}`}>
          <span>PRE-TRADE GATE</span>
          <strong>{calc.status}</strong>
        </div>
      </header>

      <section className="metricGrid">
        <Metric label="Open Risk" value={`$${calc.openRisk.toFixed(0)}`} sub={`${openRiskPct.toFixed(2)}% of equity`} />
        <Metric label="Risk Limit" value={`${rules.maxPortfolioRiskPct}%`} sub={`$${(rules.equity * rules.maxPortfolioRiskPct / 100).toFixed(0)}`} />
        <Metric label="Open Positions" value={positions.length} sub={`max ${rules.maxOpenPositions}`} />
        <Metric label="Today Peak P&L" value={`$${Number(day.peakPnl || 0).toFixed(0)}`} />
        <Metric label="Current P&L" value={`$${Number(day.currentPnl || 0).toFixed(0)}`} />
        <Metric label="Giveback" value={`$${calc.giveback.toFixed(0)}`} sub={`${calc.givebackPct.toFixed(1)}% from peak`} warn={calc.givebackPct >= rules.maxGivebackPct} />
      </section>

      <section className="grid2">
        <Card title="Pre-Trade Gate" subtitle="ระบบต้องอนุญาตก่อนเพิ่ม Risk">
          <div className="formGrid">
            <Field label="Symbol"><input value={trade.symbol} onChange={e => setTrade({ ...trade, symbol: e.target.value })} placeholder="BTCUSDT" /></Field>
            <Field label="Side"><select value={trade.side} onChange={e => setTrade({ ...trade, side: e.target.value })}><option>Long</option><option>Short</option></select></Field>
            <Field label="Setup"><input value={trade.setup} onChange={e => setTrade({ ...trade, setup: e.target.value })} placeholder="Breakout / Pullback" /></Field>
            <Field label="Entry"><input type="number" value={trade.entry} onChange={e => setTrade({ ...trade, entry: e.target.value })} /></Field>
            <Field label="Stop"><input type="number" value={trade.stop} onChange={e => setTrade({ ...trade, stop: e.target.value })} /></Field>
            <Field label="Target"><input type="number" value={trade.target} onChange={e => setTrade({ ...trade, target: e.target.value })} /></Field>
            <Field label="Portfolio P&L now"><input type="number" value={trade.currentPortfolioPnl} onChange={e => setTrade({ ...trade, currentPortfolioPnl: e.target.value })} placeholder="0" /></Field>
            <Field label="Same-direction positions"><input type="number" min="0" value={trade.sameDirectionCount} onChange={e => setTrade({ ...trade, sameDirectionCount: e.target.value })} /></Field>
            <Field label="Correlation"><select value={trade.correlation} onChange={e => setTrade({ ...trade, correlation: e.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></Field>
            <Field label="Mental state"><select value={trade.mentalState} onChange={e => setTrade({ ...trade, mentalState: e.target.value })}><option>Calm</option><option>FOMO</option><option>Frustrated</option><option>Revenge</option><option>Overconfident</option><option>Tired</option><option>Bored</option></select></Field>
            <Field label="Confidence 1–5"><input type="number" min="1" max="5" value={trade.confidence} onChange={e => setTrade({ ...trade, confidence: e.target.value })} /></Field>
          </div>

          <div className="decisionBox">
            <div><span>Risk / Trade</span><b>${calc.riskBudget.toFixed(2)}</b></div>
            <div><span>Position Qty</span><b>{calc.qty.toFixed(4)}</b></div>
            <div><span>Planned R:R</span><b>{calc.rr.toFixed(2)}R</b></div>
            <div><span>Risk after entry</span><b>{calc.afterRiskPct.toFixed(2)}%</b></div>
          </div>

          {(calc.blocks.length > 0 || calc.cautions.length > 0) && <div className="alerts">
            {calc.blocks.map(x => <div className="alert block" key={x}>BLOCK · {x}</div>)}
            {calc.cautions.map(x => <div className="alert caution" key={x}>CAUTION · {x}</div>)}
          </div>}
          <button className="primary" disabled={calc.status === 'NO TRADE'} onClick={addPosition}>Add Approved Position</button>
        </Card>

        <Card title="Daily Risk Control" subtitle="กำไรเพิ่ม ≠ สิทธิ์ในการเพิ่ม Risk">
          <div className="formGrid compact">
            <Field label="Equity ($)"><input type="number" value={rules.equity} onChange={e => setRules({ ...rules, equity: Number(e.target.value) })} /></Field>
            <Field label="Risk / Trade %"><input type="number" step="0.05" value={rules.riskPerTradePct} onChange={e => setRules({ ...rules, riskPerTradePct: Number(e.target.value) })} /></Field>
            <Field label="Max Portfolio Risk %"><input type="number" step="0.1" value={rules.maxPortfolioRiskPct} onChange={e => setRules({ ...rules, maxPortfolioRiskPct: Number(e.target.value) })} /></Field>
            <Field label="Daily Loss Limit %"><input type="number" step="0.1" value={rules.dailyLossLimitPct} onChange={e => setRules({ ...rules, dailyLossLimitPct: Number(e.target.value) })} /></Field>
            <Field label="Max Open Positions"><input type="number" value={rules.maxOpenPositions} onChange={e => setRules({ ...rules, maxOpenPositions: Number(e.target.value) })} /></Field>
            <Field label="Max Correlated"><input type="number" value={rules.maxCorrelatedPositions} onChange={e => setRules({ ...rules, maxCorrelatedPositions: Number(e.target.value) })} /></Field>
            <Field label="Max Giveback %"><input type="number" value={rules.maxGivebackPct} onChange={e => setRules({ ...rules, maxGivebackPct: Number(e.target.value) })} /></Field>
          </div>
          <div className="divider" />
          <div className="formGrid compact">
            <Field label="Today Peak P&L"><input type="number" value={day.peakPnl} onChange={e => setDay({ ...day, peakPnl: Number(e.target.value) })} /></Field>
            <Field label="Current P&L"><input type="number" value={day.currentPnl} onChange={e => setDay({ ...day, currentPnl: Number(e.target.value) })} /></Field>
            <Field label="Realized P&L"><input type="number" value={day.realizedPnl} onChange={e => setDay({ ...day, realizedPnl: Number(e.target.value) })} /></Field>
          </div>
          <div className="killSwitch">
            <span>Daily Loss Used</span>
            <b>{calc.dailyLossPct.toFixed(2)}% / {rules.dailyLossLimitPct}%</b>
          </div>
        </Card>
      </section>

      <section className="grid2 lower">
        <Card title="Portfolio Exposure" subtitle="มองทุก position เป็น portfolio เดียวกัน">
          {positions.length === 0 ? <Empty text="ยังไม่มี Approved Position" /> : <div className="tableWrap"><table><thead><tr><th>Symbol</th><th>Side</th><th>Setup</th><th>Risk</th><th>R:R</th><th>Correlation</th><th>P&L at Entry</th><th></th></tr></thead><tbody>{positions.map(p => <tr key={p.id}><td><b>{p.symbol}</b></td><td>{p.side}</td><td>{p.setup}</td><td>${Number(p.riskUsd).toFixed(0)}</td><td>{Number(p.rr).toFixed(2)}R</td><td><span className={`tag ${p.correlation.toLowerCase()}`}>{p.correlation}</span></td><td>${Number(p.portfolioPnlAtEntry).toFixed(0)}</td><td><button className="textBtn" onClick={() => closePosition(p.id)}>Close</button></td></tr>)}</tbody></table></div>}
        </Card>

        <Card title="Execution Score" subtitle="ตัดสินคุณภาพ Decision ไม่ใช่ P&L">
          <div className="scoreRow"><div className="scoreCircle"><strong>{executionScore}</strong><span>/5</span></div><div><h3>{executionScore === 5 ? 'PASS' : executionScore >= 4 ? 'WATCH' : 'FAIL'}</h3><p>A -1R trade ที่ 5/5 ยังเป็น Good Trade</p></div></div>
          <div className="checks">
            {[
              ['entry','Entry matches setup'],
              ['risk','Risk per trade correct'],
              ['portfolio','Portfolio exposure within rule'],
              ['management','Management according to plan'],
              ['exit','Exit according to rule']
            ].map(([k,label]) => <label key={k}><input type="checkbox" checked={execution[k]} onChange={e => setExecution({ ...execution, [k]: e.target.checked })} /><span>{label}</span></label>)}
          </div>
          <button className="secondary" onClick={saveExecution}>Save Execution Score</button>
          {logs.length > 0 && <div className="miniLog">Last scores: {logs.slice(0,8).map(x => <span key={x.id}>{x.score}/5</span>)}</div>}
        </Card>
      </section>

      <section className="principles">
        <div><b>1</b><span>Good Decision + Profit</span><strong>GOOD</strong></div>
        <div><b>2</b><span>Good Decision + Loss</span><strong>ACCEPT</strong></div>
        <div><b>3</b><span>Bad Decision + Profit</span><strong>DANGEROUS</strong></div>
        <div><b>4</b><span>Bad Decision + Loss</span><strong>FIX</strong></div>
      </section>
    </main>
  );
}

function Card({ title, subtitle, children }) {
  return <section className="card"><div className="cardHead"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}
function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Metric({ label, value, sub, warn }) { return <div className={`metric ${warn ? 'warn' : ''}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>; }
function Empty({ text }) { return <div className="empty">{text}</div>; }
