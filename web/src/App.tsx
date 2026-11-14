import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { initApp, type Photo, type User } from '@freeappstore/sdk';
import { useVoiceInput } from '@freeappstore/sdk/hooks';
import { type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui';
import Camera, { type Capture } from './Camera';
import { available, boundingBox, captureLabel, directions, distance, isListing, locate, photoSource, SIGHTING_LIFETIME, type Listing, type Point } from './listings';

export const fas = initApp({ appId: 'firewood' });
const posts = fas.collections.collection('listings', { visibility: 'public-read' });
const PickupMap = lazy(() => import('./PickupMap'));
const NAV: NavItem[] = [
  { label: 'Find free stuff', href: '/', title: 'Free Stuff — spotted nearby' },
  { label: 'Spot something', href: '/post', title: 'Share a free-stuff sighting' },
  { label: 'My sightings', href: '/mine', title: 'My free-stuff sightings' },
  { label: 'About', href: '/about', title: 'About Free Stuff' },
];
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export default function App() {
  const [path, setPath] = useState(window.location.pathname), [user, setUser] = useState<User | null>(fas.auth.user);
  useEffect(() => {
    const unsubscribe = fas.auth.onChange(setUser), sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => { unsubscribe(); window.removeEventListener('popstate', sync); };
  }, []);
  function navigate(href: string) { window.history.pushState(null, '', href); setPath(href); }
  return <Shell app={fas} appName="Free Stuff" nav={NAV} onNavigate={navigate}><div className="wood-app">
    {path === '/about' ? <About /> : path === '/post' ? <Post user={user} done={() => navigate('/mine')} /> : <Browse key={path} mine={path === '/mine'} user={user} post={() => navigate('/post')} />}
  </div></Shell>;
}
function SignIn() {
  return <section className="wood-panel signin"><h2>Sign in once. Share a spot.</h2><p>Your name and contact details won’t appear on sightings. There’s no inbox to manage.</p><div className="wood-actions"><button className="wood-primary" onClick={() => fas.auth.signIn('google')}>Continue with Google</button><button onClick={() => fas.auth.signIn('github')}>Continue with GitHub</button></div></section>;
}
function Browse({ mine, user, post }: { mine: boolean; user: User | null; post: () => void }) {
  const [items, setItems] = useState<Listing[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [center, setCenter] = useState<Point | null>(null), [radius, setRadius] = useState(5), [view, setView] = useState<'list' | 'map'>('list');
  const [search, setSearch] = useState(''), [selected, setSelected] = useState(''), [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  function queryOptions(nextOffset = 0) {
    return { limit: 100, offset: nextOffset, ...(mine && user ? { owner: user.id } : {}), ...(!mine && center && boundingBox(center, radius) ? { bbox: boundingBox(center, radius)! } : {}) };
  }
  useEffect(() => {
    const current = ++generation.current;
    if (mine && !user) { setItems([]); setLoading(false); return; }
    setLoading(true); setError(''); setItems([]); setOffset(0); setTotal(0);
    posts.query<Listing>(queryOptions()).then((result) => { if (generation.current === current) { setItems(result.documents.filter(isListing)); setOffset(result.documents.length); setTotal(result.total); } })
      .catch((e) => { if (generation.current === current) setError(message(e)); })
      .finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [mine, user?.id, center, radius, revision]);
  async function more() {
    const current = generation.current; setLoading(true);
    try { const result = await posts.query<Listing>(queryOptions(offset)); if (current === generation.current) { setItems((old) => [...old, ...result.documents.filter(isListing)]); setOffset(offset + result.documents.length); setTotal(result.total); } }
    catch (e) { if (current === generation.current) setError(message(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function useLocation() { setBusy('location'); setError(''); try { setCenter(await locate()); } catch (e) { setError(message(e)); } finally { setBusy(''); } }
  async function remove(item: Listing, gone = false) {
    if (!gone && !window.confirm('Remove this sighting and its photo?')) return;
    setBusy(item.id); setError('');
    try {
      if (gone) { await posts.update(item.id, { collected: true }); setItems((old) => old.map((x) => x.id === item.id ? { ...x, collected: true } : x)); }
      else { await posts.delete(item.id); setItems((old) => old.filter((x) => x.id !== item.id)); }
      await fas.photos.delete(item.photoId);
    } catch (e) { setError(message(e)); } finally { setBusy(''); }
  }
  const visible = items.filter((item) => (mine || available(item, now)) && (!center || mine || distance(center, item) <= radius) && `${item.title} ${item.notes} ${item.locality ?? ''} ${item.woodType ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => center ? distance(center, a) - distance(center, b) : (b.capturedAt ?? b._createdAt ?? 0) - (a.capturedAt ?? a._createdAt ?? 0));
  return <><PageHeader title={mine ? 'Your sightings.' : 'Spotted here. Free to take.'} description={mine ? 'No replies or reservations to manage. Sightings expire automatically.' : 'A fresh photo. A time. A place. See what’s been left out nearby.'} />
    {mine && !user ? <SignIn /> : <>
      {!mine && <section className="wood-hero"><div><span className="wood-eyebrow">SNAP IT. SHARE THE SPOT. CARRY ON.</span><h2>See something useful?</h2><p>Take a photo where you are. We record the time and GPS location. Add a note if you like—that’s it.</p></div><button className="wood-primary" onClick={post}>📷 Share a sighting</button></section>}
      <div className="wood-toolbar"><label className="wood-search"><span className="sr-only">Search free stuff</span><input type="search" placeholder="Search free stuff…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {!mine && <><button onClick={useLocation} disabled={busy === 'location'}>{busy === 'location' ? 'Finding you…' : center ? '↻ Update location' : '⌖ Near me'}</button>{center && <><label className="sr-only" htmlFor="radius">Search radius</label><select id="radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[1, 5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} km</option>)}</select><button onClick={() => setCenter(null)}>Anywhere</button></>}<div className="wood-switch" aria-label="View"><button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button></div></>}
        <button aria-label="Refresh sightings" onClick={() => setRevision((n) => n + 1)} disabled={loading}>↻</button>
      </div>
      {error && <div className="wood-error" role="alert">{error} <button onClick={() => setRevision((n) => n + 1)}>Try again</button></div>}
      <div className="wood-results"><p>{loading && !items.length ? 'Checking nearby sightings…' : `${visible.length} ${visible.length === 1 ? 'sighting' : 'sightings'}${center && !mine ? ` within ${radius} km` : ''}`}</p><span>No messages. No reservations.</span></div>
      {view === 'map' && !mine && <Suspense fallback={<div className="wood-map-loading">Loading map…</div>}><PickupMap listings={visible} center={center} onSelect={(id) => { setSelected(id); requestAnimationFrame(() => document.getElementById(`post-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }} /></Suspense>}
      {loading && !items.length ? <div className="wood-grid" aria-label="Loading sightings">{[1, 2, 3].map((n) => <div className="wood-skeleton" key={n} />)}</div> : !visible.length && !error ? <section className="wood-empty"><div className="wood-log">📦</div><h2>{search ? 'No matching sightings.' : mine ? 'Nothing to manage.' : 'Nothing spotted here yet.'}</h2><p>{search ? 'Try another search.' : center ? 'Try a wider radius, or share something you spot nearby.' : 'Spot something free, take a photo, and carry on with your day.'}</p><button className="wood-primary" onClick={post}>Share a sighting</button></section> : null}
      <div className="wood-grid">{visible.map((item) => <article id={`post-${item.id}`} className={`wood-card ${selected === item.id ? 'wood-selected' : ''}`} key={item.id}>
        <div className="wood-photo">{item.expiresAt > now && !item.collected ? <img src={photoSource(item.photoId)} alt={item.notes || 'Free items spotted at this location'} loading="lazy" onError={(e) => { e.currentTarget.hidden = true; }} /> : null}<span className="wood-photo-placeholder" aria-hidden="true">📦</span><span className="wood-badge">{item.collected ? 'Gone' : item.expiresAt <= now ? 'Expired' : 'FREE'}</span></div>
        <div className="wood-card-body"><p className="wood-locality">⌖ {center ? `${distance(center, item).toFixed(1)} km away` : item.locality || 'GPS location recorded'}</p><h2>{item.title}</h2>
          <p className="sighting-timestamp"><time dateTime={new Date(item.capturedAt ?? item._createdAt ?? now).toISOString()}>{captureLabel(item)}</time>{item.capturedAt && item.accuracy !== undefined ? <span>GPS accuracy ±{Math.max(1, Math.round(item.accuracy))} m</span> : null}</p>
          {item.notes && <p className="wood-notes">{item.notes}</p>}
          <div className="wood-card-footer"><span>{item._createdAt && item.capturedAt ? `Posted ${new Date(item._createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Availability may have changed'}</span><a className="wood-link" href={directions(item)} target="_blank" rel="noopener noreferrer">Go to the spot ↗</a></div>
          {mine && <div className="wood-actions">{!item.collected && <button disabled={busy === item.id} onClick={() => remove(item, true)}>It’s gone</button>}<button disabled={busy === item.id} onClick={() => remove(item)}>Remove</button></div>}
        </div>
      </article>)}</div>
      {offset < total && <div className="wood-load-more"><button disabled={loading} onClick={more}>{loading ? 'Loading…' : 'Load more sightings'}</button></div>}
      <p className="wood-footnote">Sightings show what was there when photographed. Items may already be gone. New sightings expire after 48 hours. <a href="https://classifieds.proappstore.online">Selling something? Classifieds ↗</a></p>
    </>}
  </>;
}
function Post({ user, done }: { user: User | null; done: () => void }) {
  const [capture, setCapture] = useState<Capture | null>(null), [preview, setPreview] = useState(''), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const voice = useVoiceInput((text) => setNotes((old) => `${old}${old ? ' ' : ''}${text}`.slice(0, 500)));
  useEffect(() => { if (!capture) { setPreview(''); return; } const url = URL.createObjectURL(capture.photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [capture]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user || !capture || busy) return;
    if (voice.isListening) { voice.stop(); setError('Finish dictating your note, then post.'); return; }
    if (Date.now() - capture.capturedAt > 10 * 60_000) { setError('Take a fresh photo before posting this sighting.'); return; }
    setBusy(true); setError(''); let photo: Photo | undefined;
    try {
      photo = await fas.photos.upload(capture.photo, { visibility: 'public' });
      await posts.create({ kind: 'sighting', title: notes.trim().split('\n')[0]?.slice(0, 80) || 'Free stuff spotted', notes: notes.trim(),
        lat: capture.location.lat, lon: capture.location.lon, accuracy: capture.location.accuracy,
        capturedAt: capture.capturedAt, locationRecordedAt: capture.location.measuredAt,
        photoId: photo.id, expiresAt: Math.min(capture.capturedAt + SIGHTING_LIFETIME, photo.expiresAt), collected: false });
      done();
    } catch (e) { if (photo) await fas.photos.delete(photo.id).catch(() => {}); setError(message(e)); }
    finally { setBusy(false); }
  }
  return <><PageHeader title="Snap it. Share the spot. Carry on." description="No contact details. No replies. Just a fresh sighting." />
    {!user ? <SignIn /> : <form className="wood-form" onSubmit={submit}><fieldset disabled={busy}><legend>What’s here right now?</legend>
      {!capture ? <Camera onCapture={setCapture} /> : <><img className="sighting-preview" src={preview} alt="Your freshly captured sighting" /><div className="sighting-capture-meta"><p>Photo taken {new Date(capture.capturedAt).toLocaleString()}</p><p>GPS recorded · accuracy ±{Math.max(1, Math.round(capture.location.accuracy))} m</p></div><button type="button" onClick={() => setCapture(null)}>Retake photo</button></>}
      <label>Optional note<textarea value={notes} maxLength={500} rows={3} placeholder="E.g. Two chairs by the gate. One has a loose leg." onChange={(e) => setNotes(e.target.value)} /></label>
      {voice.isSupported && <button type="button" aria-pressed={voice.isListening} onClick={voice.toggle}>{voice.isListening ? 'Stop dictating' : '🎙 Dictate a note'}</button>}
      {voice.isListening && <p role="status">{voice.transcript || 'Listening…'}</p>}
      <p className="wood-help">The photo, capture time, GPS pin and optional note are public. No profile or contact details are shown. Only share items clearly offered for free.</p>
    </fieldset>{error && <p className="wood-error" role="alert">{error}</p>}<button className="wood-primary wood-submit" disabled={!capture || busy} type="submit">{busy ? 'Sharing the spot…' : 'Post sighting'}</button></form>}
  </>;
}
function About() {
  return <><PageHeader title="Useful things. Spotted nearby." description="Share the spot, then get on with your day." /><section className="wood-panel wood-prose"><h2>A photo, a time, a place.</h2><p>Free Stuff is a map of things people have seen offered for free: firewood, furniture, boxes, garden materials, and other useful finds.</p><p>Take a photo in the app. Your device records a fresh GPS position and capture time. Add a note if you want, then post. There are no contact details, messages, reservations or negotiations.</p><h2>A sighting, not a promise.</h2><p>The timestamp tells you when the photo was captured; GPS accuracy is shown beside it. Devices supply this information—it isn’t independently certified. Items may already be gone when you arrive. New sightings disappear after 48 hours.</p><p>Only share things clearly offered for free. The app started as Firewood; older wood listings stay available until their original expiry.</p><p>Free to use, no ads, no payments. Built on <a href="https://freeappstore.online">FreeAppStore</a>. <a href="https://classifieds.proappstore.online">For items for sale, visit Classifieds</a>.</p></section></>;
}
