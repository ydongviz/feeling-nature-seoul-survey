import {React} from "react";
import {useStateMachine} from "little-state-machine";
import {Link, useParams} from "react-router-dom";
import './theme.css';
import './ThankYouPage.css';
import {DEFAULT_LANG, locale_text} from "./lang";

export function ThankYouPage() {
    const {surveyid} = useParams();
    const {state} = useStateMachine();
    const lang = state['language'] || DEFAULT_LANG;

    // Check if user is not eligible (answered "No" to residency)
    const isNotEligible = surveyid === 'not-eligible';

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
                    <Link to="/">
                        <button className="button-generic button-stick-to-center thankyou-button">
                            {locale_text(lang, 'thank-you-button-start-again')}
                        </button>
                    </Link>
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
                
                <Link to="/">
                    <button className="button-generic button-stick-to-center thankyou-button">
                        {locale_text(lang, 'thank-you-button-start-again')}
                    </button>
                </Link>
            </div>
        </div>
    );
}