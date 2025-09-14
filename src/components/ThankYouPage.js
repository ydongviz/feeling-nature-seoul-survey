//import {React} from "react";
import React from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useParams} from "react-router-dom";
import './theme.css';
import './ThankYouPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";
import { tvState, getSessionId } from '../stateApi';

export function ThankYouPage() {
    const {surveyid} = useParams();
    const {state} = useStateMachine();
    const lang = state['language'] || DEFAULT_LANG;

    // Check if user is not eligible (answered "No" to residency)
    const isNotEligible = surveyid === 'not-eligible';

    const sessionId = getSessionId();
    
   // Auto-reset: stay in sync with TVs if we can read expires_at; else 5 min
React.useEffect(() => {
    let timer = null;
    let didReset = false;
    const STATE_URL = process.env.REACT_APP_STATE_URL; 
    // e.g. REACT_APP_STATE_URL=https://<bucket>.s3.<region>.amazonaws.com/public/runtime/state.json
  
    async function schedule() {
      // default 5 minutes
      let ms = 3 * 60 * 1000;
  
      // try to sync with TVs
      try {
        if (STATE_URL) {
          const res = await fetch(STATE_URL, { cache: 'no-store' });
          if (res.ok) {
            const st = await res.json();
            const t = Date.parse(st?.expires_at || '');
            if (Number.isFinite(t)) {
              ms = Math.max(0, t - Date.now());
            }
          }
        }
      } catch {
        // ignore -> keep default 5 min
      }
  
      timer = setTimeout(async () => {
        if (didReset) return;
        didReset = true;
        try {
          await tvState.resetLanding(sessionId);
        } finally {
          // also reset the survey UI
          window.location.assign('/');
        }
      }, ms);
    }
  
    schedule();
    return () => { if (timer) clearTimeout(timer); };
  }, [sessionId]);
  

    // Handle not eligible case
    if (isNotEligible) {
        return (
            <div className="container-page-mid-root">
                <div>
                    <h1 className="title-text title-text-h1 thank-you-title-text-h1">
                        {locale_text(lang, 'thank-you-not-eligible-title')}
                    </h1>
                    <p className="thank-you-description-text">
                        {locale_text(lang, 'thank-you-not-eligible-description')}
                    </p>
                    <button className="button-generic button-stick-to-center thankyou-button"
                      onClick={async () => {
                        try { await tvState.resetLanding(sessionId); } finally {
                         // Navigate back to home after we write the state
                        window.location.assign('/');
                       }
                      }}
                    >
                     {locale_text(lang, 'thank-you-button-start-again')}
                   </button>

                </div>
            </div>
        );
    }

    // Regular thank you page - simplified
    return (
        <div className="container-page-mid-root">
            <div>
                <h1 className="title-text title-text-h1 thank-you-title-text-h1">
                    {locale_text(lang, 'thank-you-title')}
                </h1>
                <button  className="button-generic button-stick-to-center thankyou-button"
                   onClick={async () => {
                   try { await tvState.resetLanding(sessionId); } finally {
                   window.location.assign('/');
                   }
                 }}
                >
                {locale_text(lang, 'thank-you-button-start-again')}
               </button>
                
            </div>
        </div>
    );
}