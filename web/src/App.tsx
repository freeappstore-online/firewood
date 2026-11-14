import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { initApp, type Photo, type User } from '@freeappstore/sdk';
import { type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui';
import { available, isListing, photoSource, boundingBox, directions, distance, locate, validPoint, type Listing, type Point } from './listings';

export const fas = initApp({ appId: 'firewood' });
const posts = fas.collections.collection('listings', { visibility: 'public-read' });
const PickupMap = lazy(() => import('./PickupMap'));
const NAV: NavItem[] = [
  { label: 'Find wood', href: '/', title: 'Firewood — free wood nearby' },
  { label: 'Post wood', href: '/post', title: 'Post free firewood' },
  { label: 'My posts', href: '/mine', title: 'My firewood posts' },
  { label: 'About', href: '/about', title: 'About Firewood' },
];
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [user, setUser] = useState<User | null>(fas.auth.user);
  useEffect(() => {
    const unsubscribe = fas.auth.onChange(setUser);
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => { unsubscribe(); window.removeEventListener('popstate', sync); };
  }, []);
  function navigate(href: string) { window.history.pushState(null, '', href); setPath(href); }
  return <Shell app={fas} appName="Firewood" nav={NAV} onNavigate={navigate}>
    <div className="wood-app">
      {path === '/about' ? <About /> : path === '/post' ? <Post user={user} done={() => navigate('/mine')} /> : <Browse key={path} mine={path === '/mine'} user={user} post={() => navigate('/post')} />}
    </div>
  </Shell>;
}

function SignIn() {
  return <section className="wood-panel signin"><h2>Join your local wood pile.</h2><p>Sign in to post free wood and manage your listings. Anyone can browse.</p>
    <div className="wood-actions"><button className="wood-primary" onClick={() => fas.auth.signIn('google')}>Continue with Google</button><button onClick={() => fas.auth.signIn('github')}>Continue with GitHub</button></div></section>;
}

