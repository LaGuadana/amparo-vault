// Vault UI shell. Step 1 is protocol-only, so this renders connection state;
// login/unlock (step 3) and the decoding approval screens (step 4) land here.
import { useSyncExternalStore } from 'react'
import { subscribe, getState } from './store.js'

function Standalone() {
  return (
    <div className="wrap">
      <div className="card">
        <div className="brandline">
          <span className="brand">amparo</span>
          <span className="tag">vault</span>
        </div>
        <h1>This is amparo&rsquo;s signing vault.</h1>
        <p className="dim">
          The vault is a small, open-source page on its own origin. It is where
          your password is entered, your wallet key is unlocked, and every
          transaction is approved and signed. The dashboard can only <em>ask</em> it
          for signatures — your key and password never leave this origin.
        </p>
        <p className="dim">
          You normally don&rsquo;t open this page yourself: the dashboard opens it in
          a popup when something needs your approval. Always check the address
          bar reads this origin before typing your password here.
        </p>
      </div>
    </div>
  )
}

function Connected({ state }) {
  return (
    <div className="wrap">
      <div className="card">
        <div className="brandline">
          <span className="brand">amparo</span>
          <span className="tag">vault</span>
        </div>
        {state.origin ? (
          <>
            <div className="status">
              <span className="dot ok" />
              Connected to <span className="mono">{state.origin}</span>
            </div>
            <p className="dim">
              Waiting for requests from the dashboard. Nothing is signed without
              your approval on this page.
            </p>
          </>
        ) : (
          <div className="status">
            <span className="dot" />
            Waiting for the dashboard&hellip;
          </div>
        )}
        {state.activity.length > 0 && (
          <ul className="activity">
            {state.activity.map((a, i) => (
              <li key={i} className={a.type === 'refused' ? 'refused' : ''}>
                <span className="mono">{a.kind}</span>
                {a.type === 'refused' ? <span className="dim"> refused ({a.code})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const state = useSyncExternalStore(subscribe, getState)
  if (state.mode === 'standalone') return <Standalone />
  if (state.mode === 'iframe') return null // silent ops only; nothing to show
  return <Connected state={state} />
}
