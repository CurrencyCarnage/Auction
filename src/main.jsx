import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, CheckCircle2, ChevronRight, Clock3, FileText, Filter, Gavel, Languages, LockKeyhole, LogOut, MapPin, RotateCcw, ShieldCheck, TimerReset, User, X } from 'lucide-react';
import './styles.css';

const DEMO_USERS = Array.from({ length: 5 }, (_, i) => ({ username: `user${i + 1}`, password: `pass${i + 1}` }));
const images = {
  'shacman-x3000': '/lots/shacman-x3000.png',
  'shacman-f3000-dump': '/lots/shacman-f3000-dump.png',
  'shacman-l3000-mixer': '/lots/shacman-l3000-mixer.png',
  'case-580st': '/lots/case-580st.png',
  'case-cx220c': '/lots/case-cx220c.png',
};
const money = n => '₾' + Math.round(n || 0).toLocaleString('en-US');
const fmtTime = ms => {
  if (ms <= 0) return 'Ended';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), mm = m % 60, s = Math.floor((ms % 60000) / 1000);
  return h ? `${h}h ${mm}m` : `${mm}m ${s}s`;
};
async function api(path, opts = {}) {
  const user = JSON.parse(sessionStorage.gtAuctionUser || 'null');
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(user?.username ? { 'x-demo-user': user.username } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function App() {
  const [state, setState] = useState(null);
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.gtAuctionUser || 'null'));
  const [tick, setTick] = useState(Date.now());
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedLot, setSelectedLot] = useState(null);

  async function refresh() {
    try { setState(await api('/api/state')); } catch (e) { setToast(e.message); }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(() => { setTick(Date.now()); refresh(); }, 1800);
    return () => clearInterval(t);
  }, []);

  async function login(username, password) {
    try {
      const { user: u } = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      sessionStorage.gtAuctionUser = JSON.stringify(u);
      setUser(u);
      setToast(`Logged in as ${u.username}`);
    } catch (e) { setToast(e.message); }
  }
  function logout() { sessionStorage.removeItem('gtAuctionUser'); setUser(null); setToast('Logged out'); }
  async function action(path, body) {
    try {
      const r = await api(path, { method: 'POST', body: JSON.stringify(body) });
      setState(r.state);
      setToast(r.message || 'Done');
      return true;
    } catch (e) { setToast(e.message); return false; }
  }
  const lots = state?.lots || [];
  const filteredLots = useMemo(() => lots.filter(l => filter === 'All' || l.brand === filter || l.type.includes(filter)), [lots, filter]);
  const featured = lots[0];

  if (!state) return <div className="loading">Loading GT Auction…</div>;

  return <>
    <Header user={user} logout={logout} />
    <main>
      <Hero lot={featured} tick={tick} reset={() => action('/api/reset', {})} openBid={setSelectedLot} />
      <section className="trustStrip">
        <span><ShieldCheck size={18}/> Verified lots</span>
        <span><FileText size={18}/> Inspection-ready records</span>
        <span><LockKeyhole size={18}/> Confirm-before-bid flow</span>
        <span><Bell size={18}/> Manager approval after auction</span>
      </section>
      <section className="auctionShell" id="auctions">
        <div className="toolbar">
          <div>
            <span className="kicker"><Filter size={15}/> Active inventory</span>
            <h2>Heavy equipment auctions</h2>
            <p>Initial demo inventory: SHACMAN and CASE. Partner brands can be added later.</p>
          </div>
          <div className="filters">{['All', 'SHACMAN', 'CASE', 'Truck', 'Excavator'].map(f => <button key={f} className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>{f}</button>)}</div>
        </div>
        <div className="lotGrid">{filteredLots.map(lot => <LotCard key={lot.id} lot={lot} tick={tick} openBid={setSelectedLot} />)}</div>
      </section>
      <section className="bottomPanel" id="login">
        <LoginForm login={login} user={user} />
        <DemoUsers />
      </section>
    </main>
    <footer><b>GT Auction</b><span>Presentation MVP — visual prototype with working demo bidding backend.</span></footer>
    {selectedLot && <BidModal lot={selectedLot} tick={tick} user={user} close={() => setSelectedLot(null)} onBid={(amount) => action('/api/bid', { lotId: selectedLot.id, amount })} onProxy={(max) => action('/api/proxy', { lotId: selectedLot.id, max })} onBuy={() => action('/api/buy-now', { lotId: selectedLot.id })} />}
    {toast && <div className="toast" onAnimationEnd={() => setToast('')}>{toast}</div>}
  </>;
}

function Header({ user, logout }) {
  return <header>
    <a className="brand" href="#top"><span className="mark">GT</span><span><b>GT Auction</b><small>Heavy equipment marketplace</small></span></a>
    <nav><a href="#auctions">Auctions</a><a>How it works</a><a>Results</a><span className="language"><Languages size={14}/> KA / EN</span>{user ? <button className="ghost dark" onClick={logout}><LogOut size={15}/>{user.username}</button> : <a className="loginLink" href="#login">Login</a>}</nav>
  </header>;
}

