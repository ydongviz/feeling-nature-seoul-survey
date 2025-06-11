import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './components/App';
import reportWebVitals from './reportWebVitals';
import {create_global_store} from "./store";
import {StateMachineProvider} from "little-state-machine";

const root = ReactDOM.createRoot(document.getElementById('root'));

create_global_store();

root.render(
    <React.StrictMode>
        <StateMachineProvider>
            <App/>
        </StateMachineProvider>
    </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
