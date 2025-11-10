import './App.css';
import React, { useState } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { startIdleWatch } from "../idle";
import { showIdlePrompt, dismissIdlePrompt } from "../idlePrompt";
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
          try {
             // make sure the overlay disappears if user never clicked
            dismissIdlePrompt();
            await tvState.resetLanding(sessionId);
            } finally {
             navigate("/", { replace: true });
          }
        };

         const stop = startIdleWatch({
          warnAfterMs: 1 * 60 * 1000,
          forceAfterMs: 1 * 60 * 1000,
          //onWarn: async () => window.confirm("Do you want to leave the survey?"),
          onWarn: async () => showIdlePrompt("Do you want to leave the survey?"),
          onForceReset
        });
      return stop;
       }, 
      [location.pathname, navigate, sessionId]);
      return null;
}

// Component to handle homepage/refresh resets
function HomepageResetHandler() {
    const location = useLocation();
    const sessionId = React.useMemo(
        () => (localStorage.getItem('fn_session_id') || (crypto?.randomUUID?.() || `s-${Date.now()}`)), []
    );

    React.useEffect(() => {
        const currentPath = (location.pathname || "").toLowerCase();
        
        // Reset TVs when user navigates to homepage (but not on app load)
        if (currentPath === '/' || currentPath === '/home') {
            // Only reset if this isn't the initial page load
            const hasNavigated = sessionStorage.getItem('has_navigated');
            if (hasNavigated) {
                console.log('📺 Resetting TVs due to homepage navigation');
                tvState.resetLanding(sessionId).catch(err => 
                    console.error('[tv] homepage reset failed', err)
                );
            } else {
                // Mark that user has now navigated (for subsequent visits to homepage)
                sessionStorage.setItem('has_navigated', 'true');
            }
        } else {
            // User is navigating to other pages, mark as navigated
            sessionStorage.setItem('has_navigated', 'true');
        }
    }, [location.pathname, sessionId]);

    // Handle page refresh/reload
    React.useEffect(() => {
        const handleBeforeUnload = async () => {
            // Reset TVs when page is refreshed/closed during survey
            const currentPath = (location.pathname || "").toLowerCase();
            const isInSurvey = ['/surveycity', '/survey', '/surveyinfo'].some(route => 
                currentPath === route || currentPath.startsWith(route + '/')
            );
            
            if (isInSurvey) {
                console.log('📺 Resetting TVs due to page refresh/close during survey');
                // Use sendBeacon for reliable delivery during page unload
                try {
                    await tvState.resetLanding(sessionId);
                } catch (err) {
                    console.error('[tv] refresh reset failed', err);
                }
            }
        };

        const handleVisibilityChange = async () => {
            // Handle when user navigates away from tab or app goes to background
            if (document.visibilityState === 'hidden') {
                const currentPath = (location.pathname || "").toLowerCase();
                const isInSurvey = ['/surveycity', '/survey', '/surveyinfo'].some(route => 
                    currentPath === route || currentPath.startsWith(route + '/')
                );
                
                if (isInSurvey) {
                    console.log('📺 Resetting TVs due to app going to background during survey');
                    try {
                        await tvState.resetLanding(sessionId);
                    } catch (err) {
                        console.error('[tv] visibility reset failed', err);
                    }
                }
            }
        };

        // Add event listeners
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [location.pathname, sessionId]);

    return null;
}

export function App() {
    //const {actions, state} = useStateMachine({});
    const {state} = useStateMachine({});
    const [globalLanguage, setGlobalLanguage] = useState(state['language'] || 'Korean');
    const textDirection = (globalLanguage === 'arb') ? "rtl" : "ltr";
    
    return (
        <div className="App Theme-Background" dir={textDirection}>
            <div className="App-container">
                <BrowserRouter>
                    <IdleResetter/>
                    <HomepageResetHandler/>
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