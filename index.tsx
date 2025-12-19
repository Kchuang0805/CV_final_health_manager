import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Find the root element in index.html where the React app will be mounted.
// 尋找 index.html 中用來掛載 React 應用程式的根元素。
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Create a React root and render the App component inside StrictMode.
// StrictMode helps identify potential problems in an application during development.
// 建立 React root 並在 StrictMode 下渲染 App 元件。
// StrictMode 有助於在開發過程中發現潛在問題 (例如重複渲染檢查)。
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