function Hero({ lot, tick, reset, openBid }) {
  if (!lot) return null;
  return <section className="hero" id="top">
    <div className="heroCopy">
      <span className="kicker"><ShieldCheck size={16}/> GT Group verified auction lots</span>
      <h1>Heavy Equipment Auctions</h1>
      <p>Bid on selected SHACMAN and CASE construction vehicles with transparent history, confirmed bidder actions, and offline GT manager approval.</p>
      <div className="heroActions"><a className="primary" href="#auctions">View auctions <ChevronRight size={18}/></a><button className="secondary" onClick={reset}><RotateCcw size={16}/> Reset demo</button></div>
      <div className="metrics"><span><b>5</b> demo bidders</span><span><b>5</b> live lots</span><span><b>₾</b> GEL bidding</span></div>
    </div>
    <div className="featureCard">
      <img src={images[lot.id]} alt={lot.model}/>
      <div className="featureOverlay">
        <span className="liveDot">Live lot</span>
        <h3>{lot.brand} {lot.model}</h3>
        <div className="featureStats"><span><small>Current bid</small><b>{money(lot.current)}</b></span><span><small>Ends in</small><b>{fmtTime(lot.endAt - tick)}</b></span></div>
        <button onClick={() => openBid(lot)}>Open bid panel</button>
      </div>
    </div>
  </section>;
}

function LotCard({ lot, tick, openBid }) {
  const ended = lot.endAt - tick <= 0;
  return <article className="lotCard">
    <div className="photoWrap"><img src={images[lot.id]} alt={lot.model}/><span className="brandBadge">{lot.brand}</span>{lot.buyRequested && <span className="requestBadge">Buy request</span>}</div>
    <div className="lotBody">
      <div className="lotHead"><div><h3>{lot.model}</h3><p>{lot.type} · {lot.year} · {lot.hours}</p></div><span className={ended ? 'timer ended' : 'timer'}><Clock3 size={14}/>{fmtTime(lot.endAt - tick)}</span></div>
      <div className="specs"><span><MapPin size={14}/>{lot.location}</span><span><CheckCircle2 size={14}/> Verified lot</span><span><FileText size={14}/> Inspection report</span></div>
      <div className="priceRow"><span><small>Current bid</small><b>{money(lot.current)}</b></span><span><small>Increment</small><b>{money(lot.increment)}</b></span></div>
      <button className="bidOpen" onClick={() => openBid(lot)}>Place bid safely <ChevronRight size={16}/></button>
    </div>
  </article>;
}

function BidModal({ lot, tick, user, close, onBid, onProxy, onBuy }) {
  const [amount, setAmount] = useState(lot.current + lot.increment);
  const [proxy, setProxy] = useState(lot.current + lot.increment * 4);
  useEffect(() => { setAmount(lot.current + lot.increment); setProxy(lot.current + lot.increment * 4); }, [lot.id, lot.current, lot.increment]);
  const min = lot.current + lot.increment;
  async function confirmBid() { if (await onBid(amount)) close(); }
  return <div className="modalBackdrop" onMouseDown={close}>
    <section className="bidModal" onMouseDown={e => e.stopPropagation()}>
      <button className="modalClose" onClick={close}><X size={18}/></button>
      <div className="modalPhoto"><img src={images[lot.id]} alt={lot.model}/><span>{lot.brand}</span></div>
      <div className="modalContent">
        <span className="kicker"><Gavel size={15}/> Confirm bidder action</span>
        <h2>{lot.model}</h2>
        <p>{lot.type} · {lot.year} · {lot.location}</p>
        <div className="modalNumbers"><div><small>Current bid</small><b>{money(lot.current)}</b></div><div><small>Minimum next bid</small><b>{money(min)}</b></div><div><small>Time left</small><b>{fmtTime(lot.endAt - tick)}</b></div></div>
        <div className="confirmBox">
          <label>Bid amount</label>
          <div className="inputAction"><input type="number" min={min} step={lot.increment} value={amount} onChange={e => setAmount(Number(e.target.value))}/><button onClick={confirmBid} disabled={!user}>BID NOW</button></div>
          <div className="quickBids">{[min, min + lot.increment, min + lot.increment * 2].map(v => <button key={v} onClick={() => setAmount(v)}>{money(v)}</button>)}</div>
          <p className="safety"><LockKeyhole size={14}/> This confirmation window prevents accidental one-click bids from the homepage.</p>
        </div>
        <div className="secondaryActions">
          <div><label>Proxy bid up to</label><div className="inputAction"><input type="number" value={proxy} onChange={e => setProxy(Number(e.target.value))}/><button className="secondary" onClick={() => onProxy(proxy)} disabled={!user}>Save proxy</button></div></div>
          <button className="buyNow" onClick={onBuy} disabled={!user}>Request Buy Now at {money(lot.buyNow)}</button>
        </div>
        <p className="loginNote">{user ? `${user.username} verified · ceiling ${money(user.limit)}` : 'Login with a demo bidder before confirming a bid.'}</p>
      </div>
    </section>
  </div>;
}

function LoginForm({ login, user }) {
  const [u, setU] = useState('user1'), [p, setP] = useState('pass1');
  return <form className="loginCard" onSubmit={e => { e.preventDefault(); login(u, p); }}>
    <span className="kicker"><User size={15}/> Demo access</span><h3>{user ? `Logged in as ${user.username}` : 'Verified bidder login'}</h3>
    <div className="loginInputs"><input value={u} onChange={e => setU(e.target.value)} placeholder="username"/><input value={p} onChange={e => setP(e.target.value)} placeholder="password"/><button>Login</button></div>
  </form>;
}
function DemoUsers() { return <div className="demoUsers"><b>Demo users</b>{DEMO_USERS.map(u => <span key={u.username}>{u.username} / {u.password}</span>)}</div>; }

createRoot(document.getElementById('root')).render(<App />);
