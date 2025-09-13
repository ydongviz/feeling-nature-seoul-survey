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
    
       React.useEffect(() => {
         const onForceReset = async () => {
          try { await tvState.resetLanding(sessionId); } catch {}
           navigate('/', { replace: true });
        };
         const stop = startIdleWatch({
          warnAfterMs: 3 * 60 * 1000,
          forceAfterMs: 2 * 60 * 1000,
          onWarn: async () => window.confirm("Do you want to leave the survey?"),
          onForceReset
        });
      return stop;
       }, [location.pathname, navigate, sessionId]);
      return null;
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
