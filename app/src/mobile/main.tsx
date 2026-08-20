import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../assets/fonts.css';
import '../assets/themes.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
