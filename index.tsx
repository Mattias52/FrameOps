
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Fix: Reference document via window with type assertion to bypass missing DOM types in the current environment
const rootElement = (window as any).document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