function Browse({ mine, user, post }: { mine: boolean; user: User | null; post: () => void }) {
  const [items, setItems] = useState<Listing[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [center, setCenter] = useState<Point | null>(null), [radius, setRadius] = useState(25), [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState(''), [selected, setSelected] = useState(''), [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const current = ++generation.current;
    if (mine && !user) { setItems([]); setLoading(false); return; }
    setLoading(true); setError(''); setItems([]); setOffset(0); setTotal(0);
    posts.query<Listing>({ limit: 100, ...(mine && user ? { owner: user.id } : {}), ...(!mine && center && boundingBox(center, radius) ? { bbox: boundingBox(center, radius)! } : {}) })
      .then((result) => { if (generation.current === current) { setItems(result.documents.filter(isListing)); setOffset(result.documents.length); setTotal(result.total); } })
      .catch((e) => { if (generation.current === current) setError(message(e)); })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [mine, user?.id, center, radius, revision]);
  async function more() {
    const current = generation.current;
    setLoading(true);
    try {
      const result = await posts.query<Listing>({ limit: 100, offset, ...(mine && user ? { owner: user.id } : {}), ...(!mine && center && boundingBox(center, radius) ? { bbox: boundingBox(center, radius)! } : {}) });
      if (current === generation.current) { setItems((old) => [...old, ...result.documents.filter(isListing)]); setOffset(offset + result.documents.length); setTotal(result.total); }
    } catch (e) { if (current === generation.current) setError(message(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function useLocation() {
    setBusy('location'); setError('');
    try { setCenter(await locate()); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  }
  async function collect(item: Listing) {
    setBusy(item.id); setError('');
    try {
      await posts.update(item.id, { collected: true });
      setItems((old) => old.map((x) => x.id === item.id ? { ...x, collected: true } : x));
      await fas.photos.delete(item.photoId);
    } catch (e) { setError(message(e)); } finally { setBusy(''); }
  }
  async function remove(item: Listing) {
    if (!window.confirm('Remove this listing and its photo?')) return;
    setBusy(item.id); setError('');
    try { await posts.delete(item.id); setItems((old) => old.filter((x) => x.id !== item.id)); await fas.photos.delete(item.photoId); }
    catch (e) { setError(message(e)); } finally { setBusy(''); }
  }
  const visible = items.filter((item) => (mine || available(item, now)) && (!center || mine || distance(center, item) <= radius) && `${item.title} ${item.locality} ${item.woodType}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => center ? distance(center, a) - distance(center, b) : (b._createdAt ?? 0) - (a._createdAt ?? 0));
  return <>
    <PageHeader title={mine ? 'Your wood, shared.' : 'Good wood. Free to a good home.'} description={mine ? 'Keep your pickup spots up to date.' : 'A tree came down. Someone needs a warm fire. Find free firewood around the corner.'} />
    {mine && !user ? <SignIn /> : <>
      {!mine && <section className="wood-hero"><div><span className="wood-eyebrow">LESS WASTE. MORE WARMTH.</span><h2>Got a pile? Pass it on.</h2><p>Snap a photo, drop a pickup pin, and let your neighbours take it from there.</p></div><button className="wood-primary" onClick={post}>＋ Post free wood</button></section>}
      <div className="wood-toolbar"><label className="wood-search"><span className="sr-only">Search suburb or wood type</span><input type="search" placeholder="Search suburb or wood type…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {!mine && <><button onClick={useLocation} disabled={busy === 'location'}>{busy === 'location' ? 'Finding you…' : center ? '↻ Update location' : '⌖ Near me'}</button>
        {center && <><label className="sr-only" htmlFor="radius">Search radius</label><select id="radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}</select><button onClick={() => setCenter(null)}>Anywhere</button></>}
        <div className="wood-switch" aria-label="View"><button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button></div></>}
        <button aria-label="Refresh listings" onClick={() => setRevision((n) => n + 1)} disabled={loading}>↻</button>
      </div>
      {error && <div className="wood-error" role="alert">{error} <button onClick={() => setRevision((n) => n + 1)}>Try again</button></div>}
      <div className="wood-results"><p>{loading && !items.length ? 'Checking the wood pile…' : `${visible.length} ${visible.length === 1 ? 'spot' : 'spots'}${center && !mine ? ` within ${radius} km` : mine ? '' : ' to pick up'}`}</p><span>Always free · Local pickup</span></div>
      {view === 'map' && !mine && <Suspense fallback={<div className="wood-map-loading">Loading map…</div>}><PickupMap listings={visible} center={center} onSelect={(id) => { setSelected(id); requestAnimationFrame(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }} /></Suspense>}
      {loading && !items.length ? <div className="wood-grid" aria-label="Loading listings">{[1, 2, 3].map((n) => <div className="wood-skeleton" key={n} />)}</div> : !visible.length && !error ? <section className="wood-empty"><div className="wood-log">🪵</div><h2>{search ? 'No matching wood piles.' : mine ? 'Your first wood pile starts here.' : 'No wood piles here yet.'}</h2><p>{search ? 'Try another suburb or wood type.' : center ? 'Try a wider radius, or post some wood for your neighbours.' : 'Be the first to turn a fallen tree into someone’s next warm evening.'}</p><button className="wood-primary" onClick={post}>Post free wood</button></section> : null}
      <div className="wood-grid">{visible.map((item) => <article id={`post-${item.id}`} className={`wood-card ${selected === item.id ? 'wood-selected' : ''}`} key={item.id}>
        <div className="wood-photo">{item.expiresAt > now && !item.collected ? <img src={photoSource(item.photoId)} alt={item.title} loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} /> : null}<span className="wood-photo-placeholder" aria-hidden="true">🪵</span><span className="wood-badge">{item.collected ? 'Collected' : item.expiresAt <= now ? 'Expired' : 'FREE'}</span></div>
        <div className="wood-card-body"><p className="wood-locality">⌖ {item.locality}{center && ` · ${distance(center, item).toFixed(1)} km`}</p><h2>{item.title}</h2><p className="wood-meta">{item.quantity} · {item.woodType}</p><p className="wood-notes">{item.notes}</p>
          <div className="wood-card-footer"><span>{item._createdAt ? new Date(item._createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recently posted'}</span><a className="wood-link" href={directions(item)} target="_blank" rel="noopener noreferrer">Pickup directions ↗</a></div>
          {mine && <div className="wood-actions">{!item.collected && <button disabled={busy === item.id} onClick={() => collect(item)}>✓ Mark collected</button>}<button disabled={busy === item.id} onClick={() => remove(item)}>Remove</button></div>}
        </div>
      </article>)}</div>
      {offset < total && <div className="wood-load-more"><button disabled={loading} onClick={more}>{loading ? 'Loading…' : 'Load more spots'}</button></div>}
      <p className="wood-footnote">Only collect wood the owner has offered. Check access notes before heading over. Listings disappear after 90 days.</p>
    </>}
  </>;
}

function Post({ user, done }: { user: User | null; done: () => void }) {
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState(''), [pin, setPin] = useState<Point | null>(null);
  const [title, setTitle] = useState(''), [locality, setLocality] = useState(''), [quantity, setQuantity] = useState('A car boot'), [woodType, setWoodType] = useState('Not sure'), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [locating, setLocating] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function currentLocation() { setLocating(true); setError(''); try { setPin(await locate()); } catch (e) { setError(message(e)); } finally { setLocating(false); } }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!user || busy) return;
    if (!file || !pin || !validPoint(pin)) { setError('Add a photo and a pickup pin first.'); return; }
    if (!title.trim() || !locality.trim() || !notes.trim()) { setError('Add a title, suburb, and pickup notes.'); return; }
    setBusy(true); let photo: Photo | undefined; let saved = false;
    try {
      photo = await fas.photos.upload(file, { visibility: 'public' });
      await posts.create({ title: title.trim(), locality: locality.trim(), quantity, woodType, notes: notes.trim(), lat: pin.lat, lon: pin.lon,
        photoId: photo.id, photoUrl: photo.url, expiresAt: photo.expiresAt, collected: false });
      saved = true; done();
    } catch (e) {
      if (photo && !saved) await fas.photos.delete(photo.id).catch(() => {});
      setError(message(e));
    } finally { setBusy(false); }
  }
  return <><PageHeader title="Give your wood a second life." description="One photo. A pickup pin. A warmer neighbourhood." />
    {!user ? <SignIn /> : <form className="wood-form" onSubmit={submit}>
      <fieldset disabled={busy}><legend>1. Show the pile</legend>
        <label className="wood-upload">{preview ? <img src={preview} alt="Your wood pile preview" /> : <><span className="wood-log">＋</span><strong>Add a photo</strong><span>Take one or choose from your photos</span></>}<input aria-label="Photo of the firewood" type="file" accept="image/*" onChange={(e) => { const next = e.target.files?.[0] ?? null; if (next && next.size > 20_000_000) { setError('Choose a photo smaller than 20 MB.'); return; } setFile(next); }} /></label>
        {file && <p className="wood-help">Tap the photo to choose another.</p>}
        <label>Listing title<input value={title} maxLength={80} required placeholder="E.g. Freshly cut gum, free to collect" onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="wood-two"><label>Roughly how much?<select value={quantity} onChange={(e) => setQuantity(e.target.value)}>{['A few pieces', 'A car boot', 'A trailer load', 'Multiple trailer loads'].map((x) => <option key={x}>{x}</option>)}</select></label><label>Wood type<select value={woodType} onChange={(e) => setWoodType(e.target.value)}>{['Not sure', 'Hardwood', 'Softwood', 'Mixed wood'].map((x) => <option key={x}>{x}</option>)}</select></label></div>
      </fieldset>
      <fieldset disabled={busy}><legend>2. Drop a pickup pin</legend><label>Suburb / town<input value={locality} maxLength={80} required placeholder="E.g. Brunswick, VIC" onChange={(e) => setLocality(e.target.value)} /></label>
        <button type="button" disabled={locating} onClick={currentLocation}>{locating ? 'Finding your location…' : '⌖ Use my current location'}</button><p className="wood-help">Or tap the map to choose the pickup spot. Your pin will be public.</p>
        <Suspense fallback={<div className="wood-map-loading">Loading pickup map…</div>}><PickupMap pin={pin && validPoint(pin) ? pin : null} onPick={setPin} /></Suspense>
        <div className="wood-two"><label>Latitude<input type="number" step="any" min={-90} max={90} required value={pin && Number.isFinite(pin.lat) ? pin.lat : ''} onChange={(e) => setPin({ lat: e.target.valueAsNumber, lon: pin?.lon ?? Number.NaN })} /></label><label>Longitude<input type="number" step="any" min={-180} max={180} required value={pin && Number.isFinite(pin.lon) ? pin.lon : ''} onChange={(e) => setPin({ lat: pin?.lat ?? Number.NaN, lon: e.target.valueAsNumber })} /></label></div>
        <label>Pickup notes<textarea value={notes} maxLength={1000} required rows={4} placeholder="Where is it? Any access times? Does it need cutting? Is it freshly cut or dry?" onChange={(e) => setNotes(e.target.value)} /></label>
      </fieldset>
      <div className="wood-panel"><p>Your photo, pickup pin, and notes will be public. Only offer wood you have permission to give away. Mark it collected as soon as it’s gone.</p><p className="wood-help">Posts expire after 90 days.</p></div>
      {error && <p className="wood-error" role="alert">{error}</p>}
      <button className="wood-primary wood-submit" disabled={busy || locating} type="submit">{busy ? 'Posting your wood…' : 'Post free wood →'}</button>
    </form>}
  </>;
}

function About() {
  return <><PageHeader title="A little less waste. A little more warmth." description="Free firewood, shared by neighbours." />
    <section className="wood-panel wood-prose"><h2>A tree down doesn’t have to mean wood wasted.</h2><p>Firewood connects people with spare wood to people who can use it. Post a photo and a public pickup pin, or find a pile near you and follow the owner’s access notes.</p><h2>Simple, local, and free.</h2><ol><li>Post wood you have permission to give away.</li><li>Share a clear pickup spot and practical access notes.</li><li>Mark the listing collected when the pile is gone.</li></ol><p>Photos and listings expire after 90 days. Nobody reserves a pile through this app; availability can change before you arrive.</p><p>Free to use, no ads, no payments. Built on <a href="https://freeappstore.online">FreeAppStore</a>. <a href="https://github.com/freeappstore-online/firewood">View the source</a>.</p></section></>;
}
