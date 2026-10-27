import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Errore durante il rendering di Preventivi Pro:', error, info); }
  render() {
    if (this.state.error) return <main className="fatal-error" role="alert">
      <h1>Preventivi Pro non è riuscito ad avviarsi</h1>
      <p>Si è verificato un errore nell’interfaccia. Ricarica la pagina; se persiste, invia questo messaggio all’assistenza.</p>
      <pre>{String(this.state.error?.message || this.state.error)}</pre>
      <button type="button" onClick={() => window.location.reload()}>Ricarica applicazione</button>
    </main>;
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root mancante in index.html');
createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>
);
