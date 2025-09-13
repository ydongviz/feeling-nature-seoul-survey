import './App.css';
import React, { useState } from "react";
//import {BrowserRouter, Route, Routes} from 'react-router-dom'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { startIdleWatch } from "../idle";
import { tvState } from "../stateApi";
import {HomePage} from "./HomePage";
import {SurveyCitySelectPage} from "./SurveyCitySelectPage";
import {SurveyImgChoicePage} from "./SurveyImgChoicePage";
import {SurveyPersonalInfoPage} from "./SurveyPersonalInfoPage";
import {ThankYouPage} from "./ThankYouPage";
import {ProgressPage} from "./ProgressPage";
import {useStateMachine} from "little-state-machine";

function IdleResetter() {
      const location = useLocation();
      const navigate  = useNavigate();                  // v6
      const sessionId = React.useMemo(
         () => (localStorage.getItem('fn_session_id') || (crypto?.randomUUID?.() || `s-${Date.now()}`)), []
       );

       // Persist the session id once
       React.useEffect(() => {
         localStorage.setItem('fn_session_id', sessionId);
       }, [sessionId]);
    
       React.useEffect(() => {
       
        const p = (location.pathname || "").toLowerCase();
        const SURVEY_ROUTES = [
        "/surveycity",
        "/surveyimg",
        "/surveypersonal",
        "/survey"            // keep only if you truly have a parent /survey route
       ];
      
      const NON_SURVEY = ["/thankyou", "/progress", "/", "/home", "/control"];

      // if path is exactly in NON_SURVEY or starts with any NON_SURVEY prefix → bail
      if (NON_SURVEY.some(bad => p === bad || p.startsWith(bad + "/"))) return;
     // else only run if it matches one of your survey routes (by prefix)
      if (!SURVEY_ROUTES.some(ok => p === ok || p.startsWith(ok + "/"))) return;
    

       const onForceReset = async () => {
          try { await tvState.resetLanding(sessionId); } catch {}
           navigate('/', { replace: true });
        };
         const stop = startIdleWatch({
          warnAfterMs: 3 * 60 * 1000,
          forceAfterMs: 2 * 60 * 1000,
          //onWarn: async () => window.confirm("Do you want to leave the survey?"),
          onWarn: async () => (await import("../idlePrompt")).showIdlePrompt("Do you want to leave the survey?"),
          onForceReset
        });
      return stop;
       }, 
      [location.pathname, navigate, sessionId]);
      return null;
}


export function showIdlePrompt(message = "Do you want to leave the survey?") {
    return new Promise(resolve => {
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:99999;">
          <div style="background:#fff;padding:20px 24px;border-radius:12px;max-width:360px;width:90%;font-family:sans-serif;text-align:center">
            <div style="margin-bottom:16px;font-size:16px">${message}</div>
            <div style="display:flex;gap:12px;justify-content:center">
              <button id="idle-yes" style="padding:10px 16px;border-radius:8px;border:0;background:#e11d48;color:#fff">Yes</button>
              <button id="idle-no"  style="padding:10px 16px;border-radius:8px;border:1px solid #ddd;background:#fff">No</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);
      const done = (v) => { try { document.body.removeChild(el); } catch {} ; resolve(v); };
      el.querySelector("#idle-yes").onclick = () => done(true);
      el.querySelector("#idle-no").onclick  = () => done(false);
    });
  }
  
export function App() {

    const {actions, state} = useStateMachine({});
    //const [globalLanguage, setGlobalLanguage] = useState(state['language'] || 'en');
    const [globalLanguage, setGlobalLanguage] = useState(state['language'] || 'Korean');
    const textDirection = (globalLanguage === 'arb') ? "rtl" : "ltr";
    return (
        <div className="App Theme-Background" dir={textDirection}>
            <div className="App-container">
                <BrowserRouter>
                <IdleResetter/>
                    <Routes>
                        <Route path="*" element={<HomePage setGlobalLanguage={setGlobalLanguage}/>}/>
                        <Route path="/progress" element={<ProgressPage/>}/>
                        <Route path="/surveycity" element={<SurveyCitySelectPage/>}/>
                        <Route path="/survey" element={<SurveyImgChoicePage/>}/>
                        <Route path="/survey/:surveyid" element={<SurveyImgChoicePage/>}/>
                        <Route path="/surveyinfo" element={<SurveyPersonalInfoPage/>}/>
                        <Route path="/surveyinfo/:surveyid" element={<SurveyPersonalInfoPage/>}/>
                        <Route path="/thankyou/:surveyid" element={<ThankYouPage/>}/>
                    </Routes>
                </BrowserRouter>
            </div>
        </div>
    );
}

export default App;
