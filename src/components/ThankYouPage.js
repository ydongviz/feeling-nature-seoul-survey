import {React} from "react";
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
    React.useEffect(() => {
              const t = setTimeout(() => {
              tvState.resetLanding(sessionId).catch(console.error);
            }, 5 * 60 * 1000);
            return () => clearTimeout(t);
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